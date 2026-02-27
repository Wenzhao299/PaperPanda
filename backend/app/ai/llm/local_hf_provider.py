from __future__ import annotations

import asyncio
import logging
import os
from threading import Lock
from typing import Any

_logger = logging.getLogger(__name__)
_HF_LOAD_LOCK = Lock()


class LocalHFProvider:
    def __init__(
        self,
        model_path: str,
        device: str = "auto",
        max_new_tokens: int = 256,
        temperature: float = 0.0,
    ) -> None:
        self.model_path = model_path.strip()
        self.device = device
        self.max_new_tokens = max(16, max_new_tokens)
        self.temperature = max(0.0, min(1.0, float(temperature)))
        self._tokenizer: Any | None = None
        self._model: Any | None = None
        self._load_error: str | None = None
        self._lock = Lock()
        self._reported_unavailable = False
        self._reported_generation_error = False

    async def chat(self, messages: list[dict[str, Any]], model: str | None = None, stream: bool = False) -> str:
        _ = model
        _ = stream
        return await asyncio.to_thread(self._chat_sync, messages)

    def _chat_sync(self, messages: list[dict[str, Any]]) -> str:
        self._ensure_loaded()
        if self._model is None or self._tokenizer is None:
            if self._load_error and not self._reported_unavailable:
                _logger.warning("local hf model unavailable (%s): %s", self.model_path, self._load_error)
                self._reported_unavailable = True
            return ""

        prompt = self._build_prompt(messages)
        if not prompt:
            return ""

        try:
            import torch

            tokenizer = self._tokenizer
            model = self._model

            inputs = tokenizer(prompt, return_tensors="pt")
            target_device = self._resolve_target_device(torch=torch)
            if target_device.startswith("cuda"):
                inputs = {key: value.to(target_device) for key, value in inputs.items()}

            generate_kwargs: dict[str, Any] = {
                "max_new_tokens": self.max_new_tokens,
                "do_sample": self.temperature > 0,
                "pad_token_id": tokenizer.eos_token_id,
            }
            if self.temperature > 0:
                generate_kwargs["temperature"] = self.temperature

            with torch.no_grad():
                output = model.generate(
                    **inputs,
                    **generate_kwargs,
                )

            prompt_tokens = inputs["input_ids"].shape[-1]
            generated = output[0][prompt_tokens:]
            return tokenizer.decode(generated, skip_special_tokens=True).strip()
        except Exception as exc:
            if not self._reported_generation_error:
                _logger.warning("local hf generation failed (%s): %s", self.model_path, str(exc))
                self._reported_generation_error = True
            return ""

    def _ensure_loaded(self) -> None:
        if self._model is not None or self._load_error is not None:
            return

        with self._lock:
            if self._model is not None or self._load_error is not None:
                return
            try:
                with _HF_LOAD_LOCK:
                    os.environ.setdefault("KMP_ENABLE_SHM", "0")
                    import torch
                    self._prepare_transformers_runtime()
                    from transformers import AutoModelForCausalLM, AutoTokenizer

                    self._ensure_sentencepiece_if_needed()
                    tokenizer = AutoTokenizer.from_pretrained(self.model_path, trust_remote_code=True)
                    target_device = self._resolve_target_device(torch=torch)
                    dtype = torch.float32
                    if target_device.startswith("cuda"):
                        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

                    try:
                        model = AutoModelForCausalLM.from_pretrained(
                            self.model_path,
                            dtype=dtype,
                            trust_remote_code=True,
                            low_cpu_mem_usage=True,
                        )
                    except TypeError:
                        model = AutoModelForCausalLM.from_pretrained(
                            self.model_path,
                            torch_dtype=dtype,
                            trust_remote_code=True,
                            low_cpu_mem_usage=True,
                        )
                    model.eval()
                    if target_device.startswith("cuda"):
                        model.to(target_device)

                self._tokenizer = tokenizer
                self._model = model
            except Exception as exc:
                self._load_error = str(exc)
                _logger.exception("local hf model load failed (%s on %s)", self.model_path, self.device)
                self._tokenizer = None
                self._model = None

    @staticmethod
    def _prepare_transformers_runtime() -> None:
        # Some environments install torchvision builds incompatible with torch.
        # transformers may treat torchvision as available and try importing it
        # from text-model code paths (via image_utils), causing model load failure.
        try:
            from transformers.utils import import_utils as hf_import_utils

            if getattr(hf_import_utils, "_torchvision_available", False):
                hf_import_utils._torchvision_available = False
        except Exception:
            return

    def _ensure_sentencepiece_if_needed(self) -> None:
        tokenizer_model = os.path.join(self.model_path, "tokenizer.model")
        if not os.path.exists(tokenizer_model):
            return
        try:
            import sentencepiece  # noqa: F401
        except Exception as exc:
            raise RuntimeError("sentencepiece is required for this model but is not installed") from exc

    def _build_prompt(self, messages: list[dict[str, Any]]) -> str:
        if not messages:
            return ""

        tokenizer = self._tokenizer
        if tokenizer is not None and hasattr(tokenizer, "apply_chat_template"):
            try:
                return tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True,
                )
            except Exception:
                pass

        lines: list[str] = []
        for item in messages:
            role = str(item.get("role", "user")).strip().upper()
            content = str(item.get("content", "")).strip()
            if not content:
                continue
            lines.append(f"{role}: {content}")
        lines.append("ASSISTANT:")
        return "\n\n".join(lines)

    def _resolve_target_device(self, torch: Any) -> str:
        raw = str(self.device or "").strip().lower()
        if raw == "cpu":
            return "cpu"
        if raw == "cuda":
            return "cuda:0" if torch.cuda.is_available() else "cpu"
        if raw.startswith("cuda:"):
            if not torch.cuda.is_available():
                return "cpu"
            try:
                index = int(raw.split(":", 1)[1])
            except (TypeError, ValueError):
                return "cuda:0"
            if index < 0:
                return "cuda:0"
            if index >= torch.cuda.device_count():
                return "cuda:0"
            return f"cuda:{index}"
        return "cuda:0" if torch.cuda.is_available() else "cpu"

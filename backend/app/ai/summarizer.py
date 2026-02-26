from __future__ import annotations


class Summarizer:
    async def summarize(self, abstract: str, max_chars: int = 220) -> str:
        if len(abstract) <= max_chars:
            return abstract
        return f"{abstract[:max_chars].rstrip()}..."

from __future__ import annotations

import logging
from email.message import EmailMessage
from typing import Any

import aiosmtplib

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_verification_email(email: str, code: str) -> None:
    settings = get_settings()

    if not settings.smtp_from_email or not settings.smtp_user or not settings.smtp_password:
        logger.info("SMTP not configured, skip sending verification email to %s", email)
        return

    message = EmailMessage()
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = email
    message["Subject"] = "PaperPanda Verification Code"
    message.set_content(f"Your verification code is: {code}\nThis code expires in 10 minutes.")

    # SMTP 465 usually requires implicit TLS (use_tls=True), while 587 uses STARTTLS.
    # Try likely mode first, then a fallback mode to improve compatibility with providers.
    if settings.smtp_port == 465:
        modes: list[dict[str, Any]] = [
            {"use_tls": True, "start_tls": False},
            {"use_tls": False, "start_tls": True},
        ]
    elif settings.smtp_use_tls:
        modes = [
            {"use_tls": False, "start_tls": True},
            {"use_tls": True, "start_tls": False},
        ]
    else:
        modes = [{"use_tls": False, "start_tls": False}]

    last_error: Exception | None = None
    for mode in modes:
        try:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                use_tls=mode["use_tls"],
                start_tls=mode["start_tls"],
            )
            return
        except Exception as exc:  # pragma: no cover - external SMTP errors
            last_error = exc
            logger.warning(
                "SMTP send failed (host=%s, port=%s, use_tls=%s, start_tls=%s): %s",
                settings.smtp_host,
                settings.smtp_port,
                mode["use_tls"],
                mode["start_tls"],
                exc,
            )

    # In local debug mode, do not block registration flow when external SMTP is unreachable.
    if settings.debug:
        logger.error("SMTP unavailable in debug mode, skip sending verification email to %s", email)
        return

    if last_error is not None:
        raise last_error

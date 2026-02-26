from __future__ import annotations

import logging


def setup_logging(level: str = "INFO", fmt: str = "json") -> None:
    log_level = getattr(logging, level.upper(), logging.INFO)
    log_format = "%(asctime)s %(levelname)s %(name)s %(message)s"
    if fmt == "console":
        log_format = "%(levelname)s %(name)s: %(message)s"
    logging.basicConfig(level=log_level, format=log_format)

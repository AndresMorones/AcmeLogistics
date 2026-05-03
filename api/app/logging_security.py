from __future__ import annotations

import re
from typing import Any, Mapping

from app.config import settings

REDACTED = "<redacted>"

_HR_KEY_RE = re.compile(r"sk_live_[a-zA-Z0-9_-]{30,}")

_BEARER_RE = re.compile(r"(?i)\bBearer\s+[a-zA-Z0-9._\-]{20,}")

# Traceback-targeted patterns: structlog's format_exc_info renders local-frame
# variables into a multi-line string that may contain short tokens or
# `Authorization=<value>` style dumps that the strict patterns above miss.
# These looser regexes catch the residual leak surface in formatted tracebacks.
_HR_KEY_LOOSE_RE = re.compile(r"sk_live_[a-zA-Z0-9_\-]+")
_BEARER_LOOSE_RE = re.compile(r"(?i)\bBearer\s+\S+")
# Matches `Authorization: <value>` / `Authorization='<value>'` etc. and consumes
# the entire value up to the closing quote or end-of-line, so a short Bearer
# token like `Authorization: 'Bearer abc'` is fully redacted (not just the
# `Bearer` keyword).
_AUTH_HEADER_QUOTED_RE = re.compile(
    r"(?i)(Authorization['\"]?\s*[:=]\s*)(['\"])[^'\"]*\2"
)
_AUTH_HEADER_BARE_RE = re.compile(
    r"(?i)(Authorization['\"]?\s*[:=]\s*)([^'\"\s,;}\]]+)"
)


def _redact_text(value: str) -> str:
    if not value:
        return value
    out = _HR_KEY_RE.sub(REDACTED, value)
    out = _BEARER_RE.sub(f"Bearer {REDACTED}", out)
    # Looser pass for traceback strings & local-frame dumps. Order matters:
    # collapse the entire Authorization value first (quoted form, then bare),
    # then sweep any remaining sk_live_ / Bearer fragments anywhere in the
    # string.
    out = _AUTH_HEADER_QUOTED_RE.sub(lambda m: f"{m.group(1)}{REDACTED}", out)
    out = _AUTH_HEADER_BARE_RE.sub(lambda m: f"{m.group(1)}{REDACTED}", out)
    out = _HR_KEY_LOOSE_RE.sub(REDACTED, out)
    out = _BEARER_LOOSE_RE.sub(f"Bearer {REDACTED}", out)
    # Literal-token sweep: catches raw bearer logged without `Bearer ` prefix
    # (e.g. local-frame dumps), which the regex passes above would miss.
    token = settings.api_bearer_token
    if token and len(token) >= 8 and token in out:
        out = out.replace(token, REDACTED)
    return out


def _scrub_value(value: Any) -> Any:
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, Mapping):
        return {k: _scrub_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        scrubbed = [_scrub_value(v) for v in value]
        return type(value)(scrubbed) if isinstance(value, tuple) else scrubbed
    return value


def scrub_secrets_processor(
    _logger: Any, _method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    return {k: _scrub_value(v) for k, v in event_dict.items()}


# Header names whose raw values must never reach structlog contextvars.
_SENSITIVE_HEADERS = {"authorization", "x-api-key", "cookie", "set-cookie"}


def safe_headers(headers: Mapping[str, str]) -> dict[str, str]:
    return {
        k: (REDACTED if k.lower() in _SENSITIVE_HEADERS else v)
        for k, v in headers.items()
    }

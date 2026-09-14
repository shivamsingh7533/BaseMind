"""Operator gating helpers."""

from ..config import get_settings


def is_operator(user: "object") -> bool:
    if not getattr(user, "email", None):
        return False
    allowed = [e.strip().lower() for e in get_settings().operator_emails.split(",") if e.strip()]
    return user.email.lower() in allowed
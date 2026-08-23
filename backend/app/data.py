"""Seed data store for the BaseMind API.

Production build starts empty — records are created through the API,
not hardcoded here.
"""

AGENTS: list[dict] = []

CONVERSATIONS: list[dict] = []

DOCUMENTS: list[dict] = []

DASHBOARD: dict = {
    "stats": [],
    "activity": [],
}

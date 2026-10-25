"""Unified connectors: one registry, BYO token or OAuth (your own app), agent tools that only read, search and draft.
Sending anything outside Free way always goes through a draft that the user approves explicitly."""
from .base import Connector, ConnectorError, REGISTRY, get, http, set_opener, BASES
from .store import ConnectorStore
from . import catalog  # noqa: F401  (registers every connector)

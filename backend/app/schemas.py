"""API request bodies. Response shapes are documented in BUILD.md section 10."""
from typing import Literal

from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    agent: bool = False
    fast: bool = False


class DiscoveryToggle(BaseModel):
    enabled: bool


class PlacesScanRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)


class WatchlistSave(BaseModel):
    """Either a pasted textarea blob or an array; split and validated in watchlist.validate()."""
    keywords: list[str] | str = ""
    sites: list[str] | str = ""


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    scan_ids: list[str]
    cluster_id: str | None = None


class CasePatch(BaseModel):
    status: Literal["open", "sent_for_takedown", "closed"] | None = None
    title: str | None = Field(default=None, max_length=300)
    add_scan_ids: list[str] | None = None

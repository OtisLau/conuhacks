"""
Screen regions endpoint.
"""

from typing import Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from engine.api.dependencies import get_cached_region_manager
from engine.core.regions import RegionManager, REGIONS


router = APIRouter()


class RegionInfo(BaseModel):
    """Information about a screen region."""
    name: str
    coords: List[float] = Field(
        ...,
        description="Normalized coordinates [x1, y1, x2, y2] (0.0-1.0)"
    )


class RegionsResponse(BaseModel):
    """Response listing available regions."""
    regions: List[RegionInfo]
    custom_regions: List[RegionInfo]
    window_regions: List[RegionInfo]


@router.get("/regions", response_model=RegionsResponse)
async def list_regions(
    region_manager: RegionManager = Depends(get_cached_region_manager),
):
    """
    List available screen regions.

    Returns default regions, custom regions, and any dynamically
    detected window-relative regions.
    """
    # Default regions
    default_regions = [
        RegionInfo(name=name, coords=list(coords))
        for name, coords in sorted(REGIONS.items())
    ]

    # Custom regions
    custom = [
        RegionInfo(name=name, coords=list(coords))
        for name, coords in sorted(region_manager.custom_regions.items())
    ]

    # Window-relative regions (if detected)
    window = [
        RegionInfo(name=name, coords=list(coords))
        for name, coords in sorted(region_manager._window_regions.items())
    ]

    return RegionsResponse(
        regions=default_regions,
        custom_regions=custom,
        window_regions=window,
    )

"""
Core types, exceptions, and utilities.
"""

from engine.core.types import BoundingBox, LocatorResult, Step, Plan
from engine.core.exceptions import (
    CONUError,
    ElementNotFoundError,
    OCRError,
    IconDetectionError,
    PlanningError,
)
from engine.core.regions import RegionManager, REGIONS

__all__ = [
    "BoundingBox",
    "LocatorResult",
    "Step",
    "Plan",
    "CONUError",
    "ElementNotFoundError",
    "OCRError",
    "IconDetectionError",
    "PlanningError",
    "RegionManager",
    "REGIONS",
]

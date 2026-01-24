"""
CONU Engine - AI Screen Tutorial Guide

Modular element locator and task planner for UI automation.
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
from engine.locators.hybrid_locator import HybridLocator
from engine.planner.gemini_planner import GeminiPlanner

__version__ = "0.1.0"

__all__ = [
    # Types
    "BoundingBox",
    "LocatorResult",
    "Step",
    "Plan",
    # Exceptions
    "CONUError",
    "ElementNotFoundError",
    "OCRError",
    "IconDetectionError",
    "PlanningError",
    # Regions
    "RegionManager",
    "REGIONS",
    # Locators
    "HybridLocator",
    # Planner
    "GeminiPlanner",
]

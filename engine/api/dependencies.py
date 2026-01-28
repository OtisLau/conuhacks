"""
Dependency injection for FastAPI endpoints.

Provides singleton instances of expensive-to-initialize objects like
the HybridLocator and GeminiPlanner.
"""

import shutil
import subprocess
from functools import lru_cache
from typing import Optional

from engine.locators.hybrid_locator import HybridLocator
from engine.planner.gemini_planner import GeminiPlanner
from engine.core.regions import RegionManager, get_region_manager
from engine.config import Config, get_config


@lru_cache()
def get_cached_config() -> Config:
    """Get the singleton config instance."""
    return get_config()


@lru_cache()
def get_cached_region_manager() -> RegionManager:
    """Get the singleton region manager instance."""
    return get_region_manager()


@lru_cache()
def get_cached_locator() -> HybridLocator:
    """Get the singleton hybrid locator instance."""
    config = get_cached_config()
    region_manager = get_cached_region_manager()
    return HybridLocator(config=config, region_manager=region_manager)


@lru_cache()
def get_cached_planner() -> GeminiPlanner:
    """Get the singleton Gemini planner instance."""
    config = get_cached_config()
    return GeminiPlanner(config=config)


def check_tesseract_available() -> bool:
    """Check if tesseract OCR is installed and accessible."""
    return shutil.which("tesseract") is not None


def check_gemini_api() -> tuple[bool, Optional[str]]:
    """
    Check if Gemini API is configured and accessible.

    Returns:
        Tuple of (is_available, error_message)
    """
    config = get_cached_config()
    if not config.google_api_key:
        return False, "GOOGLE_API_KEY not configured"

    # Could add a lightweight API test here, but for now just check the key exists
    return True, None


class ReadinessStatus:
    """Container for readiness check results."""

    def __init__(self):
        self.tesseract_available = False
        self.gemini_available = False
        self.gemini_error: Optional[str] = None

    @property
    def ready(self) -> bool:
        """Overall readiness status."""
        return self.tesseract_available and self.gemini_available

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON response."""
        return {
            "ready": self.ready,
            "tesseract": self.tesseract_available,
            "gemini": {
                "available": self.gemini_available,
                "error": self.gemini_error,
            },
        }


def check_readiness() -> ReadinessStatus:
    """Perform all readiness checks."""
    status = ReadinessStatus()
    status.tesseract_available = check_tesseract_available()
    status.gemini_available, status.gemini_error = check_gemini_api()
    return status

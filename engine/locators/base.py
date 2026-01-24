"""
Abstract base class for element locators.
"""

from abc import ABC, abstractmethod
from typing import Optional
from PIL import Image

from engine.core.types import LocatorResult


class BaseLocator(ABC):
    """Abstract base class for all locators."""

    @abstractmethod
    def locate(
        self,
        img: Image.Image,
        target: str,
        region: str = "full",
        **kwargs,
    ) -> LocatorResult:
        """
        Locate an element on screen.

        Args:
            img: Screenshot as PIL Image
            target: Text or description to find
            region: Screen region to search in

        Returns:
            LocatorResult with found status and coordinates
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of this locator for logging."""
        pass

    def supports_target(self, target: str, is_icon: bool = False) -> bool:
        """
        Check if this locator can handle the target.

        Override in subclasses for specific capabilities.
        """
        return True

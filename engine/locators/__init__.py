"""
Element locator implementations.
"""

from engine.locators.base import BaseLocator
from engine.locators.ocr_locator import OCRLocator
from engine.locators.icon_locator import IconLocator
from engine.locators.hybrid_locator import HybridLocator

__all__ = [
    "BaseLocator",
    "OCRLocator",
    "IconLocator",
    "HybridLocator",
]

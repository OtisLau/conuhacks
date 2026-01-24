"""
OCR-based text locator using Tesseract.
"""

import time
from difflib import SequenceMatcher
from typing import Optional, List, Dict, Any
from PIL import Image
import pytesseract

from engine.core.types import BoundingBox, LocatorResult, LocatorMethod
from engine.core.regions import RegionManager, get_region_manager
from engine.core.exceptions import OCRError, OCRTimeoutError
from engine.cache.ocr_cache import OCRCache, get_ocr_cache
from engine.locators.base import BaseLocator
from engine.config import Config, get_config


class OCRLocator(BaseLocator):
    """
    Locator using Tesseract OCR for text detection.

    Features:
    - LRU caching for repeated OCR calls
    - Fuzzy matching for approximate text
    - Suggestions for similar text when not found
    """

    def __init__(
        self,
        config: Optional[Config] = None,
        cache: Optional[OCRCache] = None,
        region_manager: Optional[RegionManager] = None,
    ):
        self.config = config or get_config()
        self.cache = cache or get_ocr_cache(self.config.ocr_cache_size)
        self.regions = region_manager or get_region_manager()

    @property
    def name(self) -> str:
        return "ocr"

    def supports_target(self, target: str, is_icon: bool = False) -> bool:
        # OCR only works for text, not icons
        return not is_icon

    def _run_ocr(self, img: Image.Image) -> Dict[str, Any]:
        """Run Tesseract OCR, using cache if available."""
        # Check cache first
        cached = self.cache.get(img)
        if cached:
            return cached.ocr_data

        # Run OCR
        try:
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        except Exception as e:
            raise OCRError(f"Tesseract failed: {e}", cause=e)

        # Extract all text for suggestions
        all_text = [t for t in data["text"] if t.strip()]

        # Cache the result
        self.cache.put(img, data, all_text)
        return data

    def _get_all_text(self, img: Image.Image) -> List[str]:
        """Get all text detected in an image (for suggestions)."""
        cached = self.cache.get(img)
        if cached:
            return cached.all_text

        # Run OCR if not cached
        self._run_ocr(img)
        cached = self.cache.get(img)
        return cached.all_text if cached else []

    def _fuzzy_match(self, target: str, text: str) -> float:
        """Calculate fuzzy match score between target and text."""
        return SequenceMatcher(None, target.lower(), text.lower()).ratio()

    def _find_suggestions(
        self, target: str, all_text: List[str], limit: int = 5
    ) -> List[str]:
        """Find similar text strings for suggestions."""
        scored = []
        target_lower = target.lower()

        for text in all_text:
            if not text.strip():
                continue
            score = self._fuzzy_match(target, text)
            if score > 0.3:  # Minimum similarity threshold
                scored.append((text, score))

        # Sort by score descending
        scored.sort(key=lambda x: x[1], reverse=True)
        return [text for text, _ in scored[:limit]]

    def locate(
        self,
        img: Image.Image,
        target: str,
        region: str = "full",
        fuzzy: bool = True,
        return_all: bool = False,
        **kwargs,
    ) -> LocatorResult:
        """
        Find text on screen using OCR.

        Args:
            img: Screenshot as PIL Image
            target: Text to find
            region: Screen region to search in
            fuzzy: Allow fuzzy matching (default True)
            return_all: If True, return all matches in result.all_matches

        Returns:
            LocatorResult with found status and coordinates
        """
        start = time.time()

        # Crop to region
        cropped, offset = self.regions.crop_image(img, region)

        # Run OCR
        data = self._run_ocr(cropped)

        target_lower = target.lower()
        all_matches = []
        fuzzy_threshold = self.config.ocr_fuzzy_threshold

        # Search through OCR results
        for i, text in enumerate(data["text"]):
            if not text.strip():
                continue

            text_lower = text.lower()
            conf = int(data["conf"][i])

            # Exact match
            if target_lower == text_lower:
                score = 1.0
            # Substring match
            elif target_lower in text_lower:
                score = 0.95
            # Fuzzy match (if enabled)
            elif fuzzy:
                score = self._fuzzy_match(target, text)
            else:
                score = 0

            if score >= fuzzy_threshold:
                x = data["left"][i] + offset[0]
                y = data["top"][i] + offset[1]
                w = data["width"][i]
                h = data["height"][i]

                all_matches.append({
                    "text": text,
                    "bbox": BoundingBox(x, y, x + w, y + h),
                    "confidence": conf,
                    "match_score": score,
                    "weighted_score": score * (conf / 100),
                })

        elapsed_ms = (time.time() - start) * 1000

        if all_matches:
            # Sort by weighted score, best first
            all_matches.sort(key=lambda x: x["weighted_score"], reverse=True)
            best_match = all_matches[0]

            result = LocatorResult(
                found=True,
                element=best_match["text"],
                bbox=best_match["bbox"],
                confidence=best_match["confidence"],
                method=LocatorMethod.OCR,
                time_ms=elapsed_ms,
            )
            # Attach all matches for verification if needed
            result.all_matches = all_matches
            return result

        # Not found - get suggestions
        all_text = self._get_all_text(cropped)
        suggestions = self._find_suggestions(target, all_text)

        return LocatorResult(
            found=False,
            element=None,
            bbox=None,
            confidence=0,
            method=LocatorMethod.OCR,
            time_ms=elapsed_ms,
            suggestions=suggestions,
        )

    def get_all_text_in_region(
        self, img: Image.Image, region: str = "full"
    ) -> List[Dict[str, Any]]:
        """
        Get all text elements in a region.

        Useful for debugging and exploration.
        """
        cropped, offset = self.regions.crop_image(img, region)
        data = self._run_ocr(cropped)

        elements = []
        for i, text in enumerate(data["text"]):
            if not text.strip():
                continue

            conf = int(data["conf"][i])
            x = data["left"][i] + offset[0]
            y = data["top"][i] + offset[1]
            w = data["width"][i]
            h = data["height"][i]

            elements.append({
                "text": text,
                "bbox": BoundingBox(x, y, x + w, y + h),
                "confidence": conf,
            })

        return elements

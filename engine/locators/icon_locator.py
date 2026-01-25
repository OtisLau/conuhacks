"""
Icon locator using OmniParser + Gemini validation.
"""

import os
import json
import time
from typing import Optional, List, Dict, Any
from PIL import Image
import google.generativeai as genai

from engine.core.types import BoundingBox, LocatorResult, LocatorMethod
from engine.core.regions import RegionManager, get_region_manager
from engine.core.exceptions import IconDetectionError, OmniParserError, GeminiValidationError
from engine.locators.base import BaseLocator
from engine.config import Config, get_config


class IconLocator(BaseLocator):
    """
    Locator for icons using OmniParser detection + Gemini validation.

    Workflow:
    1. Load pre-computed OmniParser elements (or call Modal endpoint)
    2. Filter elements by region
    3. Use Gemini to validate each candidate
    """

    def __init__(
        self,
        config: Optional[Config] = None,
        region_manager: Optional[RegionManager] = None,
    ):
        self.config = config or get_config()
        self.regions = region_manager or get_region_manager()
        self._omni_elements: Optional[List[Dict]] = None
        self._model = None

        # Configure Gemini
        if self.config.google_api_key:
            genai.configure(api_key=self.config.google_api_key)

    @property
    def name(self) -> str:
        return "icon"

    @property
    def model(self):
        """Lazy-load Gemini model (fast model for validation)."""
        if self._model is None:
            self._model = genai.GenerativeModel(self.config.gemini_fast_model)
        return self._model

    def supports_target(self, target: str, is_icon: bool = False) -> bool:
        # Icons work best for icon targets
        return True

    def load_omni_elements(
        self, json_path: str = "omni_result.json"
    ) -> List[Dict[str, Any]]:
        """
        Load pre-computed OmniParser results from JSON.

        Args:
            json_path: Path to OmniParser output JSON

        Returns:
            List of element dictionaries with bbox and confidence
        """
        if os.path.exists(json_path):
            with open(json_path) as f:
                data = json.load(f)
            self._omni_elements = data.get("elements", [])
        else:
            self._omni_elements = []
        return self._omni_elements

    def set_omni_elements(self, elements: List[Dict[str, Any]]) -> None:
        """Set OmniParser elements directly (for Modal integration)."""
        self._omni_elements = elements

    def _filter_by_region(
        self, elements: List[Dict], region_name: str
    ) -> List[Dict]:
        """Filter elements to those within a region."""
        if region_name == "full":
            return elements

        try:
            region = self.regions.get(region_name)
            x1, y1, x2, y2 = region.coords
        except Exception:
            # If region not found, don't filter
            return elements

        filtered = []
        for el in elements:
            bbox = el.get("bbox", [])
            if len(bbox) < 4:
                continue
            # Check if element center is in region
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
            if x1 <= cx <= x2 and y1 <= cy <= y2:
                filtered.append(el)

        return filtered

    def _validate_with_gemini(
        self, img: Image.Image, bbox_px: List[int], target: str
    ) -> bool:
        """
        Use Gemini to validate if a cropped element matches the target.

        Args:
            img: Full screenshot
            bbox_px: Pixel coordinates [x1, y1, x2, y2]
            target: Description of the target icon

        Returns:
            True if Gemini confirms match
        """
        try:
            # Crop with padding
            w, h = img.size
            pad = 10
            x1 = max(0, bbox_px[0] - pad)
            y1 = max(0, bbox_px[1] - pad)
            x2 = min(w, bbox_px[2] + pad)
            y2 = min(h, bbox_px[3] + pad)
            crop = img.crop((x1, y1, x2, y2))

            prompt = f'Is this UI element a "{target}"? Reply YES or NO only.'

            response = self.model.generate_content([prompt, crop])
            answer = response.text.strip().upper()

            return "YES" in answer

        except Exception as e:
            raise GeminiValidationError(f"Gemini validation failed: {e}", cause=e)

    def locate(
        self,
        img: Image.Image,
        target: str,
        region: str = "full",
        omni_path: Optional[str] = None,
        max_candidates: Optional[int] = None,
        **kwargs,
    ) -> LocatorResult:
        """
        Find an icon on screen.

        Args:
            img: Screenshot as PIL Image
            target: Description of the icon to find
            region: Screen region to search in
            omni_path: Path to OmniParser JSON (default: omni_result.json)
            max_candidates: Max elements to check with Gemini

        Returns:
            LocatorResult with found status and coordinates
        """
        start = time.time()

        # Load OmniParser elements if not already loaded
        if self._omni_elements is None:
            self.load_omni_elements(omni_path or "omni_result.json")

        if not self._omni_elements:
            return LocatorResult(
                found=False,
                method=LocatorMethod.ICON,
                time_ms=(time.time() - start) * 1000,
                suggestions=["No OmniParser elements loaded. Run omni_modal.py first."],
            )

        # Filter by region
        candidates = self._filter_by_region(self._omni_elements, region)

        if not candidates:
            return LocatorResult(
                found=False,
                method=LocatorMethod.ICON,
                time_ms=(time.time() - start) * 1000,
                suggestions=[f"No elements found in region '{region}'"],
            )

        # Sort by confidence and limit
        candidates.sort(key=lambda x: x.get("confidence", 0), reverse=True)
        max_check = max_candidates or self.config.icon_max_candidates
        candidates = candidates[:max_check]

        # Convert normalized bbox to pixels
        w, h = img.size

        # Check each candidate with Gemini
        for el in candidates:
            bbox = el["bbox"]
            x1 = int(bbox[0] * w)
            y1 = int(bbox[1] * h)
            x2 = int(bbox[2] * w)
            y2 = int(bbox[3] * h)
            bbox_px = [x1, y1, x2, y2]

            try:
                is_match = self._validate_with_gemini(img, bbox_px, target)
                if is_match:
                    elapsed_ms = (time.time() - start) * 1000
                    return LocatorResult(
                        found=True,
                        element=target,
                        bbox=BoundingBox(x1, y1, x2, y2),
                        confidence=el.get("confidence", 0.5) * 100,
                        method=LocatorMethod.ICON,
                        time_ms=elapsed_ms,
                    )
            except GeminiValidationError:
                # Continue to next candidate on validation failure
                continue

        # Not found
        elapsed_ms = (time.time() - start) * 1000
        return LocatorResult(
            found=False,
            element=None,
            bbox=None,
            confidence=0,
            method=LocatorMethod.ICON,
            time_ms=elapsed_ms,
            suggestions=[f"Checked {len(candidates)} candidates, none matched '{target}'"],
        )

    def get_all_elements_in_region(
        self, img: Image.Image, region: str = "full"
    ) -> List[Dict[str, Any]]:
        """
        Get all detected elements in a region.

        Useful for debugging and exploration.
        """
        if self._omni_elements is None:
            self.load_omni_elements()

        candidates = self._filter_by_region(self._omni_elements or [], region)
        w, h = img.size

        elements = []
        for el in candidates:
            bbox = el["bbox"]
            x1 = int(bbox[0] * w)
            y1 = int(bbox[1] * h)
            x2 = int(bbox[2] * w)
            y2 = int(bbox[3] * h)

            elements.append({
                "id": el.get("id", "unknown"),
                "bbox": BoundingBox(x1, y1, x2, y2),
                "confidence": el.get("confidence", 0),
            })

        return elements

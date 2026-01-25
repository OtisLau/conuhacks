"""
Hybrid locator that orchestrates OCR and icon detection.
"""

import time
from typing import Optional, List
from PIL import Image
import google.generativeai as genai

from engine.core.types import LocatorResult, LocatorMethod, BoundingBox
from engine.core.regions import RegionManager, get_region_manager
from engine.core.exceptions import ElementNotFoundError
from engine.locators.base import BaseLocator
from engine.locators.ocr_locator import OCRLocator
from engine.locators.icon_locator import IconLocator
from engine.utils.retry import with_retry, RetryConfig
from engine.config import Config, get_config


PICK_ELEMENT_PROMPT = '''The user wants to: "{instruction}"

I found {count} UI elements matching "{target}". Each is marked with a colored box and number.

RULES for picking the correct element:
1. Must be inside the app window (NOT in terminal/command output)
2. Pick the PRIMARY/MAIN option, not secondary sub-options
   - Example: "dark mode" = main Light/Dark/Auto selector at TOP, NOT "icon & widget style" options below it
3. When in doubt, prefer the element that appears HIGHER on screen (main options are usually at the top)
4. Pick the one that DIRECTLY accomplishes the user's stated goal

Reply with just the number (1, 2, 3...) or "0" if none are correct.'''


VERIFY_SINGLE_PROMPT = '''The user wants to: "{instruction}"

I found a UI element matching "{target}" (marked with a red box).

Is this the CORRECT element to click? Check:
1. Is it inside the application window (not in terminal output)?
2. Is it the PRIMARY option for this task (not a secondary sub-option)?
   - For "dark mode": should be the MAIN Light/Dark/Auto selector, NOT "icon & widget style"
3. Does clicking this directly accomplish the user's goal?

Reply YES or NO only.'''


class HybridLocator(BaseLocator):
    """
    Orchestrates OCR and icon detection with fallback logic.

    Strategy:
    1. Try OCR first (fast, ~95% accurate for text)
    2. If not found and is_icon=True (or OCR failed), try icon detection
    3. Apply retry logic for transient failures
    """

    def __init__(
        self,
        config: Optional[Config] = None,
        region_manager: Optional[RegionManager] = None,
        ocr_locator: Optional[OCRLocator] = None,
        icon_locator: Optional[IconLocator] = None,
    ):
        self.config = config or get_config()
        self.regions = region_manager or get_region_manager()
        self.ocr = ocr_locator or OCRLocator(self.config, region_manager=self.regions)
        self.icon = icon_locator or IconLocator(self.config, region_manager=self.regions)
        self._verify_model = None

        # Configure Gemini
        if self.config.google_api_key:
            genai.configure(api_key=self.config.google_api_key)

        # Track statistics
        self._stats = {
            "ocr_attempts": 0,
            "ocr_successes": 0,
            "icon_attempts": 0,
            "icon_successes": 0,
            "fallbacks": 0,
            "verifications": 0,
        }

    @property
    def verify_model(self):
        """Lazy-load fast Gemini model for verification."""
        if self._verify_model is None:
            self._verify_model = genai.GenerativeModel(self.config.gemini_fast_model)
        return self._verify_model

    def _verify_single_match(
        self,
        img: Image.Image,
        match: dict,
        target: str,
        instruction: str,
    ) -> bool:
        """Verify a single match is correct using YES/NO question."""
        from PIL import ImageDraw

        try:
            # Create annotated image with box around the match
            annotated = img.copy()
            draw = ImageDraw.Draw(annotated)
            bbox = match["bbox"]

            # Draw red box
            draw.rectangle(
                [bbox.x1, bbox.y1, bbox.x2, bbox.y2],
                outline="#FF0000",
                width=4
            )

            # Resize for API
            max_width = 1200
            if annotated.width > max_width:
                ratio = max_width / annotated.width
                new_size = (max_width, int(annotated.height * ratio))
                annotated = annotated.resize(new_size, Image.LANCZOS)

            prompt = VERIFY_SINGLE_PROMPT.format(
                instruction=instruction,
                target=target,
            )

            response = self.verify_model.generate_content([prompt, annotated])
            answer = response.text.strip().upper()

            self._stats["verifications"] += 1
            return "YES" in answer

        except Exception:
            return True  # Assume correct on error

    def _pick_best_match(
        self,
        img: Image.Image,
        matches: List[dict],
        target: str,
        instruction: str,
    ) -> Optional[dict]:
        """
        Use Gemini to pick the correct element from multiple matches.
        Returns the best match dict, or None if none are correct.
        """
        from PIL import ImageDraw

        # For single match, use YES/NO verification
        if len(matches) == 1:
            if self._verify_single_match(img, matches[0], target, instruction):
                return matches[0]
            return None

        try:
            # Sort matches by Y position (top to bottom) so #1 is topmost
            sorted_matches = sorted(matches, key=lambda m: m["bbox"].y1)

            # Create annotated image with numbered boxes
            annotated = img.copy()
            draw = ImageDraw.Draw(annotated)

            colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]

            for i, match in enumerate(sorted_matches):
                bbox = match["bbox"]
                color = colors[i % len(colors)]

                # Draw box
                draw.rectangle(
                    [bbox.x1, bbox.y1, bbox.x2, bbox.y2],
                    outline=color,
                    width=4
                )

                # Draw number label
                label = str(i + 1)
                draw.rectangle(
                    [bbox.x1 - 2, bbox.y1 - 25, bbox.x1 + 25, bbox.y1 - 2],
                    fill=color
                )
                draw.text((bbox.x1 + 5, bbox.y1 - 23), label, fill="black")

            # Resize for API
            max_width = 1200
            if annotated.width > max_width:
                ratio = max_width / annotated.width
                new_size = (max_width, int(annotated.height * ratio))
                annotated = annotated.resize(new_size, Image.LANCZOS)

            prompt = PICK_ELEMENT_PROMPT.format(
                instruction=instruction,
                count=len(sorted_matches),
                target=target,
            )

            response = self.verify_model.generate_content([prompt, annotated])
            answer = response.text.strip()

            # Extract number from response
            self._stats["verifications"] += 1
            for char in answer:
                if char.isdigit():
                    num = int(char)
                    if num == 0:
                        return None  # None are correct
                    if 1 <= num <= len(sorted_matches):
                        return sorted_matches[num - 1]  # Return the actual match

            return sorted_matches[0]  # Default to first (topmost) match

        except Exception:
            return matches[0] if matches else None  # Default to first match on error

    @property
    def name(self) -> str:
        return "hybrid"

    @property
    def stats(self) -> dict:
        """Get locator statistics."""
        return self._stats.copy()

    def _try_ocr(
        self, img: Image.Image, target: str, region: str, **kwargs
    ) -> LocatorResult:
        """Attempt OCR location with retry."""
        self._stats["ocr_attempts"] += 1

        retry_config = RetryConfig(
            max_attempts=self.config.max_retries,
            base_delay=self.config.retry_base_delay,
            max_delay=self.config.retry_max_delay,
        )

        @with_retry(retry_config)
        def _ocr():
            return self.ocr.locate(img, target, region, **kwargs)

        try:
            result = _ocr()
            if result.found:
                self._stats["ocr_successes"] += 1
            return result
        except Exception:
            return LocatorResult.not_found()

    def _try_icon(
        self, img: Image.Image, target: str, region: str, **kwargs
    ) -> LocatorResult:
        """Attempt icon location with retry."""
        self._stats["icon_attempts"] += 1

        retry_config = RetryConfig(
            max_attempts=self.config.max_retries,
            base_delay=self.config.retry_base_delay,
            max_delay=self.config.retry_max_delay,
        )

        @with_retry(retry_config)
        def _icon():
            return self.icon.locate(img, target, region, **kwargs)

        try:
            result = _icon()
            if result.found:
                self._stats["icon_successes"] += 1
            return result
        except Exception:
            return LocatorResult.not_found()

    def locate(
        self,
        img: Image.Image,
        target: str,
        region: str = "full",
        is_icon: bool = False,
        raise_on_not_found: bool = False,
        instruction: str = "",
        **kwargs,
    ) -> LocatorResult:
        """
        Find a UI element on screen.

        Args:
            img: Screenshot as PIL Image
            target: Text or description to find
            region: Screen region hint
            is_icon: If True, skip OCR and use icon detection directly
            raise_on_not_found: Raise ElementNotFoundError if not found
            instruction: Full instruction for context (used for verification)

        Returns:
            LocatorResult with found status and coordinates
        """
        start = time.time()
        all_suggestions: List[str] = []

        # Try OCR first (unless explicitly icon)
        if not is_icon:
            result = self._try_ocr(img, target, region, **kwargs)
            if result.found:
                all_matches = getattr(result, 'all_matches', [])

                # Always verify with Gemini if we have instruction context
                # Even single matches could be wrong (e.g., text in terminal)
                if len(all_matches) >= 1 and instruction:
                    best_match = self._pick_best_match(img, all_matches, target, instruction)
                    if best_match is None:
                        # Gemini says none of the matches are correct
                        result.found = False
                        result.suggestions = ["Found text but not in correct context"]
                    else:
                        result.bbox = best_match["bbox"]
                        result.element = best_match["text"]
                        result.confidence = best_match["confidence"]

                if result.found:
                    result.method = LocatorMethod.HYBRID
                    result.time_ms = (time.time() - start) * 1000
                    return result
            all_suggestions.extend(result.suggestions or [])

            # Fallback: if region search failed, try the window region (not full screen)
            # This avoids finding text in other windows like terminal
            if region != "full" and region != "window":
                # Try window region first (stays within target app)
                fallback_region = "window" if "window" in [r for r in self.regions.list_regions()] else "full"
                result = self._try_ocr(img, target, fallback_region, **kwargs)
                if result.found:
                    all_matches = getattr(result, 'all_matches', [])
                    if len(all_matches) >= 1 and instruction:
                        best_match = self._pick_best_match(img, all_matches, target, instruction)
                        if best_match is None:
                            result.found = False
                            result.suggestions = ["Found text but not in correct context"]
                        else:
                            result.bbox = best_match["bbox"]
                            result.element = best_match["text"]
                            result.confidence = best_match["confidence"]

                    if result.found:
                        result.method = LocatorMethod.HYBRID
                        result.time_ms = (time.time() - start) * 1000
                        return result
                all_suggestions.extend(result.suggestions or [])

        # Fall back to icon detection
        self._stats["fallbacks"] += 1
        result = self._try_icon(img, target, region, **kwargs)

        if result.found:
            result.method = LocatorMethod.HYBRID
            result.time_ms = (time.time() - start) * 1000
            return result

        all_suggestions.extend(result.suggestions)

        # Not found
        elapsed_ms = (time.time() - start) * 1000
        final_result = LocatorResult(
            found=False,
            element=None,
            bbox=None,
            confidence=0,
            method=LocatorMethod.HYBRID,
            time_ms=elapsed_ms,
            suggestions=list(set(all_suggestions)),  # Dedupe
        )

        if raise_on_not_found:
            raise ElementNotFoundError(
                target=target,
                region=region,
                suggestions=final_result.suggestions,
            )

        return final_result

    def locate_all(
        self,
        img: Image.Image,
        targets: List[str],
        region: str = "full",
        **kwargs,
    ) -> List[LocatorResult]:
        """
        Find multiple elements on screen.

        Args:
            img: Screenshot as PIL Image
            targets: List of targets to find
            region: Screen region hint

        Returns:
            List of LocatorResults in same order as targets
        """
        results = []
        for target in targets:
            result = self.locate(img, target, region, **kwargs)
            results.append(result)
        return results

    def reset_stats(self) -> None:
        """Reset statistics counters."""
        self._stats = {
            "ocr_attempts": 0,
            "ocr_successes": 0,
            "icon_attempts": 0,
            "icon_successes": 0,
            "fallbacks": 0,
        }

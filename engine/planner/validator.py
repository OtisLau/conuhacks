"""
Plan and step validation utilities.
"""

from typing import Optional, List, Tuple
from PIL import Image
import google.generativeai as genai

from engine.core.types import Step, Plan, LocatorResult, BoundingBox
from engine.core.regions import REGIONS
from engine.config import Config, get_config


class PlanValidator:
    """
    Validates plans and handles multi-match disambiguation.

    Used when multiple elements match a target, or when confidence is low.
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or get_config()
        self._model = None

        if self.config.google_api_key:
            genai.configure(api_key=self.config.google_api_key)

    @property
    def model(self):
        """Lazy-load Gemini model."""
        if self._model is None:
            self._model = genai.GenerativeModel(self.config.gemini_model)
        return self._model

    def validate_step(self, step: Step) -> List[str]:
        """
        Validate a single step for common issues.

        Returns list of warning messages (empty if valid).
        """
        warnings = []

        # Check target text
        if not step.target_text or len(step.target_text.strip()) < 2:
            warnings.append("Target text is too short or empty")

        # Check region
        if step.region not in REGIONS:
            warnings.append(f"Unknown region: {step.region}")

        # Check instruction
        if not step.instruction or len(step.instruction) < 5:
            warnings.append("Instruction is too short")

        return warnings

    def validate_plan(self, plan: Plan) -> Tuple[bool, List[str]]:
        """
        Validate an entire plan.

        Returns:
            Tuple of (is_valid, list of warnings)
        """
        all_warnings = []

        if not plan.steps:
            return False, ["Plan has no steps"]

        if len(plan.steps) > 10:
            all_warnings.append(f"Plan has many steps ({len(plan.steps)}), may be over-complicated")

        for i, step in enumerate(plan.steps):
            step_warnings = self.validate_step(step)
            for w in step_warnings:
                all_warnings.append(f"Step {i+1}: {w}")

        is_valid = len([w for w in all_warnings if not w.startswith("Step")]) == 0
        return is_valid, all_warnings

    def disambiguate(
        self,
        img: Image.Image,
        step: Step,
        candidates: List[LocatorResult],
    ) -> Optional[LocatorResult]:
        """
        Disambiguate between multiple matching elements using Gemini.

        Args:
            img: Screenshot
            step: The step being executed
            candidates: List of possible matches

        Returns:
            Best matching LocatorResult, or None if can't disambiguate
        """
        if not candidates:
            return None

        if len(candidates) == 1:
            return candidates[0]

        # Prepare crops of each candidate
        crops = []
        for i, result in enumerate(candidates):
            if result.bbox:
                # Expand bbox slightly for context
                bbox = result.bbox.expand(20).clamp(img.width, img.height)
                crop = img.crop((bbox.x1, bbox.y1, bbox.x2, bbox.y2))
                crops.append((i, crop))

        if not crops:
            return candidates[0]

        # Ask Gemini to pick the best one
        prompt = f'''Task: {step.instruction}
Target: "{step.target_text}"

I have {len(crops)} possible matches. Which one is correct for this task?
The images are numbered 0 to {len(crops)-1}.

Reply with just the number (0, 1, 2, etc.) of the best match.'''

        # Prepare content with all crops
        content = [prompt]
        for i, crop in crops:
            content.append(f"Option {i}:")
            content.append(crop)

        try:
            response = self.model.generate_content(content)
            answer = response.text.strip()

            # Extract number from response
            for char in answer:
                if char.isdigit():
                    idx = int(char)
                    if 0 <= idx < len(candidates):
                        return candidates[idx]

            # Fallback to first candidate
            return candidates[0]

        except Exception:
            # On error, return first candidate
            return candidates[0]

    def verify_result(
        self,
        img: Image.Image,
        step: Step,
        result: LocatorResult,
    ) -> Tuple[bool, float]:
        """
        Verify that a locator result is correct for the step.

        Args:
            img: Screenshot
            step: The step being executed
            result: The locator result to verify

        Returns:
            Tuple of (is_correct, confidence_score)
        """
        if not result.found or not result.bbox:
            return False, 0.0

        # High confidence results are assumed correct
        if result.confidence >= 90:
            return True, result.confidence

        # For lower confidence, ask Gemini to verify
        bbox = result.bbox.expand(20).clamp(img.width, img.height)
        crop = img.crop((bbox.x1, bbox.y1, bbox.x2, bbox.y2))

        prompt = f'''Task: {step.instruction}
Target: "{step.target_text}"

Is this the correct element to click? Reply with:
- YES if this is definitely correct
- NO if this is wrong
- MAYBE if unsure'''

        try:
            response = self.model.generate_content([prompt, crop])
            answer = response.text.strip().upper()

            if "YES" in answer:
                return True, max(result.confidence, 85)
            elif "NO" in answer:
                return False, 0.0
            else:  # MAYBE
                return True, min(result.confidence, 60)

        except Exception:
            # On error, trust the original result
            return result.confidence >= 50, result.confidence


def validate_plan(plan: Plan) -> Tuple[bool, List[str]]:
    """Convenience function to validate a plan."""
    validator = PlanValidator()
    return validator.validate_plan(plan)

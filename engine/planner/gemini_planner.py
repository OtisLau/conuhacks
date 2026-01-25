"""
Gemini-based task planner.
"""

import json
import re
from typing import Optional, List
from PIL import Image
import google.generativeai as genai

from engine.core.types import Step, Plan
from engine.core.exceptions import PlanningError
from engine.utils.image import resize_for_api
from engine.utils.retry import with_retry, RetryConfig
from engine.config import Config, get_config


PLAN_PROMPT = '''You are a macOS UI automation assistant. Your job is to plan ALL the clicks needed to FULLY complete a task.

TASK: {task}

STEP 1 - ANALYZE THE SCREEN:
Look at the screenshot carefully. Identify:
- What application is open?
- What panel/section is currently showing?
- What clickable elements are VISIBLE RIGHT NOW?

STEP 2 - PLAN ALL REQUIRED CLICKS:
Think through the COMPLETE task from start to finish. Include ALL steps needed.

CRITICAL RULES:
- Plan the ENTIRE task, not just the first click
- Include steps for screens that will appear AFTER clicking
- Each target_text must be EXACT text on a clickable element
- For icons (is_icon: true), specify which QUAD of the screen it's in

QUAD values (only for is_icon: true):
  "top" = top half of screen (header bars, nav bars, toolbars) - USE THIS FOR MOST WEB APP ICONS
  "bottom" = bottom half (footers, docks)
  "left" = left half (sidebars)
  "right" = right half (right panels)
  1 = top-left quadrant only
  2 = top-right quadrant only
  3 = bottom-left quadrant only
  4 = bottom-right quadrant only

STEP 3 - RETURN JSON:
{{"analysis": "Brief description of what you see and what steps are needed",
  "steps": [
    {{"instruction": "Click Appearance", "target_text": "Appearance", "region": "window", "is_icon": false}},
    {{"instruction": "Click the grid icon to see courses", "target_text": "grid of 9 squares", "region": "window", "quad": "top", "is_icon": true}}
  ]
}}

Regions: window (active app), full (entire screen), menu_bar, dock
quad: REQUIRED for icons - use "top" for header/navbar icons, "left" for sidebar icons
is_icon: true ONLY for icons without any text label (omit quad for text elements)

Return valid JSON only.'''


VALIDATE_PROMPT = '''Look at this screenshot and verify if "{target}" is visible and clickable in the {region} region.

Respond with JSON only:
{{"visible": true/false, "exact_text": "the exact text if visible", "confidence": 0-100}}'''


class GeminiPlanner:
    """
    Task planner using Gemini vision model.

    Takes a screenshot and task description, returns a plan with steps.
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or get_config()
        self._planner_model = None  # Smart model for planning
        self._fast_model = None     # Fast model for QA

        if self.config.google_api_key:
            genai.configure(api_key=self.config.google_api_key)

    @property
    def planner_model(self):
        """Lazy-load smart Gemini model for planning."""
        if self._planner_model is None:
            self._planner_model = genai.GenerativeModel(self.config.gemini_planner_model)
        return self._planner_model

    @property
    def fast_model(self):
        """Lazy-load fast Gemini model for QA/validation."""
        if self._fast_model is None:
            self._fast_model = genai.GenerativeModel(self.config.gemini_fast_model)
        return self._fast_model

    @property
    def model(self):
        """Alias for planner_model (backwards compat)."""
        return self.planner_model

    def _parse_response(self, text: str) -> tuple[List[dict], str]:
        """Parse JSON response from Gemini. Returns (steps, analysis)."""
        # Strip markdown code blocks if present
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first and last lines (```json and ```)
            text = "\n".join(lines[1:-1])

        try:
            data = json.loads(text)
            analysis = data.get("analysis", "")
            steps = data.get("steps", [])
            return steps, analysis
        except json.JSONDecodeError as e:
            raise PlanningError(
                task="parse",
                message=f"Invalid JSON response: {e}",
            )

    def validate_target(
        self,
        img: Image.Image,
        target: str,
        region: str,
    ) -> dict:
        """Validate that a target is actually visible on screen (uses fast model)."""
        img_small = resize_for_api(img, max_width=1200)
        prompt = VALIDATE_PROMPT.format(target=target, region=region)

        try:
            response = self.fast_model.generate_content([prompt, img_small])
            text = response.text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])
            return json.loads(text)
        except Exception:
            return {"visible": True, "confidence": 50}  # Assume visible on error

    def _validate_step(self, step_data: dict, index: int) -> Step:
        """Validate and convert step data to Step object."""
        required = ["instruction", "target_text"]
        for field in required:
            if field not in step_data:
                raise PlanningError(
                    task="validate",
                    message=f"Step {index} missing required field: {field}",
                )

        is_icon = step_data.get("is_icon", False)
        quad = step_data.get("quad")

        # Validate quad - can be 1-4 or "top", "bottom", "left", "right"
        valid_quads = [1, 2, 3, 4, "top", "bottom", "left", "right"]
        if quad is not None and quad not in valid_quads:
            quad = None

        return Step(
            instruction=step_data["instruction"],
            target_text=step_data["target_text"],
            region=step_data.get("region", "full"),
            quad=quad if is_icon else None,  # Only use quad for icons
            is_icon=is_icon,
        )

    def generate_plan(
        self,
        img: Image.Image,
        task: str,
        max_steps: Optional[int] = None,
    ) -> Plan:
        """
        Generate a step-by-step plan for a task.

        Args:
            img: Screenshot of current screen state
            task: Description of what to accomplish
            max_steps: Maximum number of steps (default from config)

        Returns:
            Plan with steps to execute
        """
        max_steps = max_steps or self.config.plan_max_steps

        # Resize image - HD resolution for faster API calls
        img_small = resize_for_api(img, max_width=1280)

        # Build prompt
        prompt = PLAN_PROMPT.format(task=task)

        # Retry config
        retry_config = RetryConfig(
            max_attempts=self.config.max_retries,
            base_delay=self.config.retry_base_delay,
        )

        @with_retry(retry_config)
        def _call_gemini():
            response = self.model.generate_content([prompt, img_small])
            return response.text

        try:
            response_text = _call_gemini()
        except Exception as e:
            raise PlanningError(
                task=task,
                message=f"Gemini API failed: {e}",
                cause=e,
            )

        # Parse response
        try:
            steps_data, analysis = self._parse_response(response_text)
        except PlanningError:
            raise
        except Exception as e:
            raise PlanningError(
                task=task,
                message=f"Failed to parse response: {e}",
                cause=e,
            )

        if not steps_data:
            raise PlanningError(
                task=task,
                message="No steps generated",
            )

        # Log analysis for debugging
        if analysis:
            print(f"  Analysis: {analysis}")

        # Convert to Step objects
        steps = []
        for i, step_data in enumerate(steps_data):
            try:
                step = self._validate_step(step_data, i)
                steps.append(step)
            except PlanningError:
                raise
            except Exception as e:
                raise PlanningError(
                    task=task,
                    message=f"Invalid step {i}: {e}",
                    cause=e,
                )

        # QA: Validate first step target is actually visible
        if steps:
            first_step = steps[0]
            validation = self.validate_target(img, first_step.target_text, first_step.region)
            if not validation.get("visible", True):
                print(f"  Warning: '{first_step.target_text}' may not be visible")
                # Could regenerate plan here, but for now just warn

        return Plan(task=task, steps=steps)

    def refine_plan(
        self,
        img: Image.Image,
        plan: Plan,
        feedback: str,
    ) -> Plan:
        """
        Refine an existing plan based on feedback.

        Args:
            img: Current screenshot
            plan: Existing plan to refine
            feedback: What went wrong or needs adjustment

        Returns:
            Updated plan
        """
        prompt = f'''Original task: {plan.task}

Current plan:
{json.dumps([s.to_dict() for s in plan.steps], indent=2)}

Problem: {feedback}

Generate a revised plan that addresses this issue.
Return JSON with "steps" array only, same format as before.'''

        img_small = resize_for_api(img, max_width=1200)

        try:
            response = self.model.generate_content([prompt, img_small])
            steps_data = self._parse_response(response.text)

            steps = []
            for i, step_data in enumerate(steps_data):
                step = self._validate_step(step_data, i)
                steps.append(step)

            return Plan(task=plan.task, steps=steps)

        except Exception as e:
            raise PlanningError(
                task=plan.task,
                message=f"Failed to refine plan: {e}",
                cause=e,
            )

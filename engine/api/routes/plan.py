"""
Plan generation endpoint.
"""

import base64
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from PIL import Image

from engine.api.schemas.plan import PlanRequest, PlanResponse, StepSchema
from engine.api.dependencies import get_cached_planner
from engine.planner.gemini_planner import GeminiPlanner
from engine.utils.image import take_screenshot
from engine.core.exceptions import PlanningError


router = APIRouter()


def _decode_base64_image(base64_str: str) -> Image.Image:
    """Decode a base64 string to PIL Image."""
    try:
        image_data = base64.b64decode(base64_str)
        return Image.open(BytesIO(image_data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")


@router.post("/plan", response_model=PlanResponse)
async def generate_plan(
    request: PlanRequest,
    planner: GeminiPlanner = Depends(get_cached_planner),
):
    """
    Generate a step-by-step plan for a task.

    Takes a task description and optionally a screenshot, returns
    a list of steps to execute the task.

    If no image is provided, automatically captures the current screen.
    """
    try:
        # Get or capture screenshot
        if request.image:
            img = _decode_base64_image(request.image)
        else:
            img = take_screenshot()

        # Generate plan
        plan = planner.generate_plan(
            img=img,
            task=request.task,
            max_steps=request.max_steps,
        )

        # Convert to response schema
        steps = [
            StepSchema(
                instruction=step.instruction,
                target_text=step.target_text,
                region=step.region,
                quad=step.quad,
                is_icon=step.is_icon,
                completed=step.completed,
                result=step.result.to_dict() if step.result else None,
            )
            for step in plan.steps
        ]

        return PlanResponse(
            task=plan.task,
            steps=steps,
            current_step=plan.current_step,
            analysis=None,  # Could extract from planner if needed
        )

    except PlanningError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plan generation failed: {str(e)}")

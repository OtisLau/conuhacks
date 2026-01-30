"""
Pydantic schemas for plan generation endpoint.
"""

from typing import Optional, List, Union
from pydantic import BaseModel, Field

from .common import BoundingBoxSchema, LocatorMethodSchema


class StepSchema(BaseModel):
    """A single step in a task plan."""
    instruction: str = Field(..., description="Human-readable instruction")
    target_text: str = Field(..., description="Exact text or description to find")
    region: str = Field("full", description="Screen region to search in")
    quad: Optional[Union[int, str]] = Field(
        None,
        description="For icons: quadrant (1-4) or half ('top', 'bottom', 'left', 'right')"
    )
    is_icon: bool = Field(False, description="Whether target is an icon (vs text)")
    completed: bool = Field(False, description="Whether step has been completed")
    result: Optional[dict] = Field(None, description="Locate result if completed")

    class Config:
        json_schema_extra = {
            "example": {
                "instruction": "Click Appearance",
                "target_text": "Appearance",
                "region": "window",
                "is_icon": False,
                "quad": None
            }
        }


class PlanRequest(BaseModel):
    """Request body for plan generation."""
    task: str = Field(..., description="Task description (e.g., 'Turn on dark mode')")
    image: Optional[str] = Field(
        None,
        description="Base64-encoded screenshot. If omitted, captures current screen."
    )
    max_steps: int = Field(8, ge=1, le=20, description="Maximum number of steps to generate")

    class Config:
        json_schema_extra = {
            "example": {
                "task": "Turn on dark mode",
                "max_steps": 8
            }
        }


class PlanResponse(BaseModel):
    """Response from plan generation."""
    task: str = Field(..., description="Original task description")
    steps: List[StepSchema] = Field(..., description="List of steps to execute")
    current_step: int = Field(0, description="Current step index (0-based)")
    analysis: Optional[str] = Field(None, description="AI analysis of the screen state")

    class Config:
        json_schema_extra = {
            "example": {
                "task": "Turn on dark mode",
                "steps": [
                    {
                        "instruction": "Click Appearance",
                        "target_text": "Appearance",
                        "region": "window",
                        "is_icon": False,
                        "quad": None,
                        "completed": False,
                        "result": None
                    }
                ],
                "current_step": 0,
                "analysis": "System Settings is open, showing the main settings panel."
            }
        }

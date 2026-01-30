"""
Pydantic schemas for element location endpoint.
"""

from typing import Optional, List, Union
from pydantic import BaseModel, Field


class LocateRequest(BaseModel):
    """Request body for element location."""
    target: str = Field(..., description="Text or description to find")
    image: Optional[str] = Field(
        None,
        description="Base64-encoded screenshot. If omitted, captures current screen."
    )
    region: str = Field("full", description="Screen region to search in")
    is_icon: bool = Field(False, description="Whether target is an icon (vs text)")
    instruction: Optional[str] = Field(
        None,
        description="Full instruction for context (helps with disambiguation)"
    )
    quad: Optional[Union[int, str]] = Field(
        None,
        description="For icons: quadrant (1-4) or half ('top', 'bottom', 'left', 'right')"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "target": "Settings",
                "region": "full",
                "is_icon": False,
                "instruction": "Click on Settings"
            }
        }


class LocateResponse(BaseModel):
    """Response from element location."""
    found: bool = Field(..., description="Whether the element was found")
    bbox: Optional[List[int]] = Field(
        None,
        description="Bounding box as [x1, y1, x2, y2]"
    )
    center: Optional[List[int]] = Field(
        None,
        description="Center point as [x, y]"
    )
    confidence: float = Field(0.0, ge=0, le=100, description="Confidence percentage")
    method: Optional[str] = Field(None, description="Detection method used (ocr/icon/hybrid)")
    suggestions: List[str] = Field(
        default_factory=list,
        description="Alternative suggestions if not found"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "found": True,
                "bbox": [245, 120, 320, 145],
                "center": [282, 132],
                "confidence": 95.0,
                "method": "ocr",
                "suggestions": []
            }
        }

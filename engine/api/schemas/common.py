"""
Common Pydantic schemas shared across endpoints.
"""

from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field


class LocatorMethodSchema(str, Enum):
    """Method used to locate an element."""
    OCR = "ocr"
    ICON = "icon"
    HYBRID = "hybrid"


class BoundingBoxSchema(BaseModel):
    """Pixel-coordinate bounding box."""
    x1: int = Field(..., description="Left edge x coordinate")
    y1: int = Field(..., description="Top edge y coordinate")
    x2: int = Field(..., description="Right edge x coordinate")
    y2: int = Field(..., description="Bottom edge y coordinate")

    @property
    def width(self) -> int:
        return self.x2 - self.x1

    @property
    def height(self) -> int:
        return self.y2 - self.y1

    @property
    def center(self) -> tuple[int, int]:
        return ((self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2)

    def to_list(self) -> List[int]:
        """Convert to [x1, y1, x2, y2] list."""
        return [self.x1, self.y1, self.x2, self.y2]

    @classmethod
    def from_list(cls, coords: List[int]) -> "BoundingBoxSchema":
        """Create from [x1, y1, x2, y2] list."""
        return cls(x1=coords[0], y1=coords[1], x2=coords[2], y2=coords[3])

    class Config:
        json_schema_extra = {
            "example": {"x1": 245, "y1": 120, "x2": 320, "y2": 145}
        }


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")

    class Config:
        json_schema_extra = {
            "example": {"error": "Element not found", "detail": "Could not locate 'Settings' in region 'sidebar'"}
        }

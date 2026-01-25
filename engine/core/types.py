"""
Core data types for the CONU engine.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List


class LocatorMethod(Enum):
    """Method used to locate an element."""
    OCR = "ocr"
    ICON = "icon"
    HYBRID = "hybrid"


@dataclass
class BoundingBox:
    """Pixel-coordinate bounding box."""
    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def width(self) -> int:
        return self.x2 - self.x1

    @property
    def height(self) -> int:
        return self.y2 - self.y1

    @property
    def center(self) -> tuple[int, int]:
        """Center point of the bounding box."""
        return ((self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2)

    @property
    def area(self) -> int:
        return self.width * self.height

    def to_list(self) -> list[int]:
        """Convert to [x1, y1, x2, y2] list."""
        return [self.x1, self.y1, self.x2, self.y2]

    @classmethod
    def from_list(cls, coords: list[int]) -> "BoundingBox":
        """Create from [x1, y1, x2, y2] list."""
        return cls(x1=coords[0], y1=coords[1], x2=coords[2], y2=coords[3])

    def expand(self, padding: int) -> "BoundingBox":
        """Return a new bbox expanded by padding pixels."""
        return BoundingBox(
            x1=self.x1 - padding,
            y1=self.y1 - padding,
            x2=self.x2 + padding,
            y2=self.y2 + padding,
        )

    def clamp(self, width: int, height: int) -> "BoundingBox":
        """Clamp coordinates to image bounds."""
        return BoundingBox(
            x1=max(0, self.x1),
            y1=max(0, self.y1),
            x2=min(width, self.x2),
            y2=min(height, self.y2),
        )


@dataclass
class LocatorResult:
    """Result of a locate operation."""
    found: bool
    element: Optional[str] = None
    bbox: Optional[BoundingBox] = None
    confidence: float = 0.0
    method: Optional[LocatorMethod] = None
    time_ms: float = 0.0
    suggestions: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "found": self.found,
            "element": self.element,
            "bbox": self.bbox.to_list() if self.bbox else None,
            "confidence": self.confidence,
            "method": self.method.value if self.method else None,
            "time_ms": self.time_ms,
            "suggestions": self.suggestions,
        }

    @classmethod
    def not_found(cls, suggestions: Optional[List[str]] = None) -> "LocatorResult":
        """Create a not-found result."""
        return cls(found=False, suggestions=suggestions or [])


@dataclass
class Step:
    """A single step in a task plan.

    Quad values for icon location:
        1 = top-left
        2 = top-right
        3 = bottom-left
        4 = bottom-right
        "top" = top half (quad 1+2)
        "left" = left half (quad 1+3)
        None = full screen (or use region)
    """
    instruction: str
    target_text: str
    region: str = "full"
    quad: Optional[any] = None  # 1-4, or "top", "bottom", "left", "right"
    is_icon: bool = False
    completed: bool = False
    result: Optional[LocatorResult] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "instruction": self.instruction,
            "target_text": self.target_text,
            "region": self.region,
            "quad": self.quad,
            "is_icon": self.is_icon,
            "completed": self.completed,
            "result": self.result.to_dict() if self.result else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Step":
        """Create from dictionary."""
        return cls(
            instruction=data["instruction"],
            target_text=data["target_text"],
            region=data.get("region", "full"),
            quad=data.get("quad"),
            is_icon=data.get("is_icon", False),
        )


@dataclass
class Plan:
    """A plan consisting of multiple steps."""
    task: str
    steps: List[Step] = field(default_factory=list)
    current_step: int = 0

    @property
    def is_complete(self) -> bool:
        return self.current_step >= len(self.steps)

    @property
    def progress(self) -> tuple[int, int]:
        """Return (completed, total) step counts."""
        return (self.current_step, len(self.steps))

    def next_step(self) -> Optional[Step]:
        """Get the next uncompleted step."""
        if self.is_complete:
            return None
        return self.steps[self.current_step]

    def advance(self) -> None:
        """Mark current step as complete and advance."""
        if not self.is_complete:
            self.steps[self.current_step].completed = True
            self.current_step += 1

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "task": self.task,
            "steps": [s.to_dict() for s in self.steps],
            "current_step": self.current_step,
        }

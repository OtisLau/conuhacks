"""
Screenshot capture endpoint.
"""

import base64
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.utils.image import take_screenshot


router = APIRouter()


class ScreenshotRequest(BaseModel):
    """Request body for screenshot capture."""
    output_path: Optional[str] = Field(
        None,
        description="Optional file path to save the screenshot. If omitted, returns base64."
    )
    return_base64: bool = Field(
        True,
        description="Whether to return the image as base64 (default: true)"
    )


class ScreenshotResponse(BaseModel):
    """Response from screenshot capture."""
    success: bool
    width: int
    height: int
    path: Optional[str] = None
    image: Optional[str] = Field(None, description="Base64-encoded PNG image")


@router.post("/screenshot", response_model=ScreenshotResponse)
async def capture_screenshot(request: ScreenshotRequest = ScreenshotRequest()):
    """
    Capture a screenshot of the current screen.

    Returns the screenshot as base64-encoded PNG and/or saves to a file path.
    """
    try:
        # Take screenshot
        output_path = request.output_path
        img = take_screenshot(output_path)

        response = ScreenshotResponse(
            success=True,
            width=img.width,
            height=img.height,
            path=output_path,
        )

        # Convert to base64 if requested
        if request.return_base64:
            buffer = BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)
            response.image = base64.b64encode(buffer.getvalue()).decode("utf-8")

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Screenshot failed: {str(e)}")

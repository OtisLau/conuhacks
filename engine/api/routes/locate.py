"""
Element location endpoint.
"""

import base64
from io import BytesIO

from fastapi import APIRouter, HTTPException, Depends
from PIL import Image

from engine.api.schemas.locate import LocateRequest, LocateResponse
from engine.api.dependencies import get_cached_locator
from engine.locators.hybrid_locator import HybridLocator
from engine.utils.image import take_screenshot
from engine.core.exceptions import ElementNotFoundError


router = APIRouter()


def _decode_base64_image(base64_str: str) -> Image.Image:
    """Decode a base64 string to PIL Image."""
    try:
        image_data = base64.b64decode(base64_str)
        return Image.open(BytesIO(image_data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")


@router.post("/locate", response_model=LocateResponse)
async def locate_element(
    request: LocateRequest,
    locator: HybridLocator = Depends(get_cached_locator),
):
    """
    Find a UI element on screen.

    Takes a target text/description and optionally a screenshot,
    returns the element's bounding box and confidence score.

    If no image is provided, automatically captures the current screen.
    """
    try:
        # Get or capture screenshot
        if request.image:
            img = _decode_base64_image(request.image)
        else:
            img = take_screenshot()

        # Locate element
        result = locator.locate(
            img=img,
            target=request.target,
            region=request.region,
            is_icon=request.is_icon,
            instruction=request.instruction or "",
            quad=request.quad,
        )

        # Build response
        response = LocateResponse(
            found=result.found,
            confidence=result.confidence,
            method=result.method.value if result.method else None,
            suggestions=result.suggestions,
        )

        if result.found and result.bbox:
            response.bbox = result.bbox.to_list()
            response.center = list(result.bbox.center)

        return response

    except ElementNotFoundError as e:
        # Element not found is not an error - return proper response
        return LocateResponse(
            found=False,
            confidence=0.0,
            suggestions=e.suggestions if hasattr(e, "suggestions") else [],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Location failed: {str(e)}")

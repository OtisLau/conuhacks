"""
Image utilities for cropping, visualization, and screenshots.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple
from PIL import Image, ImageDraw, ImageFont

from engine.core.types import BoundingBox


def take_screenshot(output_path: Optional[str] = None) -> Image.Image:
    """
    Take a screenshot of the current screen.

    Uses macOS screencapture command.

    Args:
        output_path: Optional path to save the screenshot

    Returns:
        PIL Image of the screenshot
    """
    if output_path:
        path = output_path
    else:
        # Use temp file
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        path = tmp.name
        tmp.close()

    # Use macOS screencapture
    subprocess.run(
        ["screencapture", "-x", path],
        check=True,
        capture_output=True,
    )

    img = Image.open(path).convert("RGB")

    # Clean up temp file if we created one
    if not output_path:
        Path(path).unlink(missing_ok=True)

    return img


def resize_for_api(img: Image.Image, max_width: int = 1200) -> Image.Image:
    """
    Resize an image for API calls (to reduce latency).

    Args:
        img: Input image
        max_width: Maximum width (maintains aspect ratio)

    Returns:
        Resized image
    """
    if img.width <= max_width:
        return img

    ratio = max_width / img.width
    new_height = int(img.height * ratio)
    return img.resize((max_width, new_height), Image.Resampling.LANCZOS)


def draw_bounding_box(
    img: Image.Image,
    bbox: BoundingBox,
    color: str = "lime",
    width: int = 4,
    label: Optional[str] = None,
) -> Image.Image:
    """
    Draw a bounding box on an image.

    Args:
        img: Input image (will be copied)
        bbox: Bounding box to draw
        color: Box color
        width: Line width
        label: Optional label text

    Returns:
        New image with box drawn
    """
    result = img.copy()
    draw = ImageDraw.Draw(result)

    # Draw rectangle
    draw.rectangle(
        [bbox.x1, bbox.y1, bbox.x2, bbox.y2],
        outline=color,
        width=width,
    )

    # Draw label if provided
    if label:
        # Position above the box
        text_y = max(0, bbox.y1 - 25)
        draw.text((bbox.x1, text_y), label, fill=color)

    return result


def draw_highlight(
    img: Image.Image,
    bbox: BoundingBox,
    instruction: Optional[str] = None,
    confidence: Optional[float] = None,
    method: Optional[str] = None,
    output_path: Optional[str] = None,
) -> Image.Image:
    """
    Draw a highlighted element with instruction tooltip.

    Args:
        img: Screenshot image
        bbox: Element bounding box
        instruction: Step instruction to display
        confidence: Confidence percentage
        method: Detection method (ocr/icon)
        output_path: Optional path to save result

    Returns:
        Image with highlight drawn
    """
    result = img.copy()
    draw = ImageDraw.Draw(result)

    # Choose color based on method
    if method == "ocr":
        color = "lime"
    elif method == "icon":
        color = "cyan"
    else:
        color = "yellow"

    # Draw outer glow effect (multiple rectangles)
    for i in range(3, 0, -1):
        alpha = 100 + (i * 50)
        expanded = bbox.expand(i * 2).clamp(img.width, img.height)
        draw.rectangle(
            [expanded.x1, expanded.y1, expanded.x2, expanded.y2],
            outline=color,
            width=2,
        )

    # Draw main box
    draw.rectangle(
        [bbox.x1, bbox.y1, bbox.x2, bbox.y2],
        outline=color,
        width=4,
    )

    # Build label
    parts = []
    if instruction:
        parts.append(instruction)
    if confidence is not None:
        parts.append(f"{confidence:.0f}%")
    if method:
        parts.append(f"({method})")

    label = " ".join(parts) if parts else None

    # Draw label box
    if label:
        text_y = max(0, bbox.y1 - 30)

        # Draw background for label
        # Estimate text size (approximate)
        text_width = len(label) * 8
        text_height = 20

        draw.rectangle(
            [bbox.x1 - 2, text_y - 2, bbox.x1 + text_width + 4, text_y + text_height],
            fill="black",
        )
        draw.text((bbox.x1, text_y), label, fill=color)

    if output_path:
        result.save(output_path)

    return result


def draw_all_elements(
    img: Image.Image,
    elements: list,
    output_path: Optional[str] = None,
) -> Image.Image:
    """
    Draw all detected elements on an image for debugging.

    Args:
        img: Screenshot image
        elements: List of dicts with 'bbox' and optionally 'confidence', 'text'
        output_path: Optional path to save result

    Returns:
        Image with all elements drawn
    """
    result = img.copy()
    draw = ImageDraw.Draw(result)

    for i, el in enumerate(elements):
        bbox = el.get("bbox")
        if bbox is None:
            continue

        # Handle both BoundingBox objects and dicts
        if hasattr(bbox, "to_list"):
            coords = [bbox.x1, bbox.y1, bbox.x2, bbox.y2]
        else:
            coords = bbox

        conf = el.get("confidence", 0)

        # Color by confidence
        if conf > 80:
            color = "lime"
        elif conf > 50:
            color = "yellow"
        else:
            color = "red"

        draw.rectangle(coords, outline=color, width=2)

        # Label with index and confidence
        label = f"{i}: {conf:.0f}%"
        if "text" in el:
            label = f"{el['text'][:15]} ({conf:.0f}%)"

        draw.text((coords[0], coords[1] - 15), label, fill=color)

    if output_path:
        result.save(output_path)

    return result


def crop_to_bbox(
    img: Image.Image,
    bbox: BoundingBox,
    padding: int = 0,
) -> Image.Image:
    """
    Crop an image to a bounding box with optional padding.

    Args:
        img: Input image
        bbox: Bounding box to crop to
        padding: Pixels of padding around box

    Returns:
        Cropped image
    """
    expanded = bbox.expand(padding).clamp(img.width, img.height)
    return img.crop((expanded.x1, expanded.y1, expanded.x2, expanded.y2))

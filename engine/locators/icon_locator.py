"""
Icon locator using Gemini vision for direct icon detection.

Uses a grid-based approach: divides the screen into an NxN grid and asks
Gemini to identify which grid cell(s) contain the target icon. This is
more reliable than asking for raw pixel coordinates.
"""

import json
import time
from typing import Optional, List, Dict, Any, Tuple
from PIL import Image, ImageDraw, ImageFont
import google.generativeai as genai

from engine.core.types import BoundingBox, LocatorResult, LocatorMethod
from engine.core.regions import RegionManager, get_region_manager
from engine.core.exceptions import IconDetectionError
from engine.locators.base import BaseLocator
from engine.utils.image import resize_for_api
from engine.config import Config, get_config


# First pass: Quick region detection
REGION_DETECT_PROMPT = '''Which region of the screen contains the "{target}"?
Context: {instruction}

REGIONS:
- "top-left" = quadrant 1 (menu bars on left, top nav)
- "top-right" = quadrant 2 (status icons, notifications, top-right controls)
- "bottom-left" = quadrant 3 (sidebars, left panels)
- "bottom-right" = quadrant 4 (main content area, right panels)
- "top-half" = top portion (toolbars, menu bars)
- "left-half" = left side (sidebars, navigation)

Common locations:
- Battery/WiFi/time icons = top-right
- App menu/hamburger = top-left
- Sidebar icons = left-half
- Close/minimize buttons = top-left (macOS) or top-right (Windows)

RESPOND with just the region name, nothing else.'''

# Second pass: Precise grid search on cropped region
ICON_GRID_PROMPT = '''You are a precise UI element locator. The image has a {cols}x{rows} grid overlay.
Columns are A-{max_col}, rows are 1-{rows}. Cell "A1" is top-left.

FIND: "{target}"
CONTEXT: {instruction}

ICON PATTERNS:
- grid/waffle (9 dots/squares) = app launcher
- 3 lines = hamburger menu
- gear/cog = settings
- magnifying glass = search
- X = close

RESPOND JSON only:
{{"found": true, "cell": "K3", "description": "brief"}}
{{"found": false, "cell": null, "description": "why"}}

BE PRECISE - return the cell whose CENTER is closest to the icon center.'''


class IconLocator(BaseLocator):
    """
    Locator for icons using Gemini vision with a grid-based approach.

    Instead of asking for raw pixel coordinates, this divides the screen
    into a grid (e.g., 12x8) and asks Gemini to identify which cell
    contains the target icon. This is more reliable and accurate.
    """

    # Grid configuration - 24x16 gives tighter bounding boxes
    # Each cell is about 45x50 pixels on a 1080p image
    GRID_COLS = 24
    GRID_ROWS = 16

    def __init__(
        self,
        config: Optional[Config] = None,
        region_manager: Optional[RegionManager] = None,
    ):
        self.config = config or get_config()
        self.regions = region_manager or get_region_manager()
        self._fast_model = None  # For quick region detection
        self._smart_model = None  # For precise grid search

        # Configure Gemini
        if self.config.google_api_key:
            genai.configure(api_key=self.config.google_api_key)

    @property
    def name(self) -> str:
        return "icon"

    @property
    def fast_model(self):
        """Fast model for region detection (pass 1)."""
        if self._fast_model is None:
            self._fast_model = genai.GenerativeModel(self.config.gemini_fast_model)
        return self._fast_model

    @property
    def smart_model(self):
        """Fast model for grid search - denser grid + cropped region = good accuracy."""
        if self._smart_model is None:
            # Use fast model since we're cropping to smaller region with denser grid
            self._smart_model = genai.GenerativeModel(self.config.gemini_fast_model)
        return self._smart_model

    def supports_target(self, target: str, is_icon: bool = False) -> bool:
        return True

    def _draw_grid_overlay(self, img: Image.Image) -> Image.Image:
        """
        Draw a labeled grid overlay on the image.

        Returns a new image with grid lines and cell labels (A1, B2, etc.)
        """
        # Create a copy to draw on
        grid_img = img.copy()
        draw = ImageDraw.Draw(grid_img)

        w, h = img.size
        cell_w = w / self.GRID_COLS
        cell_h = h / self.GRID_ROWS

        # Grid line color - semi-transparent red
        line_color = (255, 0, 0, 180)

        # Draw vertical lines
        for col in range(self.GRID_COLS + 1):
            x = int(col * cell_w)
            draw.line([(x, 0), (x, h)], fill=line_color, width=1)

        # Draw horizontal lines
        for row in range(self.GRID_ROWS + 1):
            y = int(row * cell_h)
            draw.line([(0, y), (w, y)], fill=line_color, width=1)

        # Try to get a font - smaller for denser grids
        try:
            font_size = max(8, min(int(cell_w / 4), int(cell_h / 4), 12))
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except Exception:
            font = ImageFont.load_default()

        # Draw cell labels (only every other cell to reduce clutter on dense grids)
        label_every = 2 if self.GRID_COLS > 15 else 1
        for row in range(self.GRID_ROWS):
            for col in range(self.GRID_COLS):
                # Column letter (A-T for 20 cols)
                col_letter = chr(ord('A') + col)
                row_num = row + 1
                label = f"{col_letter}{row_num}"

                # Position label in top-left corner of cell
                x = int(col * cell_w) + 1
                y = int(row * cell_h) + 1

                # Only draw labels at intervals to reduce clutter
                if row % label_every == 0 and col % label_every == 0:
                    # Draw label with background for visibility
                    label_w = font_size * len(label) * 0.6
                    draw.rectangle([x, y, x + label_w + 2, y + font_size + 1], fill=(255, 255, 255, 220))
                    draw.text((x + 1, y), label, fill=(0, 0, 0), font=font)

        return grid_img

    def _cell_to_bbox(self, cell: str, img_width: int, img_height: int) -> BoundingBox:
        """
        Convert a grid cell label (e.g., "B3") to a bounding box.

        Returns the bounding box for the center region of the cell
        (slightly smaller than full cell to be more precise).
        """
        # Parse cell label
        col_letter = cell[0].upper()
        row_num = int(cell[1:])

        # Convert to 0-indexed
        col = ord(col_letter) - ord('A')
        row = row_num - 1

        # Calculate cell dimensions
        cell_w = img_width / self.GRID_COLS
        cell_h = img_height / self.GRID_ROWS

        # Get cell bounds (with small padding inward for precision)
        padding = 0.15  # Use center 70% of cell
        x1 = int((col + padding) * cell_w)
        y1 = int((row + padding) * cell_h)
        x2 = int((col + 1 - padding) * cell_w)
        y2 = int((row + 1 - padding) * cell_h)

        return BoundingBox(x1, y1, x2, y2)

    def _detect_region_from_instruction(self, instruction: str, target: str, img_width: int, img_height: int) -> Tuple[str, Tuple[int, int, int, int]]:
        """
        Detect region from instruction keywords - NO API call needed.

        Returns:
            Tuple of (region_name, (x1, y1, x2, y2) crop bounds in pixels)
        """
        text = f"{instruction} {target}".lower()
        w, h = img_width, img_height

        # Region bounds
        regions = {
            "top-right": (w // 2, 0, w, h // 2),
            "top-left": (0, 0, w // 2, h // 2),
            "bottom-right": (w // 2, h // 2, w, h),
            "bottom-left": (0, h // 2, w // 2, h),
            "top-half": (0, 0, w, h // 2),
            "bottom-half": (0, h // 2, w, h),
            "left-half": (0, 0, w // 2, h),
            "right-half": (w // 2, 0, w, h),
        }

        # Keyword -> region mapping
        # Top-right: status icons, system tray
        if any(kw in text for kw in ["battery", "wifi", "bluetooth", "volume", "sound", "clock", "time", "date", "status", "notification", "control center", "menu bar"]):
            return ("top-right", regions["top-right"])

        # Top-left: app menus, close/minimize buttons (macOS)
        if any(kw in text for kw in ["close", "minimize", "maximize", "apple menu", "file menu", "edit menu", "app menu", "red button", "traffic light"]):
            return ("top-left", regions["top-left"])

        # Left side: sidebars, navigation
        if any(kw in text for kw in ["sidebar", "navigation", "nav", "menu", "hamburger", "drawer", "panel"]):
            return ("left-half", regions["left-half"])

        # Top: toolbars, search bars
        if any(kw in text for kw in ["toolbar", "search", "address bar", "url", "tab"]):
            return ("top-half", regions["top-half"])

        # Bottom: docks, taskbars
        if any(kw in text for kw in ["dock", "taskbar", "bottom"]):
            return ("bottom-half", regions["bottom-half"])

        # Default to full if no keywords match
        return ("full", (0, 0, w, h))

    def _parse_response(self, text: str) -> dict:
        """Parse JSON response from Gemini."""
        text = text.strip()

        # Strip markdown code blocks if present
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from the response
            import re
            json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass
            return {"found": False, "cell": None, "description": "Failed to parse response"}

    def _get_quad_bounds(self, quad, img_width: int, img_height: int) -> Tuple[int, int, int, int]:
        """Get crop bounds for a quadrant (1-4) or region ("top", "bottom", "left", "right")."""
        w, h = img_width, img_height
        quads = {
            # Single quadrants
            1: (0, 0, w // 2, h // 2),          # top-left
            2: (w // 2, 0, w, h // 2),          # top-right
            3: (0, h // 2, w // 2, h),          # bottom-left
            4: (w // 2, h // 2, w, h),          # bottom-right
            # Half regions (string keys)
            "top": (0, 0, w, h // 2),           # top half
            "bottom": (0, h // 2, w, h),        # bottom half
            "left": (0, 0, w // 2, h),          # left half
            "right": (w // 2, 0, w, h),         # right half
        }
        return quads.get(quad, (0, 0, w, h))

    def locate(
        self,
        img: Image.Image,
        target: str,
        region: str = "full",
        instruction: str = "",
        quad: Optional[int] = None,
        **kwargs,
    ) -> LocatorResult:
        """
        Find an icon on screen using Gemini vision with grid-based localization.

        Args:
            img: Screenshot as PIL Image
            target: Description of the icon to find
            region: Screen region to search in (from step config)
            instruction: Full instruction context
            quad: Quadrant to search (1=top-left, 2=top-right, 3=bottom-left, 4=bottom-right)

        Returns:
            LocatorResult with found status and coordinates
        """
        start = time.time()
        original_img = img
        offset_x, offset_y = 0, 0

        # First, apply any region from step config
        if region != "full":
            try:
                cropped, (offset_x, offset_y) = self.regions.crop_image(img, region)
                img = cropped
            except Exception:
                pass

        # Use quad if provided (from planner), otherwise try keyword detection
        detected_region = "full"
        valid_quads = [1, 2, 3, 4, "top", "bottom", "left", "right"]
        if quad in valid_quads:
            # Use quad from planner
            bounds = self._get_quad_bounds(quad, img.width, img.height)
            detected_region = f"quad-{quad}" if isinstance(quad, int) else quad
            x1, y1, x2, y2 = bounds
            img = img.crop((x1, y1, x2, y2))
            offset_x += x1
            offset_y += y1
        else:
            # Fallback: detect from instruction keywords
            instruction_context = instruction if instruction else f"Find the {target}"
            detected_region, bounds = self._detect_region_from_instruction(
                instruction_context, target, img.width, img.height
            )
            if detected_region != "full":
                x1, y1, x2, y2 = bounds
                img = img.crop((x1, y1, x2, y2))
                offset_x += x1
                offset_y += y1

        # Resize cropped region for grid search - can use smaller size since region is focused
        img_for_api = resize_for_api(img, max_width=800)

        # Calculate scale factors
        scale_x = img.width / img_for_api.width
        scale_y = img.height / img_for_api.height

        # Draw grid overlay
        grid_img = self._draw_grid_overlay(img_for_api)

        # Build prompt
        max_col_letter = chr(ord('A') + self.GRID_COLS - 1)
        instruction_context = instruction if instruction else f"Find the {target}"
        prompt = ICON_GRID_PROMPT.format(
            rows=self.GRID_ROWS,
            cols=self.GRID_COLS,
            max_col=max_col_letter,
            target=target,
            instruction=instruction_context,
        )

        try:
            # Use smart model for precise grid search
            response = self.smart_model.generate_content([prompt, grid_img])
            result = self._parse_response(response.text)
        except Exception as e:
            elapsed_ms = (time.time() - start) * 1000
            return LocatorResult(
                found=False,
                method=LocatorMethod.ICON,
                time_ms=elapsed_ms,
                suggestions=[f"Gemini API error: {str(e)}"],
            )

        elapsed_ms = (time.time() - start) * 1000

        if result.get("found") and result.get("cell"):
            cell = result["cell"]

            try:
                # Convert cell to bounding box (in API image coordinates)
                bbox_api = self._cell_to_bbox(cell, img_for_api.width, img_for_api.height)

                # Scale coordinates back to cropped image size
                x1 = int(bbox_api.x1 * scale_x)
                y1 = int(bbox_api.y1 * scale_y)
                x2 = int(bbox_api.x2 * scale_x)
                y2 = int(bbox_api.y2 * scale_y)

                # Add all offsets to get coordinates in original full image
                x1 += offset_x
                y1 += offset_y
                x2 += offset_x
                y2 += offset_y

                # Clamp to image bounds
                x1 = max(0, min(x1, original_img.width - 1))
                y1 = max(0, min(y1, original_img.height - 1))
                x2 = max(0, min(x2, original_img.width))
                y2 = max(0, min(y2, original_img.height))

                description = result.get("description", f"Found in cell {cell}")
                region_info = f" in {detected_region}" if detected_region != "full" else ""

                return LocatorResult(
                    found=True,
                    element=f"{target} ({description}{region_info})",
                    bbox=BoundingBox(x1, y1, x2, y2),
                    confidence=90,
                    method=LocatorMethod.ICON,
                    time_ms=elapsed_ms,
                )
            except (ValueError, IndexError):
                return LocatorResult(
                    found=False,
                    method=LocatorMethod.ICON,
                    time_ms=elapsed_ms,
                    suggestions=[f"Invalid cell '{cell}' returned by Gemini"],
                )

        # Not found
        description = result.get("description", "Icon not found")
        return LocatorResult(
            found=False,
            element=None,
            bbox=None,
            confidence=0,
            method=LocatorMethod.ICON,
            time_ms=elapsed_ms,
            suggestions=[description],
        )

    def locate_with_retry(
        self,
        img: Image.Image,
        target: str,
        region: str = "full",
        instruction: str = "",
        max_attempts: int = 2,
        **kwargs,
    ) -> LocatorResult:
        """
        Find an icon with retry logic for improved accuracy.

        Makes multiple attempts with slightly different prompts if needed.
        """
        result = self.locate(img, target, region, instruction, **kwargs)

        if result.found:
            return result

        # Retry with more explicit prompt if first attempt failed
        if max_attempts > 1:
            # Second attempt with emphasis on visual patterns
            enhanced_instruction = f"{instruction}. Look for visual patterns like dots, lines, shapes that form the icon."
            result = self.locate(img, target, region, enhanced_instruction, **kwargs)

        return result

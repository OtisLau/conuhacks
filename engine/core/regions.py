"""
Screen region management.
"""

import subprocess
from dataclasses import dataclass, field
from typing import Dict, Tuple, Optional
from PIL import Image

from engine.core.exceptions import InvalidRegionError


def get_retina_scale_factor() -> float:
    """
    Get the Retina scale factor for the main display.

    Returns:
        Scale factor (2.0 for Retina, 1.0 for standard displays).
    """
    script = '''
    use framework "AppKit"
    set mainScreen to current application's NSScreen's mainScreen()
    return (mainScreen's backingScaleFactor()) as real
    '''
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception:
        pass
    # Default to 2.0 for modern Macs (safer assumption)
    return 2.0


def get_active_window_bounds() -> Optional[Tuple[int, int, int, int]]:
    """
    Get the bounds of the active (frontmost) window on macOS.

    Returns:
        Tuple of (x, y, width, height) in pixels, or None if failed.
    """
    return get_window_bounds_by_app(None)  # None = frontmost


def get_frontmost_app_name() -> Optional[str]:
    """Get the name of the frontmost application."""
    script = '''
    tell application "System Events"
        return name of first application process whose frontmost is true
    end tell
    '''
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def get_frontmost_app_excluding(excluded_apps: list) -> Optional[str]:
    """
    Get the frontmost application, excluding specified apps (like overlays).

    This is useful when we have a transparent overlay that's technically
    "frontmost" but we want to know what app is visible behind it.

    Args:
        excluded_apps: List of app names to exclude (case-insensitive)

    Returns:
        Name of the frontmost non-excluded app, or None if not found.
    """
    # Get all visible application processes with windows, sorted by layer order
    script = '''
    tell application "System Events"
        set appList to {}
        repeat with proc in (every application process whose visible is true)
            try
                if (count of windows of proc) > 0 then
                    set end of appList to name of proc
                end if
            end try
        end repeat
        return appList
    end tell
    '''
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            # Parse the AppleScript list output
            apps_str = result.stdout.strip()
            # AppleScript returns like: "App1, App2, App3"
            apps = [a.strip() for a in apps_str.split(",")]

            excluded_lower = [e.lower() for e in excluded_apps]
            for app in apps:
                if app.lower() not in excluded_lower:
                    return app
    except Exception:
        pass

    # Fallback: just get frontmost and check
    frontmost = get_frontmost_app_name()
    if frontmost and frontmost.lower() not in [e.lower() for e in excluded_apps]:
        return frontmost

    return None


def get_window_bounds_by_app(app_name: Optional[str] = None) -> Optional[Tuple[int, int, int, int]]:
    """
    Get the bounds of a specific app's window on macOS.

    Args:
        app_name: Name of the app (e.g., "System Settings"). If None, uses frontmost
                  (excluding overlay apps like Electron).

    Returns:
        Tuple of (x, y, width, height) in pixels, or None if failed.
    """
    # If no app specified, find the frontmost non-overlay app
    if not app_name:
        ignored_apps = ["electron", "conu", "CONU"]
        app_name = get_frontmost_app_excluding(ignored_apps)
        if not app_name:
            return None

    script = f'''
    tell application "System Events"
        tell application process "{app_name}"
            try
                set winBounds to {{position, size}} of window 1
                set {{x, y}} to item 1 of winBounds
                set {{w, h}} to item 2 of winBounds
                return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
            end try
        end tell
    end tell
    '''
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split(",")
            if len(parts) == 4:
                x, y, w, h = map(int, parts)
                return (x, y, w, h)
    except Exception:
        pass
    return None


def get_window_relative_regions(
    screen_width: int,
    screen_height: int,
    window_bounds: Optional[Tuple[int, int, int, int]] = None,
) -> Dict[str, Tuple[float, float, float, float]]:
    """
    Create regions relative to the active window.

    Args:
        screen_width: Full screen width in pixels (screenshot resolution)
        screen_height: Full screen height in pixels (screenshot resolution)
        window_bounds: (x, y, width, height) of window, or None to auto-detect

    Returns:
        Dict of region names to normalized (0-1) screen coordinates
    """
    if window_bounds is None:
        window_bounds = get_active_window_bounds()

    if window_bounds is None:
        # Fallback to full screen
        return REGIONS.copy()

    wx, wy, ww, wh = window_bounds

    # AppleScript returns logical pixels, but screenshot is in physical (Retina) pixels
    # Multiply by scale factor to convert to physical pixels
    scale = get_retina_scale_factor()
    wx = int(wx * scale)
    wy = int(wy * scale)
    ww = int(ww * scale)
    wh = int(wh * scale)

    # Convert window pixel coords to normalized screen coords
    def to_norm(px_x, px_y, px_w, px_h):
        x1 = px_x / screen_width
        y1 = px_y / screen_height
        x2 = (px_x + px_w) / screen_width
        y2 = (px_y + px_h) / screen_height
        return (x1, y1, x2, y2)

    # Window-relative regions (for typical macOS settings window)
    # Sidebar is usually ~30% of window width on left
    # Main content is the rest
    sidebar_width = int(ww * 0.30)
    toolbar_height = int(wh * 0.08)

    return {
        # Full window
        "window": to_norm(wx, wy, ww, wh),
        # Window sidebar (left 30%)
        "sidebar": to_norm(wx, wy + toolbar_height, sidebar_width, wh - toolbar_height),
        # Window main area (right 70%)
        "main": to_norm(wx + sidebar_width, wy + toolbar_height, ww - sidebar_width, wh - toolbar_height),
        # Window toolbar (top of window)
        "toolbar": to_norm(wx, wy, ww, toolbar_height),
        # Keep screen-level regions too
        "menu_bar": (0.0, 0.0, 1.0, 0.03),
        "dock": (0.0, 0.95, 1.0, 1.0),
        "full": (0.0, 0.0, 1.0, 1.0),
    }


# Normalized coordinates (0-1)
RegionCoords = Tuple[float, float, float, float]  # x1, y1, x2, y2


# Default screen regions for macOS
REGIONS: Dict[str, RegionCoords] = {
    "menu_bar": (0.0, 0.0, 1.0, 0.04),
    "toolbar": (0.0, 0.04, 1.0, 0.12),
    "sidebar": (0.0, 0.04, 0.25, 0.95),
    "main": (0.25, 0.04, 1.0, 0.95),
    "bottom": (0.0, 0.90, 1.0, 1.0),
    "dock": (0.0, 0.95, 1.0, 1.0),
    "full": (0.0, 0.0, 1.0, 1.0),
    "center": (0.25, 0.25, 0.75, 0.75),
    "top_half": (0.0, 0.0, 1.0, 0.5),
    "bottom_half": (0.0, 0.5, 1.0, 1.0),
    "left_half": (0.0, 0.0, 0.5, 1.0),
    "right_half": (0.5, 0.0, 1.0, 1.0),
}


@dataclass
class Region:
    """A screen region with normalized coordinates."""
    name: str
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def coords(self) -> RegionCoords:
        return (self.x1, self.y1, self.x2, self.y2)

    def to_pixels(self, width: int, height: int) -> Tuple[int, int, int, int]:
        """Convert normalized coords to pixel coordinates."""
        return (
            int(self.x1 * width),
            int(self.y1 * height),
            int(self.x2 * width),
            int(self.y2 * height),
        )

    @classmethod
    def from_coords(cls, name: str, coords: RegionCoords) -> "Region":
        return cls(name=name, x1=coords[0], y1=coords[1], x2=coords[2], y2=coords[3])


@dataclass
class RegionManager:
    """Manages screen regions with defaults and custom additions."""

    custom_regions: Dict[str, RegionCoords] = field(default_factory=dict)
    _window_regions: Dict[str, RegionCoords] = field(default_factory=dict)
    _screen_size: Tuple[int, int] = field(default=(1920, 1080))
    _target_app: Optional[str] = field(default=None)

    def set_target_app(self, app_name: Optional[str] = None) -> str:
        """
        Set the target app to track. If None, detects frontmost app.

        Returns the app name that was set.
        """
        if app_name is None:
            app_name = get_frontmost_app_name()
        self._target_app = app_name
        return app_name or "unknown"

    def update_for_active_window(self, screen_width: int, screen_height: int) -> bool:
        """
        Update regions based on the active window position.

        Returns True if window was detected, False otherwise.
        """
        self._screen_size = (screen_width, screen_height)

        # Use target app if set, otherwise frontmost
        window_bounds = get_window_bounds_by_app(self._target_app)
        if window_bounds:
            self._window_regions = get_window_relative_regions(
                screen_width, screen_height, window_bounds
            )
            return True
        return False

    def get(self, name: str) -> Region:
        """Get a region by name. Prioritizes window-relative regions if available."""
        if name in self.custom_regions:
            coords = self.custom_regions[name]
        elif name in self._window_regions:
            # Use window-relative region
            coords = self._window_regions[name]
        elif name in REGIONS:
            coords = REGIONS[name]
        else:
            raise InvalidRegionError(name, self.list_regions())
        return Region.from_coords(name, coords)

    def add(self, name: str, coords: RegionCoords) -> None:
        """Add a custom region."""
        if not (0 <= coords[0] < coords[2] <= 1 and 0 <= coords[1] < coords[3] <= 1):
            raise ValueError(f"Invalid region coordinates: {coords}")
        self.custom_regions[name] = coords

    def remove(self, name: str) -> bool:
        """Remove a custom region. Returns True if removed."""
        if name in self.custom_regions:
            del self.custom_regions[name]
            return True
        return False

    def list_regions(self) -> list[str]:
        """List all available region names."""
        return list(REGIONS.keys()) + list(self.custom_regions.keys())

    def crop_image(
        self, img: Image.Image, region_name: str
    ) -> Tuple[Image.Image, Tuple[int, int]]:
        """
        Crop an image to a region.

        Returns:
            Tuple of (cropped_image, (offset_x, offset_y))
        """
        region = self.get(region_name)
        w, h = img.size
        px1, py1, px2, py2 = region.to_pixels(w, h)
        cropped = img.crop((px1, py1, px2, py2))
        return cropped, (px1, py1)

    def point_in_region(
        self, x: float, y: float, region_name: str, normalized: bool = True
    ) -> bool:
        """Check if a point is within a region."""
        region = self.get(region_name)
        if not normalized:
            raise ValueError("Pixel coordinates not yet supported")
        return region.x1 <= x <= region.x2 and region.y1 <= y <= region.y2


# Default manager instance
_default_manager: Optional[RegionManager] = None


def get_region_manager() -> RegionManager:
    """Get the default region manager."""
    global _default_manager
    if _default_manager is None:
        _default_manager = RegionManager()
    return _default_manager

#!/usr/bin/env python3
"""
CONU Engine CLI - Dev testing interface.

Usage:
    python -m engine.cli run "Turn on dark mode"
    python -m engine.cli locate screenshot.png "Settings" --region sidebar
    python -m engine.cli plan screenshot.png "Check battery health"
    python -m engine.cli screenshot --output now.png
    python -m engine.cli regions
    python -m engine.cli benchmark screenshot.png
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def get_locator(region_manager=None):
    """Get the hybrid locator."""
    from engine.locators.hybrid_locator import HybridLocator
    return HybridLocator(region_manager=region_manager)


def get_planner():
    """Get the Gemini planner."""
    from engine.planner.gemini_planner import GeminiPlanner
    return GeminiPlanner()


def take_screenshot(output_path: Optional[str] = None) -> Image.Image:
    """Take a screenshot using macOS screencapture."""
    from engine.utils.image import take_screenshot as _take_screenshot
    return _take_screenshot(output_path)


def open_image(path: str) -> None:
    """Open an image in the default viewer."""
    subprocess.run(["open", path], check=False)


def _detect_target_app(task: str) -> str:
    """Detect which app is relevant for the task based on keywords."""
    task_lower = task.lower()

    # Common app mappings based on task keywords
    if any(kw in task_lower for kw in ["dark mode", "appearance", "wallpaper", "setting", "wifi", "bluetooth", "display", "sound", "privacy", "security", "network", "battery"]):
        return "System Settings"
    elif any(kw in task_lower for kw in ["safari", "bookmark"]):
        return "Safari"
    elif any(kw in task_lower for kw in ["finder", "file", "folder", "document"]):
        return "Finder"
    elif any(kw in task_lower for kw in ["code", "vscode"]):
        return "Code"
    elif any(kw in task_lower for kw in ["chrome"]):
        return "Google Chrome"
    elif any(kw in task_lower for kw in ["slack"]):
        return "Slack"
    elif any(kw in task_lower for kw in ["discord"]):
        return "Discord"
    elif any(kw in task_lower for kw in ["spotify", "music"]):
        return "Spotify"

    # Default: try to detect from frontmost app, excluding terminals and our overlay
    from engine.core.regions import get_frontmost_app_excluding

    # Apps to ignore (terminals, our Electron overlay, etc.)
    ignored_apps = [
        "alacritty", "terminal", "iterm2", "iterm", "warp", "kitty", "hyper",
        "electron", "conu", "CONU",  # Our overlay app
    ]

    frontmost = get_frontmost_app_excluding(ignored_apps)
    return frontmost or "System Settings"


def cmd_run(args):
    """Interactive task execution."""
    from engine.utils.image import draw_highlight
    from engine.core.types import LocatorMethod
    from engine.core.regions import get_region_manager

    task = args.task
    print(f"\n[1/3] Planning task: '{task}'...")
    print("  (0.5 second delay - switch to target app now...)")
    import time
    time.sleep(0.5)

    # Take initial screenshot
    img = take_screenshot()
    print(f"Screenshot: {img.size[0]}x{img.size[1]}")

    # Detect target app from task/screenshot (not frontmost which is terminal)
    region_mgr = get_region_manager()
    target_app = _detect_target_app(task)
    region_mgr.set_target_app(target_app)
    print(f"Target app: {target_app}")

    if region_mgr.update_for_active_window(img.size[0], img.size[1]):
        print(f"Window detected - using window-relative regions")
        # Debug: show the actual window regions
        if region_mgr._window_regions:
            for rname, rcoords in region_mgr._window_regions.items():
                print(f"  {rname}: ({rcoords[0]:.2f}, {rcoords[1]:.2f}) -> ({rcoords[2]:.2f}, {rcoords[3]:.2f})")
    else:
        print(f"WARNING: Window detection failed - using static regions")

    # Generate plan
    planner = get_planner()
    try:
        plan = planner.generate_plan(img, task)
    except Exception as e:
        print(f"Error: Failed to generate plan: {e}")
        return 1

    print(f"\nGenerated {len(plan.steps)} steps:")
    for i, step in enumerate(plan.steps):
        icon_marker = " [icon]" if step.is_icon else ""
        print(f"  {i+1}. {step.instruction} (target: '{step.target_text}' in {step.region}){icon_marker}")

    locator = get_locator(region_manager=region_mgr)
    step_num = 0

    while not plan.is_complete:
        step = plan.next_step()
        step_num += 1

        print(f"\n[Step {step_num}/{len(plan.steps)}] {step.instruction}")
        print(f"  Locating: '{step.target_text}' in region '{step.region}'...")

        # Delay before each step so user can switch to target app
        print("  (0.5 second delay - switch to target app...)")
        time.sleep(0.5)

        # Take fresh screenshot and update window regions
        img = take_screenshot()

        # Debug: show actual region coordinates
        try:
            region_obj = region_mgr.get(step.region)
            print(f"  Region coords: ({region_obj.x1:.2f}, {region_obj.y1:.2f}) -> ({region_obj.x2:.2f}, {region_obj.y2:.2f})")
        except Exception:
            pass
        region_mgr.update_for_active_window(img.size[0], img.size[1])

        # Locate the element (pass instruction and quad for icon detection)
        result = locator.locate(
            img,
            step.target_text,
            region=step.region,
            is_icon=step.is_icon,
            instruction=step.instruction,
            quad=step.quad,
        )

        if result.found:
            print(f"  Found! Confidence: {result.confidence:.0f}%")

            # Draw highlight
            method_name = result.method.value if result.method else "unknown"
            highlight_path = f"/tmp/conu_step{step_num}.png"
            draw_highlight(
                img,
                result.bbox,
                instruction=step.instruction,
                confidence=result.confidence,
                method=method_name,
                output_path=highlight_path,
            )
            print(f"  Highlight saved: {highlight_path}")

            # Show image
            open_image(highlight_path)

            # Wait for user
            try:
                response = input("\n>>> Press ENTER after you click, or 'q' to quit: ")
                if response.lower() == 'q':
                    print("Quit by user.")
                    return 0
            except (EOFError, KeyboardInterrupt):
                print("\nInterrupted.")
                return 0

            step.result = result
            plan.advance()

        else:
            print(f"  Not found!")
            if result.suggestions:
                print(f"  Suggestions: {', '.join(result.suggestions[:3])}")

            try:
                response = input("\n>>> Press ENTER to retry, 's' to skip, 'q' to quit: ")
                if response.lower() == 'q':
                    return 0
                elif response.lower() == 's':
                    plan.advance()
            except (EOFError, KeyboardInterrupt):
                print("\nInterrupted.")
                return 0

    print(f"\nTask complete! {step_num}/{len(plan.steps)} steps succeeded.")
    return 0


def cmd_locate(args):
    """Find a single element."""
    from engine.utils.image import draw_highlight

    img = Image.open(args.image).convert("RGB")
    target = args.target
    region = args.region or "full"
    instruction = args.instruction or ""

    # Parse quad - could be int (1-4) or string (top/bottom/left/right)
    quad = args.quad
    if quad:
        if quad.isdigit():
            quad = int(quad)
        # else keep as string

    # Only print diagnostic info if not in JSON mode
    if not args.json:
        print(f"Image: {img.size[0]}x{img.size[1]}")
        print(f"Target: '{target}' in region '{region}'")
        if instruction:
            print(f"Instruction: '{instruction}'")
        if quad:
            print(f"Quad: {quad}")

    locator = get_locator()
    result = locator.locate(img, target, region=region, is_icon=args.icon, instruction=instruction, quad=quad)

    # JSON output mode for programmatic access
    if args.json:
        output = {
            "found": result.found,
            "bbox": result.bbox.to_list() if result.bbox else None,
            "center": list(result.bbox.center) if result.bbox else None,
            "confidence": result.confidence,
            "method": result.method.value if result.method else None,
            "suggestions": result.suggestions,
        }
        print(json.dumps(output))
        return 0 if result.found else 1

    if result.found:
        print(f"\nFound!")
        print(f"  Element: {result.element}")
        print(f"  BBox: {result.bbox.to_list()}")
        print(f"  Confidence: {result.confidence:.0f}%")
        print(f"  Method: {result.method.value if result.method else 'unknown'}")
        print(f"  Time: {result.time_ms:.1f}ms")

        if args.show or args.output:
            method_name = result.method.value if result.method else "unknown"
            output_path = args.output or "/tmp/conu_locate.png"
            draw_highlight(
                img,
                result.bbox,
                instruction=f"Found: {target}",
                confidence=result.confidence,
                method=method_name,
                output_path=output_path,
            )
            print(f"\nSaved: {output_path}")
            if args.show:
                open_image(output_path)
    else:
        print(f"\nNot found!")
        if result.suggestions:
            print(f"  Suggestions: {', '.join(result.suggestions)}")
        print(f"  Time: {result.time_ms:.1f}ms")

    return 0 if result.found else 1


def cmd_plan(args):
    """Generate a plan without executing."""
    img = Image.open(args.image).convert("RGB")
    task = args.task

    print(f"Image: {img.size[0]}x{img.size[1]}")
    print(f"Task: '{task}'")
    print()

    planner = get_planner()
    try:
        plan = planner.generate_plan(img, task)
    except Exception as e:
        print(f"Error: {e}")
        return 1

    print(f"Generated {len(plan.steps)} steps:")
    for i, step in enumerate(plan.steps):
        icon_marker = " [icon]" if step.is_icon else ""
        print(f"  {i+1}. {step.instruction}")
        print(f"     Target: '{step.target_text}' in {step.region}{icon_marker}")

    if args.json:
        print("\nJSON:")
        print(json.dumps(plan.to_dict(), indent=2))

    return 0


def cmd_screenshot(args):
    """Take and save a screenshot."""
    output = args.output or "screenshot.png"
    img = take_screenshot(output)
    print(f"Saved: {output} ({img.size[0]}x{img.size[1]})")
    return 0


def cmd_regions(args):
    """List available regions."""
    from engine.core.regions import REGIONS, get_region_manager

    print("Default regions (normalized 0-1 coordinates):")
    print("-" * 50)
    for name, coords in sorted(REGIONS.items()):
        x1, y1, x2, y2 = coords
        print(f"  {name:12s}  ({x1:.2f}, {y1:.2f}) -> ({x2:.2f}, {y2:.2f})")

    manager = get_region_manager()
    if manager.custom_regions:
        print("\nCustom regions:")
        print("-" * 50)
        for name, coords in sorted(manager.custom_regions.items()):
            x1, y1, x2, y2 = coords
            print(f"  {name:12s}  ({x1:.2f}, {y1:.2f}) -> ({x2:.2f}, {y2:.2f})")

    return 0


def cmd_benchmark(args):
    """Benchmark OCR on a screenshot."""
    from engine.locators.ocr_locator import OCRLocator
    from engine.cache.ocr_cache import get_ocr_cache
    import time

    img = Image.open(args.image).convert("RGB")
    print(f"Image: {img.size[0]}x{img.size[1]}")

    locator = OCRLocator()
    cache = get_ocr_cache()

    # First run (cold)
    print("\nCold run (no cache):")
    cache.clear()
    start = time.time()
    elements = locator.get_all_text_in_region(img, "full")
    cold_time = (time.time() - start) * 1000
    print(f"  Time: {cold_time:.1f}ms")
    print(f"  Elements: {len(elements)}")

    # Second run (warm)
    print("\nWarm run (cached):")
    start = time.time()
    elements = locator.get_all_text_in_region(img, "full")
    warm_time = (time.time() - start) * 1000
    print(f"  Time: {warm_time:.1f}ms")

    print(f"\nSpeedup: {cold_time/warm_time:.1f}x")
    print(f"Cache stats: {cache.stats}")

    # Show sample text
    if elements and args.verbose:
        print("\nSample text found:")
        for el in elements[:10]:
            print(f"  - '{el['text']}' ({el['confidence']}%)")

    return 0


def cmd_debug(args):
    """Debug: show all detected elements."""
    from engine.locators.ocr_locator import OCRLocator
    from engine.utils.image import draw_all_elements

    img = Image.open(args.image).convert("RGB")
    region = args.region or "full"

    print(f"Image: {img.size[0]}x{img.size[1]}")
    print(f"Region: {region}")

    locator = OCRLocator()
    elements = locator.get_all_text_in_region(img, region)

    print(f"\nFound {len(elements)} text elements:")
    for i, el in enumerate(elements[:20]):
        bbox = el['bbox']
        print(f"  {i:2d}. '{el['text'][:30]:30s}' conf={el['confidence']:3d}% at ({bbox.x1}, {bbox.y1})")

    if args.show:
        # Convert elements to expected format
        vis_elements = [
            {"bbox": el["bbox"], "confidence": el["confidence"], "text": el["text"]}
            for el in elements
        ]
        output_path = args.output or "/tmp/conu_debug.png"
        draw_all_elements(img, vis_elements, output_path)
        print(f"\nSaved: {output_path}")
        open_image(output_path)

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="CONU Engine CLI - UI element locator and task planner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # run command
    run_parser = subparsers.add_parser("run", help="Interactive task execution")
    run_parser.add_argument("task", help="Task to execute (e.g., 'Turn on dark mode')")

    # locate command
    locate_parser = subparsers.add_parser("locate", help="Find a single element")
    locate_parser.add_argument("image", help="Screenshot image path")
    locate_parser.add_argument("target", help="Text or description to find")
    locate_parser.add_argument("--region", "-r", help="Region to search in")
    locate_parser.add_argument("--icon", "-i", action="store_true", help="Target is an icon")
    locate_parser.add_argument("--instruction", help="Full instruction context (for icon detection)")
    locate_parser.add_argument("--quad", "-q", help="Region for icon: 1-4 (quadrants), or top/bottom/left/right (halves)")
    locate_parser.add_argument("--show", "-s", action="store_true", help="Show result image")
    locate_parser.add_argument("--output", "-o", help="Output image path")
    locate_parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")

    # plan command
    plan_parser = subparsers.add_parser("plan", help="Generate a plan")
    plan_parser.add_argument("image", help="Screenshot image path")
    plan_parser.add_argument("task", help="Task to plan")
    plan_parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")

    # screenshot command
    ss_parser = subparsers.add_parser("screenshot", help="Take a screenshot")
    ss_parser.add_argument("--output", "-o", help="Output path (default: screenshot.png)")

    # regions command
    subparsers.add_parser("regions", help="List available regions")

    # benchmark command
    bench_parser = subparsers.add_parser("benchmark", help="Benchmark OCR performance")
    bench_parser.add_argument("image", help="Screenshot image path")
    bench_parser.add_argument("--verbose", "-v", action="store_true", help="Show detected text")

    # debug command
    debug_parser = subparsers.add_parser("debug", help="Debug: show all detected elements")
    debug_parser.add_argument("image", help="Screenshot image path")
    debug_parser.add_argument("--region", "-r", help="Region to analyze")
    debug_parser.add_argument("--show", "-s", action="store_true", help="Show visualization")
    debug_parser.add_argument("--output", "-o", help="Output image path")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    commands = {
        "run": cmd_run,
        "locate": cmd_locate,
        "plan": cmd_plan,
        "screenshot": cmd_screenshot,
        "regions": cmd_regions,
        "benchmark": cmd_benchmark,
        "debug": cmd_debug,
    }

    return commands[args.command](args)


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Element Locator Module

Hybrid approach for finding UI elements:
1. Primary: Tesseract OCR for text elements (fast, accurate)
2. Fallback: OmniParser + Gemini for icons (~1s, ~70% accurate)
"""

import os
import json
import time
import pytesseract
from PIL import Image, ImageDraw
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

# Screen regions (normalized 0-1)
REGIONS = {
    "menu_bar": (0, 0, 1, 0.04),
    "toolbar": (0, 0.04, 1, 0.12),
    "sidebar": (0, 0.04, 0.25, 0.95),
    "main": (0.25, 0.04, 1, 0.95),
    "bottom": (0, 0.90, 1, 1),
    "full": (0, 0, 1, 1),
}


class Locator:
    def __init__(self, google_api_key: str = None):
        api_key = google_api_key or os.environ.get("GOOGLE_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash")
        self.omni_elements = None

    def crop_region(self, img: Image.Image, region_name: str) -> tuple[Image.Image, tuple]:
        """Crop image to a named region, return crop and offset."""
        w, h = img.size
        r = REGIONS.get(region_name, REGIONS["full"])
        x1, y1, x2, y2 = int(r[0]*w), int(r[1]*h), int(r[2]*w), int(r[3]*h)
        return img.crop((x1, y1, x2, y2)), (x1, y1)

    def ocr_find_text(self, img: Image.Image, target_text: str, offset: tuple = (0, 0)) -> dict | None:
        """Use Tesseract to find exact text location."""
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

        target_lower = target_text.lower()
        best_match = None
        best_conf = 0

        for i, text in enumerate(data["text"]):
            if not text.strip():
                continue

            conf = int(data["conf"][i])
            text_lower = text.lower()

            if target_lower == text_lower or target_lower in text_lower:
                if conf > best_conf:
                    x = data["left"][i] + offset[0]
                    y = data["top"][i] + offset[1]
                    w = data["width"][i]
                    h = data["height"][i]
                    best_match = {
                        "found": True,
                        "element": text,
                        "bbox": [x, y, x + w, y + h],
                        "confidence": conf,
                        "method": "ocr"
                    }
                    best_conf = conf

        return best_match

    def load_omni_elements(self, json_path: str = "omni_result.json"):
        """Load pre-computed OmniParser results."""
        if os.path.exists(json_path):
            with open(json_path) as f:
                data = json.load(f)
            self.omni_elements = data.get("elements", [])
        return self.omni_elements

    def icon_find(self, img: Image.Image, target_description: str, region_name: str = "full") -> dict | None:
        """Use OmniParser boxes + Gemini to find an icon."""
        if not self.omni_elements:
            self.load_omni_elements()

        if not self.omni_elements:
            return None

        w, h = img.size
        r = REGIONS.get(region_name, REGIONS["full"])

        # Filter elements in region
        region_elements = []
        for el in self.omni_elements:
            bbox = el["bbox"]
            if r[0] <= bbox[0] <= r[2] and r[1] <= bbox[1] <= r[3]:
                region_elements.append(el)

        # Check each element
        for el in region_elements[:10]:  # Limit to 10 for speed
            bbox = el["bbox"]
            x1, y1, x2, y2 = int(bbox[0]*w), int(bbox[1]*h), int(bbox[2]*w), int(bbox[3]*h)

            # Crop with padding
            pad = 10
            crop = img.crop((max(0, x1-pad), max(0, y1-pad), min(w, x2+pad), min(h, y2+pad)))

            # Ask Gemini
            prompt = f'Is this UI element a "{target_description}"? Reply YES or NO only.'

            try:
                response = self.model.generate_content([prompt, crop])
                answer = response.text.strip().upper()

                if "YES" in answer:
                    return {
                        "found": True,
                        "element": target_description,
                        "bbox": [x1, y1, x2, y2],
                        "confidence": el.get("confidence", 0.5) * 100,
                        "method": "icon"
                    }
            except Exception as e:
                print(f"Gemini error: {e}")
                continue

        return None

    def locate(self, img: Image.Image, target_text: str, region: str = "full", is_icon: bool = False) -> dict:
        """
        Find a UI element on screen.

        Args:
            img: Screenshot as PIL Image
            target_text: Text or description to find
            region: Screen region hint (menu_bar, sidebar, main, etc.)
            is_icon: If True, skip OCR and use icon detection

        Returns:
            dict with found, element, bbox, confidence, method
        """
        start = time.time()

        # Try OCR first (unless explicitly icon)
        if not is_icon:
            crop, offset = self.crop_region(img, region)
            result = self.ocr_find_text(crop, target_text, offset)

            if result:
                result["time"] = time.time() - start
                return result

        # Fall back to icon detection
        result = self.icon_find(img, target_text, region)

        if result:
            result["time"] = time.time() - start
            return result

        # Not found
        return {
            "found": False,
            "element": None,
            "bbox": None,
            "confidence": 0,
            "method": None,
            "time": time.time() - start
        }

    def generate_plan(self, img: Image.Image, task: str) -> list:
        """Use Gemini to generate a step-by-step plan with region hints."""
        # Resize for faster API call
        img_small = img.copy()
        if img.width > 1200:
            img_small = img.resize((1200, int(1200 * img.height / img.width)))

        prompt = f"""Task: {task}

Generate 3-6 steps to complete this task on the screen shown.
For each step, specify what text/element to find and which screen region.

Return JSON only:
{{"steps": [
  {{"instruction": "Click X", "target_text": "X", "region": "menu_bar", "is_icon": false}},
  {{"instruction": "Click icon", "target_text": "search icon", "region": "sidebar", "is_icon": true}}
]}}

region must be: menu_bar, toolbar, sidebar, main, bottom
is_icon: true if it's an icon without text label, false otherwise
JSON only."""

        response = self.model.generate_content([prompt, img_small])

        text = response.text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:-1])

        try:
            result = json.loads(text)
            return result.get("steps", [])
        except:
            return []

    def visualize(self, img: Image.Image, result: dict, output_path: str = "locate_result.png"):
        """Draw the found element on the image."""
        img = img.copy()
        draw = ImageDraw.Draw(img)

        if result.get("found") and result.get("bbox"):
            bbox = result["bbox"]
            color = "lime" if result["method"] == "ocr" else "cyan"
            draw.rectangle(bbox, outline=color, width=4)

            label = f"{result['element']} ({result['method']})"
            draw.text((bbox[0], bbox[1]-20), label, fill=color)

        img.save(output_path)
        return output_path


def main():
    """Test the locator."""
    locator = Locator()

    img = Image.open("screenshot.png").convert("RGB")
    print(f"Image: {img.size}")

    # Test 1: OCR for text
    print("\n=== Test 1: Find 'Terminal' in menu bar ===")
    result = locator.locate(img, "Terminal", region="menu_bar")
    print(f"Result: {result}")

    if result["found"]:
        locator.visualize(img, result, "test_terminal.png")
        print("Saved: test_terminal.png")

    # Test 2: Plan generation
    print("\n=== Test 2: Generate plan ===")
    steps = locator.generate_plan(img, "Open a new terminal")
    print(f"Plan ({len(steps)} steps):")
    for s in steps:
        print(f"  - {s}")


if __name__ == "__main__":
    main()

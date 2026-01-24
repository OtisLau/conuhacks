"""
OmniParser on Modal with A100 GPU - Optimized.

Setup:
    modal token new
    modal deploy omni_modal.py

Usage:
    python omni_modal.py screenshot.png
"""

import modal

# Define the Modal app
app = modal.App("omniparser")

MODEL_URL = "https://huggingface.co/microsoft/OmniParser-v2.0/resolve/main/icon_detect/model.pt"

# Download model during image build
def download_model():
    from ultralytics import YOLO
    YOLO(MODEL_URL)  # Downloads and caches

# Create image with OmniParser dependencies + pre-downloaded model
omni_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch",
        "torchvision",
        "pillow",
        "ultralytics",
        "opencv-python-headless",
    )
    .run_function(download_model)  # Cache model in image
)


@app.cls(image=omni_image, gpu="A100", timeout=120)
class OmniParser:
    @modal.enter()
    def load_model(self):
        """Load model once when container starts."""
        from ultralytics import YOLO
        import torch
        print(f"Loading model on {torch.cuda.get_device_name(0)}...")
        self.yolo = YOLO(MODEL_URL)
        # Warmup inference
        import numpy as np
        from PIL import Image
        dummy = Image.fromarray(np.zeros((640, 640, 3), dtype=np.uint8))
        self.yolo(dummy, verbose=False)
        print("Model ready!")

    @modal.method()
    def warmup(self) -> str:
        """Call this on app start to trigger cold start. Container stays warm ~5min."""
        return "ready"

    @modal.method()
    def detect(self, image_bytes: bytes, width: int = 800) -> dict:
        """Run detection - model already loaded."""
        from PIL import Image
        import io
        import time

        start = time.time()

        # Load image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((width, int(width * img.height / img.width)))

        # Run detection (model already loaded)
        # conf=0.3 means only 30%+ confidence (fewer but better detections)
        results = self.yolo(img, conf=0.3, iou=0.1)

        # Extract boxes
        elements = []
        for r in results:
            boxes = r.boxes
            for i, box in enumerate(boxes.xyxy):
                x1, y1, x2, y2 = box.tolist()
                w, h = img.size
                elements.append({
                    "id": f"icon_{i}",
                    "bbox": [x1/w, y1/h, x2/w, y2/h],
                    "confidence": float(boxes.conf[i])
                })

        elapsed = time.time() - start
        print(f"Detection: {elapsed*1000:.0f}ms, {len(elements)} elements")

        return {
            "elements": elements,
            "time": elapsed,
            "image_size": img.size
        }


@app.local_entrypoint()
def main():
    """Run from command line."""
    import time
    import json
    from PIL import Image, ImageDraw

    image_path = "screenshot.png"
    print(f"Loading {image_path}...")
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    parser = OmniParser()

    # Warmup
    print("\n=== WARMING UP ===")
    start = time.time()
    parser.warmup.remote()
    print(f"Warm! ({time.time() - start:.2f}s)")

    # Run detection
    print("\n=== RUNNING DETECTION ===")
    start = time.time()
    result = parser.detect.remote(image_bytes, width=640)
    total = time.time() - start
    print(f"GPU: {result['time']*1000:.0f}ms | Total: {total:.2f}s | Elements: {len(result['elements'])}")

    # Print JSON
    print("\n=== JSON OUTPUT ===")
    print(json.dumps(result, indent=2))

    # Save JSON
    with open("omni_result.json", "w") as f:
        json.dump(result, f, indent=2)

    # Create visualization
    print("\n=== CREATING VISUALIZATION ===")
    img = Image.open(image_path)
    width = 640
    img = img.resize((width, int(width * img.height / img.width)))
    draw = ImageDraw.Draw(img)

    w, h = img.size
    for el in result["elements"]:
        bbox = el["bbox"]
        x1, y1, x2, y2 = bbox[0]*w, bbox[1]*h, bbox[2]*w, bbox[3]*h
        conf = el["confidence"]
        color = "lime" if conf > 0.5 else "yellow" if conf > 0.2 else "red"
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

    img.save("omni_visual.png")
    print(f"Saved: omni_visual.png and omni_result.json")

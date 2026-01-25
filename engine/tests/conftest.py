"""
Pytest fixtures for CONU engine tests.
"""

import os
import pytest
from PIL import Image
import numpy as np

from engine.config import Config, set_config
from engine.core.regions import RegionManager
from engine.cache.ocr_cache import OCRCache


@pytest.fixture
def test_config():
    """Create a test configuration."""
    config = Config(
        google_api_key="test-key",
        ocr_cache_size=10,
        max_retries=1,
        retry_base_delay=0.1,
    )
    set_config(config)
    return config


@pytest.fixture
def region_manager():
    """Create a fresh region manager."""
    return RegionManager()


@pytest.fixture
def ocr_cache():
    """Create a fresh OCR cache."""
    return OCRCache(max_size=10)


@pytest.fixture
def sample_image():
    """Create a simple test image with text."""
    # Create a 800x600 white image
    img = Image.new("RGB", (800, 600), color="white")
    return img


@pytest.fixture
def sample_image_with_text():
    """
    Create a test image with actual text for OCR testing.

    Note: For real OCR tests, you'd use a pre-rendered image.
    This creates a simple placeholder.
    """
    from PIL import ImageDraw, ImageFont

    img = Image.new("RGB", (800, 600), color="white")
    draw = ImageDraw.Draw(img)

    # Draw some text
    try:
        # Try to use a system font
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
    except (OSError, IOError):
        font = ImageFont.load_default()

    draw.text((100, 100), "Settings", fill="black", font=font)
    draw.text((100, 150), "Appearance", fill="black", font=font)
    draw.text((100, 200), "Dark Mode", fill="black", font=font)
    draw.text((400, 100), "System Preferences", fill="black", font=font)

    return img


@pytest.fixture
def temp_screenshot(tmp_path, sample_image_with_text):
    """Save sample image to temp file."""
    path = tmp_path / "test_screenshot.png"
    sample_image_with_text.save(path)
    return str(path)

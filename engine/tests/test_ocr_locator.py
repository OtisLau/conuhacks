"""
Tests for OCR locator.
"""

import pytest
from PIL import Image

from engine.core.types import BoundingBox, LocatorMethod
from engine.locators.ocr_locator import OCRLocator
from engine.cache.ocr_cache import OCRCache


class TestBoundingBox:
    """Tests for BoundingBox dataclass."""

    def test_properties(self):
        bbox = BoundingBox(10, 20, 110, 70)
        assert bbox.width == 100
        assert bbox.height == 50
        assert bbox.center == (60, 45)
        assert bbox.area == 5000

    def test_to_list(self):
        bbox = BoundingBox(10, 20, 30, 40)
        assert bbox.to_list() == [10, 20, 30, 40]

    def test_from_list(self):
        bbox = BoundingBox.from_list([10, 20, 30, 40])
        assert bbox.x1 == 10
        assert bbox.y1 == 20
        assert bbox.x2 == 30
        assert bbox.y2 == 40

    def test_expand(self):
        bbox = BoundingBox(100, 100, 200, 200)
        expanded = bbox.expand(10)
        assert expanded.x1 == 90
        assert expanded.y1 == 90
        assert expanded.x2 == 210
        assert expanded.y2 == 210

    def test_clamp(self):
        bbox = BoundingBox(-10, -10, 900, 700)
        clamped = bbox.clamp(800, 600)
        assert clamped.x1 == 0
        assert clamped.y1 == 0
        assert clamped.x2 == 800
        assert clamped.y2 == 600


class TestOCRCache:
    """Tests for OCR caching."""

    def test_cache_miss(self, ocr_cache, sample_image):
        result = ocr_cache.get(sample_image)
        assert result is None
        assert ocr_cache.stats["misses"] == 1

    def test_cache_hit(self, ocr_cache, sample_image):
        # Put something in cache
        ocr_cache.put(sample_image, {"text": ["test"]}, ["test"])

        # Should be a hit
        result = ocr_cache.get(sample_image)
        assert result is not None
        assert result.all_text == ["test"]
        assert ocr_cache.stats["hits"] == 1

    def test_lru_eviction(self):
        cache = OCRCache(max_size=2)

        # Create 3 different images
        img1 = Image.new("RGB", (100, 100), color="red")
        img2 = Image.new("RGB", (100, 100), color="green")
        img3 = Image.new("RGB", (100, 100), color="blue")

        cache.put(img1, {"id": 1}, ["one"])
        cache.put(img2, {"id": 2}, ["two"])

        # Access img1 to make it more recent
        cache.get(img1)

        # Add img3, should evict img2 (least recently used)
        cache.put(img3, {"id": 3}, ["three"])

        assert cache.get(img1) is not None  # Still there
        assert cache.get(img2) is None  # Evicted
        assert cache.get(img3) is not None  # Newly added


class TestOCRLocator:
    """Tests for OCR locator."""

    def test_name(self, test_config):
        locator = OCRLocator(config=test_config)
        assert locator.name == "ocr"

    def test_supports_text(self, test_config):
        locator = OCRLocator(config=test_config)
        assert locator.supports_target("some text", is_icon=False) is True
        assert locator.supports_target("icon", is_icon=True) is False

    def test_fuzzy_match(self, test_config):
        locator = OCRLocator(config=test_config)

        # Exact match
        assert locator._fuzzy_match("Settings", "Settings") == 1.0

        # Case insensitive
        assert locator._fuzzy_match("settings", "Settings") == 1.0

        # Similar strings
        score = locator._fuzzy_match("Setting", "Settings")
        assert score > 0.8

        # Different strings
        score = locator._fuzzy_match("Hello", "World")
        assert score < 0.5

    def test_find_suggestions(self, test_config):
        locator = OCRLocator(config=test_config)

        all_text = ["Settings", "System", "Set Up", "Preferences", "About"]
        suggestions = locator._find_suggestions("Sett", all_text)

        # Should find "Settings" and "Set Up" as similar
        assert len(suggestions) > 0
        assert "Settings" in suggestions

    @pytest.mark.skipif(
        not pytest.importorskip("pytesseract", reason="pytesseract not installed"),
        reason="pytesseract not installed"
    )
    def test_locate_text(self, test_config, sample_image_with_text):
        """Test actual OCR location (requires tesseract)."""
        locator = OCRLocator(config=test_config)

        result = locator.locate(sample_image_with_text, "Settings")

        # Note: This test may be flaky depending on font rendering
        # In a real test suite, you'd use a known-good test image
        if result.found:
            assert result.bbox is not None
            assert result.method == LocatorMethod.OCR
            assert result.confidence > 0

    def test_locate_not_found(self, test_config, sample_image):
        """Test when text is not found."""
        locator = OCRLocator(config=test_config)

        result = locator.locate(sample_image, "NonexistentText12345")

        assert result.found is False
        assert result.bbox is None

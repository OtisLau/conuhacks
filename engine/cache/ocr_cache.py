"""
LRU cache for OCR results using image hashing.
"""

import hashlib
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any
from PIL import Image
import io


@dataclass
class OCRCacheEntry:
    """Cached OCR result."""
    image_hash: str
    ocr_data: Dict[str, Any]
    all_text: List[str]  # All detected text for suggestions


class OCRCache:
    """
    LRU cache for OCR results.

    Uses perceptual hashing to identify similar images.
    """

    def __init__(self, max_size: int = 100):
        self.max_size = max_size
        self._cache: OrderedDict[str, OCRCacheEntry] = OrderedDict()
        self._hits = 0
        self._misses = 0

    def _compute_hash(self, img: Image.Image) -> str:
        """
        Compute a hash for an image.

        Uses a simple approach: resize to small size and hash pixels.
        """
        # Resize to 16x16 grayscale for hashing
        small = img.convert("L").resize((16, 16), Image.Resampling.LANCZOS)

        # Get pixel data and hash it
        pixels = list(small.getdata())
        pixel_bytes = bytes(pixels)
        return hashlib.md5(pixel_bytes).hexdigest()

    def get(self, img: Image.Image) -> Optional[OCRCacheEntry]:
        """
        Get cached OCR result for an image.

        Returns None if not cached.
        """
        img_hash = self._compute_hash(img)

        if img_hash in self._cache:
            self._hits += 1
            # Move to end (most recently used)
            self._cache.move_to_end(img_hash)
            return self._cache[img_hash]

        self._misses += 1
        return None

    def put(
        self, img: Image.Image, ocr_data: Dict[str, Any], all_text: List[str]
    ) -> str:
        """
        Cache OCR result for an image.

        Returns the image hash.
        """
        img_hash = self._compute_hash(img)

        # Remove oldest if at capacity
        if len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)

        entry = OCRCacheEntry(
            image_hash=img_hash,
            ocr_data=ocr_data,
            all_text=all_text,
        )
        self._cache[img_hash] = entry
        return img_hash

    def clear(self) -> None:
        """Clear the cache."""
        self._cache.clear()
        self._hits = 0
        self._misses = 0

    @property
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total = self._hits + self._misses
        hit_rate = self._hits / total if total > 0 else 0
        return {
            "size": len(self._cache),
            "max_size": self.max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": hit_rate,
        }


# Global cache instance
_global_cache: Optional[OCRCache] = None


def get_ocr_cache(max_size: int = 100) -> OCRCache:
    """Get or create the global OCR cache."""
    global _global_cache
    if _global_cache is None:
        _global_cache = OCRCache(max_size=max_size)
    return _global_cache

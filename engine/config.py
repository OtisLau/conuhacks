"""
Configuration and API key management.
"""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Config:
    """Engine configuration with sensible defaults."""

    # API Keys
    google_api_key: Optional[str] = field(default=None)
    modal_token: Optional[str] = field(default=None)

    # OCR Settings
    ocr_cache_size: int = 100
    ocr_fuzzy_threshold: float = 0.8

    # Retry Settings
    max_retries: int = 3
    retry_base_delay: float = 0.5
    retry_max_delay: float = 5.0

    # Gemini Settings
    gemini_planner_model: str = "gemini-2.5-pro"  # Smart model for planning
    gemini_fast_model: str = "gemini-2.0-flash"   # Fast model for QA/validation
    plan_max_steps: int = 8

    # Icon Detection
    icon_confidence_threshold: float = 0.3
    icon_max_candidates: int = 10

    # Timeouts (seconds)
    ocr_timeout: float = 10.0
    icon_timeout: float = 30.0
    planning_timeout: float = 30.0

    def __post_init__(self):
        """Load from environment if not provided."""
        if self.google_api_key is None:
            self.google_api_key = os.environ.get("GOOGLE_API_KEY")
        if self.modal_token is None:
            self.modal_token = os.environ.get("MODAL_TOKEN_ID")


# Global default config
_default_config: Optional[Config] = None


def get_config() -> Config:
    """Get or create the default config."""
    global _default_config
    if _default_config is None:
        _default_config = Config()
    return _default_config


def set_config(config: Config) -> None:
    """Set the default config."""
    global _default_config
    _default_config = config


def load_config_from_env() -> Config:
    """Create a fresh config from environment variables."""
    return Config()

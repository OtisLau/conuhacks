"""
Custom exceptions for the CONU engine.
"""

from typing import Optional, List


class CONUError(Exception):
    """Base exception for all CONU errors."""
    pass


class ElementNotFoundError(CONUError):
    """Raised when an element cannot be located."""

    def __init__(
        self,
        target: str,
        region: str = "full",
        suggestions: Optional[List[str]] = None,
    ):
        self.target = target
        self.region = region
        self.suggestions = suggestions or []

        msg = f"Element '{target}' not found in region '{region}'"
        if self.suggestions:
            msg += f". Did you mean: {', '.join(self.suggestions[:3])}?"
        super().__init__(msg)


class OCRError(CONUError):
    """Raised when OCR processing fails."""

    def __init__(self, message: str, cause: Optional[Exception] = None):
        self.cause = cause
        super().__init__(message)


class OCRTimeoutError(OCRError):
    """Raised when OCR takes too long."""

    def __init__(self, timeout: float):
        self.timeout = timeout
        super().__init__(f"OCR timed out after {timeout}s")


class IconDetectionError(CONUError):
    """Raised when icon detection fails."""

    def __init__(self, message: str, cause: Optional[Exception] = None):
        self.cause = cause
        super().__init__(message)


class OmniParserError(IconDetectionError):
    """Raised when OmniParser fails."""
    pass


class GeminiValidationError(IconDetectionError):
    """Raised when Gemini validation fails."""
    pass


class PlanningError(CONUError):
    """Raised when task planning fails."""

    def __init__(self, task: str, message: str, cause: Optional[Exception] = None):
        self.task = task
        self.cause = cause
        super().__init__(f"Failed to plan '{task}': {message}")


class RetryExhaustedError(CONUError):
    """Raised when all retry attempts have failed."""

    def __init__(self, operation: str, attempts: int, last_error: Exception):
        self.operation = operation
        self.attempts = attempts
        self.last_error = last_error
        super().__init__(
            f"Operation '{operation}' failed after {attempts} attempts: {last_error}"
        )


class ConfigurationError(CONUError):
    """Raised for configuration issues."""
    pass


class InvalidRegionError(CONUError):
    """Raised when an invalid region is specified."""

    def __init__(self, region: str, valid_regions: List[str]):
        self.region = region
        self.valid_regions = valid_regions
        super().__init__(
            f"Invalid region '{region}'. Valid regions: {', '.join(valid_regions)}"
        )

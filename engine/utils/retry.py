"""
Retry decorator with exponential backoff.
"""

import time
import functools
from dataclasses import dataclass
from typing import Callable, Optional, Tuple, Type, TypeVar, Any

from engine.core.exceptions import RetryExhaustedError


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_attempts: int = 3
    base_delay: float = 0.5
    max_delay: float = 5.0
    exponential_base: float = 2.0
    retry_on: Tuple[Type[Exception], ...] = (Exception,)


T = TypeVar("T")


def with_retry(
    config: Optional[RetryConfig] = None,
    max_attempts: Optional[int] = None,
    base_delay: Optional[float] = None,
    retry_on: Optional[Tuple[Type[Exception], ...]] = None,
) -> Callable:
    """
    Decorator for retrying functions with exponential backoff.

    Can be used with or without arguments:
        @with_retry
        def foo(): ...

        @with_retry(max_attempts=5)
        def bar(): ...

    Args:
        config: Full RetryConfig object
        max_attempts: Override max attempts
        base_delay: Override base delay
        retry_on: Tuple of exception types to retry on
    """
    # Handle being called without parentheses: @with_retry
    if callable(config):
        func = config
        config = RetryConfig()
        return _make_wrapper(func, config)

    # Handle being called with arguments: @with_retry(...)
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        cfg = config or RetryConfig()
        if max_attempts is not None:
            cfg.max_attempts = max_attempts
        if base_delay is not None:
            cfg.base_delay = base_delay
        if retry_on is not None:
            cfg.retry_on = retry_on
        return _make_wrapper(func, cfg)

    return decorator


def _make_wrapper(func: Callable[..., T], config: RetryConfig) -> Callable[..., T]:
    """Create the actual retry wrapper."""

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> T:
        last_exception = None
        delay = config.base_delay

        for attempt in range(1, config.max_attempts + 1):
            try:
                return func(*args, **kwargs)
            except config.retry_on as e:
                last_exception = e

                if attempt == config.max_attempts:
                    break

                # Sleep with exponential backoff
                time.sleep(delay)
                delay = min(delay * config.exponential_base, config.max_delay)

        raise RetryExhaustedError(
            operation=func.__name__,
            attempts=config.max_attempts,
            last_error=last_exception,
        )

    return wrapper


def retry_call(
    func: Callable[..., T],
    args: tuple = (),
    kwargs: Optional[dict] = None,
    config: Optional[RetryConfig] = None,
) -> T:
    """
    Call a function with retry logic.

    Alternative to decorator for one-off use:
        result = retry_call(some_api_call, args=(param,), config=RetryConfig(max_attempts=5))
    """
    kwargs = kwargs or {}
    cfg = config or RetryConfig()

    last_exception = None
    delay = cfg.base_delay

    for attempt in range(1, cfg.max_attempts + 1):
        try:
            return func(*args, **kwargs)
        except cfg.retry_on as e:
            last_exception = e

            if attempt == cfg.max_attempts:
                break

            time.sleep(delay)
            delay = min(delay * cfg.exponential_base, cfg.max_delay)

    raise RetryExhaustedError(
        operation=func.__name__,
        attempts=cfg.max_attempts,
        last_error=last_exception,
    )

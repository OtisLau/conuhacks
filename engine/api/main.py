"""
FastAPI application factory and server startup.

Usage:
    uvicorn engine.api.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv

# Load environment variables before importing engine modules
load_dotenv()

from engine.api.routes import health, screenshot, plan, locate, regions
from engine.api.websocket import task_runner


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup/shutdown events.

    Pre-loads expensive dependencies on startup.
    """
    # Startup: pre-warm expensive dependencies
    from engine.api.dependencies import (
        get_cached_locator,
        get_cached_planner,
        check_readiness,
    )

    print("CONU Engine API starting...")
    print("Pre-warming dependencies...")

    # Initialize locator and planner (lazy loads models)
    _ = get_cached_locator()
    _ = get_cached_planner()

    # Check readiness
    status = check_readiness()
    print(f"Tesseract available: {status.tesseract_available}")
    print(f"Gemini API available: {status.gemini_available}")
    if status.gemini_error:
        print(f"Gemini error: {status.gemini_error}")

    print("CONU Engine API ready!")

    yield

    # Shutdown: cleanup if needed
    print("CONU Engine API shutting down...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="CONU Engine API",
        description="AI-powered UI element locator and task planner for macOS",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Configure CORS for Electron frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:5173",  # Vite dev server
            "app://.",  # Electron app
            "file://",  # Electron file protocol
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(health.router, tags=["Health"])
    app.include_router(screenshot.router, tags=["Screenshot"])
    app.include_router(plan.router, tags=["Planning"])
    app.include_router(locate.router, tags=["Location"])
    app.include_router(regions.router, tags=["Regions"])

    # Include WebSocket router
    app.include_router(task_runner.router, tags=["WebSocket"])

    return app


# Create app instance for uvicorn
app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "engine.api.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )

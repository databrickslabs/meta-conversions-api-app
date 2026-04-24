"""Conversions API App - FastAPI entry point."""

import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from server.routes import router as api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("Conversions API App starting up...")
    yield
    logger.info("Conversions API App shutting down...")


app = FastAPI(
    title="Conversions API App",
    version="0.1.0",
    lifespan=lifespan,
)

# Mount API routes
app.include_router(api_router, prefix="/api")

# Serve React frontend static files
frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        file_path = (frontend_dist / full_path).resolve()
        # Guard against path traversal — ensure resolved path is inside frontend_dist
        if file_path.is_relative_to(frontend_dist) and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
else:
    @app.get("/")
    async def root():
        return {
            "message": "Conversions API App is running. Build the frontend with: cd frontend && npm run build"
        }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

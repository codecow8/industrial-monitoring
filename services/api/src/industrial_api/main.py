from typing import Any

from fastapi import Body, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_session
from .evidence import router as evidence_router
from .repository import (
    get_draft,
    get_page_version,
    get_published,
    publish_draft,
    save_draft,
)
from .schema_contract import validate_page_schema
from .telemetry import router as telemetry_router


app = FastAPI(title="Industrial Monitoring API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)
app.include_router(telemetry_router)
app.include_router(evidence_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.put("/api/pages/{page_key}/draft")
def put_draft(
    page_key: str,
    schema: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    try:
        validate_page_schema(schema)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if schema.get("id") != page_key:
        raise HTTPException(status_code=422, detail="Schema id must match the page id")
    return save_draft(session, page_key, schema)


@app.get(
    "/api/pages/{page_key}/draft",
    response_model=None,
    responses={204: {"description": "No draft has been saved"}},
)
def read_draft(
    page_key: str,
    session: Session = Depends(get_session),
) -> Response | dict[str, Any]:
    schema = get_draft(session, page_key)
    if schema is None:
        return Response(status_code=204)
    return schema


@app.post("/api/pages/{page_key}/publish", response_model=None)
def publish_page(
    page_key: str,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    published = publish_draft(session, page_key)
    if published is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return published


@app.get(
    "/api/pages/{page_key}/published",
    response_model=None,
    responses={204: {"description": "No version has been published"}},
)
def read_published_page(
    page_key: str,
    session: Session = Depends(get_session),
) -> Response | dict[str, Any]:
    published = get_published(session, page_key)
    if published is None:
        return Response(status_code=204)
    return published


@app.get("/api/pages/{page_key}/versions/{version}", response_model=None)
def read_page_version(
    page_key: str,
    version: int,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    published = get_page_version(session, page_key, version)
    if published is None:
        raise HTTPException(status_code=404, detail="Page version not found")
    return published

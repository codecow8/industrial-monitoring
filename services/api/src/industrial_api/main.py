from typing import Any

from fastapi import Body, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .auth import allowed_origins, check_origin, current_user, require_editor, router as auth_router
from .database import get_session
from .active import router as active_router
from .diagnosis import router as diagnosis_router
from .evidence import router as evidence_router
from .history import router as history_router
from .repository import (
    get_draft,
    get_page_version,
    get_published,
    publish_draft,
    save_draft,
)
from .schema_contract import validate_page_schema
from .telemetry import hub as telemetry_hub, router as telemetry_router


app = FastAPI(title="Industrial Monitoring API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(auth_router)
app.include_router(telemetry_router)
app.include_router(evidence_router, dependencies=[Depends(current_user)])
app.include_router(history_router, dependencies=[Depends(current_user)])
app.include_router(active_router, dependencies=[Depends(current_user)])
app.include_router(diagnosis_router, dependencies=[Depends(current_user), Depends(check_origin)])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.put("/api/pages/{page_key}/draft", dependencies=[Depends(require_editor), Depends(check_origin)])
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
    dependencies=[Depends(require_editor)],
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


@app.post("/api/pages/{page_key}/publish", response_model=None, dependencies=[Depends(require_editor), Depends(check_origin)])
async def publish_page(
    page_key: str,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    published = await run_in_threadpool(publish_draft, session, page_key)
    if published is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    await telemetry_hub.page_published(published)
    return published


@app.get(
    "/api/pages/{page_key}/published",
    dependencies=[Depends(current_user)],
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


@app.get("/api/pages/{page_key}/versions/{version}", response_model=None, dependencies=[Depends(current_user)])
def read_page_version(
    page_key: str,
    version: int,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    published = get_page_version(session, page_key, version)
    if published is None:
        raise HTTPException(status_code=404, detail="Page version not found")
    return published

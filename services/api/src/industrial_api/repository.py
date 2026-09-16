from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Page, PageVersion


def save_draft(session: Session, page_key: str, schema: dict[str, Any]) -> dict[str, Any]:
    statement = (
        insert(Page)
        .values(page_key=page_key, name=str(schema["name"]), draft_schema=schema)
        .on_conflict_do_update(
            index_elements=[Page.page_key],
            set_={
                "name": str(schema["name"]),
                "draft_schema": schema,
                "updated_at": func.now(),
            },
        )
        .returning(Page.draft_schema)
    )
    saved = session.execute(statement).scalar_one()
    session.commit()
    return saved


def get_draft(session: Session, page_key: str) -> dict[str, Any] | None:
    return session.execute(
        select(Page.draft_schema).where(Page.page_key == page_key)
    ).scalar_one_or_none()


def _published_result(page_key: str, page_version: PageVersion) -> dict[str, Any]:
    return {
        "pageId": page_key,
        "version": page_version.version,
        "schema": page_version.schema,
        "publishedAt": page_version.created_at.isoformat(),
    }


def publish_draft(session: Session, page_key: str) -> dict[str, Any] | None:
    page = session.execute(
        select(Page).where(Page.page_key == page_key).with_for_update()
    ).scalar_one_or_none()
    if page is None:
        return None

    next_version = session.execute(
        select(func.coalesce(func.max(PageVersion.version), 0) + 1).where(
            PageVersion.page_id == page.id
        )
    ).scalar_one()
    page_version = PageVersion(
        page_id=page.id,
        version=next_version,
        schema=page.draft_schema,
    )
    session.add(page_version)
    session.flush()
    page.published_version_id = page_version.id
    session.commit()
    session.refresh(page_version)
    return _published_result(page_key, page_version)


def get_published(session: Session, page_key: str) -> dict[str, Any] | None:
    row = session.execute(
        select(Page.page_key, PageVersion)
        .join(PageVersion, Page.published_version_id == PageVersion.id)
        .where(Page.page_key == page_key)
    ).one_or_none()
    if row is None:
        return None
    return _published_result(row.page_key, row.PageVersion)


def get_page_version(
    session: Session, page_key: str, version: int
) -> dict[str, Any] | None:
    row = session.execute(
        select(Page.page_key, PageVersion)
        .join(PageVersion, PageVersion.page_id == Page.id)
        .where(Page.page_key == page_key, PageVersion.version == version)
    ).one_or_none()
    if row is None:
        return None
    return _published_result(row.page_key, row.PageVersion)

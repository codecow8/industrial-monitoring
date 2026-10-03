from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import TelemetryObservation


STALE_AFTER_SECONDS = 5


def latest_observations(session: Session, keys: set[str], start: datetime, end: datetime) -> dict[str, TelemetryObservation]:
    if not keys:
        return {}
    # 每键取最新一条，供 Agent 查询和 WS 快照共用；时间相同用观测 ID 排序。
    rows = session.execute(
        select(TelemetryObservation)
        .where(TelemetryObservation.data_key.in_(keys), TelemetryObservation.received_at >= start,
               TelemetryObservation.received_at <= end)
        .distinct(TelemetryObservation.data_key)
        .order_by(TelemetryObservation.data_key, TelemetryObservation.received_at.desc(), TelemetryObservation.id.desc())
    ).scalars().all()
    return {row.data_key: row for row in rows}


def observation(row: TelemetryObservation) -> dict:
    return {"id": row.id, "value": row.value, "receivedAt": row.received_at.isoformat(),
            "sourceTimestamp": row.source_timestamp}

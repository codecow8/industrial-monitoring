from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_session
from .models import TelemetryObservation
from .repository import get_published


router = APIRouter()
MAX_WINDOW = timedelta(minutes=15)
MAX_OBSERVATIONS = 1000


def observation_result(observation: TelemetryObservation) -> dict:
    return {
        "id": observation.id,
        "dataKey": observation.data_key,
        "value": observation.value,
        "sourceTimestamp": observation.source_timestamp,
        "receivedAt": observation.received_at.isoformat(),
    }


@router.get("/api/pages/{page_key}/alarm-evidence")
def read_alarm_evidence(
    page_key: str,
    kind: Literal["threshold", "fault"],
    data_key: str = Query(alias="dataKey", min_length=1),
    start: datetime = Query(),
    end: datetime = Query(),
    threshold: float | None = Query(default=None),
    session: Session = Depends(get_session),
) -> dict:
    if start.tzinfo is None or end.tzinfo is None or not start < end or end - start > MAX_WINDOW:
        raise HTTPException(status_code=422, detail="Time window must be UTC-aware and at most 15 minutes")
    if (kind == "threshold" and threshold is None) or (kind == "fault" and threshold is not None):
        raise HTTPException(status_code=422, detail="Threshold is required only for threshold alarms")

    published = get_published(session, page_key)
    if published is None:
        raise HTTPException(status_code=404, detail="Published page not found")

    components = published["schema"]["components"]
    if kind == "threshold":
        matches = any(
            node["type"] in ("metric-card", "trend-chart")
            and node["props"]["dataKey"] == data_key
            and node["props"]["alarmThreshold"] == threshold
            for node in components
        )
        condition = {"kind": kind, "dataKey": data_key, "threshold": threshold}
    else:
        matches = any(
            node["type"] == "device-state" and node["props"]["dataKey"] == data_key
            for node in components
        )
        condition = {"kind": kind, "dataKey": data_key, "stateCode": 2}
    if not matches:
        raise HTTPException(status_code=404, detail="Alarm condition not found in published page")

    effective_at = datetime.fromisoformat(published["publishedAt"])
    if end <= effective_at:
        raise HTTPException(status_code=422, detail="Time window ends before the current page version")
    effective_start = max(start, effective_at)

    baseline = session.execute(
        select(TelemetryObservation)
        .where(
            TelemetryObservation.data_key == data_key,
            TelemetryObservation.received_at >= effective_at,
            TelemetryObservation.received_at < effective_start,
        )
        .order_by(TelemetryObservation.received_at.desc(), TelemetryObservation.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    records = session.execute(
        select(TelemetryObservation)
        .where(
            TelemetryObservation.data_key == data_key,
            TelemetryObservation.received_at >= effective_start,
            TelemetryObservation.received_at <= end,
        )
        .order_by(TelemetryObservation.received_at, TelemetryObservation.id)
        .limit(MAX_OBSERVATIONS + 1)
    ).scalars().all()
    truncated = len(records) > MAX_OBSERVATIONS
    records = records[:MAX_OBSERVATIONS]

    def is_alarm(value: float) -> bool:
        return value >= threshold if kind == "threshold" and threshold is not None else value == 2

    previous_state = is_alarm(baseline.value) if baseline is not None else None
    transitions = []
    for record in records:
        current_state = is_alarm(record.value)
        if previous_state is not None and previous_state != current_state:
            transitions.append({
                "type": "triggered" if current_state else "recovered",
                "observationId": record.id,
                "observedAt": record.received_at.isoformat(),
            })
        previous_state = current_state

    return {
        "pageId": page_key,
        "version": published["version"],
        "condition": condition,
        "conditionEffectiveAt": effective_at.isoformat(),
        "window": {
            "requestedStart": start.isoformat(),
            "start": effective_start.isoformat(),
            "end": end.isoformat(),
        },
        "baseline": observation_result(baseline) if baseline is not None else None,
        "observations": [observation_result(record) for record in records],
        "transitions": transitions,
        "truncated": truncated,
    }

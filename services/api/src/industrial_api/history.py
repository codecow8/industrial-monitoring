from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .database import get_session
from .models import TelemetryObservation
from .repository import get_published


router = APIRouter()


def page_conditions(schema: dict) -> list[dict]:
    conditions = {}
    for node in schema["components"]:
        props = node["props"]
        if node["type"] in ("metric-card", "trend-chart"):
            identity = ("threshold", props["dataKey"], props["alarmThreshold"])
            if identity not in conditions or node["type"] == "metric-card":
                conditions[identity] = {
                    "kind": "threshold", "dataKey": props["dataKey"],
                    "threshold": props["alarmThreshold"],
                    "title": f"{props['title']}越界",
                    "deviceName": props.get("deviceName", schema["name"]),
                    "unit": props["unit"], "precision": props["precision"],
                }
        elif node["type"] == "device-state":
            identity = ("fault", props["dataKey"], 2)
            conditions.setdefault(identity, {
                "kind": "fault", "dataKey": props["dataKey"], "stateCode": 2,
                "title": "设备状态故障", "deviceName": props["deviceName"],
                "unit": None, "precision": 0,
            })
    return list(conditions.values())


def transitions_for(session: Session, condition: dict, start: datetime, end: datetime) -> list[dict]:
    order = (TelemetryObservation.received_at, TelemetryObservation.id)
    ordered = select(
        TelemetryObservation.id.label("id"),
        TelemetryObservation.value.label("value"),
        TelemetryObservation.received_at.label("received_at"),
        TelemetryObservation.source_timestamp.label("source_timestamp"),
        func.lag(TelemetryObservation.id).over(order_by=order).label("previous_id"),
        func.lag(TelemetryObservation.value).over(order_by=order).label("previous_value"),
        func.lag(TelemetryObservation.received_at).over(order_by=order).label("previous_received_at"),
        func.lag(TelemetryObservation.source_timestamp).over(order_by=order).label("previous_source_timestamp"),
    ).where(
        TelemetryObservation.data_key == condition["dataKey"],
        TelemetryObservation.received_at >= start,
        TelemetryObservation.received_at <= end,
    ).subquery()

    if condition["kind"] == "threshold":
        threshold = condition["threshold"]
        triggered = and_(ordered.c.previous_value < threshold, ordered.c.value >= threshold)
        recovered = and_(ordered.c.previous_value >= threshold, ordered.c.value < threshold)
    else:
        triggered = and_(ordered.c.previous_value != 2, ordered.c.value == 2)
        recovered = and_(ordered.c.previous_value == 2, ordered.c.value != 2)

    rows = session.execute(
        select(ordered).where(ordered.c.previous_id.is_not(None), or_(triggered, recovered))
        .order_by(ordered.c.received_at, ordered.c.id)
    ).mappings().all()
    result = []
    for row in rows:
        result.append({
            "type": "triggered" if (
                row["value"] >= condition["threshold"] if condition["kind"] == "threshold"
                else row["value"] == 2
            ) else "recovered",
            "from": {"id": row["previous_id"], "value": row["previous_value"],
                     "receivedAt": row["previous_received_at"].isoformat(),
                     "sourceTimestamp": row["previous_source_timestamp"]},
            "to": {"id": row["id"], "value": row["value"],
                   "receivedAt": row["received_at"].isoformat(),
                   "sourceTimestamp": row["source_timestamp"]},
        })
    return result


@router.get("/api/pages/{page_key}/alarm-history")
def read_alarm_history(
    page_key: str,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    as_of: datetime | None = Query(default=None, alias="asOf"),
    session: Session = Depends(get_session),
) -> dict:
    published = get_published(session, page_key)
    if published is None:
        raise HTTPException(status_code=404, detail="Published page not found")

    now = datetime.now(UTC)
    if as_of is not None and (as_of.tzinfo is None or as_of > now):
        raise HTTPException(status_code=422, detail="asOf must be timezone-aware and not in the future")
    end = as_of or now
    published_at = datetime.fromisoformat(published["publishedAt"])
    if end < published_at:
        raise HTTPException(status_code=409, detail="Published page changed; reload alarm history")
    start = max(end - timedelta(hours=24), published_at)
    records = []
    for condition in page_conditions(published["schema"]):
        trigger = None
        for transition in transitions_for(session, condition, start, end):
            if transition["type"] == "triggered":
                trigger = transition
            elif trigger is not None:
                recovery = transition
                records.append({
                    "id": f"{condition['kind']}:{condition['dataKey']}:{trigger['to']['id']}",
                    **condition,
                    "triggeredAt": trigger["to"]["receivedAt"],
                    "recoveredAt": recovery["to"]["receivedAt"],
                    "trigger": {"from": trigger["from"], "to": trigger["to"]},
                    "recovery": {"from": recovery["from"], "to": recovery["to"]},
                })
                trigger = None

    records.sort(key=lambda record: (record["triggeredAt"], record["trigger"]["to"]["id"]), reverse=True)
    total = len(records)
    return {
        "pageId": page_key, "version": published["version"],
        "windowStart": start.isoformat(), "windowEnd": end.isoformat(),
        "total": total,
        "records": records[offset:offset + limit],
        "nextOffset": offset + limit if offset + limit < total else None,
    }

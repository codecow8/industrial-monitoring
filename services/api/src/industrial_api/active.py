from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .database import get_session
from .history import page_conditions
from .freshness import STALE_AFTER_SECONDS, latest_observations, observation
from .repository import get_published


router = APIRouter()
ALARM_LIMIT = 20


@router.get("/api/pages/{page_key}/active-alarms")
def read_active_alarms(page_key: str, session: Session = Depends(get_session)) -> dict:
    published = get_published(session, page_key)
    if published is None:
        raise HTTPException(status_code=404, detail="Published page not found")

    # 发布时间固定本次条件版本，查询时间固定本次观测快照；不使用旧版本的值判断新条件。
    queried_at = datetime.now(UTC)
    published_at = datetime.fromisoformat(published["publishedAt"])
    start = max(queried_at - timedelta(hours=24), published_at)
    conditions = page_conditions(published["schema"])
    keys = {condition["dataKey"] for condition in conditions}
    latest = latest_observations(session, keys, start, queried_at)

    missing = sorted(keys - latest.keys())
    stale = [{"dataKey": key, "observation": observation(row)} for key, row in latest.items()
             if (queried_at - row.received_at).total_seconds() >= STALE_AFTER_SECONDS]
    alarms = []
    for condition in conditions:
        row = latest.get(condition["dataKey"])
        if row is None:
            continue
        triggered = (row.value >= condition["threshold"] if condition["kind"] == "threshold"
                     else row.value == condition["stateCode"])
        if not triggered:
            continue
        age = (queried_at - row.received_at).total_seconds()
        identity_value = (format(condition["threshold"], ".17g") if condition["kind"] == "threshold"
                          else str(condition["stateCode"]))
        alarms.append({
            "id": f"{condition['kind']}:{condition['dataKey']}:{identity_value}",
            **condition, "observation": observation(row),
            "freshness": "stale" if age >= STALE_AFTER_SECONDS else "fresh",
        })

    # 新鲜度不改变触发条件；过期告警保留，明确需要新的观测来核实当前状态。
    alarms.sort(key=lambda item: (0 if item["kind"] == "fault" else 1, item["id"]))
    status = ("unconfigured" if not keys else "no_data" if not latest else "partial" if missing
              else "stale" if stale else "ready")
    return {
        "pageId": page_key, "version": published["version"], "publishedAt": published["publishedAt"],
        "queriedAt": queried_at.isoformat(), "windowStart": start.isoformat(),
        "staleAfterSeconds": STALE_AFTER_SECONDS, "status": status,
        "coverage": {"configured": len(keys), "observed": len(latest), "missing": missing, "stale": stale},
        "total": len(alarms), "omitted": max(len(alarms) - ALARM_LIMIT, 0), "alarms": alarms[:ALARM_LIMIT],
    }

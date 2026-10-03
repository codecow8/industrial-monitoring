from asyncio import Lock
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import delete
from starlette.concurrency import run_in_threadpool

from .database import SessionFactory
from .freshness import latest_observations, observation
from .models import TelemetryObservation
from .repository import get_published


router = APIRouter()


class TelemetryInput(BaseModel):
    timestamp: str
    values: dict[str, float]


def published_page(page_key: str) -> dict | None:
    with SessionFactory() as session:
        return get_published(session, page_key)


def data_keys(published: dict) -> set[str]:
    return {key for node in published["schema"]["components"]
            if isinstance(key := node.get("props", {}).get("dataKey"), str)}


def version_message(page_key: str, published: dict, previous: int) -> dict:
    return {"type": "telemetry.version_changed", "pageId": page_key,
            "previousVersion": previous, "pageVersion": published["version"],
            "publishedAt": published["publishedAt"], "serverTime": datetime.now(UTC).isoformat(), "values": {}}


def read_snapshot(page_key: str, expected_version: int) -> dict | None:
    with SessionFactory() as session:
        published = get_published(session, page_key)
        if published is None:
            return None
        if published["version"] != expected_version:
            return version_message(page_key, published, expected_version)
        now = datetime.now(UTC)
        start = max(now - timedelta(hours=24), datetime.fromisoformat(published["publishedAt"]))
        latest = latest_observations(session, data_keys(published), start, now)
        observations = {key: observation(row) for key, row in latest.items()}
        last = max(latest.values(), key=lambda row: (row.received_at, row.id), default=None)
        return {"type": "telemetry.snapshot", "pageId": page_key, "pageVersion": expected_version,
                "publishedAt": published["publishedAt"], "serverTime": now.isoformat(),
                "timestamp": last.source_timestamp if last else None,
                "values": {key: item["value"] for key, item in observations.items()}, "observations": observations}


@dataclass(eq=False)
class Subscription:
    websocket: WebSocket
    page_key: str
    version: int
    published_at: datetime
    data_keys: set[str]
    invalidated: bool = False
    send_lock: Lock = field(default_factory=Lock)


class TelemetryHub:
    def __init__(self) -> None:
        self.subscriptions: set[Subscription] = set()

    async def publish(self, telemetry: TelemetryInput, observations: dict[str, dict]) -> None:
        disconnected = []
        for subscription in tuple(self.subscriptions):
            if subscription.invalidated:
                continue
            selected = {key: item for key, item in observations.items() if key in subscription.data_keys
                        and datetime.fromisoformat(item["receivedAt"]) >= subscription.published_at}
            if not selected:
                continue
            try:
                async with subscription.send_lock:
                    if subscription.invalidated:
                        continue
                    await subscription.websocket.send_json({
                        "type": "telemetry.update", "timestamp": telemetry.timestamp,
                        "pageId": subscription.page_key, "pageVersion": subscription.version,
                        "publishedAt": subscription.published_at.isoformat(), "serverTime": datetime.now(UTC).isoformat(),
                        "values": {key: item["value"] for key, item in selected.items()}, "observations": selected,
                    })
            except (RuntimeError, WebSocketDisconnect):
                disconnected.append(subscription)
        self.subscriptions.difference_update(disconnected)

    async def subscribe(self, websocket: WebSocket, published: dict, version: int | None) -> Subscription:
        subscription = Subscription(websocket, published["pageId"], version or published["version"],
                                    datetime.fromisoformat(published["publishedAt"]), data_keys(published))
        # 先注册再读快照：快照加载期间的新更新等待同一发送锁，不会先发 update 再覆盖成旧 snapshot。
        self.subscriptions.add(subscription)
        try:
            async with subscription.send_lock:
                snapshot = await run_in_threadpool(read_snapshot, subscription.page_key, subscription.version)
                if snapshot is None:
                    await websocket.close(code=4404)
                elif not subscription.invalidated:
                    subscription.invalidated = snapshot["type"] == "telemetry.version_changed"
                    await websocket.send_json(snapshot)
                    if subscription.invalidated:
                        await websocket.close(code=4409)
        except BaseException:
            self.unsubscribe(subscription)
            raise
        return subscription

    async def page_published(self, published: dict) -> None:
        affected = [item for item in self.subscriptions if item.page_key == published["pageId"]
                    and item.version != published["version"]]
        # 先同时停止旧订阅的合并，再逐一通知；不能在发送通知期间继续转发新版观测。
        for item in affected:
            item.invalidated = True
        for item in affected:
            try:
                async with item.send_lock:
                    await item.websocket.send_json(version_message(item.page_key, published, item.version))
                    await item.websocket.close(code=4409)
                self.unsubscribe(item)
            except (RuntimeError, WebSocketDisconnect):
                self.unsubscribe(item)

    def unsubscribe(self, subscription: Subscription) -> None:
        self.subscriptions.discard(subscription)


hub = TelemetryHub()


def record_telemetry(telemetry: TelemetryInput) -> dict[str, dict]:
    received_at = datetime.now(UTC)
    with SessionFactory.begin() as session:
        session.execute(delete(TelemetryObservation).where(TelemetryObservation.received_at < received_at - timedelta(hours=24)))
        rows = [TelemetryObservation(data_key=key, value=value, source_timestamp=telemetry.timestamp, received_at=received_at)
                for key, value in telemetry.values.items()]
        session.add_all(rows)
        session.flush()
        # ID、时间和值来自本次已入库观测，WS 与查询 API 可用同一来源核对。
        result = {row.data_key: observation(row) for row in rows}
    return result


@router.post("/api/telemetry", status_code=202)
async def receive_telemetry(telemetry: TelemetryInput) -> dict[str, str]:
    observations = await run_in_threadpool(record_telemetry, telemetry)
    await hub.publish(telemetry, observations)
    return {"status": "accepted"}


@router.websocket("/ws/telemetry/pages/{page_key}")
async def telemetry_stream(websocket: WebSocket, page_key: str, version: int | None = Query(default=None, ge=1)) -> None:
    published = await run_in_threadpool(published_page, page_key)
    if published is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    subscription = await hub.subscribe(websocket, published, version)
    try:
        while not subscription.invalidated:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(subscription)

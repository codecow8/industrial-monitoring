import asyncio
from asyncio import Lock
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import delete
from starlette.concurrency import run_in_threadpool

from .auth import check_origin, session_token, token_hash, valid_login
from .database import SessionFactory
from .freshness import latest_observations, observation
from .models import TelemetryObservation
from .repository import get_published


router = APIRouter()
# 定期复验留出查询/关闭时间；推送也有时限，不能让慢连接无限阻挡撤销。
AUTH_RECHECK_SECONDS = 2
AUTH_CHECK_TIMEOUT = 0.5
WS_IO_TIMEOUT = 0.5


def login_expiry(hashed_token: str) -> datetime | None:
    with SessionFactory() as session:
        login_session = valid_login(session, hashed_token)
        return login_session.expires_at if login_session else None



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
    auth_hash: str = field(repr=False)
    expires_at: datetime
    auth_task: asyncio.Task | None = field(default=None, repr=False)
    invalidated: bool = False
    send_lock: Lock = field(default_factory=Lock)


class TelemetryHub:
    def __init__(self) -> None:
        self.subscriptions: set[Subscription] = set()

    async def auth_failure(self, subscription: Subscription) -> int | None:
        if datetime.now(UTC) >= subscription.expires_at:
            return 4401
        try:
            expiry = await asyncio.wait_for(run_in_threadpool(login_expiry, subscription.auth_hash), AUTH_CHECK_TIMEOUT)
        except Exception:
            # 无法核对身份时断流；服务故障不能被解释为登录有效或已注销。
            return 1013
        if expiry is None:
            return 4401
        subscription.expires_at = expiry
        return None

    async def close_subscription(self, subscription: Subscription, code: int) -> None:
        subscription.invalidated = True
        self.unsubscribe(subscription)
        try:
            await asyncio.wait_for(subscription.websocket.close(code=code), WS_IO_TIMEOUT)
        except (RuntimeError, WebSocketDisconnect, TimeoutError):
            pass

    async def monitor_auth(self, subscription: Subscription) -> None:
        while not subscription.invalidated:
            remaining = (subscription.expires_at - datetime.now(UTC)).total_seconds()
            await asyncio.sleep(max(0, min(AUTH_RECHECK_SECONDS, remaining)))
            code = await self.auth_failure(subscription)
            if code is None:
                continue
            # 先失效，已排队的推送会跳过，关闭不必等待它们再次访问数据库。
            subscription.invalidated = True
            async with subscription.send_lock:
                await self.close_subscription(subscription, code)

    async def send(self, subscription: Subscription, message: dict) -> None:
        await asyncio.wait_for(subscription.websocket.send_json(message), WS_IO_TIMEOUT)

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
                    code = await self.auth_failure(subscription)
                    if code is not None:
                        await self.close_subscription(subscription, code)
                        continue
                    if subscription.invalidated:
                        continue
                    await self.send(subscription, {
                        "type": "telemetry.update", "timestamp": telemetry.timestamp,
                        "pageId": subscription.page_key, "pageVersion": subscription.version,
                        "publishedAt": subscription.published_at.isoformat(), "serverTime": datetime.now(UTC).isoformat(),
                        "values": {key: item["value"] for key, item in selected.items()}, "observations": selected,
                    })
            except (RuntimeError, WebSocketDisconnect, TimeoutError):
                subscription.invalidated = True
                disconnected.append(subscription)
        for subscription in disconnected:
            self.unsubscribe(subscription)

    async def subscribe(self, websocket: WebSocket, published: dict, version: int | None, auth_hash: str, expires_at: datetime) -> Subscription:
        subscription = Subscription(websocket, published["pageId"], version or published["version"],
                                    datetime.fromisoformat(published["publishedAt"]), data_keys(published), auth_hash, expires_at)
        # 先注册再读快照：快照加载期间的新更新等待同一发送锁，不会先发 update 再覆盖成旧 snapshot。
        self.subscriptions.add(subscription)
        try:
            async with subscription.send_lock:
                snapshot = await run_in_threadpool(read_snapshot, subscription.page_key, subscription.version)
                code = await self.auth_failure(subscription)
                if code is not None:
                    await self.close_subscription(subscription, code)
                elif snapshot is None:
                    await self.close_subscription(subscription, 4404)
                elif not subscription.invalidated:
                    subscription.invalidated = snapshot["type"] == "telemetry.version_changed"
                    await self.send(subscription, snapshot)
                    if subscription.invalidated:
                        await self.close_subscription(subscription, 4409)
        except BaseException:
            self.unsubscribe(subscription)
            raise
        if not subscription.invalidated:
            subscription.auth_task = asyncio.create_task(self.monitor_auth(subscription))
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
                    code = await self.auth_failure(item)
                    if code is None:
                        await self.send(item, version_message(item.page_key, published, item.version))
                    await self.close_subscription(item, code or 4409)
                self.unsubscribe(item)
            except (RuntimeError, WebSocketDisconnect, TimeoutError):
                self.unsubscribe(item)

    def unsubscribe(self, subscription: Subscription) -> None:
        self.subscriptions.discard(subscription)
        if subscription.auth_task and subscription.auth_task is not asyncio.current_task():
            subscription.auth_task.cancel()


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
    try:
        check_origin(websocket)
    except HTTPException:
        await websocket.close(code=4403)
        return
    token = session_token(websocket)
    hashed_token = token_hash(token)
    try:
        expiry = await asyncio.wait_for(run_in_threadpool(login_expiry, hashed_token), AUTH_CHECK_TIMEOUT) if token else None
    except Exception:
        await websocket.close(code=1013)
        return
    if expiry is None:
        await websocket.close(code=4401)
        return
    published = await run_in_threadpool(published_page, page_key)
    if published is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    subscription = await hub.subscribe(websocket, published, version, hashed_token, expiry)
    try:
        while not subscription.invalidated:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(subscription)

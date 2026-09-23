from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import delete
from starlette.concurrency import run_in_threadpool

from .database import SessionFactory
from .models import TelemetryObservation
from .repository import get_published


router = APIRouter()


class TelemetryInput(BaseModel):
    timestamp: str
    values: dict[str, float]


@dataclass(eq=False)
class Subscription:
    websocket: WebSocket
    data_keys: set[str]


class TelemetryHub:
    def __init__(self) -> None:
        self.latest_values: dict[str, float] = {}
        self.latest_timestamp: str | None = None
        self.subscriptions: set[Subscription] = set()

    async def publish(self, telemetry: TelemetryInput) -> None:
        self.latest_values.update(telemetry.values)
        self.latest_timestamp = telemetry.timestamp

        disconnected: list[Subscription] = []
        for subscription in tuple(self.subscriptions):
            values = {
                key: value
                for key, value in telemetry.values.items()
                if key in subscription.data_keys
            }
            if not values:
                continue
            try:
                await subscription.websocket.send_json(
                    {
                        "type": "telemetry.update",
                        "timestamp": telemetry.timestamp,
                        "values": values,
                    }
                )
            except (RuntimeError, WebSocketDisconnect):
                disconnected.append(subscription)

        for subscription in disconnected:
            self.subscriptions.discard(subscription)

    async def subscribe(self, websocket: WebSocket, data_keys: set[str]) -> Subscription:
        subscription = Subscription(websocket=websocket, data_keys=data_keys)
        self.subscriptions.add(subscription)
        values = {
            key: value for key, value in self.latest_values.items() if key in data_keys
        }
        await websocket.send_json(
            {
                "type": "telemetry.snapshot",
                "timestamp": self.latest_timestamp,
                "values": values,
            }
        )
        return subscription

    def unsubscribe(self, subscription: Subscription) -> None:
        self.subscriptions.discard(subscription)


hub = TelemetryHub()


def record_telemetry(telemetry: TelemetryInput) -> None:
    received_at = datetime.now(UTC)
    with SessionFactory.begin() as session:
        session.execute(
            delete(TelemetryObservation).where(
                TelemetryObservation.received_at < received_at - timedelta(hours=24)
            )
        )
        session.add_all(
            TelemetryObservation(
                data_key=data_key,
                value=value,
                source_timestamp=telemetry.timestamp,
                received_at=received_at,
            )
            for data_key, value in telemetry.values.items()
        )


def published_data_keys(page_key: str) -> set[str] | None:
    with SessionFactory() as session:
        published = get_published(session, page_key)
    if published is None:
        return None

    return {
        data_key
        for component in published["schema"]["components"]
        if isinstance(data_key := component.get("props", {}).get("dataKey"), str)
    }


@router.post("/api/telemetry", status_code=202)
async def receive_telemetry(telemetry: TelemetryInput) -> dict[str, str]:
    await run_in_threadpool(record_telemetry, telemetry)
    await hub.publish(telemetry)
    return {"status": "accepted"}


@router.websocket("/ws/telemetry/pages/{page_key}")
async def telemetry_stream(websocket: WebSocket, page_key: str) -> None:
    data_keys = published_data_keys(page_key)
    if data_keys is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    subscription = await hub.subscribe(websocket, data_keys)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(subscription)

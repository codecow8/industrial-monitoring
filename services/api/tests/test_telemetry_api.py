import json
from pathlib import Path
from uuid import uuid4
from datetime import UTC, datetime, timedelta
import pytest
from sqlalchemy import select, update
from starlette.websockets import WebSocketDisconnect
from industrial_api.database import SessionFactory
from industrial_api.models import Page, PageVersion, TelemetryObservation
from industrial_api.telemetry import TelemetryHub

from fastapi.testclient import TestClient

from industrial_api.main import app


FIXTURE_PATH = Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json"


def published_page(client: TestClient, page_id: str, data_key: str) -> None:
    schema = json.loads(FIXTURE_PATH.read_text())
    schema["id"] = page_id
    schema["components"][0]["props"]["dataKey"] = data_key

    assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
    assert client.post(f"/api/pages/{page_id}/publish").status_code == 200


def test_subscribers_receive_initial_snapshot_and_later_updates() -> None:
    page_id = f"telemetry-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    initial = {
        "timestamp": "2026-09-15T10:00:00Z",
        "values": {data_key: 68.4, "unrelated.temperature": 99.0},
    }
    update = {
        "timestamp": "2026-09-15T10:00:01Z",
        "values": {data_key: 72.0, "unrelated.temperature": 100.0},
    }

    with TestClient(app) as client:
        published_page(client, page_id, data_key)
        assert client.post("/api/telemetry", json=initial).status_code == 202

        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}") as first:
            with client.websocket_connect(f"/ws/telemetry/pages/{page_id}") as second:
                first_snapshot = first.receive_json()
                second_snapshot = second.receive_json()
                for message in (first_snapshot, second_snapshot):
                    assert message["type"] == "telemetry.snapshot"
                    assert message["pageId"] == page_id
                    assert message["pageVersion"] == 1
                    assert message["values"] == {data_key: 68.4}
                    assert message["observations"][data_key]["id"] > 0
                    assert message["observations"][data_key]["value"] == 68.4
                    assert message["observations"][data_key]["sourceTimestamp"] == initial["timestamp"]
                    assert datetime.fromisoformat(message["serverTime"]) >= datetime.fromisoformat(message["observations"][data_key]["receivedAt"])
                assert first_snapshot["observations"] == second_snapshot["observations"]

                assert client.post("/api/telemetry", json=update).status_code == 202
                messages = [first.receive_json(), second.receive_json()]
                for message in messages:
                    assert message["type"] == "telemetry.update"
                    assert message["values"] == {data_key: 72.0}
                    assert message["pageVersion"] == 1
                    assert message["observations"][data_key]["id"] > first_snapshot["observations"][data_key]["id"]
                    assert message["observations"][data_key]["sourceTimestamp"] == update["timestamp"]
                assert messages[0]["observations"] == messages[1]["observations"]


def test_reconnect_snapshot_recovers_database_observations_with_original_per_key_times(monkeypatch) -> None:
    page_id = f"reconnect-{uuid4()}"
    temperature_key = f"{page_id}.temperature"
    state_key = f"{page_id}.state"
    schema = json.loads(FIXTURE_PATH.read_text())
    schema["id"] = page_id
    schema["components"][0]["props"]["dataKey"] = temperature_key
    schema["components"].append({"id": "state", "type": "device-state", "position": {"x": 800, "y": 250},
        "size": {"width": 300, "height": 180}, "props": {"deviceName": "泵", "title": "状态", "dataKey": state_key}})
    with TestClient(app) as client:
        assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
        assert client.post(f"/api/pages/{page_id}/publish").status_code == 200
        now = datetime.now(UTC)
        with SessionFactory.begin() as session:
            version_id = session.execute(select(Page.published_version_id).where(Page.page_key == page_id)).scalar_one()
            session.execute(update(PageVersion).where(PageVersion.id == version_id).values(created_at=now - timedelta(minutes=1)))
            session.add_all([TelemetryObservation(data_key=key, value=value, received_at=received,
                source_timestamp="2050-01-01T00:00:00Z") for key, value, received in [
                (temperature_key, 83, now - timedelta(seconds=8)), (state_key, 1, now - timedelta(seconds=1))]])
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}?version=1") as first:
            before = first.receive_json()
        # 新 Hub 没有任何内存缓存，模拟后端重启；快照必须仍从现有存储恢复来源。
        new_hub = TelemetryHub()
        monkeypatch.setattr("industrial_api.telemetry.hub", new_hub)
        monkeypatch.setattr("industrial_api.main.telemetry_hub", new_hub)
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}?version=1") as second:
            after = second.receive_json()
        assert before["observations"] == after["observations"]
        assert after["observations"][temperature_key]["receivedAt"] != after["observations"][state_key]["receivedAt"]
        queried_at = datetime.fromisoformat(after["serverTime"])
        assert (queried_at - datetime.fromisoformat(after["observations"][temperature_key]["receivedAt"])).total_seconds() >= 5
        active = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert active["coverage"]["stale"][0]["observation"] == after["observations"][temperature_key]


def test_new_publication_notifies_and_closes_old_subscription_without_mixing_data() -> None:
    page_id = f"version-{uuid4()}"
    data_key = f"{page_id}.temperature"
    with TestClient(app) as client:
        published_page(client, page_id, data_key)
        assert client.post("/api/telemetry", json={"timestamp": "device-time", "values": {data_key: 83}}).status_code == 202
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}?version=1") as old:
            assert old.receive_json()["values"] == {data_key: 83}
            assert client.post(f"/api/pages/{page_id}/publish").json()["version"] == 2
            changed = old.receive_json()
            assert changed["type"] == "telemetry.version_changed"
            assert changed["previousVersion"] == 1
            assert changed["pageVersion"] == 2
            assert changed["values"] == {}
            with pytest.raises(WebSocketDisconnect) as error:
                old.receive_json()
            assert error.value.code == 4409
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}?version=1") as stale_client:
            assert stale_client.receive_json()["type"] == "telemetry.version_changed"
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}?version=2") as current:
            initial = current.receive_json()
            assert initial["pageVersion"] == 2
            assert initial["values"] == {}  # 发布前观测不能解释新版本条件。
            assert client.post("/api/telemetry", json={"timestamp": "new-device-time", "values": {data_key: 79}}).status_code == 202
            fresh = current.receive_json()
            assert fresh["pageVersion"] == 2
            assert fresh["values"] == {data_key: 79}


def test_publishing_one_page_does_not_invalidate_another_page_subscription() -> None:
    first_page, second_page = f"version-a-{uuid4()}", f"version-b-{uuid4()}"
    first_key, second_key = f"{first_page}.temperature", f"{second_page}.temperature"
    with TestClient(app) as client:
        published_page(client, first_page, first_key)
        published_page(client, second_page, second_key)
        with client.websocket_connect(f"/ws/telemetry/pages/{first_page}?version=1") as first:
            with client.websocket_connect(f"/ws/telemetry/pages/{second_page}?version=1") as second:
                first.receive_json()
                second.receive_json()
                assert client.post(f"/api/pages/{first_page}/publish").status_code == 200
                assert first.receive_json()["type"] == "telemetry.version_changed"
                assert client.post("/api/telemetry", json={"timestamp": "device-time", "values": {second_key: 72}}).status_code == 202
                message = second.receive_json()
                assert message["type"] == "telemetry.update"
                assert message["pageId"] == second_page
                assert message["pageVersion"] == 1
                assert message["values"] == {second_key: 72}

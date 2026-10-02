import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from industrial_api.main import app
from industrial_api.database import SessionFactory
from industrial_api.models import Page, PageVersion, TelemetryObservation


FIXTURE = Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json"


def create_page(client: TestClient, *, state: bool = True, duplicate: bool = False) -> tuple[str, str, str]:
    page_id = f"active-{uuid4()}"
    temperature_key = f"{page_id}.temperature"
    state_key = f"{page_id}.state"
    schema = json.loads(FIXTURE.read_text())
    schema["id"] = page_id
    schema["components"][0]["props"]["dataKey"] = temperature_key
    if duplicate:
        schema["components"].append({
            "id": "trend", "type": "trend-chart", "position": {"x": 20, "y": 500},
            "size": {"width": 720, "height": 300},
            "props": {"title": "温度趋势", "dataKey": temperature_key, "unit": "°C", "precision": 1, "alarmThreshold": 80},
        })
    if state:
        schema["components"].append({
            "id": "state", "type": "device-state", "position": {"x": 795, "y": 250},
            "size": {"width": 300, "height": 180},
            "props": {"deviceName": "1号冷却泵", "title": "设备状态", "dataKey": state_key},
        })
    assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
    assert client.post(f"/api/pages/{page_id}/publish").status_code == 200
    return page_id, temperature_key, state_key


def send(client: TestClient, values: dict[str, float]) -> None:
    assert client.post("/api/telemetry", json={"timestamp": "2026-10-02T00:00:00Z", "values": values}).status_code == 202


def test_active_query_uses_latest_values_deduplicates_and_prioritizes_faults() -> None:
    with TestClient(app) as client:
        page_id, temperature_key, state_key = create_page(client, duplicate=True)
        send(client, {temperature_key: 72, state_key: 1})
        normal = client.get(f"/api/pages/{page_id}/active-alarms")
        assert normal.status_code == 200
        assert normal.json()["status"] == "ready"
        assert normal.json()["total"] == 0
        send(client, {temperature_key: 83, state_key: 2})
        response = client.get(f"/api/pages/{page_id}/active-alarms")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert body["omitted"] == 0
        assert body["coverage"]["configured"] == body["coverage"]["observed"] == 2
        fault, threshold = body["alarms"]
        assert fault["kind"] == "fault"
        assert threshold["kind"] == "threshold"
        assert threshold["threshold"] == 80
        assert threshold["observation"]["value"] == 83
        assert threshold["observation"]["id"] > 0
        assert threshold["freshness"] == "fresh"
        send(client, {temperature_key: 79, state_key: 0})
        restored = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert restored["total"] == 0
        assert restored["status"] == "ready"


def test_no_data_partial_data_and_unpublished_are_not_normal_results() -> None:
    with TestClient(app) as client:
        assert client.get(f"/api/pages/unpublished-{uuid4()}/active-alarms").status_code == 404
        page_id, temperature_key, state_key = create_page(client)
        no_data = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert no_data["status"] == "no_data"
        assert set(no_data["coverage"]["missing"]) == {temperature_key, state_key}
        send(client, {temperature_key: 72})
        partial = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert partial["status"] == "partial"
        assert partial["total"] == 0
        assert partial["coverage"]["missing"] == [state_key]


def test_stale_alarm_is_retained_until_a_new_recovery_observation() -> None:
    with TestClient(app) as client:
        page_id, temperature_key, state_key = create_page(client)
        now = datetime.now(UTC)
        with SessionFactory.begin() as session:
            version_id = session.execute(select(Page.published_version_id).where(Page.page_key == page_id)).scalar_one()
            session.execute(update(PageVersion).where(PageVersion.id == version_id).values(created_at=now - timedelta(minutes=1)))
            session.add_all([TelemetryObservation(data_key=key, value=value,
                received_at=now - timedelta(seconds=6), source_timestamp="2026-10-02T00:00:00Z")
                for key, value in [(temperature_key, 83), (state_key, 1)]])
        body = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert body["status"] == "stale"
        assert body["staleAfterSeconds"] == 5
        assert body["alarms"][0]["freshness"] == "stale"
        assert {item["dataKey"] for item in body["coverage"]["stale"]} == {temperature_key, state_key}
        send(client, {temperature_key: 79, state_key: 1})
        refreshed = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert refreshed["status"] == "ready"
        assert refreshed["total"] == 0
        assert refreshed["coverage"]["stale"] == []


def test_new_publication_requires_new_observations() -> None:
    with TestClient(app) as client:
        page_id, temperature_key, _ = create_page(client, state=False)
        send(client, {temperature_key: 83})
        assert client.get(f"/api/pages/{page_id}/active-alarms").json()["total"] == 1
        assert client.post(f"/api/pages/{page_id}/publish").json()["version"] == 2
        body = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert body["version"] == 2
        assert body["status"] == "no_data"
        assert body["alarms"] == []
        send(client, {temperature_key: 83})
        assert client.get(f"/api/pages/{page_id}/active-alarms").json()["total"] == 1


def test_only_latest_in_window_is_used_and_equal_times_are_ordered_by_id() -> None:
    with TestClient(app) as client:
        page_id, temperature_key, _ = create_page(client, state=False)
        now = datetime.now(UTC)
        with SessionFactory.begin() as session:
            version_id = session.execute(select(Page.published_version_id).where(Page.page_key == page_id)).scalar_one()
            session.execute(update(PageVersion).where(PageVersion.id == version_id).values(created_at=now - timedelta(hours=25)))
            session.add(TelemetryObservation(data_key=temperature_key, value=83,
                received_at=now - timedelta(hours=24, seconds=1), source_timestamp="old"))
        assert client.get(f"/api/pages/{page_id}/active-alarms").json()["status"] == "no_data"
        observed_at = datetime.now(UTC)
        with SessionFactory.begin() as session:
            session.add(TelemetryObservation(data_key=temperature_key, value=83, received_at=observed_at, source_timestamp="first"))
            session.flush()
            session.add(TelemetryObservation(data_key=temperature_key, value=79, received_at=observed_at, source_timestamp="second"))
        body = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert body["status"] == "ready"
        assert body["total"] == 0


def test_alarm_limit_counts_all_conditions_and_no_conditions_are_explicit() -> None:
    page_id = f"active-limit-{uuid4()}"
    schema = json.loads(FIXTURE.read_text())
    schema["id"] = page_id
    metric = schema["components"][0]
    schema["components"] = []
    values = {}
    for index in range(21):
        node = json.loads(json.dumps(metric))
        node["id"] = f"metric-{index}"
        node["props"]["dataKey"] = f"{page_id}.temp{index}"
        values[node["props"]["dataKey"]] = 83
        schema["components"].append(node)
    with TestClient(app) as client:
        assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
        assert client.post(f"/api/pages/{page_id}/publish").status_code == 200
        send(client, values)
        body = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert body["total"] == 21
        assert body["omitted"] == 1
        assert len(body["alarms"]) == 20
        assert len({alarm["id"] for alarm in body["alarms"]}) == 20
        schema["components"] = []
        assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
        assert client.post(f"/api/pages/{page_id}/publish").status_code == 200
        empty = client.get(f"/api/pages/{page_id}/active-alarms").json()
        assert empty["status"] == "unconfigured"
        assert empty["coverage"]["configured"] == 0

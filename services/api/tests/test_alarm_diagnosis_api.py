import json
from pathlib import Path
from uuid import uuid4
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from industrial_api.main import app
from industrial_api.database import SessionFactory
from industrial_api.models import Page, PageVersion, TelemetryObservation


FIXTURE = Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json"


def publish_page(client: TestClient, page_id: str, data_key: str) -> None:
    schema = json.loads(FIXTURE.read_text())
    schema["id"] = page_id
    schema["components"][0]["props"]["dataKey"] = data_key
    assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
    assert client.post(f"/api/pages/{page_id}/publish").status_code == 200


def test_diagnosis_requires_current_published_active_alarm(monkeypatch) -> None:
    page_id = f"diagnosis-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    monkeypatch.setattr("industrial_api.diagnosis.request_model", lambda _: (_ for _ in ()).throw(AssertionError("model called")))
    with TestClient(app) as client:
        publish_page(client, page_id, data_key)
        request = {"kind": "threshold", "dataKey": data_key, "threshold": 80}
        assert client.post(f"/api/pages/{page_id}/alarm-diagnoses", json=request).status_code == 409
        assert client.post(f"/api/pages/{page_id}/alarm-diagnoses", json={**request, "threshold": 90}).status_code == 404
        assert client.post("/api/telemetry", json={"timestamp": "2026-09-27T10:00:00Z", "values": {data_key: 72}}).status_code == 202
        assert client.post(f"/api/pages/{page_id}/alarm-diagnoses", json=request).status_code == 409


def test_diagnosis_uses_real_observation_sources_and_rejects_fake_citations(monkeypatch) -> None:
    page_id = f"diagnosis-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    captured = {}

    def model(payload):
        captured.update(payload)
        observation_id = payload["observations"][-1]["id"]
        return {
            "observedFacts": [{"text": "出口温度超过阈值", "sourceIds": [f"observation:{observation_id}"]}],
            "possibleCauses": [{"text": "流量不足，待核实", "sourceIds": ["manual:PUMP-01:3.2"]}],
            "recommendedChecks": [{"text": "现场核对流量和过滤器压差", "sourceIds": ["manual:PUMP-01:3.2"]}],
        }

    monkeypatch.setattr("industrial_api.diagnosis.request_model", model)
    with TestClient(app) as client:
        publish_page(client, page_id, data_key)
        for value in (72, 78.5, 83):
            assert client.post("/api/telemetry", json={"timestamp": "2026-09-27T10:00:00Z", "values": {data_key: value}}).status_code == 202
        result = client.post(f"/api/pages/{page_id}/alarm-diagnoses", json={"kind": "threshold", "dataKey": data_key, "threshold": 80})

    assert result.status_code == 200
    body = result.json()
    assert body["status"] == "completed"
    assert body["alarm"]["version"] == 1
    assert [item["value"] for item in captured["observations"]] == [72, 78.5, 83]
    assert body["observedFacts"][0]["sourceIds"][0] in {source["id"] for source in body["sources"]}
    assert body["dataFreshness"]["latestReceivedAt"]
    assert all("控制" not in item["text"] for item in body["recommendedChecks"])

    monkeypatch.setattr("industrial_api.diagnosis.request_model", lambda _: {
        "observedFacts": [{"text": "虚构事实", "sourceIds": ["observation:999999999"]}],
        "possibleCauses": [], "recommendedChecks": [],
    })
    with TestClient(app) as client:
        invalid = client.post(f"/api/pages/{page_id}/alarm-diagnoses", json={"kind": "threshold", "dataKey": data_key, "threshold": 80})
    assert invalid.status_code == 502


def test_single_active_observation_returns_insufficient_evidence_without_model(monkeypatch) -> None:
    page_id = f"diagnosis-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    monkeypatch.setattr("industrial_api.diagnosis.request_model", lambda _: (_ for _ in ()).throw(AssertionError("model called")))
    with TestClient(app) as client:
        publish_page(client, page_id, data_key)
        assert client.post("/api/telemetry", json={"timestamp": "2026-09-27T10:00:00Z", "values": {data_key: 83}}).status_code == 202
        result = client.post(f"/api/pages/{page_id}/alarm-diagnoses", json={"kind": "threshold", "dataKey": data_key, "threshold": 80})

    assert result.status_code == 200
    assert result.json()["status"] == "insufficient_evidence"
    assert result.json()["possibleCauses"] == []
    assert "无法确认触发时间" in result.json()["observedFacts"][0]["text"]


def test_diagnosis_and_active_query_share_five_second_freshness(monkeypatch) -> None:
    page_id = f"diagnosis-freshness-{uuid4()}"
    data_key = f"{page_id}.temperature"
    def model(payload):
        return {"observedFacts": [{"text": "最后观测超过阈值", "sourceIds": [f"observation:{payload['observations'][-1]['id']}"]}],
                "possibleCauses": [], "recommendedChecks": []}
    monkeypatch.setattr("industrial_api.diagnosis.request_model", model)
    with TestClient(app) as client:
        publish_page(client, page_id, data_key)
        now = datetime.now(UTC)
        with SessionFactory.begin() as session:
            version_id = session.execute(select(Page.published_version_id).where(Page.page_key == page_id)).scalar_one()
            session.execute(update(PageVersion).where(PageVersion.id == version_id).values(created_at=now - timedelta(minutes=1)))
            session.add_all([TelemetryObservation(data_key=data_key, value=value,
                received_at=now - timedelta(seconds=seconds), source_timestamp="device-time")
                for value, seconds in [(72, 7), (83, 6)]])
        active = client.get(f"/api/pages/{page_id}/active-alarms").json()
        diagnosed = client.post(f"/api/pages/{page_id}/alarm-diagnoses", json={"kind": "threshold", "dataKey": data_key, "threshold": 80})
        assert diagnosed.status_code == 200
        assert active["status"] == "stale"
        assert diagnosed.json()["dataFreshness"]["stale"] is True

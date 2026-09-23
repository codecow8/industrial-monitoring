import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from industrial_api.main import app


FIXTURE_PATH = Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json"


def publish_metric_page(client: TestClient, page_id: str, data_key: str) -> None:
    schema = json.loads(FIXTURE_PATH.read_text())
    schema["id"] = page_id
    schema["components"][0]["props"]["dataKey"] = data_key
    assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
    assert client.post(f"/api/pages/{page_id}/publish").status_code == 200


def test_published_alarm_condition_returns_persisted_observations_and_transitions() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    start = datetime.now(UTC) - timedelta(seconds=1)

    with TestClient(app) as client:
        publish_metric_page(client, page_id, data_key)
        for index, value in enumerate((68.4, 83.0, 84.0, 70.0)):
            response = client.post("/api/telemetry", json={
                "timestamp": f"2026-09-23T10:00:0{index}Z",
                "values": {data_key: value},
            })
            assert response.status_code == 202

        end = datetime.now(UTC) + timedelta(seconds=1)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "threshold",
            "dataKey": data_key,
            "threshold": 80,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 200
    body = result.json()
    assert body["pageId"] == page_id
    assert body["version"] == 1
    assert body["condition"] == {"kind": "threshold", "dataKey": data_key, "threshold": 80}
    assert [item["value"] for item in body["observations"]] == [68.4, 83.0, 84.0, 70.0]
    assert [item["sourceTimestamp"] for item in body["observations"]] == [
        "2026-09-23T10:00:00Z",
        "2026-09-23T10:00:01Z",
        "2026-09-23T10:00:02Z",
        "2026-09-23T10:00:03Z",
    ]
    assert [item["type"] for item in body["transitions"]] == ["triggered", "recovered"]
    assert body["baseline"] is None
    assert body["truncated"] is False


def test_first_alarm_observation_does_not_invent_trigger_time() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    start = datetime.now(UTC) - timedelta(seconds=1)

    with TestClient(app) as client:
        publish_metric_page(client, page_id, data_key)
        assert client.post("/api/telemetry", json={
            "timestamp": "2026-09-23T11:00:00Z",
            "values": {data_key: 83.0},
        }).status_code == 202
        end = datetime.now(UTC) + timedelta(seconds=1)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "threshold",
            "dataKey": data_key,
            "threshold": 80,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 200
    assert result.json()["transitions"] == []
    assert result.json()["baseline"] is None


def test_evidence_query_rejects_conditions_not_in_published_page() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    start = datetime.now(UTC) - timedelta(minutes=1)
    end = datetime.now(UTC)

    with TestClient(app) as client:
        publish_metric_page(client, page_id, data_key)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "threshold",
            "dataKey": data_key,
            "threshold": 90,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 404


def test_prior_observation_is_used_as_the_window_baseline() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"

    with TestClient(app) as client:
        publish_metric_page(client, page_id, data_key)
        assert client.post("/api/telemetry", json={
            "timestamp": "2026-09-23T12:00:00Z",
            "values": {data_key: 68.4},
        }).status_code == 202
        start = datetime.now(UTC)
        assert client.post("/api/telemetry", json={
            "timestamp": "2026-09-23T12:00:01Z",
            "values": {data_key: 83.0},
        }).status_code == 202
        end = datetime.now(UTC) + timedelta(seconds=1)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "threshold",
            "dataKey": data_key,
            "threshold": 80,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 200
    assert result.json()["baseline"]["value"] == 68.4
    assert [item["value"] for item in result.json()["observations"]] == [83.0]
    assert [item["type"] for item in result.json()["transitions"]] == ["triggered"]


def test_device_fault_condition_uses_state_code_two() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.operating_state"
    schema = json.loads(FIXTURE_PATH.read_text())
    schema["id"] = page_id
    schema["components"].append({
        "id": "state-pump-01",
        "type": "device-state",
        "position": {"x": 795, "y": 250},
        "size": {"width": 300, "height": 180},
        "props": {
            "deviceName": "1号冷却泵",
            "title": "运行状态",
            "dataKey": data_key,
        },
    })
    start = datetime.now(UTC) - timedelta(seconds=1)

    with TestClient(app) as client:
        assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
        assert client.post(f"/api/pages/{page_id}/publish").status_code == 200
        for index, code in enumerate((1, 2, 3)):
            assert client.post("/api/telemetry", json={
                "timestamp": f"2026-09-23T13:00:0{index}Z",
                "values": {data_key: code},
            }).status_code == 202
        end = datetime.now(UTC) + timedelta(seconds=1)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "fault",
            "dataKey": data_key,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 200
    assert result.json()["condition"] == {
        "kind": "fault", "dataKey": data_key, "stateCode": 2,
    }
    assert [item["type"] for item in result.json()["transitions"]] == [
        "triggered", "recovered",
    ]


def test_evidence_query_rejects_a_window_longer_than_fifteen_minutes() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    start = datetime.now(UTC) - timedelta(minutes=16)
    end = datetime.now(UTC)

    with TestClient(app) as client:
        publish_metric_page(client, page_id, data_key)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "threshold",
            "dataKey": data_key,
            "threshold": 80,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 422


def test_republished_condition_does_not_reinterpret_older_observations() -> None:
    page_id = f"evidence-{uuid4()}"
    data_key = f"pump-{uuid4()}.outlet_temp"
    start = datetime.now(UTC) - timedelta(seconds=1)

    with TestClient(app) as client:
        publish_metric_page(client, page_id, data_key)
        for index, value in enumerate((68.4, 83.0)):
            assert client.post("/api/telemetry", json={
                "timestamp": f"2026-09-23T14:00:0{index}Z",
                "values": {data_key: value},
            }).status_code == 202
        assert client.post(f"/api/pages/{page_id}/publish").json()["version"] == 2
        assert client.post("/api/telemetry", json={
            "timestamp": "2026-09-23T14:00:02Z",
            "values": {data_key: 84.0},
        }).status_code == 202
        end = datetime.now(UTC) + timedelta(seconds=1)
        result = client.get(f"/api/pages/{page_id}/alarm-evidence", params={
            "kind": "threshold",
            "dataKey": data_key,
            "threshold": 80,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })

    assert result.status_code == 200
    body = result.json()
    assert body["version"] == 2
    assert [item["value"] for item in body["observations"]] == [84.0]
    assert body["baseline"] is None
    assert body["transitions"] == []
    assert body["window"]["start"] == body["conditionEffectiveAt"]

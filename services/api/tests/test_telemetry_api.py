import json
from pathlib import Path
from uuid import uuid4

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
                assert first.receive_json() == {
                    "type": "telemetry.snapshot",
                    "timestamp": initial["timestamp"],
                    "values": {data_key: 68.4},
                }
                assert second.receive_json() == {
                    "type": "telemetry.snapshot",
                    "timestamp": initial["timestamp"],
                    "values": {data_key: 68.4},
                }

                assert client.post("/api/telemetry", json=update).status_code == 202
                expected_update = {
                    "type": "telemetry.update",
                    "timestamp": update["timestamp"],
                    "values": {data_key: 72.0},
                }
                assert first.receive_json() == expected_update
                assert second.receive_json() == expected_update

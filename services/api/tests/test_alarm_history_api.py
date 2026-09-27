import json
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from industrial_api.main import app


FIXTURE = Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json"


def publish_history_page(client: TestClient, page_id: str, temperature_key: str, state_key: str) -> None:
    schema = json.loads(FIXTURE.read_text())
    schema["id"] = page_id
    schema["components"][0]["props"]["dataKey"] = temperature_key
    schema["components"].append({
        "id": "state-pump-01", "type": "device-state",
        "position": {"x": 795, "y": 250}, "size": {"width": 300, "height": 180},
        "props": {"deviceName": "1号冷却泵", "title": "设备运行状态", "dataKey": state_key},
    })
    assert client.put(f"/api/pages/{page_id}/draft", json=schema).status_code == 200
    assert client.post(f"/api/pages/{page_id}/publish").status_code == 200


def send(client: TestClient, data_key: str, value: float) -> None:
    assert client.post("/api/telemetry", json={
        "timestamp": "2026-09-27T10:00:00Z", "values": {data_key: value},
    }).status_code == 202


def test_history_lists_proven_trigger_and_recovery_with_real_observation_ids() -> None:
    page_id = f"history-{uuid4()}"
    temperature_key = f"pump-{uuid4()}.outlet_temp"
    state_key = f"pump-{uuid4()}.operating_state"

    with TestClient(app) as client:
        publish_history_page(client, page_id, temperature_key, state_key)
        for value in (78.5, 83, 84, 79):
            send(client, temperature_key, value)
        for value in (1, 2, 0):
            send(client, state_key, value)
        send(client, temperature_key, 82)
        result = client.get(f"/api/pages/{page_id}/alarm-history")

    assert result.status_code == 200
    body = result.json()
    assert body["version"] == 1
    assert body["total"] == 2
    assert body["nextOffset"] is None
    fault, threshold = body["records"]
    assert fault["kind"] == "fault"
    assert (fault["trigger"]["from"]["value"], fault["trigger"]["to"]["value"]) == (1, 2)
    assert (fault["recovery"]["from"]["value"], fault["recovery"]["to"]["value"]) == (2, 0)
    assert threshold["kind"] == "threshold"
    assert (threshold["trigger"]["from"]["value"], threshold["trigger"]["to"]["value"]) == (78.5, 83)
    assert (threshold["recovery"]["from"]["value"], threshold["recovery"]["to"]["value"]) == (84, 79)
    assert all(transition[side]["id"] > 0 for record in body["records"]
               for transition in (record["trigger"], record["recovery"])
               for side in ("from", "to"))


def test_history_paginates_and_does_not_invent_unknown_onset() -> None:
    page_id = f"history-{uuid4()}"
    temperature_key = f"pump-{uuid4()}.outlet_temp"
    state_key = f"pump-{uuid4()}.operating_state"

    with TestClient(app) as client:
        publish_history_page(client, page_id, temperature_key, state_key)
        send(client, temperature_key, 83)
        send(client, temperature_key, 79)
        for value in (81, 78, 82, 77):
            send(client, temperature_key, value)
        first = client.get(f"/api/pages/{page_id}/alarm-history", params={"limit": 1, "offset": 0})
        send(client, temperature_key, 83)
        send(client, temperature_key, 76)
        second = client.get(f"/api/pages/{page_id}/alarm-history", params={
            "limit": 1, "offset": 1, "asOf": first.json()["windowEnd"],
        })

    assert first.status_code == second.status_code == 200
    assert first.json()["total"] == 2
    assert first.json()["nextOffset"] == 1
    assert second.json()["nextOffset"] is None
    assert first.json()["records"][0]["id"] != second.json()["records"][0]["id"]


def test_history_only_uses_observations_after_current_publish() -> None:
    page_id = f"history-{uuid4()}"
    temperature_key = f"pump-{uuid4()}.outlet_temp"
    state_key = f"pump-{uuid4()}.operating_state"

    with TestClient(app) as client:
        publish_history_page(client, page_id, temperature_key, state_key)
        send(client, temperature_key, 72)
        send(client, temperature_key, 83)
        assert client.post(f"/api/pages/{page_id}/publish").json()["version"] == 2
        send(client, temperature_key, 79)
        empty = client.get(f"/api/pages/{page_id}/alarm-history")
        send(client, temperature_key, 83)
        send(client, temperature_key, 79)
        complete = client.get(f"/api/pages/{page_id}/alarm-history")

    assert empty.json()["records"] == []
    assert complete.json()["version"] == 2
    assert complete.json()["total"] == 1

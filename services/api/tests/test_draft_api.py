import json
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from industrial_api.main import app


FIXTURE_PATH = Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json"


def valid_schema(page_id: str) -> dict:
    schema = json.loads(FIXTURE_PATH.read_text())
    schema["id"] = page_id
    return schema


def test_saved_draft_is_retrievable_through_the_http_interface() -> None:
    page_id = f"draft-{uuid4()}"
    schema = valid_schema(page_id)
    schema["components"][0]["props"]["title"] = "轴承温度"

    with TestClient(app) as client:
        saved = client.put(f"/api/pages/{page_id}/draft", json=schema)
        loaded = client.get(f"/api/pages/{page_id}/draft")

    assert saved.status_code == 200
    assert loaded.status_code == 200
    assert loaded.json()["components"][0]["props"]["title"] == "轴承温度"


def test_invalid_schema_does_not_overwrite_the_existing_draft() -> None:
    page_id = f"draft-{uuid4()}"
    original = valid_schema(page_id)
    original["components"][0]["props"]["title"] = "原始温度"
    invalid = json.loads(json.dumps(original))
    invalid["components"][0]["props"]["precision"] = 9

    with TestClient(app) as client:
        assert client.put(f"/api/pages/{page_id}/draft", json=original).status_code == 200
        rejected = client.put(f"/api/pages/{page_id}/draft", json=invalid)
        loaded = client.get(f"/api/pages/{page_id}/draft")

    assert rejected.status_code == 422
    assert loaded.json()["components"][0]["props"]["title"] == "原始温度"
    assert loaded.json()["components"][0]["props"]["precision"] == 1


def test_missing_draft_is_an_empty_result_instead_of_an_error() -> None:
    page_id = f"missing-{uuid4()}"

    with TestClient(app) as client:
        response = client.get(f"/api/pages/{page_id}/draft")

    assert response.status_code == 204
    assert response.content == b""


def test_published_version_stays_stable_until_the_next_publish() -> None:
    page_id = f"publish-{uuid4()}"
    draft_a = valid_schema(page_id)
    draft_a["components"][0]["props"]["title"] = "出口温度 A"
    draft_b = json.loads(json.dumps(draft_a))
    draft_b["components"][0]["props"]["title"] = "轴承温度 B"

    with TestClient(app) as client:
        assert client.put(f"/api/pages/{page_id}/draft", json=draft_a).status_code == 200
        first_publish = client.post(f"/api/pages/{page_id}/publish")
        assert client.put(f"/api/pages/{page_id}/draft", json=draft_b).status_code == 200
        published_before_republish = client.get(f"/api/pages/{page_id}/published")
        second_publish = client.post(f"/api/pages/{page_id}/publish")
        published_after_republish = client.get(f"/api/pages/{page_id}/published")
        first_version_after_republish = client.get(f"/api/pages/{page_id}/versions/1")

    assert first_publish.status_code == 200
    assert first_publish.json()["version"] == 1
    assert first_publish.json()["schema"]["components"][0]["props"]["title"] == "出口温度 A"
    assert published_before_republish.json()["schema"]["components"][0]["props"]["title"] == "出口温度 A"
    assert second_publish.json()["version"] == 2
    assert published_after_republish.json()["schema"]["components"][0]["props"]["title"] == "轴承温度 B"
    assert first_version_after_republish.status_code == 200
    assert first_version_after_republish.json()["schema"]["components"][0]["props"]["title"] == "出口温度 A"

import json

import httpx
import pytest
from fastapi import HTTPException

from industrial_api import diagnosis


MODEL_RESULT = {
    "observedFacts": [{"text": "出口温度为 83°C", "sourceIds": ["observation:1"]}],
    "possibleCauses": [],
    "recommendedChecks": [],
}


def fake_responses(monkeypatch, captured: list[httpx.Request]) -> None:
    real_client = httpx.Client

    def respond(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={
            "status": "completed",
            "output": [{"type": "message", "content": [
                {"type": "output_text", "text": json.dumps(MODEL_RESULT)}
            ]}],
        })

    monkeypatch.setattr(diagnosis.httpx, "Client", lambda **kwargs: real_client(
        transport=httpx.MockTransport(respond), **kwargs
    ))


def test_default_provider_uses_deepseek_responses_and_backend_key(monkeypatch) -> None:
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    monkeypatch.setenv("OPENAI_API_KEY", "wrong-provider-key")
    captured: list[httpx.Request] = []
    fake_responses(monkeypatch, captured)

    assert diagnosis.request_model({"alarm": "example"}) == MODEL_RESULT
    request = captured[0]
    body = json.loads(request.content)
    assert str(request.url) == "https://api.deepseek.com/responses"
    assert request.headers["Authorization"] == "Bearer test-deepseek-key"
    assert body["model"] == "deepseek-flash"
    assert body["text"]["format"]["type"] == "json_schema"
    assert "strict" not in body["text"]["format"]
    assert "store" not in body


def test_openai_provider_and_model_override(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("AI_MODEL", "gpt-6-luna")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    captured: list[httpx.Request] = []
    fake_responses(monkeypatch, captured)

    assert diagnosis.request_model({"alarm": "example"}) == MODEL_RESULT
    request = captured[0]
    body = json.loads(request.content)
    assert str(request.url) == "https://api.openai.com/v1/responses"
    assert request.headers["Authorization"] == "Bearer test-openai-key"
    assert body["model"] == "gpt-6-luna"
    assert body["text"]["format"]["strict"] is True
    assert body["store"] is False


def test_deepseek_model_can_be_selected_without_changing_provider(monkeypatch) -> None:
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.setenv("AI_MODEL", "deepseek-v4-pro")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    captured: list[httpx.Request] = []
    fake_responses(monkeypatch, captured)

    diagnosis.request_model({"alarm": "example"})
    assert json.loads(captured[0].content)["model"] == "deepseek-v4-pro"


def test_missing_default_provider_key_has_actionable_error(monkeypatch) -> None:
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(HTTPException) as error:
        diagnosis.request_model({"alarm": "example"})
    assert error.value.status_code == 503
    assert "DEEPSEEK_API_KEY" in error.value.detail

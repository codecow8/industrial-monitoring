from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from industrial_api.auth import COOKIE_NAME, hash_password
from industrial_api.database import SessionFactory
from industrial_api.main import app
from industrial_api.models import AuthSession, AuthUser, LoginRate


@pytest.fixture
def account():
    username = f"auth-{uuid4()}"
    with SessionFactory.begin() as session:
        session.execute(delete(LoginRate))
        user = AuthUser(username=username, password_hash=hash_password("Test-password-123!"))
        session.add(user)
        session.flush()
        user_id = user.id
    yield username
    with SessionFactory.begin() as session:
        session.execute(delete(AuthUser).where(AuthUser.id == user_id))
        session.execute(delete(LoginRate))


def login(client, username):
    return client.post("/api/auth/login", json={"username": username, "password": "Test-password-123!"})


def test_login_cookie_session_and_logout(account):
    with TestClient(app) as client:
        assert client.get("/api/auth/me").status_code == 401
        result = login(client, account)
        assert result.status_code == 200
        assert result.json()["username"] == account
        assert "password" not in result.text and "token" not in result.text
        cookie = result.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
        token = client.cookies.get(COOKIE_NAME)
        with SessionFactory() as session:
            stored = session.scalar(select(AuthSession).where(AuthSession.user_id == result.json()["id"]))
            assert stored is not None and stored.token_hash != token
        assert client.get("/api/auth/me").json()["username"] == account
        assert client.post("/api/auth/logout").status_code == 204
        client.cookies.set(COOKIE_NAME, token)
        assert client.get("/api/auth/me").status_code == 401


def test_invalid_credentials_and_empty_inputs(account):
    with TestClient(app) as client:
        for username in (account, "unknown-user"):
            result = client.post("/api/auth/login", json={"username": username, "password": "wrong"})
            assert result.status_code == 401
            assert result.json()["detail"] == "账号或密码错误，请重新输入。"
            assert COOKIE_NAME not in client.cookies
        assert client.post("/api/auth/login", json={"username": "", "password": ""}).status_code == 422


def test_session_expiry_rotation_and_secure_cookie(account, monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    with TestClient(app, base_url="https://testserver") as client:
        result = login(client, account)
        user_id = result.json()["id"]
        assert "Secure" in result.headers["set-cookie"]
        old = client.cookies.get(COOKIE_NAME)
        login(client, account)
        current = client.cookies.get(COOKIE_NAME)
        assert current != old
        with TestClient(app, base_url="https://testserver") as other:
            other.cookies.set(COOKIE_NAME, old)
            assert other.get("/api/auth/me").status_code == 401
        with SessionFactory.begin() as session:
            for item in session.scalars(select(AuthSession).where(AuthSession.user_id == user_id)):
                item.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        assert client.get("/api/auth/me").status_code == 401


def test_cross_site_login_is_rejected(account):
    with TestClient(app) as client:
        result = client.post("/api/auth/login", headers={"Origin": "https://evil.example"},
                             json={"username": account, "password": "Test-password-123!"})
        assert result.status_code == 403
        assert COOKIE_NAME not in client.cookies


def test_login_is_rate_limited(account):
    with TestClient(app) as client:
        for _ in range(10):
            assert client.post("/api/auth/login", json={"username": account, "password": "wrong"}).status_code == 401
        result = login(client, account)
        assert result.status_code == 429
        assert result.headers["retry-after"]


def test_write_and_runtime_read_boundaries(account):
    with TestClient(app) as client:
        for method, path in (("GET", "/api/pages/auth-test/draft"),
                             ("PUT", "/api/pages/auth-test/draft"),
                             ("POST", "/api/pages/auth-test/publish"),
                             ("POST", "/api/pages/auth-test/alarm-diagnoses")):
            assert client.request(method, path, json={}).status_code == 401
        assert client.get("/api/pages/auth-test/published").status_code == 401
        for path in ("/api/pages/auth-test/versions/1", "/api/pages/auth-test/active-alarms",
                     "/api/pages/auth-test/alarm-history", "/api/pages/auth-test/alarm-evidence"):
            assert client.get(path).status_code == 401
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/telemetry", json={"timestamp": "device-time", "values": {}}).status_code == 202
        login(client, account)
        assert client.get("/api/pages/auth-test/draft").status_code == 204
        assert client.get("/api/pages/auth-test/published").status_code == 204
        assert client.post("/api/pages/auth-test/publish", headers={"Origin": "https://evil.example"}).status_code == 403
        assert client.post("/api/auth/logout", headers={"Origin": "https://evil.example"}).status_code == 403
        assert client.get("/api/auth/me").status_code == 200
        client.post("/api/auth/logout")
        assert client.get("/api/pages/auth-test/draft").status_code == 401


def runtime_page(client):
    import json
    from pathlib import Path
    schema = json.loads((Path(__file__).parents[3] / "fixtures" / "valid-page-schema.json").read_text())
    schema["id"] = f"auth-runtime-{uuid4()}"
    key = f"{schema['id']}.temperature"
    schema["components"][0]["props"]["dataKey"] = key
    assert client.put(f"/api/pages/{schema['id']}/draft", json=schema).status_code == 200
    assert client.post(f"/api/pages/{schema['id']}/publish").status_code == 200
    return schema["id"], key


def test_anonymous_and_wrong_origin_websocket_are_rejected(account):
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as denied:
            with client.websocket_connect("/ws/telemetry/pages/no-auth"):
                pass
        assert denied.value.code == 4401
        login(client, account)
        page_id, _ = runtime_page(client)
        with pytest.raises(WebSocketDisconnect) as origin:
            with client.websocket_connect(f"/ws/telemetry/pages/{page_id}", headers={"Origin": "https://evil.example"}):
                pass
        assert origin.value.code == 4403


@pytest.mark.parametrize("invalidate", ["logout", "expire", "rotate"])
def test_idle_websocket_closes_within_five_seconds_on_invalid_login(account, invalidate):
    import time
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        user_id = login(client, account).json()["id"]
        page_id, _ = runtime_page(client)
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}") as websocket:
            snapshot = websocket.receive_json()
            token = client.cookies.get(COOKIE_NAME)
            assert token not in str(snapshot)
            started = time.monotonic()
            if invalidate == "logout":
                assert client.post("/api/auth/logout").status_code == 204
            elif invalidate == "rotate":
                assert login(client, account).status_code == 200
                assert client.cookies.get(COOKIE_NAME) != token
            else:
                with SessionFactory.begin() as session:
                    for row in session.scalars(select(AuthSession).where(AuthSession.user_id == user_id)):
                        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            # 没有任何上报或客户端消息，也必须发现会话已撤销。
            with pytest.raises(WebSocketDisconnect) as closed:
                websocket.receive_json()
            assert closed.value.code == 4401
            assert time.monotonic() - started < 5
        if invalidate == "rotate":
            assert client.get(f"/api/pages/{page_id}/published").status_code == 200
        else:
            assert client.get(f"/api/pages/{page_id}/published").status_code == 401


def test_revoked_websocket_does_not_receive_new_telemetry(account):
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        login(client, account)
        page_id, key = runtime_page(client)
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}") as websocket:
            websocket.receive_json()
            client.post("/api/auth/logout")
            assert client.post("/api/telemetry", json={"timestamp": "device-time", "values": {key: 83}}).status_code == 202
            with pytest.raises(WebSocketDisconnect) as closed:
                websocket.receive_json()
            assert closed.value.code == 4401


def test_authentication_outage_stops_push_without_claiming_logout(account, monkeypatch):
    import industrial_api.telemetry as telemetry
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        login(client, account)
        page_id, key = runtime_page(client)
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}") as websocket:
            websocket.receive_json()
            def unavailable(_hashed_token):
                raise RuntimeError("Authentication storage unavailable")
            monkeypatch.setattr(telemetry, "login_expiry", unavailable)
            client.post("/api/telemetry", json={"timestamp": "device-time", "values": {key: 83}})
            with pytest.raises(WebSocketDisconnect) as closed:
                websocket.receive_json()
            assert closed.value.code == 1013
        assert client.get("/api/auth/me").status_code == 200


def mini_login(client, username):
    return client.post("/api/auth/mini/login", json={"username": username, "password": "Test-password-123!"})


def test_mini_session_does_not_expose_or_accept_browser_cookie(account):
    with TestClient(app) as client:
        web = login(client, account)
        cookie = client.cookies.get(COOKIE_NAME)
        result = mini_login(client, account)
        assert result.status_code == 200
        assert "set-cookie" not in result.headers
        assert result.headers["cache-control"] == "no-store"
        token = result.json()["token"]
        assert token.startswith("mini_") and token != cookie
        client.cookies.clear()
        client.headers["Authorization"] = f"Bearer {token}"
        assert client.get("/api/auth/me").json()["id"] == web.json()["id"]
        assert client.get("/api/pages/no-published/published").status_code == 204
        client.headers["Authorization"] = f"Bearer {cookie}"
        assert client.get("/api/auth/me").status_code == 401
        client.headers.clear()
        client.cookies.set(COOKIE_NAME, token)
        assert client.get("/api/auth/me").status_code == 401
        client.cookies.set(COOKIE_NAME, cookie)
        assert client.get("/api/auth/me").status_code == 200


@pytest.mark.parametrize("invalidate", ["logout", "expire", "rotate"])
def test_mini_http_and_idle_socket_share_revocation(account, invalidate):
    from starlette.websockets import WebSocketDisconnect
    import time
    with TestClient(app) as client:
        result = mini_login(client, account)
        assert result.status_code == 200
        token = result.json()["token"]
        client.headers["Authorization"] = f"Bearer {token}"
        page_id, _ = runtime_page(client)
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}", headers={"Origin": "http://127.0.0.1:8000"}) as socket:
            assert socket.receive_json()["type"] == "telemetry.snapshot"
            started = time.monotonic()
            if invalidate == "logout":
                assert client.post("/api/auth/logout").status_code == 204
            elif invalidate == "rotate":
                assert mini_login(client, account).status_code == 200
            else:
                with SessionFactory.begin() as session:
                    for row in session.scalars(select(AuthSession).where(AuthSession.user_id == result.json()["id"])):
                        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            with pytest.raises(WebSocketDisconnect) as closed:
                socket.receive_json()
            assert closed.value.code == 4401
            assert time.monotonic() - started < 5
        assert client.get("/api/auth/me").status_code == 401


def test_mini_invalid_login_and_shared_rate_limit(account):
    with TestClient(app) as client:
        for _ in range(5):
            assert client.post("/api/auth/mini/login", json={"username": account, "password": "wrong"}).status_code == 401
            assert client.post("/api/auth/login", json={"username": account, "password": "wrong"}).status_code == 401
        assert mini_login(client, account).status_code == 429


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_viewer_can_monitor_but_cannot_read_drafts_edit_or_publish(account, transport):
    with TestClient(app) as client:
        login(client, account)
        page_id, _ = runtime_page(client)
        with SessionFactory.begin() as session:
            user = session.scalar(select(AuthUser).where(AuthUser.username == account))
            user.role = "viewer"
        if transport == "bearer":
            result = mini_login(client, account)
            client.cookies.clear()
            client.headers["Authorization"] = f"Bearer {result.json()['token']}"
        assert client.get("/api/auth/me").json()["role"] == "viewer"
        published = client.get(f"/api/pages/{page_id}/published")
        assert published.status_code == 200
        assert client.get(f"/api/pages/{page_id}/active-alarms").status_code == 200
        assert client.get(f"/api/pages/{page_id}/alarm-history").status_code == 200
        for method, path in (("GET", "draft"), ("PUT", "draft"), ("POST", "publish")):
            response = client.request(method, f"/api/pages/{page_id}/{path}", json=published.json()["schema"])
            assert response.status_code == 403
        with client.websocket_connect(f"/ws/telemetry/pages/{page_id}") as socket:
            assert socket.receive_json()["type"] == "telemetry.snapshot"
        # Role changes apply immediately to an existing session; it cannot retain editor rights.
        with SessionFactory.begin() as session:
            user = session.scalar(select(AuthUser).where(AuthUser.username == account))
            user.role = "editor"
        assert client.get(f"/api/pages/{page_id}/draft").status_code == 200

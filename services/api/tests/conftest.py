from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config


@pytest.fixture(scope="session", autouse=True)
def migrate_database() -> None:
    service_root = Path(__file__).parent.parent
    config = Config(service_root / "alembic.ini")
    command.upgrade(config, "head")



@pytest.fixture(autouse=True)
def authenticated_business_tests(request, monkeypatch):
    # Existing business tests exercise their original seam with a real DB session.
    # Authentication tests use anonymous clients and verify the access boundary.
    if request.module.__name__.endswith("test_auth_api"):
        yield
        return
    import secrets
    from datetime import UTC, datetime, timedelta
    from fastapi.testclient import TestClient
    from sqlalchemy import delete
    from industrial_api.auth import COOKIE_NAME, hash_password, token_hash
    from industrial_api.database import SessionFactory
    from industrial_api.models import AuthSession, AuthUser

    token = secrets.token_urlsafe(32)
    with SessionFactory.begin() as session:
        user = AuthUser(username="test-" + secrets.token_hex(8), password_hash=hash_password(token))
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(AuthSession(token_hash=token_hash(token), user_id=user_id,
                                expires_at=datetime.now(UTC) + timedelta(hours=1)))
    original = TestClient.__init__
    def initialize(self, *args, **kwargs):
        kwargs["cookies"] = {**kwargs.get("cookies", {}), COOKIE_NAME: token}
        original(self, *args, **kwargs)
    monkeypatch.setattr(TestClient, "__init__", initialize)
    yield
    with SessionFactory.begin() as session:
        session.execute(delete(AuthUser).where(AuthUser.id == user_id))

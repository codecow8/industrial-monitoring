from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config


@pytest.fixture(scope="session", autouse=True)
def migrate_database() -> None:
    service_root = Path(__file__).parent.parent
    config = Config(service_root / "alembic.ini")
    command.upgrade(config, "head")


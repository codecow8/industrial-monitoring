import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


CONTRACT_PATH = Path(__file__).resolve().parents[4] / "fixtures" / "page-schema-v1.json"
CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(CONTRACT)


def validate_page_schema(schema: dict[str, Any]) -> None:
    errors = sorted(VALIDATOR.iter_errors(schema), key=lambda error: list(error.path))
    if not errors:
        return

    first = errors[0]
    path = "/" + "/".join(str(part) for part in first.path)
    raise ValueError(f"{path}: {first.message}")

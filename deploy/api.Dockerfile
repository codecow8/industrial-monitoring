FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /usr/local/bin/uv
WORKDIR /app/services/api
COPY services/api/pyproject.toml services/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY services/api ./
COPY fixtures /app/fixtures
RUN uv sync --frozen --no-dev
ENV PATH="/app/services/api/.venv/bin:$PATH" PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --create-home app
USER app
# Telemetry hub is in process; use one worker until a shared broker is introduced.
CMD ["uvicorn", "industrial_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

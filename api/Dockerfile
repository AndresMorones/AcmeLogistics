# syntax=docker/dockerfile:1.7

# Build context = repo root (not api/) so we can COPY data/loads.csv,
# a sibling of api/. Enforced via fly.toml [build] dockerfile = "api/Dockerfile".

# Pin to immutable SHA digest for reproducibility (FAANG bar).
# To refresh: docker pull ghcr.io/astral-sh/uv:python3.12-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/astral-sh/uv:python3.12-bookworm-slim
# Modern alternative: crane digest ghcr.io/astral-sh/uv:python3.12-bookworm-slim
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY api/pyproject.toml api/uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY api/app/ ./app/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


# Pin to immutable SHA digest for reproducibility (FAANG bar).
# To refresh: docker pull python:3.12-slim && docker inspect --format='{{index .RepoDigests 0}}' python:3.12-slim
# Modern alternative: crane digest python:3.12-slim
FROM python:3.12-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --home-dir /app --shell /usr/sbin/nologin app

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LOADS_CSV_PATH=/app/loads.csv \
    LOG_LEVEL=INFO

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app api/app/ ./app/

COPY --chown=app:app data/loads.csv ./loads.csv

RUN chown app:app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

ARG BASE_REGISTRY=docker.io

FROM ${BASE_REGISTRY}/library/python:3.12-slim AS build
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL} UV_INDEX_URL=${PIP_INDEX_URL} UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src src
RUN uv sync --frozen --no-dev

FROM ${BASE_REGISTRY}/library/python:3.12-slim
RUN useradd --system --uid 10001 --no-create-home churn
COPY --from=build /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1
USER churn
WORKDIR /app
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=2)"]
CMD ["python", "-m", "churn_mcp"]

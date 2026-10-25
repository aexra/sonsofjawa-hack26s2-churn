ARG BASE_REGISTRY=docker.io

FROM ${BASE_REGISTRY}/library/python:3.12-slim AS dependencies
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1
WORKDIR /app/ml
COPY requirements.txt ./
RUN pip install --no-cache-dir --only-binary=:all: --index-url "${PIP_INDEX_URL}" -r requirements.txt

FROM dependencies AS tested
COPY riskml ./riskml
COPY tests ./tests
RUN python -W error::ResourceWarning -m unittest discover -s tests -v

FROM dependencies AS runtime
RUN groupadd --system --gid 10001 churn \
    && useradd --system --uid 10001 --gid churn --no-create-home churn \
    && mkdir -p /app/ml/reports \
    && chown churn:churn /app/ml/reports
COPY --from=tested /app/ml/riskml ./riskml
USER 10001:10001
ENTRYPOINT ["python", "-m", "riskml"]
CMD ["--help"]

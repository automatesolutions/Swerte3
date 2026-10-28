# Build stage: install wheels into /install so the runtime image carries no pip cache or build tooling.
FROM python:3.12-slim AS build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Runtime stage. psycopg2-binary bundles libpq, so no apt packages are needed.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY --from=build /install /usr/local
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

# Precompile app bytecode so a cold start does not spend time compiling .py files.
RUN python -m compileall -q app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]

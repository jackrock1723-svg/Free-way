# Free way - hosted image for Render (or any Docker host).
# Stage 1 builds the React frontend; stage 2 runs the Python server.

FROM node:22-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.js ./
COPY frontend ./frontend
RUN npm run build            # writes /src/web-react

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FW_PYDEPS=/app/pydeps \
    FREEWAY_HOSTED=1 \
    FREECODE_DATA=/tmp/freeway-data
WORKDIR /app
# Postgres driver goes in the pydeps folder (same layout the desktop app uses);
# pydantic is imported at startup (schema.py); google-auth verifies Google sign-in tokens.
RUN pip install --no-cache-dir --target /app/pydeps "psycopg[binary]==3.3.6" \
 && pip install --no-cache-dir "pydantic==2.14.1" "google-auth>=2.30,<3"
COPY freecode ./freecode
COPY web ./web
COPY migrations ./migrations
COPY --from=web /src/web-react ./web-react
RUN useradd --create-home freeway && mkdir -p /tmp/freeway-data && chown -R freeway /app /tmp/freeway-data
USER freeway
EXPOSE 10000
# Shell form so Render's $PORT is expanded; server also reads PORT itself.
CMD python -m freecode --mode cloud --host 0.0.0.0 --port "${PORT:-10000}" --data "$FREECODE_DATA"

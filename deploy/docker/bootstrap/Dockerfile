FROM python:3.13-slim

WORKDIR /deploy

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      tini \
      ca-certificates \
      postgresql-client \
      redis-tools \
      bash \
      openssl \
    ; \
    rm -rf /var/lib/apt/lists/*; \
    command -v psql; \
    command -v pg_isready; \
    command -v redis-cli

RUN useradd -m -u 1001 -s /usr/sbin/nologin appuser

COPY deploy/scripts/ /deploy/scripts/
RUN chmod +x /deploy/scripts/*.sh \
 && chown -R appuser:appuser /deploy

USER appuser

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["bash", "-lc", "echo bootstrap ready"]

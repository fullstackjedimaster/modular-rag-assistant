#!/usr/bin/env bash
set -euo pipefail

# deploy/scripts/init-postgres.sh
# Hard reset: DROP DATABASE + CREATE DATABASE + apply rag.sql
# rag.sql is expected to be in the same directory as this script.

log() { echo -e "\033[1;32m[init-postgres] $*\033[0m"; }
err() { echo -e "\033[1;31m[init-postgres] $*\033[0m" >&2; exit 1; }

DATABASE_URL="${DATABASE_URL:-}"
POSTGRES_HOST="${POSTGRES_HOST:-${DATABASE_HOST:-}}"
POSTGRES_PORT="${POSTGRES_PORT:-${DATABASE_PORT:-5432}}"
POSTGRES_DB="${POSTGRES_DB:-}"
POSTGRES_USER="${POSTGRES_USER:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

if [ -z "$DATABASE_URL" ]; then
  : "${POSTGRES_HOST:?POSTGRES_HOST is required}"
  : "${POSTGRES_PORT:?POSTGRES_PORT ) is required}"
  : "${POSTGRES_DB:?POSTGRES_DB is required}"
  : "${POSTGRES_USER:?POSTGRES_USER is required}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

  export PGPASSWORD="$POSTGRES_PASSWORD"

  DATABASE_URL="postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
fi

SITE_NAME="${SITE_NAME:-TEST}"
SITEARRAY_LABEL="${SITEARRAY_LABEL:-Site Array TEST}"
TZ_NAME="${TZ_NAME:-America/Chicago}"

echo "[init-postgres] Using '$DATABASE_URL'"
echo "[init-postgres] Waiting for Postgres and checking schema..."


# Final hard fail if Postgres never came up
if ! psql "$DATABASE_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
  echo "[init-postgres] ERROR: Postgres never became ready."
  exit 1
fi

echo "[init-postgres] Creating schema/tables and seeding data..."

psql -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
BEGIN;

CREATE SCHEMA IF NOT EXISTS rag;

SET search_path TO rag;


DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prompt_chaining_mode' AND typnamespace = 'rag'::regnamespace) THEN
CREATE TYPE rag.prompt_chaining_mode AS ENUM ('append', 'replace', 'none');
END IF;

END$$;
-- =========================
-- Tables
-- =========================

CREATE TABLE IF NOT EXISTS rag.rag_client (
                                              id          SERIAL PRIMARY KEY,
                                              name        TEXT NOT NULL UNIQUE,         -- formerly FRAME_ID
                                              host_url    TEXT NOT NULL,                -- URL/URI of host app including iframe URI
                                              created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS rag.client_context (
                                                  id            SERIAL PRIMARY KEY,
                                                  rag_client_id INT NOT NULL UNIQUE REFERENCES rag.rag_client(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS rag.content_doc (
                                               id                 SERIAL PRIMARY KEY,
                                               client_context_id  INT NOT NULL REFERENCES rag.client_context(id) ON DELETE CASCADE,
    doc_name           TEXT NOT NULL,
    file_path          TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_context_id, doc_name)
    );

CREATE TABLE IF NOT EXISTS rag.telemetry_message (
                                                     id                 SERIAL PRIMARY KEY,
                                                     client_context_id  INT NOT NULL REFERENCES rag.client_context(id) ON DELETE CASCADE,
    message_name       TEXT NOT NULL,
    message_value      TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_context_id, message_name)
    );

CREATE TABLE IF NOT EXISTS rag.prompt (
                                          id                 SERIAL PRIMARY KEY,
                                          client_context_id  INT NOT NULL REFERENCES rag.client_context(id) ON DELETE CASCADE,
    text               TEXT NOT NULL,
    chaining_mode      rag.prompt_chaining_mode NOT NULL DEFAULT 'append',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );

-- Optional: maintain updated_at automatically
CREATE OR REPLACE FUNCTION rag.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rag_client_set_updated_at') THEN
CREATE TRIGGER rag_client_set_updated_at
    BEFORE UPDATE ON rag.rag_client
    FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();
END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'client_context_set_updated_at') THEN
CREATE TRIGGER client_context_set_updated_at
    BEFORE UPDATE ON rag.client_context
    FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();
END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'content_doc_set_updated_at') THEN
CREATE TRIGGER content_doc_set_updated_at
    BEFORE UPDATE ON rag.content_doc
    FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();
END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'telemetry_message_set_updated_at') THEN
CREATE TRIGGER telemetry_message_set_updated_at
    BEFORE UPDATE ON rag.telemetry_message
    FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();
END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prompt_set_updated_at') THEN
CREATE TRIGGER prompt_set_updated_at
    BEFORE UPDATE ON rag.prompt
    FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();
END IF;
END$$;

-- =========================
-- Helper: ensure 1:1 context exists
-- =========================

CREATE OR REPLACE FUNCTION rag.ensure_client_context(p_rag_client_id INT)
RETURNS INT AS $$
DECLARE
v_context_id INT;
BEGIN
SELECT id INTO v_context_id
FROM rag.client_context
WHERE rag_client_id = p_rag_client_id;

IF v_context_id IS NULL THEN
        INSERT INTO rag.client_context (rag_client_id)
        VALUES (p_rag_client_id)
        RETURNING id INTO v_context_id;
END IF;

RETURN v_context_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- CRUD: rag_client
-- =========================

CREATE OR REPLACE FUNCTION rag.create_rag_client(p_name TEXT, p_host_url TEXT)
RETURNS INT AS $$
DECLARE
v_id INT;
BEGIN
INSERT INTO rag.rag_client (name, host_url)
VALUES (p_name, p_host_url)
    RETURNING id INTO v_id;

PERFORM rag.ensure_client_context(v_id);
RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_rag_client(p_id INT, p_name TEXT, p_host_url TEXT)
RETURNS VOID AS $$
BEGIN
UPDATE rag.rag_client
SET name = p_name,
    host_url = p_host_url
WHERE id = p_id;

-- keep context present
PERFORM rag.ensure_client_context(p_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_rag_client(p_id INT)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.rag_client WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.list_rag_clients()
RETURNS TABLE (id INT, name TEXT, host_url TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ) AS $$
BEGIN
RETURN QUERY
SELECT rc.id, rc.name, rc.host_url, rc.created_at, rc.updated_at
FROM rag.rag_client rc
ORDER BY rc.name;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- CRUD: content_doc
-- =========================

CREATE OR REPLACE FUNCTION rag.create_content_doc(p_rag_client_id INT, p_doc_name TEXT, p_file_path TEXT)
RETURNS INT AS $$
DECLARE
v_context_id INT;
    v_id INT;
BEGIN
    v_context_id := rag.ensure_client_context(p_rag_client_id);

INSERT INTO rag.content_doc (client_context_id, doc_name, file_path)
VALUES (v_context_id, p_doc_name, p_file_path)
    RETURNING id INTO v_id;

RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_content_doc(p_id INT, p_doc_name TEXT, p_file_path TEXT)
RETURNS VOID AS $$
BEGIN
UPDATE rag.content_doc
SET doc_name = p_doc_name,
    file_path = p_file_path
WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_content_doc(p_id INT)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.content_doc WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- CRUD: telemetry_message
-- =========================

CREATE OR REPLACE FUNCTION rag.create_telemetry_message(p_rag_client_id INT, p_message_name TEXT, p_message_value TEXT)
RETURNS INT AS $$
DECLARE
v_context_id INT;
    v_id INT;
BEGIN
    v_context_id := rag.ensure_client_context(p_rag_client_id);

INSERT INTO rag.telemetry_message (client_context_id, message_name, message_value)
VALUES (v_context_id, p_message_name, p_message_value)
    RETURNING id INTO v_id;

RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_telemetry_message(p_id INT, p_message_name TEXT, p_message_value TEXT)
RETURNS VOID AS $$
BEGIN
UPDATE rag.telemetry_message
SET message_name = p_message_name,
    message_value = p_message_value
WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_telemetry_message(p_id INT)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.telemetry_message WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- CRUD: prompt
-- =========================

CREATE OR REPLACE FUNCTION rag.create_prompt(p_rag_client_id INT, p_text TEXT, p_chaining_mode rag.prompt_chaining_mode)
RETURNS INT AS $$
DECLARE
v_context_id INT;
    v_id INT;
BEGIN
    v_context_id := rag.ensure_client_context(p_rag_client_id);

INSERT INTO rag.prompt (client_context_id, text, chaining_mode)
VALUES (v_context_id, p_text, COALESCE(p_chaining_mode, 'append'))
    RETURNING id INTO v_id;

RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_prompt(p_id INT, p_text TEXT, p_chaining_mode rag.prompt_chaining_mode)
RETURNS VOID AS $$
BEGIN
UPDATE rag.prompt
SET text = p_text,
    chaining_mode = COALESCE(p_chaining_mode, chaining_mode)
WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_prompt(p_id INT)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.prompt WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- Read: Full nested JSON for one client
-- =========================

CREATE OR REPLACE FUNCTION rag.get_rag_client_json(p_rag_client_id INT)
RETURNS JSONB AS $$
DECLARE
v_client JSONB;
    v_context_id INT;
BEGIN
SELECT to_jsonb(rc) INTO v_client
FROM rag.rag_client rc
WHERE rc.id = p_rag_client_id;

IF v_client IS NULL THEN
        RETURN NULL;
END IF;

SELECT id INTO v_context_id
FROM rag.client_context
WHERE rag_client_id = p_rag_client_id;

IF v_context_id IS NULL THEN
        -- no context yet; return client with null context
        RETURN jsonb_build_object(
            'id', (v_client->>'id')::int,
            'name', v_client->>'name',
            'host_url', v_client->>'host_url',
            'context', NULL
        );
END IF;

RETURN jsonb_build_object(
        'id', (v_client->>'id')::int,
        'name', v_client->>'name',
        'host_url', v_client->>'host_url',
        'context', jsonb_build_object(
                'id', v_context_id,
                'content_docs', COALESCE(
                        (SELECT jsonb_agg(jsonb_build_object(
                                'id', cd.id,
                                'doc_name', cd.doc_name,
                                'file_path', cd.file_path
                                          ) ORDER BY cd.doc_name)
                         FROM rag.content_doc cd
                         WHERE cd.client_context_id = v_context_id),
                        '[]'::jsonb
                                ),
                'telemetry_messages', COALESCE(
                        (SELECT jsonb_agg(jsonb_build_object(
                                'id', tm.id,
                                'message_name', tm.message_name,
                                'message_value', tm.message_value
                                          ) ORDER BY tm.message_name)
                         FROM rag.telemetry_message tm
                         WHERE tm.client_context_id = v_context_id),
                        '[]'::jsonb
                                      ),
                'prompts', COALESCE(
                        (SELECT jsonb_agg(jsonb_build_object(
                                'id', p.id,
                                'text', p.text,
                                'chaining_mode', p.chaining_mode
                                          ) ORDER BY p.id)
                         FROM rag.prompt p
                         WHERE p.client_context_id = v_context_id),
                        '[]'::jsonb
                           )
                   )
       );
    END;

$$ LANGUAGE plpgsql;



COMMIT;

SQL

echo "[init-postgres] Done."

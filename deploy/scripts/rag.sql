-- schema: rag
CREATE SCHEMA IF NOT EXISTS rag;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Prompt chaining mode
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
                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                              name        TEXT NOT NULL UNIQUE,         -- formerly FRAME_ID
                                              host_url    TEXT NOT NULL,                -- URL/URI of host app including iframe URI
                                              collection TEXT NOT NULL,
                                              llm_model TEXT NOT NULL DEFAULT 'llama3.2',
                                              embed_model text NOT NULL DEFAULT 'nomic-embed-text',
                                              prompt    TEXT NOT NULL,
                                              chaining_mode prompt_chaining_mode NOT NULL,

                                              created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );


CREATE TABLE IF NOT EXISTS rag.content_doc (
                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                               rag_client_id  uuid NOT NULL REFERENCES rag.rag_client(id) ON DELETE CASCADE,
    doc_name           TEXT NOT NULL,
    file_path          TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rag_client_id, doc_name)
    );

CREATE TABLE IF NOT EXISTS rag.telemetry_message (
                                                     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                                     rag_client_id  uuid NOT NULL REFERENCES rag.rag_client(id) ON DELETE CASCADE,
    message_name       TEXT NOT NULL,
    message_value      TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rag_client_id, message_name)
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


END$$;


-- =========================
-- CRUD: rag_client
-- =========================

CREATE OR REPLACE FUNCTION rag.create_rag_client(p_name uuid, p_host_url TEXT, p_collection TEXT, p_llm_model TEXT, p_embed_model TEXT, p_prompt TEXT,  p_chaining_mode prompt_chaining_mode)
RETURNS uuid AS $$
DECLARE
v_id uuid;
BEGIN
INSERT INTO rag.rag_client (name, host_url, collection,  llm_model, embed_model,prompt ,  chaining_mode )
VALUES (p_name, p_host_url, p_collection, p_llm_model, p_embed_model, p_prompt ,  p_chaining_mode)
    RETURNING id INTO v_id;
RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_rag_client(p_id uuid, p_name TEXT, p_host_url TEXT, p_collection TEXT,  p_llm_model TEXT, p_embed_model TEXT, p_prompt TEXT,  p_chaining_mode prompt_chaining_mode)
RETURNS VOID AS $$
BEGIN
UPDATE rag.rag_client
SET name = p_name,
    host_url = p_host_url,
    collection = p_collection,
    llm_model = p_llm_model,
    embed_model = p_embed_model,
    prompt = p_prompt,
    chaining_mode = p_chaining_mode
WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rag.delete_rag_client(p_id uuid)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.rag_client WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.list_rag_clients()
RETURNS TABLE (id uuid, name TEXT, host_url TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ) AS $$
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

CREATE OR REPLACE FUNCTION rag.create_content_doc(p_rag_client_id uuid, p_doc_name TEXT, p_file_path TEXT)
RETURNS uuid AS $$
DECLARE

    v_id uuid;
BEGIN


INSERT INTO rag.content_doc (rag_client_id, doc_name, file_path)
VALUES (p_rag_client_id, p_doc_name, p_file_path)
    RETURNING id INTO v_id;

RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_content_doc(p_id uuid, p_doc_name TEXT, p_file_path TEXT)
RETURNS VOID AS $$
BEGIN
UPDATE rag.content_doc
SET doc_name = p_doc_name,
    file_path = p_file_path
WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_content_doc(p_id uuid)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.content_doc WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- CRUD: telemetry_message
-- =========================

CREATE OR REPLACE FUNCTION rag.create_telemetry_message(p_rag_client_id uuid, p_message_name TEXT, p_message_value TEXT)
RETURNS uuid AS $$
DECLARE

    v_id uuid;
BEGIN


INSERT INTO rag.telemetry_message (rag_client_id, message_name, message_value)
VALUES (p_rag_client_id, p_message_name, p_message_value)
    RETURNING id INTO v_id;

RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.update_telemetry_message(p_id uuid, p_message_name TEXT, p_message_value TEXT)
RETURNS VOID AS $$
BEGIN
UPDATE rag.telemetry_message
SET message_name = p_message_name,
    message_value = p_message_value
WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_telemetry_message(p_id uuid)
RETURNS VOID AS $$
BEGIN
DELETE FROM rag.telemetry_message WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;



CREATE OR REPLACE FUNCTION rag.get_rag_client_json(p_rag_client_id uuid)
RETURNS JSONB AS $$
DECLARE
v_client JSONB;

BEGIN
SELECT to_jsonb(rc) INTO v_client
FROM rag.rag_client rc
WHERE rc.id = p_rag_client_id;

IF v_client IS NULL THEN
        RETURN NULL;
END IF;



RETURN jsonb_build_object(
        'id', (v_client->>'id')::uuid,
        'name', v_client->>'name',
        'host_url', v_client->>'host_url',
        'collection', v_client->>'collection',
        'llm_model', v_client->>'llm_model',
        'embed_model', v_client->>'embed_model',
        'prompt', v_client->>'prompt',
        'chaining_mode', v_client->>'chaining_mode',
        'telemetry_messages', COALESCE(
                    (SELECT jsonb_agg(jsonb_build_object(
                            'id', tm.id,
                            'message_name', tm.message_name,
                            'message_value', tm.message_value
                                      ) ORDER BY tm.message_name)
                     FROM rag.telemetry_message tm
                     WHERE tm.rag_client_id = p_rag_client_id),
                    '[]'::jsonb
                                  )
       );
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    v_rag_client_id UUID;
BEGIN

INSERT INTO rag.rag_client (
name,
host_url,
collection,
llm_model,
embed_model,
prompt,
chaining_mode
)
VALUES (
'iot-wireless-mesh-daq',
'https://mesh-daq.fullstackjedi.dev',
'mesh_daq_fault_docs',
'llama3.2:latest',
'nomic-embed-text:latest',
'You are a solar diagnostics expert. Use ONLY the provided context to answer.

# Rules
- If the context does not contain the answer, say Insufficient context.
- Focus on electrical reasoning.
- Be concise (<= 6 bullet points).
- Prefer concrete evidence (numbers, timestamps, MACs).

# Context
{context}

# Question
{question}

# Output (bullets)
- Likely cause(s):
- Evidence:
- Remediation:',
        'append'
    )
RETURNING id
INTO v_rag_client_id;

INSERT INTO rag.telemetry_message (
rag_client_id,
message_name,
message_value
)
VALUES
(v_rag_client_id, 'status', 0),
(v_rag_client_id, 'voltage', 0),
(v_rag_client_id, 'current', 0),
(v_rag_client_id, 'power', 0),
(v_rag_client_id, 'temperature', 0);


RAISE NOTICE 'Created rag_client_id=%', v_rag_client_id;

END $$;



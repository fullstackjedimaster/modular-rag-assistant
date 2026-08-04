-- =========================
-- Route support functions (RAG Host refactor)
-- =========================

CREATE OR REPLACE FUNCTION rag.update_rag_host_basic(
    p_id uuid,
    p_name text,
    p_host_url text
)
RETURNS void AS $$
BEGIN
    UPDATE rag.rag_host
    SET name = p_name, host_url = p_host_url
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RAG host % not found', p_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.list_rag_hosts_json()
RETURNS jsonb AS $$
BEGIN
    RETURN COALESCE(
        (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.name) FROM rag.rag_host h),
        '[]'::jsonb
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION rag.list_content_docs_by_host(p_rag_host_id uuid)
RETURNS TABLE (
    id uuid,
    doc_name text,
    file_path text,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT d.id, d.doc_name, d.file_path, d.created_at, d.updated_at
    FROM rag.content_doc d
    WHERE d.rag_host_id = p_rag_host_id
    ORDER BY d.doc_name;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION rag.update_content_doc_by_host(
    p_rag_host_id uuid,
    p_id uuid,
    p_doc_name text,
    p_file_path text
)
RETURNS void AS $$
BEGIN
    UPDATE rag.content_doc
    SET doc_name = p_doc_name, file_path = p_file_path
    WHERE id = p_id AND rag_host_id = p_rag_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Content document % not found for RAG host %', p_id, p_rag_host_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_content_doc_by_host(
    p_rag_host_id uuid,
    p_id uuid
)
RETURNS void AS $$
BEGIN
    DELETE FROM rag.content_doc
    WHERE id = p_id AND rag_host_id = p_rag_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Content document % not found for RAG host %', p_id, p_rag_host_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.list_telemetry_messages_by_host(p_rag_host_id uuid)
RETURNS TABLE (
    id uuid,
    message_name text,
    message_value text,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.message_name, COALESCE(m.message_value, ''), m.created_at, m.updated_at
    FROM rag.telemetry_message m
    WHERE m.rag_host_id = p_rag_host_id
    ORDER BY m.message_name;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION rag.update_telemetry_message_by_host(
    p_rag_host_id uuid,
    p_id uuid,
    p_message_name text,
    p_message_value text
)
RETURNS void AS $$
BEGIN
    UPDATE rag.telemetry_message
    SET message_name = p_message_name, message_value = p_message_value
    WHERE id = p_id AND rag_host_id = p_rag_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Telemetry message % not found for RAG host %', p_id, p_rag_host_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.delete_telemetry_message_by_host(
    p_rag_host_id uuid,
    p_id uuid
)
RETURNS void AS $$
BEGIN
    DELETE FROM rag.telemetry_message
    WHERE id = p_id AND rag_host_id = p_rag_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Telemetry message % not found for RAG host %', p_id, p_rag_host_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.replace_telemetry_messages_for_host(
    p_rag_host_id uuid,
    p_rows text
)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM rag.rag_host WHERE id = p_rag_host_id) THEN
        RAISE EXCEPTION 'RAG host % not found', p_rag_host_id;
    END IF;

    DELETE FROM rag.telemetry_message WHERE rag_host_id = p_rag_host_id;

    INSERT INTO rag.telemetry_message (rag_host_id, message_name, message_value)
    SELECT
        p_rag_host_id,
        trim(item->>'name'),
        ''
    FROM jsonb_array_elements(COALESCE(NULLIF(p_rows, ''), '[]')::jsonb) AS item
    WHERE trim(COALESCE(item->>'name', '')) <> '';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rag.get_rag_host_prompt(p_rag_host_id uuid)
RETURNS text AS $$
    SELECT prompt FROM rag.rag_host WHERE id = p_rag_host_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION rag.set_rag_host_prompt(
    p_rag_host_id uuid,
    p_prompt text
)
RETURNS void AS $$
BEGIN
    UPDATE rag.rag_host
    SET prompt = COALESCE(p_prompt, '')
    WHERE id = p_rag_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RAG host % not found', p_rag_host_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

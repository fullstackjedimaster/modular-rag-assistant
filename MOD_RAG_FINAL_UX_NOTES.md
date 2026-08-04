# Modular RAG final host UX pass

- Mesh DAQ is selected and attached on demo load.
- Host preview and assistant attachment now use one active host state.
- Repeated discovery/connect handshakes make Entity Client attach before form rendering.
- Dashboard uses Host / Assistant wording and host names link to detail pages.
- Host identity is immutable after creation; actions moved to the bottom.
- Debug panel removed.
- Content docs route reads rag.content_doc directly.
- Telemetry message_value removed from the UI/API contract; existing DB column may remain nullable.

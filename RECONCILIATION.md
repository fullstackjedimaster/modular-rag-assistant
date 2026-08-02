# Embed / Dock Reconciliation

## Ownership

- Portfolio owns outer demo iframe creation, portfolio tokens, and outer iframe height.
- Mod RAG owns `dock-host.js`, the dock protocol, the dock iframe, RAG client configuration, and exclusive connection state.
- IoT and Entity Client own only their application UI and `TARGET_SELECTED` data.
- Every iframe layer reports only its own rendered height to its direct parent.

## Protocols

### Portfolio embed

Parent to child:

- `EMBED_TOKEN { token }`

Child to parent:

- `EMBED_HEIGHT { height }`

The child receives `embedParentOrigin` in its URL and validates both `event.source` and `event.origin`.

### Mod RAG host adapter

Controller to host:

- `RAG_HOST_DISCOVER`
- `RAG_DOCK_CONNECT { ragClientId }`
- `RAG_DOCK_DISCONNECT`

Host to controller:

- `RAG_HOST_READY`
- `TARGET_SELECTED { id, attrs, source }`
- `EMBED_HEIGHT { height }`

Host to dock:

- `HOST_THEME { vars, app, density }`
- `TARGET_SELECTED { id, attrs, source }`

Dock to host:

- `DOCK_READY`
- `DOCK_RESIZE { height }`

## Important corrections

- `dock-host.js` is loaded after React hydration, not through raw server-rendered `<script>` markup.
- Host iframe identity and origin change together; changing host recreates the iframe.
- The API enforces one connected RAG client at a time.
- All connection links derive from one `connectedId`: Connect, Disconnect, or Switch.
- Nested dock resize dispatches `rag-dock-resize`; the host remeasures and reports outward.
- Embed-lock booleans are parsed as booleans, not truthy strings.
- Python token verification accepts direct or explicitly delegated audiences.
- Public Mod RAG integration surfaces `/dock` and `/dock-host.js` remain independent of Portfolio.

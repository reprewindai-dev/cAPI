# AGENTS.md — READ FIRST

Before any work, read [`00_VEKLOM_BIBLE.md`](./00_VEKLOM_BIBLE.md).

That file is the Veklom cross-repo architecture/runtime context. Repo-local source and tests govern Covenant/cAPI implementation details only when they do not conflict with current verified runtime evidence.

For cAPI, the current reported runtime contract is port `3003`. Ports `3000` and `8000` are forbidden cAPI production/root fallbacks and must not appear as Docker, listener, health-check, Compose, or Traefik defaults. Treat `3003` as `UNVERIFIED` until deployed SHA, HTTP/protocol identity, container listener, and Traefik routing agree.

Do not infer service placement, health, compliance, or production status from old docs. Use Coolify UI/API/MCP for Coolify management; SSH is for direct host/container verification or operations. Never commit secrets or concrete private infrastructure addresses.

# Interlink-cAPI / cAPI Consolidation Record

- Canonical repository: `reprewindai-dev/cAPI`
- Legacy source repository: `reprewindai-dev/interlink-cAPI`
- Destination prefix: `interlink/`
- cAPI base SHA: `f0f2c43f2f8c08f7515ef93d7fcf6babe1493e66`
- interlink-cAPI source branch: `master`
- interlink-cAPI source SHA: `a02d880eda3eeac911a8835d9693fd6df6004744`
- subtree import commit: `2197c58c06e7a695ffd08e70c78f25dc15afcdb0`
- imported at: `2026-07-20T23:37:52.9709000Z`

## Authority rule

The product is **Interlink cAPI**. The canonical repository after this merge is
`reprewindai-dev/cAPI`, containing both the active cAPI/Covenant runtime and the
legacy Interlink implementation/history.

The imported tree is not automatically production-authoritative. Existing active
runtime authority remains defined by the root application until code is deliberately
migrated, tested, and wired.

## Known duplication

The root repository already contains `interlink-capifull/`, copied previously without
the full source repository history. The imported source may also contain
`interlink/interlink-capifull/`.

Do not delete either copy during the history merge. Compare them and remove duplication
in a separate reviewed commit.

## Deployment migration

The old Interlink deployment used `interlink-cAPI/interlink-rs`.
After consolidation, update the Coolify build context to
`interlink/interlink-rs`.

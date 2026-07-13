#!/usr/bin/env python3
"""Build contracts/graphql/operation-registry.json from checked-in .graphql operations.

Each operation file must carry a header line:

    # capability: <capability_id> | lane: <1|2|3> | version: <semver>

The operation hash is sha256 over the normalized operation body (header
comments stripped, whitespace collapsed) so cosmetic edits do not change the
hash but semantic edits do. Run from repo root:

    python3 contracts/scripts/build-operation-registry.py [--check]

--check exits non-zero if the checked-in registry differs (CI gate).
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(__file__)
OPS_DIR = os.path.join(HERE, "..", "graphql", "operations")
REGISTRY_PATH = os.path.join(HERE, "..", "graphql", "operation-registry.json")
SCHEMA_VERSION = "1.0.0"

LANE_LIMITS = {
    1: {"maximum_depth": 5, "maximum_cost": 100},
    2: {"maximum_depth": 5, "maximum_cost": 150},
    3: {"maximum_depth": 6, "maximum_cost": 300},
}

HEADER_RE = re.compile(
    r"#\s*capability:\s*(?P<cap>[\w.\-]+)\s*\|\s*lane:\s*(?P<lane>[123])\s*\|\s*version:\s*(?P<ver>[\w.\-]+)"
)
NAME_RE = re.compile(r"^(query|mutation|subscription)\s+(\w+)", re.MULTILINE)


def normalize(body: str) -> str:
    lines = [ln for ln in body.splitlines() if not ln.strip().startswith("#")]
    return " ".join(" ".join(lines).split())


def build() -> dict:
    records = []
    for fname in sorted(os.listdir(OPS_DIR)):
        if not fname.endswith(".graphql"):
            continue
        with open(os.path.join(OPS_DIR, fname)) as f:
            body = f.read()
        header = HEADER_RE.search(body)
        if not header:
            raise SystemExit(f"{fname}: missing capability header")
        name = NAME_RE.search(body)
        if not name:
            raise SystemExit(f"{fname}: cannot determine operation name")
        lane = int(header.group("lane"))
        digest = hashlib.sha256(normalize(body).encode()).hexdigest()
        records.append({
            "operation_name": name.group(2),
            "operation_file": fname,
            "capability_id": header.group("cap"),
            "operation_version": header.group("ver"),
            "schema_version": SCHEMA_VERSION,
            "operation_hash": f"sha256:{digest}",
            "lane": lane,
            "maximum_depth": LANE_LIMITS[lane]["maximum_depth"],
            "maximum_cost": LANE_LIMITS[lane]["maximum_cost"],
            "required_grants": [header.group("cap")],
        })
    return {"registry_version": SCHEMA_VERSION, "operations": records}


def main() -> None:
    registry = build()
    rendered = json.dumps(registry, indent=2) + "\n"
    if "--check" in sys.argv:
        try:
            with open(REGISTRY_PATH) as f:
                current = f.read()
        except FileNotFoundError:
            current = ""
        if current != rendered:
            print("operation-registry.json is stale. Run build-operation-registry.py.")
            raise SystemExit(1)
        print("operation registry is up to date")
        return
    with open(REGISTRY_PATH, "w") as f:
        f.write(rendered)
    print(f"wrote {REGISTRY_PATH} ({len(registry['operations'])} operations)")


if __name__ == "__main__":
    main()

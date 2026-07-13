#!/usr/bin/env python3
import hashlib
import json
import os
import re
import sys
from graphql import parse, print_ast, build_schema, validate, OperationDefinitionNode

HERE = os.path.dirname(__file__)
OPS_DIR = os.path.join(HERE, "..", "graphql", "operations")
REGISTRY_PATH = os.path.join(HERE, "..", "graphql", "operation-registry.json")
SCHEMA_PATH = os.path.join(HERE, "..", "graphql", "schema.graphql")
SCHEMA_VERSION = "1.0.0"

LANE_LIMITS = {
    1: {"maximum_depth": 5, "maximum_cost": 100},
    2: {"maximum_depth": 5, "maximum_cost": 150},
    3: {"maximum_depth": 6, "maximum_cost": 300},
}

HEADER_RE = re.compile(
    r"#\s*capability:\s*(?P<cap>[\w.\-]+)\s*\|\s*lane:\s*(?P<lane>[123])\s*\|\s*version:\s*(?P<ver>[\w.\-]+)"
)

def build() -> dict:
    if not os.path.exists(OPS_DIR):
        os.makedirs(OPS_DIR, exist_ok=True)
    with open(SCHEMA_PATH) as f:
        sdl = f.read()
    schema = build_schema(sdl)

    records = []
    for fname in sorted(os.listdir(OPS_DIR)):
        if not fname.endswith(".graphql"):
            continue
        with open(os.path.join(OPS_DIR, fname)) as f:
            body = f.read()
        header = HEADER_RE.search(body)
        if not header:
            raise SystemExit(f"{fname}: missing capability header")
        
        lane = int(header.group("lane"))
        
        doc = parse(body)
        errors = validate(schema, doc)
        if errors:
            raise SystemExit(f"{fname} validation errors: {errors}")
            
        operations = [node for node in doc.definitions if isinstance(node, OperationDefinitionNode)]
        if len(operations) != 1:
            raise SystemExit(f"{fname} must contain exactly one operation")
            
        operation = operations[0]
        if not operation.name:
            raise SystemExit(f"{fname} operation must be named")
            
        op_name = operation.name.value
        canonical_body = print_ast(doc)
        digest = hashlib.sha256(canonical_body.encode()).hexdigest()
        
        required_authority = "CAPPO" if lane == 3 else "WORKSPACE"
        
        records.append({
            "operation_name": op_name,
            "operation_file": fname,
            "capability_id": header.group("cap"),
            "operation_version": header.group("ver"),
            "schema_version": SCHEMA_VERSION,
            "operation_hash": f"sha256:{digest}",
            "lane": lane,
            "maximum_depth": LANE_LIMITS[lane]["maximum_depth"],
            "maximum_cost": LANE_LIMITS[lane]["maximum_cost"],
            "required_authority": required_authority,
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

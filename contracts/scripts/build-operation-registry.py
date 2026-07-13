#!/usr/bin/env python3
import hashlib
import json
import os
import sys
from graphql import parse, print_ast, build_schema, validate, OperationDefinitionNode

HERE = os.path.dirname(__file__)
OPS_DIR = os.path.join(HERE, "..", "graphql", "operations")
REGISTRY_PATH = os.path.join(HERE, "..", "graphql", "operation-registry.json")
SCHEMA_PATH = os.path.join(HERE, "..", "graphql", "schema.graphql")
MANIFEST_PATH = os.path.join(OPS_DIR, "manifest.json")
SCHEMA_VERSION = "1.0.0"

def build() -> dict:
    if not os.path.exists(OPS_DIR):
        os.makedirs(OPS_DIR, exist_ok=True)
    with open(SCHEMA_PATH) as f:
        sdl = f.read()
    schema = build_schema(sdl)

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    records = []
    
    # Track uniqueness
    op_names = set()
    
    for op_meta in manifest["operations"]:
        fname = op_meta["operation_file"]
        
        # Must be unique operation name
        op_name = op_meta["operation_name"]
        if op_name in op_names:
            raise SystemExit(f"Duplicate operation name found in manifest: {op_name}")
        op_names.add(op_name)
        
        # Verify Lane 3 requires CAPPO
        lane = op_meta["lane"]
        if lane == 3 and op_meta.get("required_authority") != "CAPPO":
            raise SystemExit(f"{fname}: Lane 3 operation must specify required_authority: CAPPO")
        
        with open(os.path.join(OPS_DIR, fname)) as f:
            body = f.read()
            
        doc = parse(body)
        errors = validate(schema, doc)
        if errors:
            raise SystemExit(f"{fname} validation errors: {errors}")
            
        operations = [node for node in doc.definitions if isinstance(node, OperationDefinitionNode)]
        if len(operations) != 1:
            raise SystemExit(f"{fname} must contain exactly one operation")
            
        operation = operations[0]
        if not operation.name or operation.name.value != op_name:
            raise SystemExit(f"{fname} operation name in file ({operation.name.value if operation.name else 'None'}) must match manifest ({op_name})")
            
        # Canonicalize using print_ast (GraphQL-aware printing)
        canonical_body = print_ast(doc)
        
        # Hash UTF-8 bytes with SHA-256
        digest = hashlib.sha256(canonical_body.encode("utf-8")).hexdigest()
        
        op_meta["operation_hash"] = f"sha256:{digest}"
        records.append(op_meta)
        
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

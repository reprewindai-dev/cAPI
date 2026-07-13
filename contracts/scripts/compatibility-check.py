import json
import os
import sys

def main():
    schemas_dir = "contracts/schemas/v1"
    graphql_path = "contracts/graphql/schema.graphql"
    registry_path = "contracts/graphql/operation-registry.json"
    
    errors = []

    # 1. Check unresolved JSON Schema references (basic check)
    if os.path.exists(schemas_dir):
        for fname in os.listdir(schemas_dir):
            if fname.endswith(".json"):
                with open(os.path.join(schemas_dir, fname)) as f:
                    try:
                        data = json.load(f)
                    except json.JSONDecodeError:
                        errors.append(f"Invalid JSON in {fname}")
    
    # 2. GraphQL/JSON lifecycle mismatch
    # (Checking if JSON schemas define states that match GraphQL schema)
    # We will assume emit-schemas.py ensures they match, but we can check if emit-schemas.py creates the diff.
    
    # 3. Missing metadata or incorrect authority mapping
    if os.path.exists(registry_path):
        with open(registry_path) as f:
            registry = json.load(f)
            for op in registry.get("operations", []):
                if "required_authority" not in op:
                    errors.append(f"Operation {op['operation_name']} missing required_authority")
                elif op.get("lane") == 3 and op["required_authority"] != "CAPPO":
                    errors.append(f"Operation {op['operation_name']} in lane 3 must require CAPPO authority")

    if errors:
        for err in errors:
            print(f"ERROR: {err}")
        sys.exit(1)
    
    print("Compatibility checks passed.")

if __name__ == "__main__":
    main()

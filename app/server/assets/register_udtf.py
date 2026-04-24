# Databricks notebook source
# MAGIC %md
# MAGIC # Register Meta CAPI UDTF in Unity Catalog
# MAGIC
# MAGIC This notebook fetches the latest `meta_capi.py` and `mapping_engine.py` from
# MAGIC the [pyspark-udtf](https://github.com/allisonwang-db/pyspark-udtf) repo and
# MAGIC registers/updates the UC function with the full source inlined.
# MAGIC
# MAGIC **Schedule this notebook** to scan for upstream changes and keep the function
# MAGIC in sync automatically.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

# Target UC location for the function
CATALOG = "meta_meta_conversions_api"
SCHEMA = "meta_capi"
# CATALOG = "vdm_classic_tctuui_catalog"
# SCHEMA = "adtech"
FUNCTION_NAME = "write_to_meta_capi"


# GitHub raw URLs for the source files
GITHUB_BASE = "https://raw.githubusercontent.com/allisonwang-db/pyspark-udtf/master/src/pyspark_udtf/udtfs"
META_CAPI_URL = f"{GITHUB_BASE}/meta_capi.py"
MAPPING_ENGINE_URL = f"{GITHUB_BASE}/mapping_engine.py"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Latest Source from GitHub

# COMMAND ----------

import requests

def fetch_source(url: str) -> str:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text

mapping_engine_src = fetch_source(MAPPING_ENGINE_URL)
meta_capi_src = fetch_source(META_CAPI_URL)

print(f"✓ Fetched mapping_engine.py ({len(mapping_engine_src)} chars)")
print(f"✓ Fetched meta_capi.py ({len(meta_capi_src)} chars)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Inlined UDTF Source
# MAGIC
# MAGIC We inline both `MappingEngine` and `MetaCAPILogic` into the `AS $$` block
# MAGIC so the UC function has no external package dependency.

# COMMAND ----------

import re
import hashlib

def strip_docstrings(src: str) -> str:
    """Remove all triple-quoted docstrings (content included) from Python source."""
    src = re.sub(r'"""[\s\S]*?"""', '', src)
    src = re.sub(r"'''[\s\S]*?'''", '', src)
    return src

def strip_imports_and_decorators(src: str, remove_patterns: list[str] = None) -> str:
    """Remove specific import lines and decorators from source."""
    lines = src.split("\n")
    filtered = []
    skip_next_class = False
    for line in lines:
        if remove_patterns and any(p in line for p in remove_patterns):
            if line.strip().startswith("@"):
                skip_next_class = True
            continue
        if skip_next_class and line.strip().startswith("class "):
            skip_next_class = False
            continue
        if skip_next_class and line.strip() == "":
            continue
        if skip_next_class:
            continue
        filtered.append(line)
    return "\n".join(filtered)

def restructure_for_exec(source: str) -> str:
    """Move all imports to the top and add globals().update(locals())
    so they are visible to functions/classes inside exec().
    
    UC UDTFs run code via exec(code, globals_dict, locals_dict).
    Imports go into locals_dict, but functions/classes look up names
    in globals_dict. globals().update(locals()) bridges this gap.
    
    We call it TWICE:
    1. After imports — so module-level function calls (e.g. _partner_agent())
       can access imported names.
    2. At the end — so class definitions (e.g. MappingEngine) are available
       in globals for cross-class references at runtime.
    """
    lines = source.split('\n')
    imports = []
    code = []
    
    for line in lines:
        stripped = line.strip()
        if (stripped.startswith('import ') or stripped.startswith('from ')) and not stripped.startswith('from __future__'):
            imports.append(stripped)
        else:
            code.append(line)
    
    # Deduplicate imports while preserving order
    seen = set()
    unique_imports = []
    for imp in imports:
        if imp not in seen:
            seen.add(imp)
            unique_imports.append(imp)
    
    result = 'from __future__ import annotations\n'
    result += '\n'.join(unique_imports)
    result += '\nglobals().update(locals())\n\n'
    result += '\n'.join(code)
    result += '\nglobals().update(locals())\n'
    return result

# --- Strip unwanted patterns from each source file ---

# Clean up mapping_engine
mapping_clean = strip_imports_and_decorators(mapping_engine_src, [
    "from typing import",
    "from __future__ import",
])

# Clean up meta_capi: strip docstrings first (they contain $$ which breaks AS $$ blocks)
meta_capi_no_docs = strip_docstrings(meta_capi_src)
meta_capi_clean = strip_imports_and_decorators(meta_capi_no_docs, [
    "from pyspark",
    "from .mapping_engine",
    "from ..utils",
    "from typing import",
    "from __future__ import",
    "check_version_compatibility",
    "@udtf",
    "class WriteToMetaCAPI",
    "    pass",
])

# --- Combine and restructure for UC UDTF exec() sandbox ---
combined = f"{mapping_clean}\n\n{meta_capi_clean}"
inlined_source = restructure_for_exec(combined)

# Compute hash for change detection
source_hash = hashlib.sha256(inlined_source.encode()).hexdigest()[:12]
print(f"✓ Inlined source built ({len(inlined_source)} chars, hash: {source_hash})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check if Update is Needed

# COMMAND ----------

# Check current function's source hash (stored in COMMENT)
current_hash = None
try:
    result = spark.sql(f"DESCRIBE FUNCTION EXTENDED {CATALOG}.{SCHEMA}.{FUNCTION_NAME}").collect()
    for row in result:
        desc = row.function_desc
        if desc and "source_hash:" in desc:
            current_hash = desc.split("source_hash:")[1].strip()
            break
except Exception:
    print("Function does not exist yet — will create.")

if current_hash == source_hash:
    print(f"✓ Function is already up to date (hash: {source_hash}). No update needed.")
    dbutils.notebook.exit(f"UP_TO_DATE:{source_hash}")

print(f"Update needed: current={current_hash}, new={source_hash}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Register / Update the UC Function

# COMMAND ----------

# Escape the inlined source for SQL (double any single quotes)
escaped_source = inlined_source.replace("'", "''")

create_sql = f"""
CREATE OR REPLACE FUNCTION {CATALOG}.{SCHEMA}.{FUNCTION_NAME}(
    data TABLE,
    pixel_id STRING,
    access_token STRING,
    mapping_yaml STRING,
    test_event_code STRING
)
RETURNS TABLE (
    status STRING,
    events_received INT,
    events_failed INT,
    fbtrace_id STRING,
    error_message STRING
)
LANGUAGE PYTHON
HANDLER 'MetaCAPILogic'
COMMENT 'Meta CAPI UDTF - source_hash:{source_hash}'
AS $$
""" + inlined_source + """
$$
"""

spark.sql(create_sql)
print(f"✓ Function {CATALOG}.{SCHEMA}.{FUNCTION_NAME} registered (hash: {source_hash})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify

# COMMAND ----------

spark.sql(f"DESCRIBE FUNCTION {CATALOG}.{SCHEMA}.{FUNCTION_NAME}").display()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Test (Optional)
# MAGIC
# MAGIC Uncomment and run to test with 1 row:
# MAGIC
# MAGIC ```sql
# MAGIC SELECT * FROM meta_meta_conversions_api.meta_capi.write_to_meta_capi(
# MAGIC     TABLE(SELECT * FROM meta_meta_conversions_api.meta_capi.conversion_data LIMIT 1),
# MAGIC     'YOUR_PIXEL_ID',
# MAGIC     secret('your_scope', 'access_token'),
# MAGIC     'event_name:\n  source: "event_name"\nevent_time:\n  source: "event_time"\n  transform: ["to_epoch"]',
# MAGIC     'TEST12345'
# MAGIC )
# MAGIC ```

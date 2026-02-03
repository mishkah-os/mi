# C++ Engine (QuranServ) Integration Configuration

## Overview

This document defines the structure of `mas_config.json`, the central configuration file for the C++ `QuranServ` engine. This file allows the engine to locate the shared data directory (Single Source of Truth) and configure other runtime parameters without recompilation.

## Configuration File Location

The engine should look for `mas_config.json` in the following order:

1. Command line argument: `./QuranServ --config /path/to/mas_config.json`
2. Environment Variable: `MAS_CONFIG_PATH`
3. Same directory as the executable.

## `mas_config.json` Structure

```json
{
  "system": {
    "node_name": "QS_MASTER_01",
    "environment": "production",
    "log_level": "info"
  },
  "paths": {
    "data_root": "d:/git/os/data",
    "modules_config": "modules.json", 
    "schemas_dir": "schemas",
    "branches_dir": "branches"
  },
  "network": {
    "http_port": 8080,
    "websocket_port": 8081,
    "bind_address": "0.0.0.0"
  },
  "database": {
    "engine": "sqlite", 
    "storage_path": "d:/git/os/storage.db"
  },
  "security": {
    "jwt_secret": "YOUR_SECRET_KEY_HERE_FROM_ENV",
    "token_expiry_seconds": 3600
  }
}
```

## Field Descriptions

### `paths` Section (Critical)

* **`data_root`**: The absolute path to the unified `os/data` directory.
  * *Value*: `d:/git/os/data`
* **`modules_config`**: The name of the modules definition file relative to `data_root`.
  * *Default*: `modules.json`
  * *Logic*: Engine reads `{data_root}/{modules_config}` to discover active modules (Security, Finance, etc.).

### `system` Section

* **`node_name`**: Identifier for this engine instance (useful for clustering logs).
* **`environment`**: `development` | `production`.

### `network` Section

* **`http_port`**: Port for REST API functionality (if enabled).
* **`websocket_port`**: Port for real-time connections (if used).

## Integration Logic

1. **Startup**:
    * Engine loads `mas_config.json`.
    * Engine verifies existence of `paths.data_root`.

2. **Module Discovery**:
    * Engine reads `{paths.data_root}/modules.json`.
    * Iterates through defined modules (`security`, `finance`, etc.).
    * Loads table definitions from `schemaFallbackPath` (e.g., `data/schemas/security_schema.json`).

3. **Data Loading**:
    * Engine can optionally load seed data from `seedPath` defined in `modules.json` if initializing a clean database.

## Example `modules.json` Interaction

When `QuranServ` reads `modules.json`, it finds:

```json
"security": {
  "label": "Enterprise Security",
  "schemaFallbackPath": "data/schemas/security_schema.json",
  ...
}
```

It constructs the full schema path as:
`{mas_config.paths.data_root}` + `/` + `data/schemas/security_schema.json`
Result: `d:/git/os/data/data/schemas/security_schema.json`
*(Note: Ensure paths in `modules.json` are relative to `data_root`)*

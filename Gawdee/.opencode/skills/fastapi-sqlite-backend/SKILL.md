---
name: fastapi-sqlite-backend
description: FastAPI backend with SQLite, handling default settings, public key allow-listing, and admin save routes.
---

# FastAPI SQLite Backend

## Directives
- Maintain `database.py` with `DEFAULT_SETTINGS` and synchronous/asynchronous `get_setting(key)` and `set_setting(key, val)`.
- Enforce API key/public key authentication via `account.py` using an allow-list verification dependency.
- Structure `admin.py` endpoints for bulk updating and validating settings with typed Pydantic schemas.
- Ensure database connections use safe transaction contexts with auto-rollback on failure.
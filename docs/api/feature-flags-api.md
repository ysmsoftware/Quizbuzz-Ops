# Feature Flags API Specification

The Feature Flags API domain manages platform-wide feature toggles and per-organization overrides — a hybrid global + per-org entitlement/add-on mechanism. Mutating routes require `SUPER_ADMIN` (`FEATURE_FLAG_MANAGE` permission); read routes are open to any authenticated admin.

---

## Base Path
`/api/v1/ops/feature-flags`

---

## Endpoints

### 1. List Feature Flags
`GET /api/v1/ops/feature-flags`

- **Purpose**: Fetch all feature flags and their current global state.
- **Description**: Read-open to any authenticated admin — `SUPPORT` needs to see current flag state even though it can't change it.

#### Request Parameters
- **Headers**: `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "message": "Feature flags retrieved.",
  "data": [
    {
      "id": "flag_maintenance",
      "key": "maintenance_mode",
      "label": "Maintenance Mode",
      "description": "Activates maintenance window platform-wide. All live operations are suspended.",
      "isEnabled": false,
      "severity": "CRITICAL",
      "supportsOrgOverride": false,
      "updatedAt": "2026-08-04T11:02:00.000Z",
      "updatedByName": "Jane Doe"
    }
  ],
  "requestId": "req_abc123"
}
```

##### Failure States
- **`401 Unauthorized`**: Missing/invalid `ops_access_token` cookie.

---

### 2. Get Feature Flag Detail
`GET /api/v1/ops/feature-flags/[key]`

- **Purpose**: Retrieve a single flag's current state by key.
- **Description**: Same auth level as (1). Returns `404` if the key doesn't exist.

#### Request Parameters
- **Path Parameters**: `key` (string, required) - Flag key, e.g. `maintenance_mode`.

#### Responses

##### Success State (`200 OK`)
Same shape as a single item from (1).

##### Failure States
- **`401 Unauthorized`**
- **`404 Not Found`**: `errorResponse('Feature flag not found', 'NOT_FOUND', null, 404)`

---

### 3. Toggle Feature Flag (Global)
`PATCH /api/v1/ops/feature-flags/[key]`

- **Purpose**: Set the global default value for a flag.
- **Description**: Requires `SUPER_ADMIN`. Writes a `feature_flag.toggled` entry to the platform audit log with `{ from, to }` metadata.

#### Request Parameters
- **Path Parameters**: `key` (string, required).

#### Request Body
```json
{ "isEnabled": true }
```

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "message": "Feature flag updated.",
  "data": {
    "id": "flag_maintenance",
    "key": "maintenance_mode",
    "label": "Maintenance Mode",
    "isEnabled": true,
    "severity": "CRITICAL",
    "supportsOrgOverride": false,
    "updatedAt": "2026-08-09T09:14:22.000Z",
    "updatedByName": "Jane Doe"
  },
  "requestId": "req_def456"
}
```

##### Failure States
- **`403 Forbidden`**: Admin lacks `FEATURE_FLAG_MANAGE` (not `SUPER_ADMIN`).
- **`404 Not Found`**: Unknown key.
- **`400 Bad Request`**: `isEnabled` missing or not boolean.

---

### 4. List Organization Overrides
`GET /api/v1/ops/feature-flags/[key]/organizations`

- **Purpose**: List active (non-removed) per-organization overrides for a flag.
- **Description**: Read-open to any authenticated admin. Returns `400` if the flag doesn't support org overrides.

#### Request Parameters
- **Path Parameters**: `key` (string, required).

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "message": "Organization overrides retrieved.",
  "data": [
    {
      "id": "ffoo_01hxyz",
      "flagKey": "proctoring_enabled_platform_wide",
      "organizationId": "org_9f3c1a",
      "isEnabled": true,
      "reason": "Add-on purchased per contract dated 2026-07-15.",
      "createdByName": "Jane Doe",
      "expiresAt": null,
      "createdAt": "2026-07-15T14:02:00.000Z"
    }
  ],
  "requestId": "req_ghi789"
}
```

##### Failure States
- **`401 Unauthorized`**
- **`404 Not Found`**: Unknown key.
- **`400 Bad Request`**: `errorResponse('Flag does not support org overrides', 'ORG_OVERRIDE_NOT_SUPPORTED', null, 400)`.

---

### 5. Set Organization Override
`PUT /api/v1/ops/feature-flags/[key]/organizations/[orgId]`

- **Purpose**: Enable or disable a flag for one specific organization, overriding the global default.
- **Description**: Requires `SUPER_ADMIN`. "Set" = replace: any existing active override for `(key, orgId)` is soft-removed (`removedReason: 'Replaced by new override'`) and a fresh row is created, preserving history. Writes a `feature_flag.org_override.set` audit entry.

#### Request Parameters
- **Path Parameters**: `key` (string, required), `orgId` (string, required).

#### Request Body
```json
{ "isEnabled": true, "reason": "Add-on purchased per contract dated 2026-07-15." }
```
- `expiresAt` (ISO datetime string, optional).

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "message": "Organization override set.",
  "data": {
    "id": "ffoo_01hxyz",
    "flagKey": "proctoring_enabled_platform_wide",
    "organizationId": "org_9f3c1a",
    "isEnabled": true,
    "reason": "Add-on purchased per contract dated 2026-07-15.",
    "createdByName": "Jane Doe",
    "expiresAt": null,
    "createdAt": "2026-07-15T14:02:00.000Z"
  },
  "requestId": "req_jkl012"
}
```

##### Failure States
- **`403 Forbidden`**: Admin lacks `FEATURE_FLAG_MANAGE`.
- **`404 Not Found`**: Unknown key.
- **`400 Bad Request`**: `flag.supportsOrgOverride === false`, or `isEnabled`/`reason` missing/malformed.

---

### 6. Remove Organization Override
`DELETE /api/v1/ops/feature-flags/[key]/organizations/[orgId]`

- **Purpose**: Revert an organization to the flag's global default.
- **Description**: Requires `SUPER_ADMIN`. Soft-delete only (`removedAt`/`removedById`/`removedReason`) — never a hard delete, so a reversed decision stays auditable. Writes a `feature_flag.org_override.removed` audit entry.

#### Request Parameters
- **Path Parameters**: `key` (string, required), `orgId` (string, required).

#### Request Body
```json
{ "reason": "Trial period ended." }
```
`reason` is optional; a JSON body (even `{}`) is required.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "message": "Organization override removed. Organization now follows the global default.",
  "data": { "flagKey": "proctoring_enabled_platform_wide", "organizationId": "org_9f3c1a", "removedAt": "2026-08-09T09:20:00.000Z" },
  "requestId": "req_mno345"
}
```

##### Failure States
- **`403 Forbidden`**: Admin lacks `FEATURE_FLAG_MANAGE`.
- **`404 Not Found`**: Unknown key, or no active override exists for that org.

---

## Notes

- No `POST`/`DELETE` on the base `feature-flags` resource — flags are managed via migration + seed, not ad hoc admin creation. Org overrides, by contrast, are designed to be created/removed ad hoc from the dashboard.
- RBAC is a single flat `FEATURE_FLAG_MANAGE` permission (see `lib/hooks/useAuth.ts`'s `hasPermission()`), granted to `SUPER_ADMIN` only — no per-flag or per-org variation.

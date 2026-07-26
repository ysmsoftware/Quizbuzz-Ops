# Audit Log API Specification

The Audit Log API domain provides an immutable trail of administrative platform actions, operator security events, organization suspensions, plan changes, payout adjustments, and support notes.

---

## Base Path
`/api/v1/ops/audit-log`

---

## Endpoints

### 1. List & Search Platform Audit Logs
`GET /api/v1/ops/audit-log`

- **Purpose**: Query, filter, and audit administrative actions executed across the platform.
- **Description**:
  Queries the `OpsAuditLog` collection. Accessible by all authenticated platform administrators (`SUPER_ADMIN`, `BILLING_ADMIN`, `SUPPORT`).
  Supports filtering by action key (e.g. `org.suspended`, `plan.updated`), target entity type, target ID, operator ID, and date ranges.

#### Request Parameters
- **Query Parameters**:
  - `page` (number, default: 1) - Page number.
  - `limit` (number, default: 20) - Items per page.
  - `action` (string, optional) - Action string filter (e.g. `org.suspended`, `plan.created`, `billing_portal.checkout_started`).
  - `targetType` (`ORGANIZATION` | `SUBSCRIPTION_PLAN` | `PLATFORM_ADMIN` | `PAYOUT_ACCOUNT` | `SYSTEM`, optional) - Target entity category.
  - `targetId` (string, optional) - Specific target record ID.
  - `actorId` (string, optional) - Administrator ID who executed the action.
  - `dateFrom` (string, optional) - Start date filter (ISO string).
  - `dateTo` (string, optional) - End date filter (ISO string).
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "aud_10029",
        "actorId": "adm_9912",
        "actorEmail": "admin@quizbuzz.io",
        "actorName": "Austin Operations Admin",
        "actorRole": "SUPER_ADMIN",
        "action": "org.suspended",
        "targetType": "ORGANIZATION",
        "targetId": "org_7712",
        "targetName": "Global Tech Institute",
        "metadata": {
          "reason": "Repeated Terms of Service violation and fraudulent chargebacks."
        },
        "createdAt": "2026-07-25T14:30:00.000Z"
      },
      {
        "id": "aud_10030",
        "actorId": "adm_9912",
        "actorEmail": "admin@quizbuzz.io",
        "actorName": "Austin Operations Admin",
        "actorRole": "SUPER_ADMIN",
        "action": "plan.updated",
        "targetType": "SUBSCRIPTION_PLAN",
        "targetId": "pln_pro",
        "targetName": "Pro Business",
        "metadata": {
          "updatedFields": ["price", "maxParticipantsPerContest"]
        },
        "createdAt": "2026-07-26T09:15:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 540,
      "totalPages": 27
    }
  },
  "message": "Audit log retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Authentication missing or expired operator token.
- **`400 Bad Request`**: Invalid date string or target type enum.
```json
{
  "success": false,
  "error": {
    "code": "INVALID_QUERY",
    "message": "Invalid query parameters provided for audit log search."
  }
}
```

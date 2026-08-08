# Messaging API Specification

The Messaging API domain handles template-based email message composition, dispatch queues, delivery audit trails, organization notification histories, and automatic/manual message retry flows.

---

## Base Path
`/api/v1/ops/messaging`

---

## Endpoints

### 1. Retrieve Message Template Catalog
`GET /api/v1/ops/messaging/templates`

- **Purpose**: Get available message templates and allowed dynamic interpolation variables.
- **Description**:
  Returns template IDs (`BILLING_PAYMENT_SUCCESS`, `ORG_SUSPENDED`, `CUSTOM`, etc.), names, and placeholder variables for constructing email notifications.

#### Request Parameters
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "BILLING_PAYMENT_SUCCESS",
      "name": "Billing: Payment Success",
      "variables": ["adminName", "planName", "amount"]
    },
    {
      "id": "ORG_SUSPENDED",
      "name": "Organization Suspended",
      "variables": ["adminName", "reason"]
    },
    {
      "id": "CUSTOM",
      "name": "Custom Message",
      "variables": ["adminName", "subject", "body"]
    }
  ],
  "message": "Message templates retrieved."
}
```

---

### 2. Preview a Message
`POST /api/v1/ops/messaging/preview`

- **Purpose**: Render the exact subject/HTML a template+params combo would produce, without sending anything.
- **Description**:
  Runs the same template renderer the real send path uses (`server/templates/email.templates.ts`), so the compose UI's live preview is byte-accurate rather than a separately maintained copy. No DB write, no queue job, no audit entry.

#### Request Body
```json
{
  "template": "SUBSCRIPTION_RENEWAL_REMINDER",
  "params": {
    "adminName": "Dr. Aris Thorne",
    "planName": "Pro Business",
    "currentPeriodEnd": "2026-08-20",
    "daysRemaining": "12"
  }
}
```

#### Responses
```json
{
  "success": true,
  "data": {
    "subject": "Your Pro Business plan expires in 12 days",
    "html": "<div style=\"font-family:sans-serif;...\">...</div>"
  },
  "message": "Preview rendered."
}
```

---

### 3. Enqueue Message for Delivery
`POST /api/v1/ops/messaging/send`

- **Purpose**: Compose and enqueue an email notification for delivery to an organization recipient.
- **Description**:
  Validates message payload against template specifications. Enqueues email dispatch task, writes `org.message_sent` audit entry, and sets initial status to `PENDING`. Channel is strictly enforced to `EMAIL`.

#### Request Body
```json
{
  "organizationId": "org_7712",
  "template": "ORG_SUSPENDED",
  "recipient": "director@globaltech.edu",
  "subject": "Important Notice: Quizbuzz Account Suspended",
  "channel": "EMAIL",
  "params": {
    "adminName": "Dr. Aris Thorne",
    "reason": "Repeated chargebacks"
  }
}
```

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "msg_99012",
    "organizationId": "org_7712",
    "template": "ORG_SUSPENDED",
    "recipient": "director@globaltech.edu",
    "channel": "EMAIL",
    "status": "PENDING",
    "createdAt": "2026-07-26T11:48:00.000Z"
  },
  "message": "Message queued for sending."
}
```

##### Failure States
- **`400 Bad Request`**: Validation error (e.g. invalid template or channel other than `EMAIL`).

---

### 4. List Platform-Wide Message Log
`GET /api/v1/ops/messaging`

- **Purpose**: Browse every outbound message across every organization — powers the centralized Messaging dashboard page.
- **Description**:
  Returns a paginated, most-recent-first list of message log entries. All filters are optional and combine with AND (`search` matches recipient or subject).

#### Request Parameters
- **Query Parameters**:
  - `page` (number, default: 1)
  - `limit` (number, default: 20)
  - `organizationId` (string, optional) — narrow to one organization.
  - `status` (`QUEUED` | `PROCESSING` | `SENT` | `DELIVERED` | `FAILED`, optional)
  - `channel` (`EMAIL` | `WHATSAPP`, optional)
  - `template` (one of the `OpsMessageTemplate` enum values, optional)
  - `search` (string, optional) — case-insensitive match against recipient or subject.

#### Responses
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "msg_99012",
        "organizationId": "org_7712",
        "channel": "EMAIL",
        "template": "ORG_SUSPENDED",
        "recipient": "director@globaltech.edu",
        "subject": "Important Notice: Quizbuzz Account Suspended",
        "status": "SENT",
        "retryCount": 0,
        "attemptCount": 1,
        "createdAt": "2026-07-26T11:48:00.000Z"
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "message": "Message log retrieved."
}
```

---

### 5. Get Message Status & Log Detail
`GET /api/v1/ops/messaging/[id]`

- **Purpose**: Check delivery status, attempt counts, error details, and delivery timestamps for a message ID.
- **Description**:
  Queries Ops database for message status (`PENDING`, `SENT`, `FAILED`). Returns delivery provider logs if failed.

#### Request Parameters
- **Path Parameters**:
  - `id` (string, required) - Message ID.

#### Responses
```json
{
  "success": true,
  "data": {
    "id": "msg_99012",
    "organizationId": "org_7712",
    "recipient": "director@globaltech.edu",
    "channel": "EMAIL",
    "status": "SENT",
    "sentAt": "2026-07-26T11:48:02.000Z",
    "attempts": 1,
    "lastError": null
  },
  "message": "Message retrieved."
}
```

---

### 6. List Organization Message History
`GET /api/v1/ops/messaging/organization/[orgId]`

- **Purpose**: View full message log history dispatched to a specific organization.
- **Description**:
  Returns paginated list of all emails sent to the organization, sorted by timestamp descending.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Organization ID.
- **Query Parameters**:
  - `page` (number, default: 1)
  - `limit` (number, default: 20)

#### Responses
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "msg_99012",
        "template": "ORG_SUSPENDED",
        "recipient": "director@globaltech.edu",
        "status": "SENT",
        "createdAt": "2026-07-26T11:48:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 15,
      "totalPages": 1
    }
  },
  "message": "Message history retrieved."
}
```

---

### 7. Retry Individual Failed Message
`POST /api/v1/ops/messaging/[id]/retry`

- **Purpose**: Re-enqueue a failed email message for delivery.
- **Description**:
  Resets message status to `PENDING`, increments attempt counter, enqueues worker job, and logs audit trail.

#### Responses
```json
{
  "success": true,
  "data": {
    "id": "msg_99012",
    "status": "PENDING",
    "attempts": 2
  },
  "message": "Message queued for retry."
}
```

---

### 8. Bulk Retry Failed Messages for Organization
`POST /api/v1/ops/messaging/retry-failed`

- **Purpose**: Bulk retry all failed messages associated with an organization.
- **Description**:
  Scans all messages for `orgId` in `FAILED` status and re-queues them for background delivery worker execution.

#### Request Body
```json
{
  "organizationId": "org_7712"
}
```

#### Responses
```json
{
  "success": true,
  "data": {
    "count": 3
  },
  "message": "Queued 3 failed messages for retry."
}
```

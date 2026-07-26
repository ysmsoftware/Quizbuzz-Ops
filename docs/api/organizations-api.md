# Organizations API Specification

The Organizations API domain provides platform administration tools to manage tenant organizations, view member rosters, contest histories, participant registries, financial transactions, internal operator notes, and trigger account suspensions or reactivations.

---

## Base Path
`/api/v1/ops/organizations`

---

## Endpoints

### 1. List Organizations Directory
`GET /api/v1/ops/organizations`

- **Purpose**: Search, filter, and paginate through all registered tenant organizations.
- **Description**:
  Queries platform databases to return paginated organization records with aggregated member, contest, and participant totals.
  Supports full-text search by organization name/slug/owner email, status filtering, subscription plan filtering, and sorting.

#### Request Parameters
- **Query Parameters**:
  - `page` (number, default: 1) - Page number.
  - `limit` (number, default: 10) - Number of items per page.
  - `search` (string, optional) - Keyword search on organization name, slug, or owner email.
  - `status` (`all` | `active` | `suspended` | `deleted`, default: `all`) - Account status filter.
  - `planSlug` (string, optional) - Filter by assigned subscription plan slug (e.g. `starter`, `pro`, `enterprise`).
  - `sort` (string, optional) - Sorting field and order (e.g. `createdAt:desc`, `name:asc`).
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
        "id": "org_7712",
        "name": "Global Tech Institute",
        "slug": "global-tech-institute",
        "ownerEmail": "director@globaltech.edu",
        "memberCount": 5,
        "contestCount": 12,
        "participantCount": 1450,
        "status": "ACTIVE",
        "plan": {
          "slug": "pro",
          "name": "Pro Business",
          "status": "ACTIVE"
        },
        "createdAt": "2026-01-15T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalItems": 142,
      "totalPages": 15
    }
  },
  "message": "Organizations directory retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Authentication missing or expired.
- **`400 Bad Request`**: Invalid query parameter structure.

---

### 2. Get Organization Detail Profile
`GET /api/v1/ops/organizations/[orgId]`

- **Purpose**: Fetch complete profile metadata, subscription state, onboarding status, and suspension logs for a specific organization.
- **Description**:
  Retrieves comprehensive organization profile information, active plan limits, and suspension metadata if suspended.
  Returns HTTP 404 if the requested organization ID does not exist in the system.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Unique ID of the organization.
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
    "id": "org_7712",
    "name": "Global Tech Institute",
    "slug": "global-tech-institute",
    "logoUrl": "https://cdn.quizbuzz.io/logos/org_7712.png",
    "website": "https://globaltech.edu",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-01-15T10:00:00.000Z",
    "ownerName": "Dr. Aris Thorne",
    "ownerEmail": "director@globaltech.edu",
    "memberCount": 5,
    "contestCount": 12,
    "participantCount": 1450,
    "onboardingStep": "COMPLETED",
    "onboardingCompleted": true,
    "plan": {
      "slug": "pro",
      "name": "Pro Business",
      "status": "ACTIVE"
    },
    "suspension": null
  },
  "message": "Organization profile retrieved."
}
```

##### Failure States
- **`404 Not Found`**: Organization not found.
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Organization not found"
  }
}
```

---

### 3. List Organization Members
`GET /api/v1/ops/organizations/[orgId]/members`

- **Purpose**: Fetch the team member roster belonging to an organization.
- **Description**:
  Retrieves administrative users, roles (`Owner`, `Admin`, `Viewer`), and join dates associated with the organization.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Organization ID.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "mem_101",
      "adminId": "usr_882",
      "name": "Dr. Aris Thorne",
      "email": "director@globaltech.edu",
      "role": "Owner",
      "joinedDate": "2026-01-15T10:00:00.000Z"
    }
  ],
  "message": "Organization member roster retrieved."
}
```

---

### 4. List Organization Contests
`GET /api/v1/ops/organizations/[orgId]/contests`

- **Purpose**: List all contests created by an organization.
- **Description**:
  Returns contest titles, statuses, schedule start times, participant registration counts, and total entry fees collected.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Organization ID.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "cnt_301",
      "title": "Annual Tech Quiz 2026",
      "slug": "annual-tech-quiz-2026",
      "status": "COMPLETED",
      "startTime": "2026-06-10T09:00:00.000Z",
      "duration": 60,
      "registrationFee": 100,
      "participantCount": 450,
      "revenueCollected": 45000,
      "createdAt": "2026-05-01T12:00:00.000Z"
    }
  ],
  "message": "Organization contest list retrieved."
}
```

---

### 5. List Organization Participants
`GET /api/v1/ops/organizations/[orgId]/participants`

- **Purpose**: Retrieve participant registration details across all contests of an organization.
- **Description**:
  Returns participant names, emails, phones, contest registration reference codes, and payment statuses.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Organization ID.

---

### 6. List Organization Payment Records
`GET /api/v1/ops/organizations/[orgId]/payments`

- **Purpose**: Fetch subscription payments and contest fee transactions associated with an organization.
- **Description**:
  Returns payment history including amounts, transaction statuses (`PAID`, `PENDING`, `FAILED`, `REFUNDED`), and payment gateway reference IDs.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Organization ID.

---

### 7. Operator Support Notes
`GET /api/v1/ops/organizations/[orgId]/notes`
`POST /api/v1/ops/organizations/[orgId]/notes`

- **Purpose**: View or log internal support notes and tags for an organization.
- **Description**:
  `POST` logs internal operator notes with optional categorization tags. Audit log entry is written upon note creation.

#### Request Body (`POST`)
```json
{
  "body": "Customer requested temporary limit extension due to high-traffic weekend event.",
  "tags": ["SUPPORT", "LIMIT_REQUEST"]
}
```

#### Responses (`POST`)
```json
{
  "success": true,
  "data": {
    "id": "note_551",
    "organizationId": "org_7712",
    "authorId": "adm_101",
    "authorName": "Austin Operations Admin",
    "body": "Customer requested temporary limit extension due to high-traffic weekend event.",
    "tags": ["SUPPORT", "LIMIT_REQUEST"],
    "createdAt": "2026-07-26T11:48:00.000Z"
  },
  "message": "Support note logged successfully."
}
```

---

### 8. Suspend Organization
`POST /api/v1/ops/organizations/[orgId]/suspend`

- **Purpose**: Suspend an organization's access to the platform.
- **Description**:
  Sets organization status to `SUSPENDED`, updates database records, writes an audit trail entry, and invalidates API tokens.
  Requires `SUPER_ADMIN` role.

#### Request Body
```json
{
  "reason": "Repeated Terms of Service violation and fraudulent chargebacks."
}
```

#### Responses
##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": null,
  "message": "Organization suspended successfully."
}
```

##### Failure States
- **`403 Forbidden`**: Operator lacks `SUPER_ADMIN` role.
- **`400 Bad Request`**: Reason string missing or under 3 characters.

---

### 9. Reactivate Organization
`POST /api/v1/ops/organizations/[orgId]/reactivate`

- **Purpose**: Restore active status to a suspended organization.
- **Description**:
  Clears suspension flag, restores platform features, and records reactivation audit log entry.
  Requires `SUPER_ADMIN` role.

#### Request Body
```json
{
  "reason": "Compliance review completed and account resolved."
}
```

#### Responses
```json
{
  "success": true,
  "data": null,
  "message": "Organization reactivated successfully."
}
```

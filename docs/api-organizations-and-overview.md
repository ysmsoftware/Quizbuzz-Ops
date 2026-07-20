# QuizBuzz Ops — Overview & Organizations API Documentation

## Domain Overview

This domain provides high-level operational metrics (KPI statistics, weekly growth trends, upcoming contest schedules, recent registrations) and organization control plane operations (directory search, profile details, member rosters, contest histories, participant records, support notes logging, and suspension/reactivation enforcement).

All endpoints require an active operator session (`ops_access_token` cookie). Writes (suspensions and reactivations) are restricted to `SUPER_ADMIN` operators and generate immutable entries in `PlatformAuditLog`.

---

## Overview Aggregation APIs

### 1. Platform Statistics Summary

`GET /api/v1/ops/overview/stats`

#### Purpose

Returns global platform counters: organization status breakdown, contest status counts, total registered participants, and revenue aggregations. Cached for 60 seconds.

#### Request Parameters

None.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Overview stats retrieved successfully.",
  "data": {
    "organizations": {
      "total": 45,
      "active": 40,
      "suspended": 3,
      "deleted": 2
    },
    "contests": {
      "total": 128,
      "byStatus": {
        "DRAFT": 12,
        "PUBLISHED": 20,
        "REGISTRATION_CLOSED": 8,
        "LIVE": 5,
        "COMPLETED": 83
      }
    },
    "participants": {
      "total": 14250
    },
    "revenue": {
      "allTime": 459000.00,
      "thisMonth": 84500.00,
      "currency": "INR"
    },
    "computedAt": "2026-07-20T13:59:19.000Z"
  }
}
```

##### Failure — Session Missing (401 Unauthorized)

```json
{
  "success": false,
  "message": "Authentication required. Session expired.",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### 2. Organization Weekly Growth

`GET /api/v1/ops/overview/org-growth`

#### Purpose

Aggregates new organization registrations grouped by week over a configurable interval.

#### Request Parameters

| Parameter | Type    | Required | Default | Description                       |
| :----------| :--------| :---------| :--------| :----------------------------------|
| `weeks`   | integer | No       | `12`    | Number of past weeks to aggregate |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization growth points retrieved.",
  "data": [
    { "week": "2026-W18", "count": 2 },
    { "week": "2026-W19", "count": 5 },
    { "week": "2026-W20", "count": 8 }
  ]
}
```

---

### 3. Upcoming Contests Schedule

`GET /api/v1/ops/overview/upcoming-contests`

#### Purpose

Lists upcoming published contests scheduled to start within the specified time window.

#### Request Parameters

| Parameter | Type    | Required | Default | Description                            |
| :----------| :--------| :---------| :--------| :---------------------------------------|
| `days`    | integer | No       | `7`     | Days ahead to filter upcoming contests |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Upcoming contests retrieved.",
  "data": [
    {
      "id": "cnt_89412",
      "title": "National Level Quiz Championship 2026",
      "organizationName": "TechEdu Institute",
      "startTime": "2026-07-22T10:00:00.000Z",
      "participantCount": 420
    }
  ]
}
```

---

### 4. Recently Registered Organizations

`GET /api/v1/ops/overview/recent-orgs`

#### Purpose

Lists the latest registered tenant organizations for quick access on the operator home view.

#### Request Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | integer | No | `5` | Maximum items to return |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Recent organizations retrieved.",
  "data": [
    {
      "id": "org_01HJ8E9234857239485723",
      "name": "Apex Academy",
      "slug": "apex-academy",
      "createdAt": "2026-07-19T14:22:10.000Z",
      "ownerEmail": "director@apex.edu"
    }
  ]
}
```

---

## Organization Control Plane APIs

### 5. List Organizations Directory

`GET /api/v1/ops/organizations`

#### Purpose

Provides a paginated list of organizations with search filters, status criteria, and aggregated counts.

#### Request Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | integer | No | `1` | Page number |
| `limit` | integer | No | `10` | Page size |
| `search` | string | No | — | Partial match filter against name or slug |
| `status` | string | No | `all` | `all`, `active`, `suspended`, or `deleted` |
| `planSlug` | string | No | — | Filter by assigned plan slug |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organizations directory retrieved.",
  "data": {
    "data": [
      {
        "id": "org_01HJ8E9234857239485723",
        "name": "Apex Academy",
        "slug": "apex-academy",
        "ownerEmail": "director@apex.edu",
        "memberCount": 4,
        "contestCount": 12,
        "participantCount": 1250,
        "status": "ACTIVE",
        "plan": {
          "slug": "growth",
          "name": "Growth",
          "status": "ACTIVE"
        },
        "createdAt": "2026-07-19T14:22:10.000Z"
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 10
  }
}
```

---

### 6. Get Organization Profile Details

`GET /api/v1/ops/organizations/:orgId`

#### Purpose

Fetches comprehensive profile details for an organization, including current plan entitlements, onboarding state, and open suspension reasons if suspended.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization profile retrieved.",
  "data": {
    "id": "org_01HJ8E9234857239485723",
    "name": "Apex Academy",
    "slug": "apex-academy",
    "logoUrl": "https://api.dicebear.com/7.x/initials/svg?seed=Apex%20Academy&backgroundColor=0d9488",
    "website": "https://apex-academy.com",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-07-19T14:22:10.000Z",
    "ownerName": "Rajesh Kumar",
    "ownerEmail": "director@apex.edu",
    "memberCount": 4,
    "contestCount": 12,
    "participantCount": 1250,
    "onboardingStep": "COMPLETED",
    "onboardingCompleted": true,
    "plan": {
      "slug": "growth",
      "name": "Growth",
      "status": "ACTIVE"
    },
    "suspension": null
  }
}
```

##### Failure — Organization Not Found (404 Not Found)

```json
{
  "success": false,
  "message": "Organization not found",
  "error": {
    "code": "NOT_FOUND",
    "details": null
  }
}
```

---

### 7. Organization Members Roster

`GET /api/v1/ops/organizations/:orgId/members`

#### Purpose

Returns the list of administrator accounts associated with the specified organization.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization member roster retrieved.",
  "data": [
    {
      "id": "om_01HJ992",
      "adminId": "adm_88123",
      "name": "Rajesh Kumar",
      "email": "director@apex.edu",
      "role": "Owner",
      "joinedDate": "2026-07-19T14:22:10.000Z"
    }
  ]
}
```

---

### 8. Organization Contests List

`GET /api/v1/ops/organizations/:orgId/contests`

#### Purpose

Retrieves all contests created under the specified organization along with revenue collections per quiz.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization contest list retrieved.",
  "data": [
    {
      "id": "cnt_99812",
      "title": "Summer Math Challenge",
      "slug": "summer-math-challenge",
      "status": "COMPLETED",
      "startTime": "2026-07-10T10:00:00.000Z",
      "duration": 60,
      "registrationFee": 100.00,
      "participantCount": 150,
      "revenueCollected": 15000.00,
      "createdAt": "2026-07-01T08:00:00.000Z"
    }
  ]
}
```

---

### 9. Organization Participant Register

`GET /api/v1/ops/organizations/:orgId/participants`

#### Purpose

Fetches student/participant registrations associated with contests in this organization.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization participant register retrieved.",
  "data": [
    {
      "id": "part_88123",
      "registrationRef": "REF-88123",
      "firstName": "Ananya",
      "lastName": "Sharma",
      "email": "ananya@example.com",
      "phone": "+91 98765 43210",
      "status": "SUBMITTED",
      "paymentStatus": "PAID",
      "paymentAmount": 100.00,
      "registeredAt": "2026-07-05T12:00:00.000Z"
    }
  ]
}
```

---

### 10. Organization Payments History

`GET /api/v1/ops/organizations/:orgId/payments`

#### Purpose

Lists all successful payment transactions generated by quiz fees or subscription payments for this tenant.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization payment logs retrieved.",
  "data": [
    {
      "id": "pay_991823",
      "source": "contest_fee",
      "referenceId": "pay_rzp_live_881923",
      "payeeName": "Ananya Sharma",
      "description": "Quiz Entry Fee: Summer Math Challenge",
      "amount": 100.00,
      "status": "PAID",
      "paymentMethod": "UPI",
      "date": "2026-07-05T12:01:00.000Z"
    }
  ]
}
```

---

### 11. Support Notes (List & Add)

#### `GET /api/v1/ops/organizations/:orgId/notes`

Retrieves internal support notes logged by platform operators for this organization.

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization operator notes retrieved.",
  "data": [
    {
      "id": "note_01HJ8E4T",
      "organizationId": "org_01HJ8E9234857239485723",
      "authorId": "admin_01HJ8E4TY9Q5X5M3K8E4TY9Q5X",
      "authorName": "Super Admin",
      "body": "Contacted owner regarding participant capacity increase.",
      "tags": ["Support", "Capacity"],
      "createdAt": "2026-07-20T11:00:00.000Z"
    }
  ]
}
```

#### `POST /api/v1/ops/organizations/:orgId/notes`

Appends a new internal operator note to the organization profile and logs audit `org.note_added`.

##### Request Body

```json
{
  "body": "Requested billing statement for annual plan upgrade.",
  "tags": ["Billing", "Upgrade"]
}
```

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Support note logged successfully.",
  "data": {
    "id": "note_01HJ8E4T_NEW",
    "organizationId": "org_01HJ8E9234857239485723",
    "authorId": "admin_01HJ8E4TY9Q5X5M3K8E4TY9Q5X",
    "authorName": "Super Admin",
    "body": "Requested billing statement for annual plan upgrade.",
    "tags": ["Billing", "Upgrade"],
    "createdAt": "2026-07-20T13:59:19.000Z"
  }
}
```

---

### 12. Suspend Organization

`POST /api/v1/ops/organizations/:orgId/suspend`

#### Purpose

Restricted to `SUPER_ADMIN`. Enforces `isActive = false` on the main application database, creates an `OrganizationSuspension` record in `quizbuzz_ops`, and logs audit `org.suspended`.

#### Request Body

```json
{
  "reason": "Violation of terms: Unauthorized automated contest generation."
}
```

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization suspended successfully.",
  "data": null
}
```

##### Failure — Insufficient Permissions (403 Forbidden)

```json
{
  "success": false,
  "message": "Access denied. Action requires role: SUPER_ADMIN",
  "error": {
    "code": "FORBIDDEN",
    "details": null
  }
}
```

##### Failure — Already Suspended (400 Bad Request)

```json
{
  "success": false,
  "message": "Organization is already suspended",
  "error": {
    "code": "BAD_REQUEST",
    "details": null
  }
}
```

---

### 13. Reactivate Organization

`POST /api/v1/ops/organizations/:orgId/reactivate`

#### Purpose

Restricted to `SUPER_ADMIN`. Enforces `isActive = true` on the main application database, marks open suspensions as lifted in `quizbuzz_ops`, and logs audit `org.reactivated`.

#### Request Body

```json
{
  "reason": "Policy compliance confirmed following administrative review."
}
```

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Organization reactivated successfully.",
  "data": null
}
```

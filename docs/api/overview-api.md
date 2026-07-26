# Overview API Specification

The Overview API domain provides executive metrics, top-level platform statistics, org growth trends, upcoming contest schedules, and recent organization registrations across the platform.

---

## Base Path
`/api/v1/ops/overview`

---

## Endpoints

### 1. Platform Statistics Overview
`GET /api/v1/ops/overview/stats`

- **Purpose**: Retrieve top-level platform KPI counts including organizations, contests, participants, and revenue metrics.
- **Description**:
  Executes aggregated queries against PostgreSQL databases to compute real-time system tallies.
  Includes organization breakdown by status, contest status distribution, total participant registrations, and month/all-time revenue metrics.

#### Request Parameters
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
    "organizations": {
      "total": 142,
      "active": 128,
      "suspended": 11,
      "deleted": 3
    },
    "contests": {
      "total": 850,
      "byStatus": {
        "DRAFT": 45,
        "PUBLISHED": 120,
        "ONGOING": 15,
        "COMPLETED": 670
      }
    },
    "participants": {
      "total": 54200
    },
    "revenue": {
      "allTime": 2450000,
      "thisMonth": 320000,
      "currency": "INR"
    },
    "computedAt": "2026-07-26T11:46:16.000Z"
  },
  "message": "Overview stats retrieved successfully."
}
```

##### Failure States
- **`401 Unauthorized`**: Authentication missing or expired operator session token.
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication token missing or invalid."
  }
}
```
- **`500 Internal Server Error`**: Database aggregation failure.
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An error occurred while fetching platform stats."
  }
}
```

---

### 2. Organization Growth Metrics
`GET /api/v1/ops/overview/org-growth`

- **Purpose**: Fetch weekly organization registration counts over a specified lookback timeframe.
- **Description**:
  Groups organization registration dates into weekly time buckets to produce line-chart growth data points.
  Supports an optional `weeks` query parameter (defaulting to 12 weeks lookback).

#### Request Parameters
- **Query Parameters**:
  - `weeks` (number, optional, default: 12) - Number of historical weeks to aggregate.
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    { "week": "2026-W20", "count": 8 },
    { "week": "2026-W21", "count": 12 },
    { "week": "2026-W22", "count": 15 },
    { "week": "2026-W23", "count": 11 }
  ],
  "message": "Organization growth points retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Missing session.
- **`400 Bad Request`**: Non-numeric value supplied for `weeks`.

---

### 3. Upcoming Contests Schedule
`GET /api/v1/ops/overview/upcoming-contests`

- **Purpose**: Retrieve a list of scheduled contests starting within the upcoming time window.
- **Description**:
  Queries the main application database for contests with `startTime` falling within the specified `days` window.
  Returns contest titles, parent organization names, scheduled start timestamps, and participant count.

#### Request Parameters
- **Query Parameters**:
  - `days` (number, optional, default: 7) - Lookahead period in days.
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "cnt_9981",
      "title": "National Math Championship 2026",
      "organizationName": "Apex Education Foundation",
      "startTime": "2026-07-28T09:00:00.000Z",
      "participantCount": 1250
    }
  ],
  "message": "Upcoming contests retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Missing session token.
- **`500 Internal Server Error`**: Database query failure.

---

### 4. Recent Organization Registrations
`GET /api/v1/ops/overview/recent-orgs`

- **Purpose**: List the most recently registered organizations on the platform.
- **Description**:
  Fetches newly onboarded organization profiles ordered by creation timestamp descending.
  Enables platform administrators to quickly monitor new tenant activity and owner emails.

#### Request Parameters
- **Query Parameters**:
  - `limit` (number, optional, default: 5) - Maximum number of records to return.
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "org_4412",
      "name": "St. Xavier Academy",
      "slug": "st-xavier-academy",
      "createdAt": "2026-07-25T14:22:10.000Z",
      "ownerEmail": "admin@stxavier.edu"
    }
  ],
  "message": "Recent organizations retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Authentication missing or invalid.
- **`500 Internal Server Error`**: Unable to query organization registry.

# Contest Booking & Pricing Calculator API Specification

The Contest Booking & Pricing Calculator API manages high-concurrency contest infrastructure quotes, custom add-on pricing rules, calculation breakdown estimations, and end-to-end booking lifecycles (`QUOTED` → `PAID` → `PROVISIONED` → `COMPLETED` / `CANCELLED`) with automatic billing ledger synchronization.

**Last checked:** 2026-11-08 (`feature/subscriptions`). A booking is an **Event Pass**: it charges the Event Pass price (`lib/pricing/event-pass.ts`, the same formula as the public quote in `billing-portal-api.md` §10) and, once provisioned, raises the org's limits for the event.

---

## Base Path
`/api/v1/ops/bookings`

---

## Authentication & Authorization
All endpoints require a valid Ops Admin session cookie (`ops_session`). Role access control is enforced at the controller level:
- **Read Operations**: every ops role (`SUPER_ADMIN`, `BILLING_ADMIN`, `SUPPORT`).
- **Write / Mutation Operations**: `SUPER_ADMIN` and `BILLING_ADMIN`.

---

## Endpoints

### 1. Get Pricing Engine Configuration
`GET /api/v1/ops/bookings/pricing-config`

- **Purpose**: Retrieve active platform pricing parameters and add-on cost structures used by the estimate calculator.
- **Access**: All Admin Roles

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "pricing_default",
    "currency": "INR",
    "baseBookingFee": 5000,
    "perParticipantCost": 2.5,
    "perQuestionCost": 10,
    "perInstanceHourCost": 45,
    "participantsPerInstance": 1000,
    "elastiCachePerDayCost": 150,
    "addOns": {
      "proctoring": { "enabled": true, "flatCost": 3500 },
      "certificates": { "enabled": true, "perParticipantCost": 1.5 },
      "prioritySupport": { "enabled": true, "flatCost": 2000 }
    },
    "marginMultiplier": 1.35,
    "updatedAt": "2026-07-29T12:00:00.000Z",
    "updatedByAdminName": "Rajesh Sharma"
  },
  "message": "Pricing configuration retrieved successfully."
}
```

---

### 2. Update Pricing Engine Configuration
`PUT /api/v1/ops/bookings/pricing-config`

- **Purpose**: Update platform base rates, capacity formulas, add-on costs, or margin multipliers.
- **Access**: `SUPER_ADMIN`, `BILLING_ADMIN`
- **Audit Event**: `pricing_config.updated`

#### Request Body
```json
{
  "baseBookingFee": 5000,
  "perParticipantCost": 2.5,
  "perQuestionCost": 10,
  "perInstanceHourCost": 45,
  "participantsPerInstance": 1000,
  "elastiCachePerDayCost": 150,
  "addOns": {
    "proctoring": { "enabled": true, "flatCost": 3500 },
    "certificates": { "enabled": true, "perParticipantCost": 1.5 },
    "prioritySupport": { "enabled": true, "flatCost": 2000 }
  },
  "marginMultiplier": 1.35
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "pricing_default",
    "currency": "INR",
    "baseBookingFee": 5000,
    "perParticipantCost": 2.5,
    "perQuestionCost": 10,
    "perInstanceHourCost": 45,
    "participantsPerInstance": 1000,
    "elastiCachePerDayCost": 150,
    "addOns": {
      "proctoring": { "enabled": true, "flatCost": 3500 },
      "certificates": { "enabled": true, "perParticipantCost": 1.5 },
      "prioritySupport": { "enabled": true, "flatCost": 2000 }
    },
    "marginMultiplier": 1.35,
    "updatedAt": "2026-07-29T12:05:00.000Z",
    "updatedByAdminName": "Super Admin"
  },
  "message": "Pricing configuration updated successfully."
}
```

---

### 3. List Contest Bookings
`GET /api/v1/ops/bookings`

- **Purpose**: Search, filter, and paginate through contest bookings and custom infrastructure quotes.
- **Access**: All Admin Roles

#### Request Query Parameters
- `page` (number, default: 1) - Page number.
- `limit` (number, default: 20) - Items per page.
- `status` (`all` | `quoted` | `paid` | `provisioned` | `completed` | `cancelled`, default: `all`) - Booking status filter.
- `search` (string, optional) - Search filter by contest name, organization name, or booking ID.

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "booking_cm659a10x0001",
        "status": "quoted",
        "organizationId": "org_1",
        "organizationName": "TechTutors Academy",
        "organizationEmail": "rahul.sharma@techtutors.in",
        "contestName": "All India Coding Challenge 2026",
        "durationMinutes": 120,
        "questionCount": 40,
        "participantCount": 2500,
        "addOnsSelected": {
          "proctoring": true,
          "certificates": false,
          "prioritySupport": true
        },
        "pricingBreakdown": {
          "baseFee": 5000,
          "computeCost": 270,
          "cacheCost": 150,
          "questionCost": 400,
          "addOnsCost": 5500,
          "subtotal": 11320,
          "margin": 3962,
          "total": 15282
        },
        "desiredStartTime": "2026-08-15T10:00:00.000Z",
        "quotedAt": "2026-07-29T12:00:00.000Z",
        "paidAt": null,
        "provisionedAt": null,
        "cancelledAt": null,
        "createdByAdminName": "Super Admin"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  },
  "message": "Contest bookings retrieved successfully."
}
```

---

### 4. Create Contest Booking Quote
`POST /api/v1/ops/bookings`

- **Purpose**: Calculate and persist a new contest infrastructure booking quote for an existing organization or new prospective customer.
- **Access**: `SUPER_ADMIN`, `BILLING_ADMIN`
- **Audit Event**: `booking.created`

#### Request Body
```json
{
  "orgMode": "existing",
  "organizationId": "org_1",
  "organizationName": "TechTutors Academy",
  "organizationEmail": "rahul.sharma@techtutors.in",
  "contestName": "National Aptitude Mock 2026",
  "durationMinutes": 90,
  "questionCount": 50,
  "participantCount": 5000,
  "addOnsSelected": {
    "proctoring": true,
    "certificates": true,
    "prioritySupport": true
  },
  "desiredStartTime": "2026-09-01T09:00:00.000Z"
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "data": {
    "id": "booking_cm659b20y0002",
    "status": "quoted",
    "organizationId": "org_1",
    "organizationName": "TechTutors Academy",
    "organizationEmail": "rahul.sharma@techtutors.in",
    "contestName": "National Aptitude Mock 2026",
    "durationMinutes": 90,
    "questionCount": 50,
    "participantCount": 5000,
    "addOnsSelected": {
      "proctoring": true,
      "certificates": true,
      "prioritySupport": true
    },
    "pricingBreakdown": {
      "baseFee": 5000,
      "computeCost": 675,
      "cacheCost": 150,
      "questionCost": 500,
      "addOnsCost": 13000,
      "subtotal": 19325,
      "margin": 6763.75,
      "total": 39998,
      "costFloor": 26088.75,
      "eventPass": { "participants": 5000, "basePrice": 34999, "engineerPrice": 4999, "price": 39998, "gst": 7199.64, "total": 47197.64, "…": "…" }
    },
    "desiredStartTime": "2026-09-01T09:00:00.000Z",
    "quotedAt": "2026-07-29T12:10:00.000Z",
    "paidAt": null,
    "provisionedAt": null,
    "cancelledAt": null,
    "createdByAdminName": "Super Admin"
  },
  "message": "Contest booking quote created successfully."
}
```

#### Pricing
- `pricingBreakdown.total` is what the booking charges: the **Event Pass price** before GST (`eventPass.price`). `addOnsSelected.prioritySupport` adds the engineer-on-the-day add-on.
- `costFloor` is the older cost-plus total (base fee, compute, cache, questions, add-ons and margin from the pricing config). It stays so ops can see when a price is below our cost; the calculator warns "below the cost floor".
- The pricing config (§1–2) now only drives the cost floor.

---

### 5. Get Booking Details
`GET /api/v1/ops/bookings/[id]`

- **Purpose**: Retrieve full breakdown metrics and execution metadata for a specific booking.
- **Access**: All Admin Roles

#### Path Parameters
- `id` (string, required) - Booking ID.

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "booking_cm659b20y0002",
    "status": "quoted",
    "organizationId": "org_1",
    "organizationName": "TechTutors Academy",
    "organizationEmail": "rahul.sharma@techtutors.in",
    "contestName": "National Aptitude Mock 2026",
    "durationMinutes": 90,
    "questionCount": 50,
    "participantCount": 5000,
    "addOnsSelected": {
      "proctoring": true,
      "certificates": true,
      "prioritySupport": true
    },
    "pricingBreakdown": {
      "baseFee": 5000,
      "computeCost": 675,
      "cacheCost": 150,
      "questionCost": 500,
      "addOnsCost": 13000,
      "subtotal": 19325,
      "margin": 6763.75,
      "total": 26088.75
    },
    "desiredStartTime": "2026-09-01T09:00:00.000Z",
    "quotedAt": "2026-07-29T12:10:00.000Z",
    "paidAt": null,
    "provisionedAt": null,
    "cancelledAt": null,
    "createdByAdminName": "Super Admin"
  },
  "message": "Booking detail retrieved successfully."
}
```

---

### 6. Update Booking Status
`PATCH /api/v1/ops/bookings/[id]/status`

- **Purpose**: Advance booking lifecycle state (`quoted` → `paid` → `provisioned` → `completed` or `cancelled`).
- **Access**: `SUPER_ADMIN`, `BILLING_ADMIN`
- **Audit Event**: `booking.status_updated`
- **Side Effects**:
  - `paid`: generates an `OpsPayment` record in the billing ledger.
  - `provisioned`: **grants the Event Pass** (`server/features/bookings/event-pass-grants.ts`). The booking must be linked to an organization (`409` otherwise), and an org without a subscription is put on Free first. Limit overrides tagged with the booking's `bookingId` are added to the org, expiring **30 days** after the event start (or now, if that's later), and only where the event needs more than the org already has:
    - `maxParticipantsPerContest` and `maxQuestionsPerContest` raised to the booking's counts (`ABSOLUTE`);
    - `maxContestsPerCycle` +2 (`ADDITIVE`), unless already unlimited;
    - `featureProctoring`, `featureCertBranding`, `featureAnalyticsExport` turned on where the plan lacks them.
    The main app's cache is refreshed, and the grant is recorded as `booking.limits_granted`. Provisioning twice adds nothing.
  - `cancelled`: removes every override the booking granted (reason: "Booking cancelled: …"), and refreshes the cache.

#### Request Body
```json
{
  "status": "paid",
  "paymentMethod": "Razorpay",
  "paymentReference": "pay_O1928371029"
}
```
For `cancelled`, send `cancellationReason`.

> Revenue share instead of payment (`payOption`, `commissionPercent`, `contestId` on the booking) is **on hold**. Those columns exist but are unused.

#### Status Transition Rules
- `quoted` → `paid` or `cancelled`
- `paid` → `provisioned` or `cancelled`
- `provisioned` → `completed` or `cancelled`
- Terminal states (`completed`, `cancelled`) cannot be modified further.

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "booking_cm659b20y0002",
    "status": "paid",
    "organizationId": "org_1",
    "organizationName": "TechTutors Academy",
    "contestName": "National Aptitude Mock 2026",
    "paymentMethod": "Razorpay",
    "paymentReference": "pay_O1928371029",
    "paidAt": "2026-07-29T12:15:00.000Z",
    "provisionedAt": null,
    "cancelledAt": null,
    "createdByAdminName": "Super Admin"
  },
  "message": "Booking status updated successfully."
}
```

---

## Error Responses

| Code | Status | Description |
|---|---|---|
| `400 Bad Request` | Validation Error | Payload failed Zod schema checks (e.g. invalid status, missing required fields). |
| `401 Unauthorized` | Unauthenticated | Session cookie missing or expired. |
| `403 Forbidden` | Access Denied | Admin role lacks permission to execute the action. |
| `404 Not Found` | Entity Missing | Specified booking ID or organization ID does not exist in PostgreSQL. |
| `409 Conflict` | Invalid State Transition | Requested status transition violates state machine rules. |
| `500 Internal Error` | Server Failure | Unhandled server or database error. |

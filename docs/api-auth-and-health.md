# QuizBuzz Ops — Authentication & Health API Documentation

## Domain Overview
This domain provides system health status monitoring and handles platform administrator authentication. The authentication mechanism utilizes a 2-step verification process (password credentials followed by a 6-digit numeric OTP) and issues secure, HTTPOnly session cookies (`ops_access_token` and `ops_refresh_token`).

All endpoints follow the standard platform response envelope:
- **Success:** `{ "success": true, "message": "...", "data": ... }`
- **Failure:** `{ "success": false, "message": "...", "error": { "code": "...", "details": ... } }`

---

## Endpoints

### 1. System Health Check
`GET /api/v1/ops/health`

#### Purpose
Verifies the operational status of the operational database (`quizbuzz_ops`) and the main read-only application database connection pool (`quizbuzz`).

#### Request Parameters
None.

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Ops system healthiest status confirmed.",
  "data": {
    "status": "healthy",
    "timestamp": "2026-07-20T13:59:19.000Z",
    "databases": {
      "opsDb": "connected",
      "mainDb": "connected"
    }
  }
}
```

##### Failure — Database Connection Degraded (503 Service Unavailable)
```json
{
  "success": false,
  "message": "Database connectivity check failed.",
  "error": {
    "code": "DATABASE_ERROR",
    "details": [
      {
        "database": "opsDb",
        "error": "Connection timed out after 5000ms"
      }
    ]
  }
}
```

---

### 2. Operator Login (Step 1: Credentials)
`POST /api/v1/ops/auth/login`

#### Purpose
Validates platform administrator corporate email and password. Upon successful validation, generates a 6-digit verification OTP dispatched to the operator.

#### Request Body
```json
{
  "email": "admin@ysmquizbuzz.com",
  "password": "YsmSecureOps2026!"
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Verification code has been dispatched.",
  "data": {
    "otpRequired": true,
    "email": "admin@ysmquizbuzz.com",
    "otpCode": "849201"
  }
}
```

##### Validation Error — Invalid Payload (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "email",
        "message": "Enter a valid corporate email address."
      }
    ]
  }
}
```

##### Failure — Invalid Credentials (401 Unauthorized)
```json
{
  "success": false,
  "message": "Invalid email credentials or account inactive.",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### 3. Verify OTP Code (Step 2: Session Establishment)
`POST /api/v1/ops/auth/verify-otp`

#### Purpose
Verifies the 6-digit numeric OTP code. On success, issues signed JWT access and refresh tokens, sets `ops_access_token` and `ops_refresh_token` HTTPOnly cookies, and returns the operator profile.

#### Request Body
```json
{
  "email": "admin@ysmquizbuzz.com",
  "otp": "849201"
}
```

#### Responses

##### Success (200 OK)
Sets `ops_access_token` and `ops_refresh_token` HTTPOnly cookies.
```json
{
  "success": true,
  "message": "Verification successful. Session established.",
  "data": {
    "admin": {
      "id": "admin_01HJ8E4TY9Q5X5M3K8E4TY9Q5X",
      "email": "admin@ysmquizbuzz.com",
      "name": "Super Admin",
      "role": "SUPER_ADMIN",
      "isActive": true
    }
  }
}
```

##### Failure — Incorrect or Expired OTP (401 Unauthorized)
```json
{
  "success": false,
  "message": "Invalid or expired verification code.",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### 4. Refresh Session Token
`POST /api/v1/ops/auth/refresh`

#### Purpose
Rotates the administrator access token using the active `ops_refresh_token` HTTPOnly cookie.

#### Request Parameters / Body
None (Reads `ops_refresh_token` cookie from request headers).

#### Responses

##### Success (200 OK)
Updates `ops_access_token` HTTPOnly cookie.
```json
{
  "success": true,
  "message": "Session credentials updated successfully.",
  "data": {
    "admin": {
      "id": "admin_01HJ8E4TY9Q5X5M3K8E4TY9Q5X",
      "email": "admin@ysmquizbuzz.com",
      "name": "Super Admin",
      "role": "SUPER_ADMIN"
    }
  }
}
```

##### Failure — Missing or Revoked Refresh Token (401 Unauthorized)
```json
{
  "success": false,
  "message": "Refresh token is missing or has been revoked.",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### 5. Operator Logout
`POST /api/v1/ops/auth/logout`

#### Purpose
Invalidates the current session refresh token in the database and clears the session cookies.

#### Request Parameters / Body
None.

#### Responses

##### Success (200 OK)
Clears `ops_access_token` and `ops_refresh_token` cookies.
```json
{
  "success": true,
  "message": "Administrator logged out successfully.",
  "data": null
}
```

---

### 6. Get Current Operator Profile (`/me`)
`GET /api/v1/ops/auth/me`

#### Purpose
Retrieves the logged-in administrator's profile and RBAC role.

#### Request Parameters
None (Requires `ops_access_token` cookie).

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Operator profile retrieved.",
  "data": {
    "id": "admin_01HJ8E4TY9Q5X5M3K8E4TY9Q5X",
    "email": "admin@ysmquizbuzz.com",
    "name": "Super Admin",
    "firstName": "Super",
    "lastName": "Admin",
    "role": "SUPER_ADMIN",
    "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&q=80"
  }
}
```

##### Failure — Unauthenticated (401 Unauthorized)
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

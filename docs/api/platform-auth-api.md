# Platform Auth API Specification

The Platform Auth API domain handles operator authentication, two-factor OTP verification, session token refreshes, operator identity retrieval (`me`), logout, and system health checks.

---

## Base Path
`/api/v1/ops/auth`

---

## Endpoints

### 1. Admin Login (Step 1 - Credentials Verification)
`POST /api/v1/ops/auth/login`

- **Purpose**: Authenticate platform admin email and password, and dispatch 2FA OTP code.
- **Description**:
  Verifies operator credentials against hashed passwords stored in `PlatformAdminUser`.
  Generates a 6-digit OTP code, stores it in session cache with a 10-minute expiration, and sends an email to the administrator.

#### Request Body
```json
{
  "email": "admin@quizbuzz.io",
  "password": "SecurePassword123!"
}
```

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "email": "admin@quizbuzz.io",
    "otpRequired": true,
    "expiresInSeconds": 600
  },
  "message": "Verification code has been dispatched."
}
```

##### Failure States
- **`400 Bad Request`**: Invalid email format or password under 6 characters.
- **`401 Unauthorized`**: Invalid credentials or suspended admin account.
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email address or password."
  }
}
```

---

### 2. Verify OTP & Establish Session (Step 2 - 2FA Verification)
`POST /api/v1/ops/auth/verify-otp`

- **Purpose**: Validate 6-digit OTP code and set HTTP-only authentication cookies.
- **Description**:
  Validates the submitted OTP code. Upon verification, generates JWT access token (30-min expiry) and refresh token (7-day expiry).
  Sets `ops_access_token` and `ops_refresh_token` HTTP-only cookies in the HTTP response headers.

#### Request Body
```json
{
  "email": "admin@quizbuzz.io",
  "otp": "492015"
}
```

#### Responses

##### Success State (`200 OK`)
Sets `Set-Cookie` header for `ops_access_token` and `ops_refresh_token`.
```json
{
  "success": true,
  "data": {
    "admin": {
      "id": "adm_9912",
      "email": "admin@quizbuzz.io",
      "name": "Austin Operations Admin",
      "role": "SUPER_ADMIN"
    }
  },
  "message": "Verification successful. Session established."
}
```

##### Failure States
- **`400 Bad Request`**: OTP is not exactly 6 digits.
- **`401 Unauthorized`**: Invalid or expired OTP code.

---

### 3. Session Refresh
`POST /api/v1/ops/auth/refresh`

- **Purpose**: Renew short-lived access token using valid HTTP-only refresh token.
- **Description**:
  Reads `ops_refresh_token` from request cookies, verifies signature and DB session validity, and sets a updated `ops_access_token` cookie.

#### Request Parameters
- **Headers**:
  - `Cookie`: Session containing `ops_refresh_token`.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "admin": {
      "id": "adm_9912",
      "email": "admin@quizbuzz.io",
      "name": "Austin Operations Admin",
      "role": "SUPER_ADMIN"
    }
  },
  "message": "Session credentials updated successfully."
}
```

##### Failure States
- **`401 Unauthorized`**: Refresh token missing or expired.

---

### 4. Get Current Operator Profile (`me`)
`GET /api/v1/ops/auth/me`

- **Purpose**: Retrieve current logged-in administrator's profile details and role permissions.
- **Description**:
  Reads session token, resolves operator details from DB, and formats identity fields (first name, last name, email, avatar URL, role).

#### Request Parameters
- **Headers**:
  - `Cookie`: Session containing `ops_access_token`.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "adm_9912",
    "email": "admin@quizbuzz.io",
    "name": "Austin Operations Admin",
    "firstName": "Austin",
    "lastName": "Operations Admin",
    "role": "SUPER_ADMIN",
    "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&q=80"
  },
  "message": "Operator profile retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Missing or invalid session token.

---

### 5. Admin Logout
`POST /api/v1/ops/auth/logout`

- **Purpose**: Invalidate operator refresh session and clear authentication cookies.
- **Description**:
  Deletes refresh session record from database and sets response cookie headers to clear `ops_access_token` and `ops_refresh_token`.

#### Request Body
None.

#### Responses
```json
{
  "success": true,
  "data": null,
  "message": "Administrator logged out successfully."
}
```

---

### 6. System Health Check
`GET /api/v1/ops/health` or `GET /api/health`

- **Purpose**: Return server, database, and Redis connectivity health status.
- **Description**:
  Executes heartbeat pings against Ops Prisma DB, Main PostgreSQL DB pool, and Redis cache. Returns overall health state.

#### Responses
```json
{
  "status": "healthy",
  "timestamp": "2026-07-26T11:48:49.000Z",
  "services": {
    "opsDb": "connected",
    "mainDb": "connected",
    "redis": "connected"
  }
}
```

# Node.js Authentication Layer Documentation

## Overview

The Node.js Authentication Layer adds a secure, session-based login mechanism to the previously open `server.js`. It is designed to be **optional** initially (via a toggle) to prevent breaking existing POS and Legacy functionality.

## Configuration

### `GLOBAL_AUTH_ENABLED`

- **Location:** `src/server.js` (Top-level constants)
- **Type:** `Boolean`
- **Default:** `false`
- **Description:**
  - `false`: The `authenticateRequest` middleware immediately returns a "system" user, bypassing all checks. POS and all endpoints work as before.
  - `true`: The middleware strictly checks for a valid Session Token in Cookies or Authorization Header. Unauthenticated requests receive `401 Unauthorized` (except for whitelisted public routes).

### Session Storage

- **Type:** In-Memory `Map` (`SESSIONS`)
- **TTL:** 24 Hours
- **Cookie Name:** `mishkah_session`
- **Cookie Attributes:** `HttpOnly`, `Path=/`, `SameSite=Lax`

## Endpoints (`/api/v1/auth/*`)

### 1. Login

**POST** `/api/v1/auth/login`

Authenticates a user against `sys_users` (Enterprise) or `users` (Legacy) and creates a session.

**Request Body:**

```json
{
  "username": "user1",
  "password": "password123",
  "branch_id": "pt" // Optional, defaults to path context
}
```

**Response (200 OK):**

```json
{
  "ok": true,
  "token": "sess-...",
  "user": {
    "user_id": "uuid...",
    "username": "user1",
    "role": "manager",
    "default_branch_id": "pt"
  }
}
```

**Headers:**

- `Set-Cookie: mishkah_session=sess-...; ...`

---

### 2. Logout

**POST** `/api/v1/auth/logout`

Destroys the current session and clears the cookie.

**Response (200 OK):**

```json
{
  "ok": true
}
```

---

### 3. Get Current User (Me)

**GET** `/api/v1/auth/me`

Returns the currently authenticated user context (mocked if Auth is disabled).

**Response (200 OK):**

```json
{
  "user": {
    "user_id": "uuid...",
    "username": "user1",
    "is_guest": false
  }
}
```

## Middleware Strategy

### `authenticateRequest(req)`

This function is injected at the top of protected handlers (like `handleUniversalCrudApi`).

1. Checks `GLOBAL_AUTH_ENABLED`. If false, returns `{ user_id: 'system' }`.
2. Checks parsing of `Cookie: mishkah_session`.
3. Checks `Authorization: Bearer <token>`.
4. Validates token against in-memory `SESSIONS`.
5. Returns `user` object or `null`.

## Legacy Support

The endpoints `encrypt-username`, `decrypt-username`, and `hash-password` are preserved for backward compatibility with dev tools but should be secured or removed in production.

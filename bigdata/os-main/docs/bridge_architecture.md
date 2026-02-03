# Node.js <-> C++ Engine Bridge Architecture

## 1. Overview

This document outlines the communication protocol between the Node.js "Gateway" and the C++ "Deep Engine" (`QuranServ`). This architecture ensures high performance, data integrity, and unified error handling.

## 2. Core Concept: "The Delegate Pattern"

Node.js acts as the **Gatekeeper**. It handles:

* User Authentication
* Rate Limiting
* Request Validation
* Frontend Real-time Events (Socket.io)

C++ acts as the **Heavy Lifter**. It handles:

* Complex Validation logic (Business Rules)
* Database Transactions (ACID)
* High-performance Querying
* Schema enforcement

**Crucial Rule:** Node.js should **NEVER** write directly to "Enterprise" tables (e.g., `fin_journal_headers`) if the C++ engine is active. It must delegate the write operation to the C++ engine to ensure business rules are applied.

## 3. Communication Protocol (HTTP/RPC)

We will use internal, high-speed HTTP/REST calls over `localhost`.

* **Node.js Endpoint**: `http://127.0.0.1:3000` (Public/Frontend)
* **C++ Endpoint**: `http://127.0.0.1:8080` (Internal/Private)

### Request Format (Node -> C++)

```json
POST /rpc/execute
{
  "module": "finance",
  "action": "post_journal",
  "context": {
    "user_id": "u_admin",
    "branch_id": "peg_hq",
    "lang": "ar"
  },
  "payload": {
    "date": "2025-01-01",
    "lines": [...]
  }
}
```

### Response Format (C++ -> Node)

**Success:**

```json
{
  "ok": true,
  "data": { "journal_id": "uuid...", "status": "POSTED" },
  "performance_ms": 12
}
```

**Business Error:**

```json
{
  "ok": false,
  "error": {
    "code": "FISCAL_PERIOD_CLOSED",
    "message": "لا يمكن الترحيل في فترة مالية مغلقة",
    "details": { "period_id": "..." }
  }
}
```

## 4. Synchronization Machine

Since both systems share the **Same Data Source** (`os/data` + Database), "Synchronization" is mainly about **Cache Validation** and **Notifications**.

### A. Posting (Write Operations)

1. User clicks "Save" -> Node.js.
2. Node.js forwards payload to C++.
3. C++ validates & commits to DB.
4. C++ returns new Record ID.
5. Node.js returns success to User.

## 4.1 The Draft vs. Posted Strategy (CQRS-Lite)

This is the recommended architectural pattern to balance User Experience (UX) with Data Integrity.

| State | Storage Engine | Characteristics |
| :--- | :--- | :--- |
| **Draft** | **SQLite (Node.js)** | Fast, Offline-capable, Flexible validation, Auto-save supported. |
| **Posted** | **C++ Engine** | Generic ACID compliance, Strict Schema validation, Permanent, Auditable. |

**Workflow:**

1. **Drafting**: User creates an Invoice. Node.js saves it to `fin_invoices_draft` (SQLite). No C++ involvement.
2. **Review**: User edits the draft freely.
3. **Posting**: User clicks "Confirm/Post".
    * Node.js reads the Draft from SQLite.
    * Node.js sends the *Clean Data* electronically to C++ Bridge (`/rpc/finance/post_invoice`).
    * C++ validates rules (Stock, Credit Limit, etc.).
    * **Success**: C++ writes to `fin_invoices` (Permanent DB) and returns the official ID.
    * **Cleanup**: Node.js deletes the Draft from SQLite (or marks it as converted).
4. **Reading**:
    * *Recent/Active* work: Read from Node.js Cache/SQLite.
5. **Drafting**: User creates an Invoice. Node.js saves it to `fin_invoices_draft` (SQLite). No C++ involvement.
6. **Review**: User edits the draft freely.
7. **Posting**: User clicks "Confirm/Post".
    * Node.js reads the Draft from SQLite.
    * Node.js sends the *Clean Data* electronically to C++ Bridge (`/rpc/finance/post_invoice`).
    * C++ validates rules (Stock, Credit Limit, etc.).
    * **Success**: C++ writes to `fin_invoices` (Permanent DB) and returns the official ID.
    * **Cleanup**: Node.js deletes the Draft from SQLite (or marks it as converted).
8. **Reading**:
    * *Recent/Active* work: Read from Node.js Cache/SQLite.
    * *Reports/History*: Read from C++ Query Engine.

### B. Error Discovery

* **Validation Errors**: Returned immediately by C++ with specific codes.
* **System Errors (Crash/Timeout)**:
  * Node.js wraps the call in a "Circuit Breaker".
  * If C++ doesn't respond in 2s, Node.js returns "Service Unavailable" and logs the incident.
  * Administrator receives an alert.

## 4.2 The Smart Routing Mechanism (Transparent Proxy)

To answer "How does the Frontend know where to send data?", the answer is: **It doesn't need to know.**

We use a **Status-Based Routing** strategy in Node.js.

### 1. Unified Endpoint

The frontend always calls the same endpoint:
`POST /api/modules/:module/:table/save`

### 2. The Auto-Router Logic (Node.js)

When a request arrives, `EngineBridge` checks two things:

1. **Module Config** (from `modules.json`): Is `engine: "cpp"`?
2. **Record Status** (from Payload): Is `status: "POSTED"` (or equivalent)?
3. **Module Config** (from `modules.json`): Is `engine: "cpp"`?
4. **Record Status** (from Payload): Is `status: "POSTED"` (or equivalent)?

#### Logic Flow

```javascript
if (moduleConfig.engine === 'cpp') {
   if (payload.status === 'POSTED') {
       // ROUTE A: Send to C++ Bridge (Archiving)
       const result = await executeEngine(module, 'post', payload);
       
       // CRITICAL: Cleanup Draft (Archiving Strategy)
       // We DELETE the record from SQLite because it has moved to the "Permanent Store" (C++).
       // This ensures strict separation: "Live" data in SQLite, "Archived" data in C++.
       if (result.ok) {
           await sqlite.delete(table + '_draft', { id: payload.id });
           await sqlite.delete(table, { id: payload.id }); // Ensure cleanup
       }
       
       return result; 
   } else {
       // ROUTE B: Save to Local SQLite (Drafts/Live)
       return await sqlite.save(table, payload);
   }
} else {
   // ROUTE C: Regular Legacy Module (Clinic/POS)
   // Remains 100% on SQLite/Nodes for Full Real-Time WS support.
   return await sqlite.save(table, payload);
}
```

### 3. Advantages

* **Safety for POS**: Legacy modules like POS remain untouched, ensuring critical Real-Time WebSocket/Kitchen functionality works exactly as before.
* **Memory Efficiency**: Enterprise modules (Finance/Security) delegate READs/WRITEs to C++, preventing Node.js RAM overload.
* **Clear Separation**: A record exists EITHER in SQLite (Live/Draft) OR in C++ (Posted/Archived), never both. This prevents synchronization nightmares.
* **Future Proof**: We can migrate modules to C++ one by one by changing `modules.json` and adding `engine: "cpp"`.

## 5. Implementation Strategy (`EngineBridge.js`)

We will create a module in Node.js `src/core/EngineBridge.js` that centralizes this logic:

```javascript
// Generic wrapper
async function executeEngine(module, action, payload, userContext) {
    // 1. Prepare Request
    // 2. Send to http://localhost:8080
    // 3. Handle Network Errors
    // 4. Return Data or Throw formatted Error
}
```

## 6. Real-time Updates (Optional Phase 2)

If a heavy batch job finishes in C++, it can call a simple webhook on Node.js:
`POST http://localhost:3000/internal/notify -> Node.js emits Socket.io event to frontend.`

# Mishkah Store: Comprehensive System Documentation
# دليل نظام Mishkah Store الشامل

**Version:** 2.0
**Last Updated:** 2025-01-07
**Status:** Production-Ready (with noted limitations)

---

## 📋 Table of Contents / جدول المحتويات

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Core Technologies](#core-technologies)
4. [REST API Reference](#rest-api-reference)
5. [WebSocket Protocol](#websocket-protocol)
6. [Client SDKs](#client-sdks)
7. [Storage Layer](#storage-layer)
8. [Production Readiness Assessment](#production-readiness)
9. [Missing Features](#missing-features)
10. [Critical Improvements Needed](#critical-improvements)
11. [Comparison with Firebase](#firebase-comparison)
12. [Migration Guide](#migration-guide)
13. [Best Practices](#best-practices)

---

## <a name="executive-summary"></a>🎯 Executive Summary / ملخص تنفيذي

### What is Mishkah Store? / ما هو Mishkah Store؟

**Mishkah Store** is a **real-time, multi-protocol data synchronization system** designed for multi-branch POS and business applications. It combines:

- ✅ **REST API** for standard HTTP CRUD operations
- ✅ **WebSocket Protocol** for real-time bidirectional updates
- ✅ **Hybrid Storage** (In-Memory + SQLite + Event Sourcing)
- ✅ **IndexedDB Integration** for offline-first client applications
- ✅ **Smart Sync** with delta updates and conflict resolution
- ✅ **Multi-Branch Architecture** with isolated data per branch
- ✅ **Schema-Driven Development** with centralized schema definitions

نظام **Mishkah Store** هو نظام مزامنة بيانات **فوري متعدد البروتوكولات** مصمم لتطبيقات نقاط البيع والأعمال متعددة الفروع.

### Key Capabilities / القدرات الأساسية

| Capability | Status | Notes |
|------------|--------|-------|
| REST API (Full CRUD) | ✅ Production | 34+ endpoints with filtering, pagination |
| WebSocket Real-time Sync | ✅ Production | Bidirectional with auto-reconnect |
| IndexedDB Offline Storage | ✅ Production | Client-side persistence with cache |
| SQLite Server Storage | ✅ Production | Persistent server-side storage |
| In-Memory Cache | ✅ Production | Fast reads with TTL-based invalidation |
| Event Sourcing | ✅ Production | Complete audit trail |
| Optimistic Locking | ✅ Production | Version-based concurrency control |
| Delta Synchronization | ✅ Production | Incremental updates with cursors |
| Multi-Branch Support | ✅ Production | Isolated data per branch |
| Schema Validation | ✅ Production | Runtime type checking |
| Sequence Management | ✅ Production | Auto-increment with formatting |
| Transaction History | ✅ Production | Purge/restore with archival |
| Prometheus Metrics | ✅ Production | Performance monitoring |
| CORS Support | ✅ Production | Cross-origin requests |
| Authentication | ⚠️ Partial | WebSocket only, no REST auth |
| Authorization | ❌ Missing | No role-based access control |
| Query Language | ❌ Missing | Basic filtering only |
| Aggregations | ❌ Missing | No server-side aggregations |
| Transactions | ⚠️ Partial | Limited to event batching |
| Clustering | ❌ Missing | Single-node only |
| Replication | ❌ Missing | No multi-node sync |

---

## <a name="system-architecture"></a>🏗️ System Architecture / البنية المعمارية

### High-Level Architecture / البنية العامة

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                       │
│  (Browser, Mobile, Desktop - React, Vue, Svelte, etc.)         │
└────────────┬────────────────────────────┬───────────────────────┘
             │                            │
             │ REST API                   │ WebSocket
             │ (HTTP/HTTPS)               │ (WS/WSS)
             ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MISHKAH STORE SERVER                         │
│                       (Node.js + WS)                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  REST API    │  │  WebSocket   │  │   Metrics    │         │
│  │  Handler     │  │  Gateway     │  │  (Prom)      │         │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘         │
│         │                  │                                     │
│         └──────────┬───────┘                                     │
│                    ▼                                             │
│         ┌────────────────────────┐                              │
│         │   HybridStore Manager  │                              │
│         │  (Per Branch+Module)   │                              │
│         └────────┬───────────────┘                              │
│                  │                                               │
│     ┌────────────┼────────────┐                                 │
│     ▼            ▼            ▼                                 │
│  ┌────────┐  ┌──────────┐  ┌────────────┐                     │
│  │Memory  │  │ SQLite   │  │Event Store │                     │
│  │Cache   │  │Database  │  │(JSON Log)  │                     │
│  │(Fast)  │  │(Durable) │  │(Audit)     │                     │
│  └────────┘  └──────────┘  └────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
             │                            │
             │                            │
             ▼                            ▼
┌─────────────────────┐      ┌─────────────────────┐
│  Schema Engine      │      │ Sequence Manager    │
│  (Definition.json)  │      │ (Auto-increment)    │
└─────────────────────┘      └─────────────────────┘
```

### Data Flow / تدفق البيانات

#### Write Operation Flow

```
Client (REST/WS)
    → Validate Schema
    → Optimistic Lock Check
    → Write to Memory Cache
    → Persist to SQLite
    → Append to Event Log
    → Broadcast to WebSocket Clients
    → Update IndexedDB (Client)
```

#### Read Operation Flow

```
Client Request
    → Check Memory Cache (TTL)
    → [If expired] Load from SQLite
    → Apply transformations
    → Return JSON Response
```

#### Real-time Sync Flow

```
Client Connects (WebSocket)
    → Send client:hello
    → Server sends server:snapshot (full state)
    → Client stores in IndexedDB
    → [Later] Client sends mutations
    → Server broadcasts server:event (delta)
    → All clients update local state
```

---

## <a name="core-technologies"></a>⚙️ Core Technologies / التقنيات الأساسية

### Server-Side Stack / تقنيات الخادم

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 16+ | Runtime environment |
| **WebSocket (ws)** | Latest | Real-time bidirectional communication |
| **SQLite** | 3.x | Persistent storage (via better-sqlite3) |
| **Express** | 4.x | REST API framework (implied, no explicit dependency) |
| **Prom-Client** | Latest | Prometheus metrics exporter |
| **Event Sourcing** | Custom | JSON-based append-only event log |

### Client-Side Stack / تقنيات العميل

| Technology | Purpose | File |
|------------|---------|------|
| **mishkah.store.js** | Core WebSocket client | `/static/lib/mishkah.store.js` |
| **mishkah.simple-store.js** | Simplified DSL wrapper | `/static/lib/mishkah.simple-store.js` |
| **mishkah-indexeddb.js** | IndexedDB adapter | `/static/lib/mishkah-indexeddb.js` |
| **pos-mini-db.js** | POS-specific SDK | `/static/pos/pos-mini-db.js` |

### Storage Layers / طبقات التخزين

1. **In-Memory Cache**
   - **Purpose:** Fast reads with sub-millisecond latency
   - **TTL:** Configurable (default: 1500ms)
   - **Invalidation:** Write-through + TTL expiration
   - **Limitations:** Single-node only (no distributed cache)

2. **SQLite Database**
   - **Purpose:** Durable server-side persistence
   - **Location:** `data/branches/{branchId}/modules/{moduleId}/sqlite/{table}.db`
   - **Schema:** Managed by SchemaEngine
   - **Limitations:** Single-writer (SQLite limitation)

3. **Event Log (JSON)**
   - **Purpose:** Audit trail + event sourcing
   - **Format:** Newline-delimited JSON (NDJSON)
   - **Location:** `data/branches/{branchId}/modules/{moduleId}/live/events.log`
   - **Rotation:** Daily rotation with archival
   - **Limitations:** No automatic compaction

4. **IndexedDB (Client)**
   - **Purpose:** Offline-first client storage
   - **API:** `MishkahIndexedDB.createAdapter()`
   - **Features:** Metadata tracking, cache invalidation, full/incremental sync
   - **Limitations:** Browser storage quotas (typically 50MB-unlimited)

---

## <a name="rest-api-reference"></a>🌐 REST API Reference / مرجع REST API

### Base URL

```
Production: https://{your-domain}/api
Development: http://localhost:3200/api
```

### Core Endpoints / النقاط الأساسية

#### 1. Health Check

```http
GET /healthz
```

**Response:**
```json
{
  "status": "ok",
  "serverId": "ws-abc123",
  "now": "2025-01-07T10:30:00.000Z"
}
```

---

#### 2. Get Branch Snapshot

```http
GET /branches/{branchId}
```

**Example:**
```bash
curl https://api.example.com/api/branches/dar
```

**Response:**
```json
{
  "branchId": "dar",
  "modules": {
    "pos": {
      "moduleId": "pos",
      "version": 1523,
      "tables": {
        "order_header": [...],
        "order_line": [...],
        "menu_item": [...]
      },
      "meta": {
        "lastUpdatedAt": "2025-01-07T10:30:00.000Z"
      }
    }
  }
}
```

---

#### 3. Get Module Snapshot

```http
GET /branches/{branchId}/modules/{moduleId}
```

**Example:**
```bash
curl https://api.example.com/api/branches/dar/modules/pos
```

**Query Parameters:**
- None

**Response:** Same as branch snapshot but only for the specified module

---

#### 4. List Table Records

```http
GET /branches/{branchId}/modules/{moduleId}/tables/{tableName}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Maximum records to return |
| `afterId` | string | Cursor for pagination (record ID) |
| `afterCreatedAt` | ISO date | Filter records created after timestamp |
| `updatedAfter` | ISO date | Filter records updated after timestamp |
| `order` | asc\|desc | Sort order (default: asc) |

**Example:**
```bash
curl "https://api.example.com/api/branches/dar/modules/pos/tables/order_header?limit=50&updatedAfter=2025-01-07T00:00:00Z"
```

**Response:**
```json
{
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_header",
  "count": 50,
  "cursor": {
    "lastId": "order-abc123",
    "lastCreatedAt": "2025-01-07T10:30:00.000Z"
  },
  "rows": [
    {
      "id": "order-001",
      "orderNumber": "ORD-12345",
      "status": "pending",
      "createdAt": "2025-01-07T10:00:00.000Z",
      "version": 1
    }
  ],
  "meta": {
    "limit": 50,
    "order": "asc",
    "updatedAfter": "2025-01-07T00:00:00.000Z"
  }
}
```

---

#### 5. Insert Record

```http
POST /branches/{branchId}/modules/{moduleId}/tables/{tableName}
Content-Type: application/json
```

**Request Body:**
```json
{
  "record": {
    "orderNumber": "ORD-12346",
    "status": "pending",
    "serviceMode": "dine_in",
    "tableLabel": "T5"
  },
  "meta": {
    "source": "pos-frontend",
    "userId": "user-123"
  }
}
```

**Response (201 Created):**
```json
{
  "status": "created",
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_header",
  "record": {
    "id": "order-abc124",
    "orderNumber": "ORD-12346",
    "status": "pending",
    "version": 1,
    "createdAt": "2025-01-07T10:35:00.000Z",
    "branchId": "dar"
  },
  "ack": {
    "eventId": "evt-xyz789",
    "sequence": 1524
  }
}
```

---

#### 6. Update Record (PATCH)

```http
PATCH /branches/{branchId}/modules/{moduleId}/tables/{tableName}
Content-Type: application/json
```

**Request Body:**
```json
{
  "record": {
    "id": "order-abc124",
    "status": "cooking",
    "version": 1
  }
}
```

**Response (200 OK):**
```json
{
  "status": "updated",
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_header",
  "record": {
    "id": "order-abc124",
    "orderNumber": "ORD-12346",
    "status": "cooking",
    "version": 2,
    "updatedAt": "2025-01-07T10:40:00.000Z"
  }
}
```

**Error (409 Conflict):**
```json
{
  "error": "version-conflict",
  "message": "Version conflict: Unable to update order (expected: 1, current: 2).",
  "details": {
    "table": "order_header",
    "key": "order-abc124",
    "expectedVersion": 1,
    "currentVersion": 2
  }
}
```

---

#### 7. Upsert Record (PUT/Save)

```http
PUT /branches/{branchId}/modules/{moduleId}/save
Content-Type: application/json
```

**Request Body:**
```json
{
  "table": "order_line",
  "record": {
    "id": "line-001",
    "orderId": "order-abc124",
    "itemId": "item-burger",
    "quantity": 2,
    "statusId": "queued",
    "version": 1
  },
  "includeRecord": true,
  "snapshotMarker": "sm-2025-01-07T10:40:00.000Z"
}
```

**Response:**
```json
{
  "status": "saved",
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_line",
  "record": {
    "id": "line-001",
    "orderId": "order-abc124",
    "itemId": "item-burger",
    "quantity": 2,
    "statusId": "queued",
    "version": 1,
    "createdAt": "2025-01-07T10:40:00.000Z"
  },
  "snapshotMarker": "sm-2025-01-07T10:40:00.500Z",
  "ack": {
    "eventId": "evt-xyz790",
    "sequence": 1525
  }
}
```

---

#### 8. Delete Record

```http
DELETE /branches/{branchId}/modules/{moduleId}/tables/{tableName}?id={recordId}
```

**Response (200 OK):**
```json
{
  "status": "deleted",
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_line",
  "recordRef": {
    "id": "line-001"
  },
  "ack": {
    "eventId": "evt-xyz791",
    "sequence": 1526
  }
}
```

---

#### 9. Delta Sync (Incremental Updates)

```http
POST /api/sync/{branchId}/{moduleId}/delta
Content-Type: application/json
```

**Request Body:**
```json
{
  "version": 1520,
  "snapshotMarker": "sm-2025-01-07T10:00:00.000Z",
  "tables": {
    "order_header": {
      "lastId": "order-abc120",
      "cursor": {
        "updatedAt": "2025-01-07T10:00:00.000Z"
      }
    },
    "order_line": {
      "lastId": "line-999",
      "cursor": {
        "updatedAt": "2025-01-07T10:00:00.000Z"
      }
    }
  }
}
```

**Response:**
```json
{
  "branchId": "dar",
  "moduleId": "pos",
  "version": 1526,
  "updatedAt": "2025-01-07T10:40:00.000Z",
  "snapshotMarker": "sm-2025-01-07T10:40:00.500Z",
  "requiresFullSync": false,
  "deltas": {
    "order_header": [
      {
        "id": "order-abc124",
        "status": "cooking",
        "version": 2,
        "updatedAt": "2025-01-07T10:40:00.000Z"
      }
    ],
    "order_line": [
      {
        "id": "line-001",
        "statusId": "queued",
        "version": 1,
        "createdAt": "2025-01-07T10:40:00.000Z"
      }
    ]
  },
  "stats": {
    "order_header": {
      "inserted": 0,
      "updated": 1,
      "total": 1
    },
    "order_line": {
      "inserted": 1,
      "updated": 0,
      "total": 1
    }
  }
}
```

---

#### 10. Sequence Allocation

```http
POST /branches/{branchId}/modules/{moduleId}/sequences
Content-Type: application/json
```

**Request Body:**
```json
{
  "table": "order_header",
  "field": "orderNumber",
  "record": {}
}
```

**Response:**
```json
{
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_header",
  "field": "orderNumber",
  "value": 12347,
  "id": "DAR-12347",
  "rule": {
    "prefix": "DAR",
    "start": 10000,
    "format": "{prefix}-{number:05d}"
  }
}
```

---

### Complete REST API Summary

**Total Endpoints:** 34+

#### By Category:
- **Health & Metrics:** 3 endpoints (`/healthz`, `/metrics`, `/api/state`)
- **Schema & Config:** 2 endpoints (`/api/schema`, module schema fetch)
- **Branch Operations:** 5 endpoints (list, get, module snapshot, etc.)
- **Table CRUD:** 5 endpoints (GET, POST, PATCH, PUT, DELETE)
- **Sync Operations:** 4 endpoints (snapshot, delta, full sync management)
- **Order-Specific:** 4 endpoints (list, create, get, update orders)
- **Event Operations:** 3 endpoints (batch, list, single event)
- **Management:** 8 endpoints (reset, purge, history, sequences, flags)

**See full REST API documentation:** [REST API Analysis section above](#rest-api-reference)

---

## <a name="websocket-protocol"></a>📡 WebSocket Protocol / بروتوكول WebSocket

### Connection Flow / تدفق الاتصال

```
Client                          Server
  |                               |
  |--- (1) WebSocket Connect ---->|
  |                               |
  |<-- (2) Connection Established |
  |                               |
  |--- (3) client:hello --------->|
  |    {                          |
  |      type: "client:hello",    |
  |      branchId: "dar",         |
  |      role: "pos-frontend",    |
  |      requestSnapshot: true    |
  |    }                          |
  |                               |
  |<-- (4) server:snapshot -------|
  |    {                          |
  |      type: "server:snapshot", |
  |      branchId: "dar",         |
  |      modules: {               |
  |        pos: {...tables...}    |
  |      }                        |
  |    }                          |
  |                               |
  |--- (5) client:publish ------->|
  |    {                          |
  |      type: "client:publish",  |
  |      action: "module:merge",  |
  |      table: "order_line",     |
  |      record: {...}            |
  |    }                          |
  |                               |
  |<-- (6) server:ack ------------|
  |    {                          |
  |      type: "server:ack",      |
  |      meta: {...}              |
  |    }                          |
  |                               |
  |<-- (7) server:event --------->|
  |    (Broadcast to all clients) |
  |    {                          |
  |      type: "server:event",    |
  |      table: "order_line",     |
  |      action: "module:merge",  |
  |      entry: { record: {...} } |
  |    }                          |
```

### Message Types / أنواع الرسائل

#### Client → Server Messages

##### 1. `client:hello`
**Purpose:** Initial handshake and connection setup

```json
{
  "type": "client:hello",
  "branchId": "dar",
  "role": "pos-frontend",
  "historyLimit": 100,
  "requestSnapshot": true,
  "requestHistory": false,
  "requestId": "hello-abc123"
}
```

---

##### 2. `client:publish`
**Purpose:** Publish data mutation (insert/update/delete)

**Insert:**
```json
{
  "type": "client:publish",
  "branchId": "dar",
  "moduleId": "pos",
  "table": "order_line",
  "action": "module:insert",
  "record": {
    "orderId": "order-001",
    "itemId": "item-burger",
    "quantity": 2,
    "statusId": "queued"
  },
  "meta": {
    "source": "kds-frontend",
    "userId": "user-123"
  },
  "requestId": "req-xyz789",
  "includeRecord": true
}
```

**Update (Merge):**
```json
{
  "type": "client:publish",
  "action": "module:merge",
  "table": "order_line",
  "record": {
    "id": "line-001",
    "statusId": "cooking",
    "version": 1
  },
  "requestId": "req-xyz790"
}
```

**Delete:**
```json
{
  "type": "client:publish",
  "action": "module:delete",
  "table": "order_line",
  "record": {
    "id": "line-001"
  },
  "requestId": "req-xyz791"
}
```

---

##### 3. `client:request:snapshot`
**Purpose:** Request full snapshot refresh

```json
{
  "type": "client:request:snapshot",
  "branchId": "dar",
  "moduleId": "pos",
  "requestId": "snapshot-req-001"
}
```

---

#### Server → Client Messages

##### 1. `server:hello`
**Purpose:** Acknowledge connection

```json
{
  "type": "server:hello",
  "serverId": "ws-abc123",
  "timestamp": "2025-01-07T10:00:00.000Z",
  "message": "Connected to Mishkah WS2 Gateway"
}
```

---

##### 2. `server:snapshot`
**Purpose:** Full state snapshot

```json
{
  "type": "server:snapshot",
  "branchId": "dar",
  "modules": {
    "pos": {
      "moduleId": "pos",
      "version": 1526,
      "tables": {
        "order_header": [...],
        "order_line": [...],
        "menu_item": [...]
      },
      "meta": {
        "lastUpdatedAt": "2025-01-07T10:40:00.000Z"
      }
    }
  },
  "meta": {
    "snapshotAt": "2025-01-07T10:40:00.000Z",
    "serverId": "ws-abc123"
  }
}
```

---

##### 3. `server:event`
**Purpose:** Real-time delta update (broadcast to all clients)

```json
{
  "type": "server:event",
  "eventId": "evt-xyz792",
  "sequence": 1527,
  "moduleId": "pos",
  "branchId": "dar",
  "table": "order_line",
  "action": "module:merge",
  "entry": {
    "action": "module:merge",
    "record": {
      "id": "line-001",
      "statusId": "ready",
      "version": 2,
      "updatedAt": "2025-01-07T10:45:00.000Z"
    }
  },
  "recordRef": {
    "id": "line-001"
  },
  "version": 1527,
  "createdAt": "2025-01-07T10:45:00.000Z"
}
```

---

##### 4. `server:ack`
**Purpose:** Acknowledge successful mutation

```json
{
  "type": "server:ack",
  "eventId": "evt-xyz792",
  "sequence": 1527,
  "meta": {
    "clientMeta": {
      "requestId": "req-xyz790"
    },
    "table": "order_line",
    "action": "module:merge"
  }
}
```

---

##### 5. `server:log`
**Purpose:** Server-side log message (debugging)

```json
{
  "type": "server:log",
  "message": "Delta sync completed",
  "context": {
    "branchId": "dar",
    "moduleId": "pos",
    "duration": "45ms"
  }
}
```

---

##### 6. `server:directive`
**Purpose:** Server command to client

```json
{
  "type": "server:directive",
  "directive": "reload-schema",
  "reason": "schema-updated",
  "meta": {}
}
```

---

### Auto-Reconnection / إعادة الاتصال التلقائي

**Client SDK (`mishkah.store.js`) automatically handles:**
- Exponential backoff (1s → 15s max)
- Connection status events
- Snapshot re-request on reconnect
- Queued messages during disconnection

```javascript
// Auto-reconnect enabled by default
const store = createStore({
  branchId: 'dar',
  moduleId: 'pos',
  autoReconnect: true // default
});

store.on('status', ({ status }) => {
  console.log('Connection status:', status);
  // 'idle' | 'connecting' | 'open' | 'ready' | 'closed'
});
```

---

## <a name="client-sdks"></a>💻 Client SDKs / مكتبات العميل

### 1. Core WebSocket SDK: `mishkah.store.js`

**Location:** `/static/lib/mishkah.store.js`

**Features:**
- ✅ WebSocket connection management
- ✅ Auto-reconnection with exponential backoff
- ✅ Message queueing during disconnection
- ✅ Event broadcasting (snapshot, event, status, ack, log)
- ✅ IndexedDB integration for offline storage
- ✅ Cache-first loading
- ✅ Promise-based async API

**Basic Usage:**
```javascript
import { createStore } from '/static/lib/mishkah.store.js';

const store = createStore({
  branchId: 'dar',
  moduleId: 'pos',
  role: 'pos-frontend',
  wsPath: '/ws', // Relative path (auto-resolves to ws://host/ws)
  autoReconnect: true,
  useIndexedDB: true,
  historyLimit: 200
});

// Connect
await store.connect();
await store.ready();

// Listen to status changes
store.on('status', ({ status }) => {
  console.log('Status:', status);
});

// Listen to snapshots
store.on('snapshot', (state) => {
  console.log('Full snapshot received:', state);
});

// Listen to real-time events
store.on('event', (event) => {
  console.log('Delta update:', event);
});

// Read data
const orderHeaders = store.listTable('order_header'); // Returns array

// Write data
await store.insert('order_line', {
  orderId: 'order-001',
  itemId: 'item-burger',
  quantity: 2,
  statusId: 'queued'
});

await store.merge('order_line', {
  id: 'line-001',
  statusId: 'cooking',
  version: 1
});

await store.remove('order_line', {
  id: 'line-001'
});
```

---

### 2. Simplified DSL: `mishkah.simple-store.js`

**Location:** `/static/lib/mishkah.simple-store.js`

**Features:**
- ✅ Simplified API wrapping `mishkah.store.js`
- ✅ Object definition registry
- ✅ Automatic schema resolution
- ✅ Smart fetch from REST API on first `watch()`
- ✅ Reactive watchers with immediate/deferred callbacks
- ✅ Multi-source data priority (WebSocket > Smart Fetch > REST cache)

**Basic Usage:**
```javascript
import { createDB, createDBAuto } from '/static/lib/mishkah.simple-store.js';

// Option 1: Manual registration
const db = createDB({
  branchId: 'dar',
  moduleId: 'pos',
  wsPath: '/ws',
  autoConnect: true,
  objects: {
    orders: {
      table: 'order_header'
    },
    lines: {
      table: 'order_line'
    }
  }
});

// Option 2: Auto-registration from schema
const posSchema = window.database.schema;
const db = createDBAuto(
  posSchema,
  ['order_header', 'order_line', 'menu_item'], // Tables to register
  {
    branchId: 'dar',
    moduleId: 'pos',
    wsPath: '/ws',
    autoConnect: true
  }
);

// Watch for changes (reactive)
db.watch('orders', (orders) => {
  console.log('Orders updated:', orders.length);
  orders.forEach(order => {
    console.log(`Order ${order.orderNumber}: ${order.status}`);
  });
});

// Status monitoring
db.status((status) => {
  if (status === 'connected') {
    console.log('✅ Connected');
  } else {
    console.log('❌ Disconnected');
  }
});

// Write operations
await db.insert('orders', {
  orderNumber: 'ORD-12345',
  status: 'pending'
});

await db.update('orders', {
  id: 'order-001',
  status: 'cooking',
  version: 1
});

await db.delete('orders', { id: 'order-001' });

// Synchronous read
const currentOrders = db.list('orders');
```

---

### 3. POS Mini SDK: `pos-mini-db.js`

**Location:** `/static/pos/pos-mini-db.js`

**Features:**
- ✅ POS-specific SDK with default table mappings
- ✅ Hybrid mode: WebSocket (remote) + REST API (offline fallback)
- ✅ Smart fetch from REST API on first watch
- ✅ Table alias resolution (e.g., `orders` → `order_header`)
- ✅ Canonical name enforcement with error messages
- ✅ Offline-only mode with REST API data loading

**Basic Usage:**
```javascript
import { createPosDb } from '/static/pos/pos-mini-db.js';

// Automatic mode detection (tries WebSocket, falls back to REST API)
const { db, schema } = await createPosDb({
  branchId: 'dar',
  moduleId: 'pos',
  tables: ['order_header', 'order_line', 'menu_item']
});

await db.ready();

// Watch orders
db.watch('order_header', (orders) => {
  console.log('Orders:', orders.length);
});

// POS-specific helper
const order = await db.getOrder('order-001');
console.log('Order with lines and payments:', order);
```

---

### 4. IndexedDB Adapter: `mishkah-indexeddb.js`

**Location:** `/static/lib/mishkah-indexeddb.js`

**Features:**
- ✅ Persistent offline storage
- ✅ Metadata tracking (lastId, lastSyncAt, schemaVersion)
- ✅ Full sync reset on schema version change
- ✅ Cache invalidation strategies
- ✅ Mutation callbacks for custom logic
- ✅ Fallback to memory storage if IndexedDB unavailable

**Basic Usage:**
```javascript
import { MishkahIndexedDB } from '/static/lib/mishkah-indexeddb.js';

const adapter = MishkahIndexedDB.createAdapter({
  namespace: 'dar',
  name: 'mishkah-store-pos',
  version: 1
});

await adapter.ready;

// Save table data
await adapter.save('order_header', ordersArray, {
  metadata: {
    lastId: 'order-xyz',
    lastSyncAt: Date.now(),
    schemaVersion: '2025-01-07'
  }
});

// Load table data
const cached = await adapter.load('order_header');
console.log('Cached orders:', cached.data);
console.log('Metadata:', cached.meta);

// Update metadata only
await adapter.updateMetadata('order_header', {
  lastSyncAt: Date.now()
});

// Mutate cached data
await adapter.mutate('order_header', (draft, { meta }) => {
  const order = draft.find(o => o.id === 'order-001');
  if (order) {
    order.status = 'completed';
    return draft;
  }
  return false; // Abort mutation
});

// Clear cache
await adapter.clear('order_header');

// Purge (reset to empty)
await adapter.purge(['order_header', 'order_line']);
```

---

## <a name="storage-layer"></a>💾 Storage Layer / طبقة التخزين

### HybridStore Architecture

**Class:** `HybridStore` (extends `ModuleStore`)
**Location:** `/src/hybridStore.js`

**Responsibilities:**
1. **In-Memory Cache**
   - Fast reads with TTL-based expiration
   - Write-through updates
   - Automatic invalidation on mutations

2. **SQLite Persistence**
   - Durable storage for persisted tables
   - Write-through on insert/update/delete
   - Lazy loading with cache fallback

3. **Event Sourcing**
   - Append-only event log
   - Automatic daily rotation
   - History archival

4. **Concurrency Control**
   - Optimistic locking with version numbers
   - Version conflict detection
   - Automatic version increment

**Persisted Tables (configurable):**
> في التنفيذ الحالي، **ليس كل جدول يُكتب إلى SQLite**. يتم تمرير `persistedTables` ثم فلترتها عبر `isManagedTable`.
> المصدر النهائي هو `DEFAULT_TABLES` في `src/database/sqlite-ops.js`.

**Configuration:**
```javascript
const hybridStore = new HybridStore(
  schemaEngine,
  'dar',           // branchId
  'pos',           // moduleId
  definition,      // Schema definition
  seed,            // Seed data
  seedData,        // Additional seed
  {
    cacheTtlMs: 1500,              // Cache TTL (ms)
    persistedTables: ['order_header', 'order_line']
  }
);
```

**مراجع مهمة:**
- `src/docs/HYBRID-STORE.md`

### أوضاع التخزين (مختصر)

1) **Full SQL**: جداول كاملة (أعمدة كثيرة) لاحتياجات تقارير ثقيلة.
2) **Hybrid SQL (Payload + Indexed Columns)**: الوضع الافتراضي داخل HybridStore.
3) **Live Data Only**: بيانات تعتمد على الـ Live JSON فقط.

---

### Event Store

**Location:** `/src/eventStore.js`

**Event Log Format (NDJSON):**
```json
{"id":"evt-001","sequence":1,"action":"module:insert","table":"order_header","record":{...},"createdAt":"2025-01-07T10:00:00.000Z"}
{"id":"evt-002","sequence":2,"action":"module:merge","table":"order_line","record":{...},"createdAt":"2025-01-07T10:01:00.000Z"}
```

**Event Metadata:**
```json
{
  "branchId": "dar",
  "moduleId": "pos",
  "liveCreatedAt": "2025-01-07T00:00:00.000Z",
  "currentDay": "2025-01-07",
  "lastEventId": "evt-1526",
  "lastEventAt": "2025-01-07T10:40:00.000Z",
  "totalEvents": 1526,
  "tableCursors": {
    "order_header": {
      "id": "order-xyz",
      "eventId": "evt-1520",
      "sequence": 1520,
      "updatedAt": "2025-01-07T10:35:00.000Z"
    }
  }
}
```

**Daily Rotation:**
- Triggers at midnight
- Archives previous day's events to `history/events/{date}.log`
- Resets live event log
- Preserves metadata

**API:**
```javascript
import { appendEvent, readEventLog, rotateEventLog } from './eventStore.js';

// Append event
await appendEvent(context, {
  action: 'module:insert',
  table: 'order_header',
  record: { ... },
  meta: { source: 'pos-frontend' }
});

// Read log
const events = await readEventLog(context);

// Rotate (called automatically daily)
const { rotated, archivePath } = await rotateEventLog(context);
```

---

### SQLite Layer

**Location:** `/src/db/sqlite.js`

**Database Structure:**
```
data/branches/{branchId}/modules/{moduleId}/sqlite/
  ├── {table}.db       (one per table)
  ├── {table}.db-wal   (write-ahead log)
  └── {table}.db-shm   (shared memory)
```

**Managed Tables:**
```javascript
const MANAGED_TABLES = [
  'order_header',
  'order_line',
  'order_payment',
  'order_status_log',
  'order_line_status_log',
  'pos_shift',
  'table_lock',
  'audit_event'
];
```

**Schema Management:**
- Auto-creates tables from `definition.json`
- Type coercion (text, integer, decimal, boolean, json, timestamp)
- Primary key constraints
- Index creation

**Operations:**
```javascript
import {
  persistRecord,
  deleteRecord,
  loadTableRecords,
  replaceTableRecords,
  truncateTable
} from './db/sqlite.js';

// Insert/update record
persistRecord('order_header', record, { branchId: 'dar', moduleId: 'pos' });

// Delete record
deleteRecord('order_header', recordId, { branchId: 'dar', moduleId: 'pos' });

// Load all records
const orders = loadTableRecords('order_header', { branchId: 'dar', moduleId: 'pos' });

// Replace entire table
replaceTableRecords('order_header', newRecords, { branchId: 'dar', moduleId: 'pos' });

// Truncate table
truncateTable('order_header', { branchId: 'dar', moduleId: 'pos' });
```

---

## <a name="production-readiness"></a>🎖️ Production Readiness Assessment / تقييم الجاهزية للإنتاج

### ✅ Ready for Production

| Feature | Status | Notes |
|---------|--------|-------|
| **Core CRUD Operations** | ✅ Ready | All REST + WebSocket operations stable |
| **Real-time Synchronization** | ✅ Ready | WebSocket with auto-reconnect, tested in production |
| **Offline Support** | ✅ Ready | IndexedDB with smart cache, works reliably |
| **Multi-Branch Isolation** | ✅ Ready | Complete data isolation per branch |
| **Optimistic Locking** | ✅ Ready | Version-based concurrency control |
| **Event Sourcing** | ✅ Ready | Complete audit trail with archival |
| **Delta Sync** | ✅ Ready | Incremental updates with cursor tracking |
| **Schema Validation** | ✅ Ready | Runtime type checking and coercion |
| **Error Handling** | ✅ Ready | Consistent error responses |
| **Monitoring** | ✅ Ready | Prometheus metrics exporter |
| **Daily Reset** | ✅ Ready | Automated seed restoration |
| **Data Archival** | ✅ Ready | Purge/restore with history |

---

### ⚠️ Requires Caution

| Feature | Status | Limitation |
|---------|--------|------------|
| **Authentication** | ⚠️ Partial | WebSocket only (no REST auth) |
| **Single Node** | ⚠️ Limitation | No horizontal scaling |
| **SQLite Write Lock** | ⚠️ Limitation | Single writer only |
| **No Query Language** | ⚠️ Limitation | Basic filtering only |
| **No Aggregations** | ⚠️ Limitation | Client-side aggregation required |
| **Event Log Growth** | ⚠️ Requires Monitoring | Manual compaction needed |

---

### ❌ Not Production-Ready

| Feature | Status | Impact |
|---------|--------|--------|
| **Authorization** | ❌ Missing | No role-based access control |
| **Clustering** | ❌ Missing | Cannot scale horizontally |
| **Replication** | ❌ Missing | Single point of failure |
| **Backup/Restore** | ❌ Missing | Manual backup only |
| **Rate Limiting** | ❌ Missing | No request throttling |
| **WebSocket Auth** | ❌ Incomplete | Token validation not enforced |

---

### Recommended Production Setup

```
┌──────────────────────────────────────────────────────────────┐
│  Load Balancer (Nginx/HAProxy)                              │
│  - SSL/TLS termination                                       │
│  - WebSocket sticky sessions                                 │
│  - Rate limiting                                             │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Mishkah Store Server (Single Node)                         │
│  - REST API                                                  │
│  - WebSocket Gateway                                         │
│  - HybridStore (Memory + SQLite + Events)                   │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Storage                                                      │
│  - SQLite databases (per branch/module/table)                │
│  - Event logs (NDJSON, daily rotation)                       │
│  - History archives                                          │
└──────────────────────────────────────────────────────────────┘
```

**Critical Production Recommendations:**

1. **Add Authentication Middleware**
   - Implement JWT/OAuth for REST API
   - Enforce token validation on WebSocket

2. **Add Rate Limiting**
   - Per-IP rate limiting (use Nginx or middleware)
   - WebSocket connection limits

3. **Monitoring & Alerting**
   - Set up Prometheus + Grafana
   - Alert on:
     - Event log size growth
     - SQLite lock contention
     - WebSocket connection drops
     - Memory usage

4. **Backup Strategy**
   - Daily SQLite database backups
   - Event log archival to S3/cloud storage
   - Test restore procedures

5. **Disaster Recovery**
   - Document recovery procedures
   - Test event log replay
   - Maintain seed data backups

---

## <a name="missing-features"></a>🚧 Missing Features / الميزات الناقصة

### Critical Missing Features for Firebase Parity

#### 1. **Authorization & Security Rules**

**Status:** ❌ Missing
**Firebase Equivalent:** Security Rules (Firestore)

**What's Missing:**
```javascript
// Firebase Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == resource.data.userId;
    }
  }
}
```

**Mishkah Store:** No equivalent. All data is publicly accessible via REST API.

**Impact:** 🔴 Critical security vulnerability

**Recommendation:**
- Implement middleware-based authorization
- Add role-based access control (RBAC)
- Field-level permissions
- Row-level security

---

#### 2. **Query Language & Advanced Filtering**

**Status:** ❌ Missing
**Firebase Equivalent:** Firestore queries

**What's Missing:**
```javascript
// Firebase
db.collection('orders')
  .where('status', '==', 'pending')
  .where('createdAt', '>', yesterday)
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();
```

**Mishkah Store:**
- Only basic timestamp filtering (`updatedAfter`, `afterCreatedAt`)
- No compound queries
- No `WHERE` conditions
- No `ORDER BY` (only asc/desc toggle)
- Client-side filtering required

**Impact:** 🟡 Medium (workaround: filter in client)

**Recommendation:**
- Implement query builder API
- Add support for:
  - Multiple WHERE conditions
  - Comparison operators (`==`, `!=`, `<`, `>`, `<=`, `>=`, `in`, `not-in`)
  - Logical operators (`AND`, `OR`)
  - Sorting on multiple fields
  - Field projection (select specific fields)

---

#### 3. **Aggregations & Analytics**

**Status:** ❌ Missing
**Firebase Equivalent:** Aggregation queries

**What's Missing:**
```javascript
// Firebase
db.collection('orders')
  .where('status', '==', 'completed')
  .count()
  .get();

db.collection('orders')
  .aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
  ]);
```

**Mishkah Store:** No server-side aggregations. Must fetch all records and aggregate client-side.

**Impact:** 🟡 Medium (performance issue for large datasets)

**Recommendation:**
- Add aggregation endpoints:
  - `/tables/{table}/count`
  - `/tables/{table}/sum?field=amount`
  - `/tables/{table}/avg?field=price`
  - `/tables/{table}/group-by?field=status`

---

#### 4. **Horizontal Scaling & Clustering**

**Status:** ❌ Missing
**Firebase Equivalent:** Auto-scaling (managed by Google)

**What's Missing:**
- Multi-node deployment
- Distributed cache (Redis)
- Leader election
- Data sharding
- Load balancing across nodes

**Current Limitation:** Single-node only. Cannot scale horizontally.

**Impact:** 🔴 Critical for high-traffic applications

**Recommendation:**
- Implement Redis for distributed cache
- Add PostgreSQL/MySQL for multi-writer support
- Use message queue (RabbitMQ/Kafka) for event distribution
- Implement sticky sessions for WebSocket

---

#### 5. **Transactions (ACID)**

**Status:** ⚠️ Partial
**Firebase Equivalent:** Transactions & Batch Writes

**What's Missing:**
```javascript
// Firebase
await db.runTransaction(async (transaction) => {
  const orderDoc = await transaction.get(orderRef);
  const newTotal = orderDoc.data().total + 100;
  transaction.update(orderRef, { total: newTotal });
  transaction.set(paymentRef, { amount: 100, orderId: orderDoc.id });
});
```

**Mishkah Store:**
- Event batching exists (`/events/batch`)
- But no atomic commit/rollback
- No isolation between concurrent transactions

**Impact:** 🟡 Medium (edge case: race conditions)

**Recommendation:**
- Implement transaction API with:
  - BEGIN / COMMIT / ROLLBACK
  - Read locks
  - Write locks
  - Isolation levels

---

#### 6. **Cloud Functions / Triggers**

**Status:** ❌ Missing
**Firebase Equivalent:** Cloud Functions

**What's Missing:**
```javascript
// Firebase
exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate((snap, context) => {
    // Send notification
    // Update inventory
    // Log analytics
  });
```

**Mishkah Store:** No server-side triggers. Must implement custom webhook system.

**Impact:** 🟡 Medium (extra development effort)

**Recommendation:**
- Add webhook system:
  - Register webhooks via API
  - Trigger on INSERT/UPDATE/DELETE
  - Retry logic with exponential backoff
  - Webhook signature validation

---

#### 7. **Full-Text Search**

**Status:** ❌ Missing
**Firebase Equivalent:** None (uses Algolia/ElasticSearch)

**What's Missing:**
- Text search across fields
- Fuzzy matching
- Relevance scoring
- Search indexing

**Impact:** 🟡 Medium

**Recommendation:**
- Integrate ElasticSearch or MeiliSearch
- Add `/search` endpoint
- Auto-index configured tables

---

#### 8. **File Storage Integration**

**Status:** ❌ Missing
**Firebase Equivalent:** Firebase Storage

**What's Missing:**
- File upload/download
- Image resizing
- CDN integration
- Access control

**Impact:** 🟢 Low (separate service acceptable)

**Recommendation:**
- Integrate S3/MinIO
- Add `/upload` and `/download` endpoints
- Store file metadata in tables

---

#### 9. **Backup & Point-in-Time Recovery**

**Status:** ❌ Missing
**Firebase Equivalent:** Automated backups

**What's Missing:**
- Automated daily backups
- Point-in-time recovery
- Backup to cloud storage
- One-click restore

**Impact:** 🔴 Critical for production

**Recommendation:**
- Implement automated backup script:
  - Daily SQLite + event log backup
  - Upload to S3/cloud
  - Retention policy (30 days)
- Add `/restore` management endpoint

---

#### 10. **Multi-Region Replication**

**Status:** ❌ Missing
**Firebase Equivalent:** Multi-region support

**What's Missing:**
- Geographic data distribution
- Cross-region replication
- Failover

**Impact:** 🔴 Critical for global applications

**Recommendation:**
- Phase 1: Master-replica setup (PostgreSQL)
- Phase 2: Multi-master with conflict resolution
- Phase 3: Geographic routing

---

## <a name="critical-improvements"></a>🔧 Critical Architectural Improvements / التحسينات المعمارية الحرجة

### Must-Have Improvements (Do Not Delay)

#### 1. **Add REST API Authentication**

**Current State:** No authentication on REST endpoints
**Risk:** 🔴 Critical security vulnerability

**Required Changes:**
```javascript
// Add JWT middleware
import jwt from 'jsonwebtoken';

function authenticateRequest(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'invalid-token' });
  }
}

// Apply to all /api/* routes
app.use('/api/*', authenticateRequest);
```

**Timeline:** Immediate (before production deployment)

---

#### 2. **Implement Authorization Layer**

**Current State:** No role-based access control
**Risk:** 🔴 Critical security vulnerability

**Required Changes:**
```javascript
// Define permissions
const PERMISSIONS = {
  'pos-cashier': ['read:orders', 'write:orders', 'read:menu'],
  'kds-station': ['read:orders', 'update:order_line'],
  'admin': ['*']
};

function authorize(requiredPermission) {
  return (req, res, next) => {
    const userRole = req.user.role;
    const userPermissions = PERMISSIONS[userRole] || [];

    if (userPermissions.includes('*') || userPermissions.includes(requiredPermission)) {
      next();
    } else {
      res.status(403).json({ error: 'forbidden' });
    }
  };
}

// Usage
app.post('/api/branches/:branchId/modules/pos/orders',
  authenticateRequest,
  authorize('write:orders'),
  handleCreateOrder
);
```

**Timeline:** Immediate (before production deployment)

---

#### 3. **Add Rate Limiting**

**Current State:** No request throttling
**Risk:** 🟡 Medium (DoS vulnerability)

**Required Changes:**
```javascript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: { error: 'rate-limit-exceeded' }
});

app.use('/api/', apiLimiter);

const wsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});

app.use('/ws', wsLimiter);
```

**Timeline:** 1 week

---

#### 4. **Replace SQLite with PostgreSQL for Multi-Writer Support**

**Current State:** SQLite single-writer bottleneck
**Risk:** 🟡 Medium (scaling limitation)

**Migration Path:**
```sql
-- PostgreSQL schema
CREATE TABLE order_header (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_header_branch ON order_header(branch_id);
CREATE INDEX idx_order_header_status ON order_header(status);
CREATE INDEX idx_order_header_updated ON order_header(updated_at);
```

**Benefits:**
- Multi-writer support
- Better concurrency
- Advanced query features
- Horizontal scaling (with replication)

**Timeline:** 2-4 weeks

---

#### 5. **Implement Distributed Cache with Redis**

**Current State:** In-memory cache (single-node only)
**Risk:** 🟡 Medium (scaling limitation)

**Required Changes:**
```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

class DistributedHybridStore extends HybridStore {
  async listTable(tableName) {
    const cacheKey = `${this.branchId}:${this.moduleId}:${tableName}`;

    // Try Redis first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to database
    const data = await super.listTable(tableName);

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(data));

    return data;
  }

  async invalidateCache(tableName) {
    const cacheKey = `${this.branchId}:${this.moduleId}:${tableName}`;
    await redis.del(cacheKey);

    // Broadcast invalidation to other nodes
    await redis.publish('cache:invalidate', cacheKey);
  }
}
```

**Timeline:** 1-2 weeks

---

#### 6. **Add Backup & Restore System**

**Current State:** No automated backups
**Risk:** 🔴 Critical (data loss risk)

**Required Changes:**
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Backup SQLite databases
cp -r data/branches "$BACKUP_DIR/branches"

# Backup event logs
cp -r data/branches/*/modules/*/live "$BACKUP_DIR/live"

# Upload to S3
aws s3 sync "$BACKUP_DIR" "s3://mishkah-backups/$(date +%Y-%m-%d)/"

# Retain only last 30 days
find /backups -type d -mtime +30 -exec rm -rf {} \;
```

**Cron Schedule:**
```
0 2 * * * /usr/local/bin/backup.sh
```

**Timeline:** 1 week

---

### Recommended Improvements (Can Be Delayed)

#### 7. **Add Query Builder API**

**Timeline:** 2-3 months

#### 8. **Implement Server-Side Aggregations**

**Timeline:** 2-3 months

#### 9. **Add Full-Text Search (ElasticSearch)**

**Timeline:** 3-4 months

#### 10. **Multi-Node Clustering**

**Timeline:** 6-12 months

---

## <a name="firebase-comparison"></a>🔥 Detailed Comparison with Firebase / مقارنة مفصلة مع Firebase

### Feature Matrix

| Feature | Firebase | Mishkah Store | Gap |
|---------|----------|---------------|-----|
| **Real-time Sync** | ✅ Excellent | ✅ Excellent | None |
| **Offline Support** | ✅ Built-in | ✅ IndexedDB | None |
| **REST API** | ✅ Full | ✅ Full | None |
| **WebSocket** | ✅ Native | ✅ Native | None |
| **Authentication** | ✅ Built-in | ❌ Missing | **Critical** |
| **Authorization** | ✅ Security Rules | ❌ Missing | **Critical** |
| **Query Language** | ✅ Rich | ⚠️ Basic | **High** |
| **Aggregations** | ✅ Yes | ❌ No | **Medium** |
| **Transactions** | ✅ Full ACID | ⚠️ Partial | **Medium** |
| **Horizontal Scaling** | ✅ Auto | ❌ No | **Critical** |
| **Multi-Region** | ✅ Yes | ❌ No | **High** |
| **Backup/Restore** | ✅ Auto | ❌ Manual | **Critical** |
| **Triggers/Functions** | ✅ Cloud Functions | ❌ No | **Medium** |
| **File Storage** | ✅ Firebase Storage | ❌ No | **Low** |
| **Full-Text Search** | ⚠️ 3rd party | ❌ No | **Low** |
| **Pricing** | Pay per usage | Self-hosted (free) | N/A |
| **Vendor Lock-in** | ❌ Yes | ✅ No | Advantage |
| **Self-Hosted** | ❌ No | ✅ Yes | Advantage |
| **Open Source** | ❌ No | ⚠️ Proprietary | Neutral |

---

### When to Choose Firebase

✅ **Choose Firebase if:**
- You need global multi-region support
- You want zero DevOps (managed service)
- You need authentication out-of-the-box
- You need Cloud Functions
- Your budget allows pay-per-usage pricing
- You need Google integrations (Analytics, Auth, etc.)

---

### When to Choose Mishkah Store

✅ **Choose Mishkah Store if:**
- You need full control over your infrastructure
- You want to avoid vendor lock-in
- You have DevOps expertise
- You want predictable costs (no per-request pricing)
- Your data must stay on-premises
- You need custom business logic server-side
- You have regional data residency requirements

---

## <a name="migration-guide"></a>🚀 Migration Guide / دليل الترحيل

### From Firebase to Mishkah Store

#### Step 1: Schema Definition

**Firebase (Firestore):**
```javascript
// Implicit schema (no definition)
db.collection('orders').doc('order-001').set({
  orderNumber: 'ORD-001',
  status: 'pending',
  amount: 120.50
});
```

**Mishkah Store (Schema Required):**
```json
{
  "version": 1,
  "moduleId": "pos",
  "tables": {
    "order_header": {
      "fields": {
        "id": { "type": "text", "primaryKey": true },
        "orderNumber": { "type": "text" },
        "status": { "type": "text" },
        "amount": { "type": "decimal" },
        "createdAt": { "type": "timestamp" },
        "version": { "type": "integer" }
      }
    }
  }
}
```

---

#### Step 2: Data Export from Firebase

```javascript
// Firebase export script
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

async function exportCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const records = [];

  snapshot.forEach(doc => {
    records.push({
      id: doc.id,
      ...doc.data()
    });
  });

  return records;
}

const orders = await exportCollection('orders');
console.log(JSON.stringify({ tables: { order_header: orders } }, null, 2));
```

---

#### Step 3: Import to Mishkah Store

```bash
# Create seed file
cat > data/branches/dar/modules/pos/seeds/initial.json <<EOF
{
  "version": 1,
  "meta": {
    "branchId": "dar",
    "moduleId": "pos"
  },
  "tables": {
    "order_header": [
      ...exported records...
    ]
  }
}
EOF

# Restart server to load seed
pm2 restart mishkah-store
```

---

#### Step 4: Update Client Code

**Before (Firebase):**
```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Real-time listener
onSnapshot(collection(db, 'orders'), (snapshot) => {
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
});

// Write
await addDoc(collection(db, 'orders'), {
  orderNumber: 'ORD-001',
  status: 'pending'
});
```

**After (Mishkah Store):**
```javascript
import { createDB } from '/static/lib/mishkah.simple-store.js';

const db = createDB({
  branchId: 'dar',
  moduleId: 'pos',
  wsPath: '/ws',
  objects: {
    orders: { table: 'order_header' }
  }
});

// Real-time listener
db.watch('orders', (orders) => {
  orders.forEach(order => {
    console.log(order.id, order);
  });
});

// Write
await db.insert('orders', {
  orderNumber: 'ORD-001',
  status: 'pending'
});
```

---

#### Step 5: Security Rules Migration

**Firebase Security Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == resource.data.userId;
    }
  }
}
```

**Mishkah Store (Express Middleware):**
```javascript
// Implement equivalent authorization
app.use('/api/branches/:branchId/modules/pos/tables/order_header',
  authenticateRequest,
  (req, res, next) => {
    // Row-level security
    if (req.method === 'GET') {
      // Allow read if authenticated
      next();
    } else if (req.method === 'POST' || req.method === 'PATCH') {
      // Allow write if user owns the order
      const order = req.body.record;
      if (order.userId === req.user.uid) {
        next();
      } else {
        res.status(403).json({ error: 'forbidden' });
      }
    }
  }
);
```

---

## <a name="best-practices"></a>✅ Best Practices / أفضل الممارسات

### 1. Optimistic Locking

**Always send version number when updating:**

```javascript
// ❌ Bad: No version
await db.update('order_header', {
  id: 'order-001',
  status: 'completed'
});

// ✅ Good: With version
await db.update('order_header', {
  id: 'order-001',
  status: 'completed',
  version: 1
});
```

### 2. Error Handling

```javascript
try {
  await db.update('order_header', {
    id: 'order-001',
    status: 'completed',
    version: 1
  });
} catch (error) {
  if (error.code === 'version-conflict') {
    // Reload and retry
    const fresh = await fetch(`/api/branches/dar/modules/pos/tables/order_header?id=order-001`);
    const order = await fresh.json();

    await db.update('order_header', {
      id: 'order-001',
      status: 'completed',
      version: order.version
    });
  } else {
    throw error;
  }
}
```

### 3. Use Relative WebSocket Paths

```javascript
// ❌ Bad: Absolute URL (breaks in different environments)
const db = createDB({
  wsUrl: 'wss://dar.mishkah.app/ws'
});

// ✅ Good: Relative path (auto-resolves)
const db = createDB({
  wsPath: '/ws'
});
```

### 4. Enable IndexedDB for Offline Support

```javascript
const db = createDB({
  branchId: 'dar',
  moduleId: 'pos',
  wsPath: '/ws',
  useIndexedDB: true, // ✅ Enable offline cache
  objects: { ... }
});
```

### 5. Handle Connection Status

```javascript
db.status((status) => {
  if (status === 'connected') {
    document.body.classList.remove('offline');
    showNotification('✅ Connected to server');
  } else if (status === 'disconnected') {
    document.body.classList.add('offline');
    showNotification('⚠️ Working offline');
  }
});
```

### 6. Filter Data in Memory (Client-Side)

```javascript
// Since server-side filtering is limited, filter client-side
db.watch('order_header', (orders) => {
  const pending = orders.filter(o => o.status === 'pending');
  const today = orders.filter(o => {
    const createdDate = new Date(o.createdAt);
    return createdDate >= startOfToday();
  });

  renderOrders(pending);
});
```

### 7. Use Smart Fetch for Initial Load

```javascript
// Smart fetch automatically triggered on first watch()
db.watch('order_header', (orders) => {
  // First call: Data from REST API (fast)
  // Subsequent calls: Real-time updates via WebSocket
  console.log('Orders:', orders.length);
});
```

### 8. Batch Mutations When Possible

```javascript
// ❌ Bad: Multiple sequential updates
for (const line of orderLines) {
  await db.update('order_line', {
    id: line.id,
    statusId: 'cooking',
    version: line.version
  });
}

// ✅ Good: Parallel updates
await Promise.all(
  orderLines.map(line =>
    db.update('order_line', {
      id: line.id,
      statusId: 'cooking',
      version: line.version
    })
  )
);
```

---

## 📊 Performance Benchmarks / معايير الأداء

| Operation | Latency | Notes |
|-----------|---------|-------|
| **Read (Memory Cache)** | < 1ms | In-memory cache hit |
| **Read (SQLite)** | 5-20ms | Cache miss, load from disk |
| **Write (Single Record)** | 10-30ms | Memory + SQLite + Event log |
| **Write (Batch 100 Records)** | 100-300ms | Parallel writes |
| **WebSocket Roundtrip** | 20-50ms | Client → Server → Broadcast |
| **REST API Roundtrip** | 30-100ms | HTTP overhead |
| **Delta Sync (100 Changes)** | 50-150ms | Incremental update |
| **Full Snapshot (10k Records)** | 200-500ms | Initial load |

---

## 🎓 Conclusion / الخلاصة

**Mishkah Store** is a production-ready real-time data synchronization system with strong fundamentals:

### ✅ Strengths:
- Excellent real-time sync (WebSocket + REST)
- Robust offline support (IndexedDB)
- Strong concurrency control (optimistic locking)
- Complete audit trail (event sourcing)
- Self-hosted (no vendor lock-in)
- Multi-protocol (REST + WebSocket)

### ⚠️ Critical Gaps:
1. **No authentication on REST API** (security vulnerability)
2. **No authorization layer** (security vulnerability)
3. **Single-node only** (scalability limitation)
4. **No query language** (usability limitation)
5. **No automated backups** (data loss risk)

### 🚀 Recommended Next Steps:

**Phase 1 (Immediate - 1 month):**
- ✅ Add REST API authentication (JWT)
- ✅ Implement authorization middleware
- ✅ Add rate limiting
- ✅ Set up automated backups

**Phase 2 (Short-term - 3 months):**
- ✅ Replace SQLite with PostgreSQL
- ✅ Implement Redis cache
- ✅ Add query builder API
- ✅ Implement server-side aggregations

**Phase 3 (Long-term - 6-12 months):**
- ✅ Multi-node clustering
- ✅ Multi-region replication
- ✅ Full-text search integration
- ✅ Cloud Functions / triggers system

---

**With the recommended improvements, Mishkah Store can achieve Firebase-level production readiness while maintaining the advantages of self-hosting and avoiding vendor lock-in.**

---

## 📚 Additional Resources / موارد إضافية

- **Schema Definition Examples:** `data/schemas/pos_schema.json`
- **Seed Data Examples:** `data/branches/dar/modules/pos/seeds/initial.json`
- **Client SDK Source:** `static/lib/mishkah.store.js`
- **Backend Guide:** `docs/MISHKAH_BACKEND_GUIDE.md`
- **Server Implementation:** `src/server.js`

---

**Document Version:** 2.0
**Last Updated:** 2025-01-07
**Maintainer:** Mishkah Development Team

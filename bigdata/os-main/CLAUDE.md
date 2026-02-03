# CLAUDE.md - AI Assistant Guide for Mishkah.js WebSocket Gateway

**بسم الله الرحمن الرحيم**

> **Purpose**: This document guides AI assistants (Claude, GPT, etc.) when working with the Mishkah.js WebSocket Gateway (mishkah-ws2) codebase.

**Last Updated**: 2025-11-17
**Repository**: mishkah-os/os (mishkah-ws2)
**Version**: 0.1.0

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Repository Overview](#repository-overview)
3. [Architecture & Philosophy](#architecture--philosophy)
4. [Directory Structure](#directory-structure)
5. [Technology Stack](#technology-stack)
6. [Development Workflow](#development-workflow)
7. [Key Conventions](#key-conventions)
8. [Common Tasks](#common-tasks)
9. [Mishkah.js Framework Guide](#mishkahjs-framework-guide)
10. [Testing & Deployment](#testing--deployment)
11. [Critical Patterns](#critical-patterns)
12. [Common Pitfalls](#common-pitfalls)

---

## Quick Start

### What is this repository?

**mishkah-ws2** is a lightweight, dynamic WebSocket gateway for Point-of-Sale (POS) and Enterprise Resource Planning (ERP) experiments, built on the Mishkah.js framework philosophy.

### Key Facts
- **Backend**: Node.js ES Modules + WebSocket + SQLite
- **Frontend**: Mishkah.js (custom VDOM framework, no build step)
- **Architecture**: Multi-module, multi-branch, event-sourced, real-time
- **Lines of Code**: ~12,600 backend + ~800KB frontend libraries
- **Primary Language**: JavaScript (100%)

### Running the App
```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production mode
npm start

# Testing
npm test
```

### Environment Variables
```bash
PORT=3200                        # Server port
NODE_ENV=development             # Environment
HYBRID_CACHE_TTL_MS=1500        # Cache TTL in ms
WS2_PG_URL=postgresql://...     # Optional PostgreSQL for events
WS2_METRICS=1                   # Enable Prometheus metrics
```

---

## Repository Overview

### Purpose & Scope

This is a **production-grade**, **real-time**, **multi-tenant** system that serves as:
1. **WebSocket Gateway**: Real-time bidirectional communication for POS/ERP apps
2. **REST API Server**: HTTP endpoints for CRUD operations
3. **Static File Server**: Serves Mishkah.js frontend applications
4. **Event Store**: Logs all mutations with optimistic concurrency control
5. **Multi-Module Platform**: Supports multiple business domains (POS, Gym, ERP, etc.)

### Business Domains Supported

- **POS (Point of Sale)**: 65+ tables for restaurant/retail operations
- **Gym Management**: 11 tables for gym/fitness center operations
- **Physical Therapy Clinic**: ERP system for healthcare clinics
- **Scratchpad**: Testing/development workspace

### Key Features

✅ **Event Sourcing**: Every mutation logged as an event
✅ **Optimistic Concurrency**: Version-based conflict resolution
✅ **Hybrid Storage**: In-memory cache + SQLite persistence
✅ **Real-time Broadcasting**: WebSocket updates to all connected clients
✅ **Multi-Branch Support**: Isolated data per physical location
✅ **Dynamic Schema Loading**: JSON schemas define database structure
✅ **Offline-First Frontend**: IndexedDB + WebSocket sync
✅ **Zero Build Frontend**: Pure UMD modules, no bundler needed

---

## Architecture & Philosophy

### The Mishkah.js Philosophy

This codebase is built on **7 Architectural Pillars** (see README.md):

1. **State Centralization**: Single source of truth (`database` object)
2. **Constrained DSL**: Enforced separation of structure and behavior
3. **Functional Atom Classification**: Smart HTML wrappers by category
4. **Composable Components**: Reusable UI building blocks
5. **Integrated Global Environment**: Built-in i18n, theming, RTL
6. **Standardized Utilities**: Unified toolbox to prevent dependency chaos
7. **Conscious Reconstruction**: Surgical DOM updates with VDOM + LIS algorithm

### Governance Triad (Security System)

1. **Guardian**: Prevents errors before they happen (VDOM-level firewall)
2. **Auditor**: Monitors and grades component performance (-7 to +7 scale)
3. **DevTools**: Analyzes logs and issues verdicts (promote/isolate components)

⚠️ **Note**: Guardian/Auditor are partially implemented. Treat as no-ops in current code.

### Backend Architecture (3-Layer)

```
┌─────────────────────────────────────┐
│  HTTP + WebSocket Server Layer      │
│  - REST API Endpoints (12+ types)   │
│  - WebSocket Message Handlers       │
│  - Static File Serving              │
│  - Session Management               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Business Logic Layer                │
│  - ModuleStore (CRUD operations)     │
│  - HybridStore (Cache + Persistence) │
│  - SchemaEngine (Record validation)  │
│  - SequenceManager (Auto-increment)  │
│  - EventStore (Event sourcing)       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Data Persistence Layer              │
│  - SQLite (Primary storage)          │
│  - PostgreSQL (Event archive)        │
│  - File System (Config, logs)        │
└─────────────────────────────────────┘
```

### Frontend Architecture (Mishkah.js)

```
View Layer (DSL Components)
    ↓
State Layer (Centralized Database)
    ↓
Events Layer (Orders)
    ↓
Services Layer (WebSocket, IndexedDB, Network)
```

---

## Directory Structure

```
/home/user/os/
├── src/                          # Backend Node.js server code
│   ├── server.js                 # Main HTTP + WebSocket server (6,618 lines)
│   ├── moduleStore.js            # Core data store with versioning (853 lines)
│   ├── hybridStore.js            # Hybrid in-memory + SQLite (306 lines)
│   ├── eventStore.js             # Event sourcing system (430 lines)
│   ├── sequenceManager.js        # Auto-incrementing sequences (274 lines)
│   ├── queryBuilder.js           # Dynamic SQL query builder (559 lines)
│   ├── logger.js                 # Pino logger configuration (12 lines)
│   ├── utils.js                  # Utility functions (153 lines)
│   ├── db/                       # Database layer
│   │   ├── sqlite.js             # SQLite persistence (695 lines)
│   │   ├── dynamic-sqlite.js     # Dynamic table creation (562 lines)
│   │   ├── schema-loader.js      # Schema loading (192 lines)
│   │   ├── schema-validator.js   # Schema validation (292 lines)
│   │   ├── schema-migrator.js    # Schema migration (330 lines)
│   │   └── schema-logger.js      # Schema logging (183 lines)
│   ├── schema/                   # Schema engine
│   │   ├── engine.js             # Core schema engine (171 lines)
│   │   ├── fk-resolver.js        # Foreign key resolver (275 lines)
│   │   ├── legacy-loader.js      # Legacy loader (93 lines)
│   │   └── registry.js           # Schema registry (283 lines)
│   └── tasks/                    # Administrative tasks
│       └── hybridStoreTasks.js   # Migration/load test tasks (306 lines)
│
├── static/                       # Frontend static files
│   ├── lib/                      # Mishkah.js framework libraries (~800KB)
│   │   ├── mishkah.core.js       # Core framework (58KB)
│   │   ├── mishkah.div.js        # DSL & VDOM (84KB)
│   │   ├── mishkah-htmlx.js      # Enhanced templating (143KB)
│   │   ├── mishkah-ui.js         # UI component library (78KB)
│   │   ├── mishkah-utils.js      # Utility functions (120KB)
│   │   ├── mishkah.store.js      # State management (21KB)
│   │   ├── mishkah.templates.js  # Template system (92KB)
│   │   └── mishkah-css.css       # Base styles (38KB)
│   ├── pos/                      # POS application
│   │   ├── posv2.js              # Main POS app
│   │   ├── kds.js                # Kitchen Display System
│   │   └── pos_finance.js        # Financial reports
│   ├── projects/                 # Project-specific implementations
│   │   ├── gym/                  # Gym management system
│   │   └── physical-therapy-clinic/  # PT clinic ERP
│   ├── js/                       # Shared JavaScript modules
│   └── vendor/                   # Third-party libraries
│
├── data/                         # Configuration and data
│   ├── modules.json              # Module definitions
│   ├── branches.config.json      # Branch configuration
│   ├── sequence-rules.json       # Sequence generation rules
│   ├── schemas/                  # JSON schema definitions
│   │   └── pos_schema.json       # Complete POS schema (65+ tables)
│   └── branches/                 # Per-branch data storage
│       ├── dar/                  # Main branch
│       ├── remal/                # Cloud branch
│       └── gim/                  # Gym branch
│
├── tests/                        # Test files (Node.js test runner)
├── docs/                         # Documentation
├── examples/                     # Example implementations
├── package.json                  # Node.js dependencies
└── README.md                     # Philosophy and vision (703 lines)
```

### Key Files by Purpose

| File | Purpose | Lines |
|------|---------|-------|
| `src/server.js` | Main application entry point | 6,618 |
| `src/moduleStore.js` | Core CRUD operations | 853 |
| `src/hybridStore.js` | Performance cache layer | 306 |
| `src/eventStore.js` | Event sourcing system | 430 |
| `data/schemas/pos_schema.json` | POS database schema | Large |
| `static/lib/mishkah.core.js` | Frontend framework kernel | 1,226 |
| `static/pos/posv2.js` | Main POS application | Large |

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | Latest (ES Modules) | Runtime environment |
| **ws** | ^8.18.0 | WebSocket server |
| **better-sqlite3** | ^9.4.3 | SQLite driver (primary storage) |
| **pg** | ^8.12.0 | PostgreSQL client (event archiving) |
| **pino** | ^9.1.0 | Structured JSON logging |
| **prom-client** | ^15.1.3 | Prometheus metrics |

**No build tools required** - pure runtime Node.js

### Frontend

| Technology | Purpose |
|------------|---------|
| **Mishkah.js** | Custom VDOM framework (zero build) |
| **Native WebSocket** | Real-time bidirectional communication |
| **IndexedDB** | Client-side offline storage |
| **TailwindCSS-inspired** | Utility-first CSS classes |

### Database Schema

- **SQLite**: Primary storage (files in `data/branches/{branchId}/modules/{moduleId}/`)
- **PostgreSQL**: Optional event archiving
- **JSON Schema**: Defines table structures dynamically

---

## Development Workflow

### Starting Development

```bash
# 1. Clone the repository
git clone <repo-url>
cd os

# 2. Install dependencies
npm install

# 3. Create branch directories (if needed)
mkdir -p data/branches/dar/modules/pos
mkdir -p data/branches/dar/modules/gym

# 4. Start development server
npm run dev
```

### Available Scripts

```bash
npm start                  # Production mode
npm run dev                # Development mode (verbose logging)
npm test                   # Run test suite
npm run hybrid:migrate     # SQLite schema migration
npm run hybrid:loadtest    # Load testing
```

### Development Server Behavior

- **Port**: 3200 (default)
- **Static Files**: Served from `/static`
- **WebSocket**: Same port as HTTP (upgrade connection)
- **Hot Reload**: Not built-in (restart server manually)
- **Logging**: JSON format via Pino

### Testing Strategy

- **Framework**: Node.js built-in test runner (`node --test`)
- **Location**: `/tests/` directory
- **Coverage**: Unit tests for core modules
- **Focus Areas**:
  - Version conflicts
  - FK resolution
  - Sequence generation
  - Schema validation

---

## Key Conventions

### Naming Conventions

#### Backend

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `module-store.js`, `hybrid-store.js` |
| Classes | PascalCase | `ModuleStore`, `SchemaEngine` |
| Functions | camelCase | `createId`, `nowIso` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_CACHE_TTL_MS` |

#### Database

| Type | Convention | Example |
|------|------------|---------|
| Table names | snake_case | `order_header`, `job_order_detail` |
| Field names (code) | camelCase | `createdAt`, `updatedAt` |
| Field names (SQL) | snake_case | `created_at`, `updated_at` |
| Primary keys | String with prefix | `ord-uuid`, `DAR-001003` |
| Timestamps | ISO 8601 | `2025-11-17T10:30:00.000Z` |
| Version fields | Integer | `1`, `2`, `3` |

### API Response Format

#### Success Response
```javascript
{
  branchId: "dar",
  moduleId: "pos",
  data: { id: "123", name: "Item" },
  meta: { timestamp: "2025-11-17T10:30:00.000Z" }
}
```

#### Error Response
```javascript
{
  error: "version-conflict",
  message: "Version mismatch: expected 2, got 1",
  details: { expected: 2, received: 1 }
}
```

### Code Quality Standards

✅ **DO**:
- Use `logger.info()` or `logger.warn()` for logging
- Always catch and return structured errors
- Use `SchemaEngine` for proper type handling
- Use `deepClone()` to prevent mutations
- Always `await` database operations
- Add version fields for optimistic locking
- Broadcast changes via WebSocket

❌ **DON'T**:
- Use `console.log` in production code
- Mutate state directly
- Skip error handling
- Forget to broadcast updates
- Use synchronous SQLite operations in handlers

---

## Common Tasks

### Task 1: Add a New REST Endpoint

**File**: `src/server.js`

```javascript
// 1. Add route handler
httpServer.on('request', async (req, res) => {
  // ... existing routes ...

  if (req.method === 'POST' && req.url.startsWith('/api/my-new-endpoint')) {
    try {
      const body = await parseBody(req);
      const { branchId, moduleId, data } = body;

      // Use moduleStore for operations
      const result = await moduleStore.insert(
        branchId,
        moduleId,
        'my_table',
        data
      );

      // Broadcast to connected clients
      broadcast({
        type: 'insert',
        branchId,
        moduleId,
        table: 'my_table',
        data: result
      });

      sendJSON(res, 200, result);
    } catch (err) {
      logger.error({err}, 'my-new-endpoint error');
      sendJSON(res, 500, {error: 'internal-error', message: err.message});
    }
    return;
  }
});
```

### Task 2: Add a New Table to Schema

**File**: `data/schemas/pos_schema.json`

```json
{
  "my_new_table": {
    "fields": [
      {"name": "id", "type": "TEXT", "primaryKey": true},
      {"name": "name", "type": "TEXT", "required": true},
      {"name": "createdAt", "type": "TEXT", "defaultFn": "NOW_ISO"},
      {"name": "version", "type": "INTEGER", "defaultValue": 1}
    ],
    "foreignKeys": [
      {
        "field": "userId",
        "references": "users",
        "referencesField": "id"
      }
    ]
  }
}
```

Then run migration:
```bash
npm run hybrid:migrate
```

### Task 3: Add Frontend Component (Mishkah.js)

**File**: `static/my-app/app.js`

```javascript
// Define body function
Mishkah.app.setBody(function(db, D) {
  return D.Containers.Div({attrs: {class: 'container'}}, [
    D.Text.H1({}, ['My App']),
    D.Forms.Button(
      {attrs: {'data-m-gkey': 'submit'}},
      ['Submit']
    )
  ]);
});

// Create app
const app = Mishkah.app.createApp(
  // Initial state
  {
    title: 'My App',
    items: []
  },
  // Orders (event handlers)
  {
    'btn.submit': {
      on: ['click'],
      gkeys: ['submit'],
      handler: function(event, ctx) {
        ctx.setState(function(prevState) {
          return {
            ...prevState,
            items: [...prevState.items, {id: Date.now(), text: 'New'}]
          };
        });
      }
    }
  }
);

// Mount to DOM
app.mount('#app');
```

### Task 4: Add WebSocket Message Handler

**File**: `src/server.js`

```javascript
ws.on('message', async (rawMessage) => {
  try {
    const message = JSON.parse(rawMessage);

    // Add new message type
    if (message.type === 'my-custom-action') {
      const { branchId, moduleId, data } = message;

      // Perform action
      const result = await moduleStore.update(
        branchId,
        moduleId,
        'my_table',
        data
      );

      // Broadcast to all clients
      broadcast({
        type: 'my-custom-action-result',
        branchId,
        moduleId,
        data: result
      });

      // Respond to sender
      ws.send(JSON.stringify({
        type: 'my-custom-action-ack',
        data: result
      }));
    }
  } catch (err) {
    logger.error({err}, 'WebSocket message error');
  }
});
```

### Task 5: Add Sequence Rule

**File**: `data/sequence-rules.json`

```json
{
  "my_table": {
    "pattern": "{branchPrefix}-{seq:6}",
    "start": 1,
    "increment": 1,
    "description": "Sequence for my_table IDs"
  }
}
```

**Usage in code**:
```javascript
const newId = await sequenceManager.getNextId(branchId, moduleId, 'my_table');
// Returns: "DAR-000001"
```

---

## Mishkah.js Framework Guide

### Core Principles (Critical)

1. **NO HTML strings in body function** - Always use DSL atoms
2. **NO direct event handlers** - Use orders + gkeys
3. **NO state mutations** - Always return new objects
4. **ALWAYS provide keys for lists** - For VDOM reconciliation

### DSL Atom Categories

**⚠️ Most common AI mistake**: Confusing `Forms` vs `Inputs`

```javascript
const D = Mishkah.DSL;

// ✅ CORRECT
D.Forms.Button({}, ['Submit'])      // Button is in Forms
D.Inputs.Input({}, [])              // Input is in Inputs

// ❌ WRONG
D.Inputs.Button({}, ['Submit'])     // NO! Button is not in Inputs
D.Forms.Input({}, [])               // NO! Input is not in Forms
```

### Complete Atom Reference

```javascript
// Containers (layout/structure)
D.Containers.Div, Section, Article, Header, Footer, Main, Nav, Aside

// Text (typography)
D.Text.P, Span, H1, H2, H3, H4, H5, H6, Strong, Em, B, I, Small, Code, A

// Lists
D.Lists.Ul, Ol, Li, Dl, Dt, Dd

// Forms (structure, NOT inputs)
D.Forms.Form, Label, Button, Fieldset, Legend, Progress, Meter

// Inputs (actual input elements)
D.Inputs.Input, Textarea, Select, Option

// Media
D.Media.Img, Video, Audio, Iframe

// Tables
D.Tables.Table, Thead, Tbody, Tr, Th, Td

// SVG
D.SVG.Svg, Path, Circle, Rect, etc.

// Misc
D.Misc.Hr, Br
```

### Application Structure

```javascript
// Step 1: Define body function (pure view)
Mishkah.app.setBody(function(database, D) {
  return D.Containers.Div({}, [
    D.Text.H1({}, [database.title])
  ]);
});

// Step 2: Create app with state and orders
const app = Mishkah.app.createApp(
  // database (state)
  {
    title: 'My App',
    count: 0
  },
  // orders (event handlers)
  {
    'counter.increment': {
      on: ['click'],
      gkeys: ['inc'],
      handler: (event, ctx) => {
        ctx.setState(s => ({...s, count: s.count + 1}));
      }
    }
  }
);

// Step 3: Mount to DOM
app.mount('#app');
```

### Event System (Orders)

**Key concept**: All events are delegated, not attached to elements.

```javascript
{
  'order.name': {
    on: ['click', 'input', 'change'],  // Event types
    keys: ['item-123', 'product-*'],   // data-m-key matches
    gkeys: ['submit', 'cancel'],       // data-m-gkey matches
    disabled: false,                   // Optional: disable order
    handler: function(event, ctx) {
      // Available methods:
      ctx.getState()           // Get current state
      ctx.setState(updater)    // Update state
      ctx.rebuild()            // Force re-render
      ctx.freeze()             // Pause updates
      ctx.unfreeze()           // Resume updates
      ctx.scopeQuery('selector')     // Query within scope
      ctx.scopeQueryAll('selector')  // Query all within scope
      ctx.stop()               // Stop propagation
    }
  }
}
```

### State Management Rules

```javascript
// ❌ WRONG - Direct mutation
handler: (e, ctx) => {
  const state = ctx.getState();
  state.count++;  // Mutating!
  ctx.setState(state);
}

// ✅ CORRECT - Functional update
handler: (e, ctx) => {
  ctx.setState(function(prevState) {
    return {
      ...prevState,
      count: prevState.count + 1
    };
  });
}

// ✅ CORRECT - Object merge (shallow)
handler: (e, ctx) => {
  ctx.setState({count: ctx.getState().count + 1});
}
```

### Common Patterns

#### Pattern: Counter
```javascript
Mishkah.app.setBody((db, D) =>
  D.Containers.Div({}, [
    D.Text.P({}, ['Count: ' + db.count]),
    D.Forms.Button({attrs: {'data-m-gkey': 'inc'}}, ['+'])
  ])
);

const app = Mishkah.app.createApp(
  {count: 0},
  {
    'inc': {
      on: ['click'],
      gkeys: ['inc'],
      handler: (e, ctx) => ctx.setState(s => ({count: s.count + 1}))
    }
  }
);
```

#### Pattern: List with Delete
```javascript
Mishkah.app.setBody((db, D) =>
  D.Lists.Ul({}, db.items.map(item =>
    D.Lists.Li({attrs: {key: item.id}}, [
      item.text,
      D.Forms.Button({
        attrs: {'data-m-key': 'delete-' + item.id}
      }, ['Delete'])
    ])
  ))
);

const app = Mishkah.app.createApp(
  {items: [{id: 1, text: 'Task 1'}]},
  {
    'list.delete': {
      on: ['click'],
      keys: ['delete-*'],
      handler: (e, ctx) => {
        const itemId = extractIdFromKey(e.target.dataset.mKey);
        ctx.setState(s => ({
          items: s.items.filter(i => i.id !== itemId)
        }));
      }
    }
  }
);
```

---

## Testing & Deployment

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --test tests/my-test.test.js
```

### Test Structure (Node.js Test Runner)

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('my feature works', async (t) => {
  const result = await myFunction();
  assert.strictEqual(result, expected);
});
```

### Deployment Architecture

```
┌─────────────────────────────────────┐
│  Reverse Proxy (nginx/caddy)        │
│  - SSL termination                   │
│  - WebSocket upgrade                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Node.js Server (mishkah-ws2)       │
│  - HTTP on port 3200                 │
│  - WebSocket on same port            │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  SQLite files                        │
│  data/branches/*/modules/*/*.db      │
└─────────────────────────────────────┘
```

### Deployment Steps

1. Clone repository
2. `npm install --production`
3. Configure environment variables
4. Initialize branch directories
5. Copy seed data and schemas
6. `npm start`

### Production Considerations

- **Cache TTL**: Adjust `HYBRID_CACHE_TTL_MS` based on load (default: 1500ms)
- **Event Archiving**: Enable PostgreSQL for event persistence
- **Metrics**: Enable Prometheus with `WS2_METRICS=1`
- **Logging**: Set `LOG_LEVEL=info` or `warn` in production
- **WebSocket Limits**: Configure reverse proxy for WebSocket timeouts

---

## Critical Patterns

### Pattern 1: Version Conflict Handling

**Always handle version conflicts in updates:**

```javascript
try {
  const result = await moduleStore.update(
    branchId,
    moduleId,
    'order_header',
    {
      id: 'ord-123',
      status: 'completed',
      version: 2  // CRITICAL: Include current version
    }
  );
} catch (err) {
  if (err.message.includes('version')) {
    // Handle version conflict
    logger.warn('Version conflict detected, refreshing data');
    // Fetch latest version and retry
  }
}
```

### Pattern 2: FK Population

**Always populate foreign keys when fetching:**

```javascript
const result = await moduleStore.get(
  branchId,
  moduleId,
  'order_header',
  {id: 'ord-123'},
  {
    populateFKs: true,  // CRITICAL: Populate related records
    fkFields: ['customerId', 'userId']
  }
);

// Result includes populated objects:
// result.customer = {...}
// result.user = {...}
```

### Pattern 3: Sequence ID Generation

**Use sequence manager for auto-incrementing IDs:**

```javascript
const newId = await sequenceManager.getNextId(
  branchId,
  moduleId,
  'order_header'
);
// Returns: "DAR-000123"

const record = {
  id: newId,
  customerId: 'cust-456',
  total: 100.00,
  createdAt: nowIso(),
  version: 1
};

await moduleStore.insert(branchId, moduleId, 'order_header', record);
```

### Pattern 4: Broadcasting Updates

**Always broadcast changes to connected clients:**

```javascript
// After insert/update/delete
broadcast({
  type: 'insert',  // or 'update', 'delete'
  branchId,
  moduleId,
  table: 'order_header',
  data: result
});

// Table-specific broadcast
broadcast({
  type: 'table-update',
  branchId,
  moduleId,
  table: 'order_header',
  tableId: 'order_header',
  data: result
});
```

### Pattern 5: Hybrid Store Cache Invalidation

**Invalidate cache after mutations:**

```javascript
// Insert invalidates cache automatically
await hybridStore.insert(branchId, moduleId, table, record);

// Manual invalidation if needed
hybridStore.invalidate(branchId, moduleId, table, filters);
```

---

## Common Pitfalls

### Backend Pitfalls

#### ❌ Pitfall 1: Forgetting Version Fields
```javascript
// WRONG - No version field
await moduleStore.update(branchId, moduleId, 'order_header', {
  id: 'ord-123',
  status: 'completed'
});

// CORRECT - Include version
await moduleStore.update(branchId, moduleId, 'order_header', {
  id: 'ord-123',
  status: 'completed',
  version: 2
});
```

#### ❌ Pitfall 2: Not Broadcasting Changes
```javascript
// WRONG - No broadcast
const result = await moduleStore.insert(branchId, moduleId, table, data);
sendJSON(res, 200, result);

// CORRECT - Broadcast to all clients
const result = await moduleStore.insert(branchId, moduleId, table, data);
broadcast({type: 'insert', branchId, moduleId, table, data: result});
sendJSON(res, 200, result);
```

#### ❌ Pitfall 3: Using console.log
```javascript
// WRONG - console.log
console.log('User logged in:', userId);

// CORRECT - Use logger
logger.info({userId}, 'User logged in');
```

#### ❌ Pitfall 4: Synchronous SQLite Operations
```javascript
// WRONG - Blocking operation
const result = db.prepare('SELECT * FROM users').all();

// CORRECT - Use async wrapper or move to worker thread
const result = await asyncWrapper(() => db.prepare('SELECT * FROM users').all());
```

### Frontend Pitfalls (Mishkah.js)

#### ❌ Pitfall 1: Using HTML Strings
```javascript
// WRONG - HTML string
function body(db, D) {
  return '<div>Hello</div>';
}

// CORRECT - DSL atoms
function body(db, D) {
  return D.Containers.Div({}, ['Hello']);
}
```

#### ❌ Pitfall 2: Attaching Events Directly
```javascript
// WRONG - Direct event handler
D.Forms.Button({
  attrs: {
    onclick: function() { alert('clicked'); }
  }
}, ['Click'])

// CORRECT - Use orders + gkey
D.Forms.Button({attrs: {'data-m-gkey': 'alert'}}, ['Click'])
```

#### ❌ Pitfall 3: Mutating State
```javascript
// WRONG - Direct mutation
handler: (e, ctx) => {
  ctx.getState().count++;
}

// CORRECT - Immutable update
handler: (e, ctx) => {
  ctx.setState(s => ({count: s.count + 1}));
}
```

#### ❌ Pitfall 4: Forgetting Keys in Lists
```javascript
// WRONG - No key attribute
db.items.map(item => D.Lists.Li({}, [item.text]))

// CORRECT - Key for reconciliation
db.items.map(item => D.Lists.Li({attrs: {key: item.id}}, [item.text]))
```

#### ❌ Pitfall 5: Wrong Atom Category
```javascript
// WRONG - Button is not in Inputs
D.Inputs.Button({}, ['Submit'])

// CORRECT - Button is in Forms
D.Forms.Button({}, ['Submit'])
```

---

## Additional Resources

### Documentation Files

| File | Purpose |
|------|---------|
| `/README.md` | Philosophy and 7 architectural pillars (703 lines) |
| `/docs/MISHKAH-TECHNICAL-GUIDE.md` | Technical reference for AI systems |
| `/docs/MISHKAH_COOKBOOK.md` | Recipes and patterns |
| `/docs/PERFORMANCE_OPTIMIZATION_GUIDE.md` | Performance tuning |
| `/docs/MISHKAH_BACKEND_GUIDE.md` | Backend architecture deep dive |
| `/ENDPOINT_EXPLANATION.md` | REST API endpoint documentation |
| `/BROADCASTING_FIX_EXPLANATION.md` | WebSocket broadcasting system |

### Code Examples

- `/static/examples/sales-report.html` - Real-world POS example (1318 lines)
- `/static/pos/posv2.js` - Production POS application
- `/static/pos/kds.js` - Kitchen Display System

### Key Schemas

- `/data/schemas/pos_schema.json` - Complete POS database schema (65+ tables)
- `/data/modules.json` - Module definitions
- `/data/branches.config.json` - Branch-to-module mappings

---

## Quick Reference Card

### Minimal Mishkah.js App
```javascript
Mishkah.app.setBody((db, D) => D.Text.H1({}, ['Hello']));
Mishkah.app.createApp({}, {}).mount('#app');
```

### REST API Pattern
```javascript
// POST /api/endpoint
{
  branchId: "dar",
  moduleId: "pos",
  data: { /* record */ }
}
```

### WebSocket Message Pattern
```javascript
ws.send(JSON.stringify({
  type: 'insert',
  branchId: 'dar',
  moduleId: 'pos',
  table: 'order_header',
  data: { /* record */ }
}));
```

### Module Store Operations
```javascript
// Insert
await moduleStore.insert(branchId, moduleId, table, data);

// Update (with version)
await moduleStore.update(branchId, moduleId, table, {id, version, ...data});

// Get (with FK population)
await moduleStore.get(branchId, moduleId, table, {id}, {populateFKs: true});

// Delete
await moduleStore.delete(branchId, moduleId, table, {id});

// Query
await moduleStore.query(branchId, moduleId, table, filters, options);
```

---

## When Working with This Codebase

### Before Making Changes

1. ✅ Read relevant documentation in `/docs`
2. ✅ Check existing patterns in similar code
3. ✅ Understand the event sourcing implications
4. ✅ Consider real-time broadcasting needs
5. ✅ Review schema definitions if touching data layer

### When Adding Features

1. ✅ Update schema if needed (`data/schemas/*.json`)
2. ✅ Add/modify server endpoints (`src/server.js`)
3. ✅ Implement business logic in appropriate layer
4. ✅ Add WebSocket broadcasting
5. ✅ Update frontend components if UI change
6. ✅ Add tests for critical paths
7. ✅ Update this CLAUDE.md if introducing new patterns

### When Fixing Bugs

1. ✅ Check logs (JSON format via Pino)
2. ✅ Verify version field handling
3. ✅ Check FK resolution
4. ✅ Verify broadcasting is working
5. ✅ Test with multiple concurrent clients
6. ✅ Add regression test

---

## Final Notes for AI Assistants

### This Codebase is Different

- **No bundlers/transpilers**: Pure runtime JavaScript (frontend and backend)
- **Philosophical framework**: Not just code, but a design philosophy
- **Event sourcing**: Every mutation is logged and versioned
- **Real-time first**: WebSocket broadcasting is core, not optional
- **Multi-tenant**: Branch and module isolation is fundamental
- **Bilingual**: Arabic and English throughout (respect both)

### Key Mental Models

1. **Backend**: Think "event stream" not "CRUD database"
2. **Frontend**: Think "state → view" not "imperative DOM manipulation"
3. **Communication**: Think "broadcast to all" not "request-response"
4. **Data**: Think "eventual consistency" not "immediate consistency"
5. **Architecture**: Think "modular domains" not "monolithic app"

### When in Doubt

1. Check `/README.md` for philosophy
2. Check `/docs/MISHKAH-TECHNICAL-GUIDE.md` for Mishkah.js specifics
3. Check `src/server.js` for server patterns
4. Check `static/pos/posv2.js` for frontend patterns
5. Ask clarifying questions rather than guessing

---

**END OF CLAUDE.md**

*This document is maintained by AI assistants for AI assistants. When you make significant changes to the codebase, update this file to reflect new patterns, conventions, or architectural decisions.*

**Last Updated**: 2025-11-17
**Maintained By**: AI Assistants working with mishkah-os/os

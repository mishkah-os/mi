# Mishkah Simple Store - Documentation

## بسم الله الرحمن الرحيم

**Module:** `mishkah.simple-store.js`
**Purpose:** Realtime collaborative data layer with WebSocket sync and offline support
**Status:** Beta (Use in production with caution)
**Version:** Inferred from code analysis
**Last Updated:** 2025-11-09

---

## 🎯 Vision & Philosophy

### The Big Idea:
**Mishkah Store aims to compete with Firebase/Supabase** by providing:
1. **Smart Data Fetching**: REST API fallback + WebSocket realtime sync
2. **Offline-First**: IndexedDB caching for offline resilience
3. **Simple API**: Minimal boilerplate compared to Firebase
4. **Self-Hosted**: Full control over your data infrastructure
5. **Integrated**: Works seamlessly with Mishkah apps

### Architecture:
```
┌─────────────────────────────────────────┐
│         Mishkah App (Frontend)          │
│                                         │
│  db.watch('users', (list) => {...})    │
│  db.insert('users', {...})             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Mishkah Simple Store            │
│  ┌──────────────────────────────────┐   │
│  │  Priority System:                │   │
│  │  1. WebSocket (live)             │   │
│  │  2. Smart Fetch Cache            │   │
│  │  3. REST API Cache               │   │
│  │  4. IndexedDB (offline)          │   │
│  └──────────────────────────────────┘   │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
┌──────────────┐  ┌──────────────┐
│  WebSocket   │  │  REST API    │
│  (Realtime)  │  │  (Initial)   │
└──────────────┘  └──────────────┘
        │             │
        └──────┬──────┘
               ▼
┌─────────────────────────────────────────┐
│          Your Backend Server            │
│  - WebSocket server for events          │
│  - REST API: GET /api/branches/:id      │
│  - Database (PostgreSQL, MySQL, etc.)   │
└─────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Basic Setup:
```javascript
// 1. Load the library
<script src="/lib/mishkah.store.js"></script>
<script src="/lib/mishkah.simple-store.js"></script>

// 2. Create DB instance
const db = createDB({
  branchId: 'app:restaurant-main',
  moduleId: 'orders',
  wsUrl: 'wss://api.myapp.com',  // Optional: WebSocket URL
  wsPath: '/ws',                 // Optional: WebSocket path
  useIndexedDB: true,            // Enable offline cache
  autoConnect: true,             // Auto-connect on creation
  objects: {
    orders: {
      table: 'orders_table',
      toRecord: (value, ctx) => ({
        id: ctx.uuid('order'),
        branchId: ctx.branchId,
        items: value.items,
        total: value.total,
        createdAt: ctx.now()
      }),
      fromRecord: (record) => ({
        id: record.id,
        items: record.items,
        total: record.total,
        createdAt: record.createdAt
      })
    }
  }
});

// 3. Connect (if autoConnect: false)
await db.connect();

// 4. Watch for changes
db.watch('orders', (ordersList) => {
  console.log('Orders updated:', ordersList);
  // Update Mishkah app state
  app.setState({orders: ordersList});
});

// 5. Insert data
await db.insert('orders', {
  items: ['Coffee', 'Cake'],
  total: 45.50
});

// 6. Update data
await db.update('orders', {
  id: 'order-abc123',
  items: ['Coffee', 'Cake', 'Cookie'],
  total: 52.00
});

// 7. Delete data
await db.delete('orders', {id: 'order-abc123'});
```

---

## 📦 API Reference

### createDB(options)

Creates a new database instance.

#### Options:
```javascript
{
  branchId: 'string',        // Required: Workspace/branch identifier
  moduleId: 'string',        // Required: Module/collection identifier
  role: 'string',            // Optional: Client role (default: 'ws2-simple')
  wsUrl: 'string',           // Optional: WebSocket server URL
  wsPath: 'string',          // Optional: WebSocket path (default: '/ws')
  useIndexedDB: boolean,     // Optional: Enable offline cache (default: true)
  dbVersion: number,         // Optional: IndexedDB version (default: 1)
  autoConnect: boolean,      // Optional: Auto-connect (default: true)
  autoReconnect: boolean,    // Optional: Auto-reconnect on disconnect (default: true)
  historyLimit: number,      // Optional: Event history limit (default: 50)
  logger: object,            // Optional: Custom logger (default: console)
  objects: {                 // Required: Object definitions
    name: {
      table: 'string',       // SQL table name
      moduleId: 'string',    // Override module ID
      idPrefix: 'string',    // ID prefix (default: 'rec')
      defaults: object,      // Default values
      meta: object,          // Metadata
      toRecord: function,    // Transform to database record
      fromRecord: function,  // Transform from database record
      ensure: function       // Validate/enrich record
    }
  }
}
```

#### Returns:
Database API object.

---

### db.connect()

Connects to WebSocket server and fetches initial data.

```javascript
await db.connect();
```

**Returns:** Promise<void>

---

### db.disconnect()

Disconnects from WebSocket server.

```javascript
db.disconnect();
```

---

### db.ready()

Returns a promise that resolves when initial data is loaded.

```javascript
await db.ready();
```

---

### db.watch(name, handler, options)

Watches for changes to a collection.

```javascript
const unwatch = db.watch('orders', (ordersList, meta) => {
  console.log('New orders:', ordersList);
  console.log('Table name:', meta.table);
}, {
  immediate: true  // Call handler immediately with current data
});

// Stop watching
unwatch();
```

#### Parameters:
- `name` (string): Collection name
- `handler` (function): Callback(list, meta)
- `options.immediate` (boolean): Call immediately (default: true)

#### Returns:
Unwatch function.

---

### db.list(name)

Gets current data snapshot (synchronous).

```javascript
const orders = db.list('orders');
console.log(orders);
```

---

### db.insert(name, value, meta)

Inserts a new record.

```javascript
await db.insert('orders', {
  items: ['Coffee'],
  total: 15.00
}, {
  // Optional metadata
  source: 'manual'
});
```

#### Returns:
Promise with operation result.

---

### db.update(name, value, meta)

Updates an existing record (upsert behavior).

```javascript
await db.update('orders', {
  id: 'order-123',
  items: ['Coffee', 'Tea'],
  total: 25.00
});
```

#### Returns:
Promise with operation result.

---

### db.delete(name, recordRef, meta)

Deletes a record.

```javascript
await db.delete('orders', {id: 'order-123'});
```

#### Parameters:
- `recordRef`: Object with `id` field or record ID string

#### Returns:
Promise with operation result.

---

### db.status(handler)

Listens to connection status changes.

```javascript
const unlisten = db.status((status) => {
  console.log('Connection status:', status);
  // Possible values: 'idle', 'connecting', 'connected', 'disconnected', 'error'
});

// Stop listening
unlisten();
```

---

### db.register(name, definition)

Dynamically registers a new collection.

```javascript
db.register('products', {
  table: 'products_table',
  toRecord: (value, ctx) => ({
    id: ctx.uuid('prod'),
    name: value.name,
    price: value.price,
    createdAt: ctx.now()
  })
});
```

---

## 🔄 Smart Fetching Mechanism

### How It Works:

1. **First watch() call** triggers automatic REST API fetch:
   ```
   GET /api/branches/{branchId}/modules/{moduleId}
   ```

2. **Response format:**
   ```json
   {
     "tables": {
       "orders_table": [
         {"id": "1", "items": [...], "total": 45.50},
         {"id": "2", "items": [...], "total": 32.00}
       ],
       "products_table": [...]
     }
   }
   ```

3. **Data is cached** in `restApiCache` map.

4. **WebSocket connection** starts in parallel.

5. **Priority system:**
   - If WebSocket has data → use it
   - Else if Smart Fetch cache has data → use it
   - Else if REST API cache has data → use it
   - Else → return empty array

---

## 🔧 Object Definitions

### toRecord(value, ctx)

Transforms user-provided value to database record.

#### Context API:
```javascript
{
  branchId: 'string',
  moduleId: 'string',
  now: () => ISO8601_string,
  uuid: (prefix) => 'prefix-uuid',
  ensure: (record) => enriched_record
}
```

#### Example:
```javascript
toRecord: (value, ctx) => {
  // User calls: db.insert('orders', {items: [...], total: 45})
  return ctx.ensure({
    id: ctx.uuid('order'),              // Generate ID
    branchId: ctx.branchId,             // Add branch context
    clientUuid: ctx.uuid('client'),     // Client identifier
    items: value.items,
    total: value.total,
    status: value.status || 'pending',  // Default
    createdAt: ctx.now(),               // Timestamp
    serverAt: ctx.now()
  });
}
```

---

### fromRecord(record, ctx)

Transforms database record to user-facing object.

#### Example:
```javascript
fromRecord: (record) => {
  // Transform DB format to app format
  return {
    id: record.id,
    items: record.items,
    total: record.total,
    status: record.status,
    createdAt: record.createdAt,
    // Hide internal fields
    // Don't expose: serverAt, clientUuid, branchId
  };
}
```

---

### ensure(record)

Validates and enriches record before saving.

#### Example:
```javascript
ensure: (record) => {
  // Validation
  if (!record.total || record.total < 0) {
    throw new Error('Invalid total');
  }

  // Enrichment
  return {
    ...record,
    totalFormatted: formatCurrency(record.total),
    itemCount: record.items ? record.items.length : 0
  };
}
```

---

## 📊 Integration with Mishkah Apps

### Example: Realtime Dashboard

```javascript
// 1. Create store
const store = createDB({
  branchId: 'restaurant:main',
  moduleId: 'orders',
  objects: {
    orders: {
      table: 'orders',
      toRecord: (v, ctx) => ctx.ensure({
        id: ctx.uuid('order'),
        items: v.items,
        total: v.total,
        createdAt: ctx.now()
      }),
      fromRecord: (r) => ({
        id: r.id,
        items: r.items,
        total: r.total,
        createdAt: r.createdAt
      })
    }
  }
});

// 2. Create Mishkah app
Mishkah.app.setBody(function(db, D) {
  return D.Containers.Div({}, [
    D.Text.H1({}, ['Orders (' + db.orders.length + ')']),
    D.Lists.Ul({}, db.orders.map(function(order) {
      return D.Lists.Li({attrs: {key: order.id}}, [
        'Order #' + order.id + ': $' + order.total
      ]);
    }))
  ]);
});

const app = Mishkah.app.createApp(
  {orders: []},
  {}
);
app.mount('#app');

// 3. Connect store to app
await store.connect();
store.watch('orders', function(ordersList) {
  app.setState({orders: ordersList});
});

// 4. Insert order (realtime update!)
await store.insert('orders', {
  items: ['Coffee', 'Cake'],
  total: 35.50
});
```

---

## 🌐 Backend Requirements

### REST API Endpoint:

```
GET /api/branches/:branchId/modules/:moduleId
```

#### Response Format:
```json
{
  "tables": {
    "table_name_1": [
      {"id": "1", "...": "..."},
      {"id": "2", "...": "..."}
    ],
    "table_name_2": [...]
  },
  "meta": {
    "timestamp": "2025-11-09T12:00:00Z",
    "count": 42
  }
}
```

---

### WebSocket Server:

#### Events to Send to Client:

**1. Snapshot Event** (initial data)
```json
{
  "type": "snapshot",
  "payload": {
    "moduleId": "orders",
    "tables": {
      "orders": [
        {"id": "1", "...": "..."}
      ]
    }
  }
}
```

**2. Event (insert/update/delete)**
```json
{
  "type": "event",
  "payload": {
    "action": "insert",  // or "update", "delete"
    "moduleId": "orders",
    "table": "orders",
    "record": {"id": "1", "...": "..."}
  }
}
```

**3. Status**
```json
{
  "type": "status",
  "payload": {
    "status": "connected"  // or "idle", "error"
  }
}
```

#### Events to Receive from Client:

**Insert**
```json
{
  "action": "insert",
  "moduleId": "orders",
  "table": "orders",
  "record": {"id": "order-123", "...": "..."},
  "meta": {}
}
```

**Update**
```json
{
  "action": "merge",
  "moduleId": "orders",
  "table": "orders",
  "record": {"id": "order-123", "...": "..."},
  "meta": {}
}
```

**Delete**
```json
{
  "action": "remove",
  "moduleId": "orders",
  "table": "orders",
  "recordId": "order-123",
  "meta": {}
}
```

---

## 💾 IndexedDB Schema

Mishkah Store automatically creates IndexedDB database:

**Database Name:** `mishkah-store-{moduleId}`
**Stores:**
- `records-{tableName}`: Cached records
- `events`: Event history (limited by `historyLimit`)

---

## ⚠️ Known Limitations & Caveats

### 1. **Beta Status**
- Use in production with caution
- Test thoroughly with your backend
- Monitor for edge cases

### 2. **No Conflict Resolution**
- Last write wins
- No operational transforms (yet)
- Manual conflict handling required for complex scenarios

### 3. **Table Name Matching**
- `object.table` must match backend table name exactly
- Case-sensitive

### 4. **WebSocket Dependency**
- Realtime features require WebSocket server
- Falls back to REST + polling (manual refresh)

### 5. **No Query Language**
- No filtering, sorting, pagination in client
- Fetch all records, filter in app
- Future: Consider GraphQL/REST query params

---

## 🔮 Future Roadmap

### Planned Features:
1. **Query Language**: Filter/sort on backend
2. **Conflict Resolution**: CRDT-based merging
3. **Optimistic Updates**: Instant UI, background sync
4. **Pagination**: Large dataset support
5. **Subscriptions**: Fine-grained change tracking
6. **Encryption**: End-to-end encrypted fields
7. **Schema Validation**: JSON Schema support
8. **Migration Tools**: Schema version management

---

## 🎯 Competitive Comparison

| Feature | Firebase | Supabase | Mishkah Store |
|---------|----------|----------|---------------|
| **Realtime Sync** | ✅ Yes | ✅ Yes | ✅ Yes (WebSocket) |
| **Offline Support** | ✅ Yes | ⚠️ Limited | ✅ Yes (IndexedDB) |
| **Self-Hosted** | ❌ No | ✅ Yes | ✅ Yes |
| **Simple API** | ⚠️ Complex | ✅ Good | ✅ Excellent |
| **Zero Config** | ✅ Yes | ⚠️ Setup req. | ✅ Yes |
| **Pricing** | 💰 Pay/use | 💰 Freemium | 🆓 Free (self-host) |
| **Arab-First** | ❌ No | ❌ No | ✅ Yes |
| **Query Language** | ✅ Rich | ✅ SQL | ❌ Not yet |
| **Authentication** | ✅ Built-in | ✅ Built-in | ❌ BYO |
| **Schema Validation** | ✅ Yes | ✅ Yes | ❌ Manual |

---

## 📚 Examples

### Example 1: Todo App
```javascript
const db = createDB({
  branchId: 'user:123',
  moduleId: 'todos',
  objects: {
    tasks: {
      table: 'tasks',
      toRecord: (v, ctx) => ({
        id: ctx.uuid('task'),
        text: v.text,
        done: v.done || false,
        createdAt: ctx.now()
      })
    }
  }
});

await db.connect();
db.watch('tasks', (tasks) => {
  app.setState({tasks});
});

// Add task
await db.insert('tasks', {text: 'Buy milk', done: false});

// Complete task
await db.update('tasks', {id: 'task-123', done: true});

// Delete task
await db.delete('tasks', {id: 'task-123'});
```

### Example 2: Collaborative Notes
```javascript
const db = createDB({
  branchId: 'team:acme',
  moduleId: 'notes',
  objects: {
    notes: {
      table: 'notes',
      toRecord: (v, ctx) => ({
        id: ctx.uuid('note'),
        title: v.title,
        content: v.content,
        author: v.author,
        updatedAt: ctx.now()
      })
    }
  }
});

// Realtime collaborative editing!
db.watch('notes', (notes) => {
  renderNotesList(notes);
});
```

---

## 🛠️ Troubleshooting

### Issue: "No data showing"
**Solution:** Check WebSocket connection status:
```javascript
db.status((status) => {
  if (status === 'error') {
    console.error('WebSocket failed, check backend');
  }
});
```

### Issue: "Data duplicating"
**Solution:** Check `toRecord` - don't push to arrays, return new object.

### Issue: "Slow initial load"
**Solution:** Enable Smart Fetch (default), optimize REST API response.

---

## 📖 Conclusion

Mishkah Simple Store is **ambitious and promising**. It tackles a real problem (competing with cloud databases) with a clean API and solid architecture.

**Current Status:** Beta - works well for simple use cases
**Recommendation:** Use in internal projects, test thoroughly before public launch

---

**والله أعلم.**

*End of Documentation*

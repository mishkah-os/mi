# Mishkah Store System

The Mishkah Store System is a dual-layer state management architecture designed for real-time applications. It consists of a robust core SDK (`mishkah.store.js`) and a simplified DSL layer (`mishkah.simple-store.js`) for rapid development.

## 1. Core SDK (`mishkah.store.js`)

The `MishkahRealtimeStore` class provides low-level access to the WebSocket protocol, handling connection management, message queuing, and state synchronization.

### Key Features

- **WebSocket Protocol**: Manages `client:hello`, `client:publish`, `server:snapshot`, `server:event`.
- **Optimistic UI**: Client-side state is updated immediately (if programmed) while waiting for server ack.
- **IndexedDB Caching**: Persists snapshots offline for instant load on next visit.
- **Event Emitter**: Publishes fine-grained events (`state:change`, `event` (remote), `snapshot`).

### Core API

```javascript
const store = new MishkahRealtimeStore({
  branchId: 'my-branch',
  moduleId: 'my-module',
  useIndexedDB: true
});

await store.connect();

// Reading Data
const users = store.listTable('users');
const user = await store.read('users', 'user_123');

// Writing Data
await store.insert('users', { name: 'New User' });
await store.update('users', { id: 'user_123', name: 'Updated Name', version: 2 }); // version required for optimistic locking
await store.remove('users', { id: 'user_123' });
```

## 2. Simple Store DSL (`mishkah.simple-store.js`)

The `createDB` factory provides a higher-level abstraction, similar to a "mini-database" running in the browser. It unifies REST APIs and WebSockets into a single reactive data source.

### "Smart Store" Philosophy

The Simple Store automatically handles the "Gap of Death" (the time between page load and WebSocket connection) by:

1. **Immediate Cache**: Loads from IndexedDB immediately.
2. **Smart Fetch**: Fetches a REST snapshot (`/api/branches/...`) in the background if empty.
3. **Real-time Handover**: Applies WebSocket updates on top of the REST snapshot.

### DSL API

```javascript
const db = createDB({
  branchId: 'my-branch',
  moduleId: 'my-module',
  autoConnect: true,
  smartFetch: true, // Enable REST background fetch
  objects: {
    // Define your entities
    products: { table: 'sbn_products' },
    users: { table: 'sbn_users' }
  }
});

// Reactivity
db.watch('products', (rows) => {
  renderProductList(rows);
});

// Simple CRUD
await db.insert('products', { name: 'Apple' });
```

## 3. Firebase Compatibility Plan (Proposed)

To allow AI agents and developers familiar with Firebase to work seamlessly with Mishkah, we will implement a compatibility layer. This adapter will map Firebase Realtime Database methods to Mishkah Store operations.

### Goal API

```javascript
const firebase = createFirebaseAdapter(store);
const db = firebase.database();

// Listen for updates
db.ref('products').on('value', (snapshot) => {
  const products = snapshot.val();
  console.log(products);
});

// Write data
db.ref('products').push({ name: 'New Product' });
```

### Implementation Strategy

1. **`ref(path)`**: Maps `path` (e.g., `'products'`) to a Store table definition.
2. **`on('value', cb)`**: Wraps `store.watch(tableName, cb)`. The `snapshot` object passed to the callback will have a `.val()` method returning the array of rows.
3. **`once('value')`**: Wraps `store.listTable(tableName)` or `store.read(...)` wrapped in a Promise.
4. **`set(data)`**: Maps to `store.update` (if ID exists) or `store.insert`.
5. **`push(data)`**: Maps to `store.insert` with an auto-generated UUID.
6. **`update(data)`**: Maps to `store.merge`.

### Adapter Code Sketch

```javascript
class FirebaseRef {
  constructor(store, path) {
    this.store = store;
    this.table = path; // Simplified mapping
  }

  on(eventType, callback) {
    if (eventType === 'value') {
      // Return unsubscribe function
      return this.store.watch(this.table, (data) => {
        callback({ val: () => data });
      });
    }
  }

  async push(data) {
    const id = this.store.uuid();
    await this.store.insert(this.table, { ...data, id });
    return { key: id };
  }
}
```

This layer will sit in `static/lib/mishkah.firebase-adapter.js`.

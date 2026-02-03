# Mishkah Store: AI Integration Guide

This guide is designed to help AI assistants generate correct code for interacting with the **Mishkah Store** real-time data system.

## 🚨 Critical Rules for AI

1. **NO Direct API Calls**: Never use `fetch()` to manually POST/PUT to `/api/branches/...` for data operations. Always use the `M.Store` or `MishkahFirebase` SDK methods.
2. **Schema First**: Data structures are defined in schema JSON files. Respect the field names (snake_case in DB, camelCase in JS usually handled by adapters).
3. **IDs are Mandatory**: Every record MUST have a UUID `id`. If creating a new record, use `M.Store.uuid()` or let the SDK handle it.
4. **WebSocket Priority**: The system depends on WebSocket for real-time sync.

## ✅ Correct Patterns

### 1. Initialization (Standard)

```javascript
// Using the "Auto" mode which infers table structure from Schema
const db = window.createDBAuto(schemaJson, [], {
  branchId: 'default',
  moduleId: 'pos',
  autoConnect: true
});
await db.connect();
```

### 2. Reading Data (Reactive)

```javascript
// Correct: Using .watch() for real-time updates
db.watch('pos_terminal', (items) => {
  console.log('Terminals updated:', items);
  renderUI(items);
});
```

### 3. Modifying Data (Smart Save)

Use the `.save()` method which handles "Upsert" (Insert if new, Update if exists) automatically.

```javascript
// Correct: Use .save() to avoid "id exists" errors
await db.save('pos_terminal', {
  id: 'term-123',
  label: 'Main Counter',
  status: 'active'
});
```

---

## ❌ Incorrect Patterns (Do NOT Generate)

```javascript
// WRONG: Direct fetch bypassing the sync engine
fetch('/api/branches/dar/modules/pos/tables/pos_terminal', { method: 'POST', ... });

// WRONG: Hardcoded IDs without UUID format (unless specified)
id: 1 // usually strings 'term-uuid...'

// WRONG: Assuming local state is truth without sync
items.push(newItem); // NO! Send to DB, wait for sync callback.
```

## "MishkahFirebase" Adapter

For projects using the Firebase wrapper (`mishkah-firebase.js`):

```javascript
/* Correct Firebase-style usage */
const MF = window.MishkahFirebase;

// Listen
MF.collection('orders').onSnapshot(snap => { ... });

// Upsert (Set)
MF.collection('orders').doc('123').set({ status: 'done' }, { merge: true });

// Add (Auto ID)
MF.collection('orders').add({ total: 50 });
```

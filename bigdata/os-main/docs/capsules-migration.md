# Capsules Migration Plan (WS as Signal, REST as Data)

This document is a concrete, code-oriented migration plan tied to the current Mishkah architecture.
Goal: make WebSocket payloads tiny (signal only), and let clients pull + merge partial data via REST.

---

## 0) Current Architecture Anchors (Where to Inject)

### Server
- **Event pipeline**: `src/runtime/module-events.js`
  - All `insert/merge/save/delete` pass through `handleModuleEvent`.
  - Ideal hook to emit capsules.
- **Snapshot/Sync**: `src/runtime/sync-manager.js` and `src/server/http/http-handler.js`
  - Snapshot + delta WS responses.
  - We can add "light snapshot" + capsule merge.
- **Store hydration**: `src/runtime/module-store-manager.js`
  - Hybrid store creation; keep as-is.
- **REST CRUD**: `src/server/api-router.js`
  - Add a partial entity endpoint: `/api/entities/:entity/:id?parts=...`

### Client
- **POS**: `static/pos/posv3.js`
- **KDS**: `static/pos/kds.js`
- **WS client / store**: `static/pos/mishkah.store.js`
  - Add capsule listener → REST pull → partial merge.

---

## 1) Capsule Schema (Minimal Signal)

**New server module**: `src/runtime/capsules.js`

```js
export function createCapsule({ entity, id, parts, version, source }) {
  return {
    entity,          // "order" | "job" | "batch" | "shift" | ...
    id,              // UUID / serial
    parts,           // ["status","totals",...]
    v: version || Date.now(),
    ts: Date.now(),
    source: source || "system"
  };
}

export const ENTITY_MAP = {
  order: { table: "order_header", idField: "id" },
  job:   { table: "job_order_header", idField: "id" },
  batch: { table: "job_order_batch", idField: "id" },
  shift: { table: "pos_shift", idField: "id" }
};

export function resolveEntityFromTable(tableName) {
  switch (String(tableName || "").toLowerCase()) {
    case "order_header": return "order";
    case "job_order_header": return "job";
    case "job_order_batch": return "batch";
    case "pos_shift": return "shift";
    default: return null;
  }
}
```

---

## 2) Server Injection (Event Pipeline)

**File**: `src/runtime/module-events.js`

Inject capsule creation after store mutation, before broadcast:

```js
import { createCapsule, resolveEntityFromTable } from "./capsules.js";

// after recordResult/effectiveAction
const entity = resolveEntityFromTable(tableName);
if (entity && recordResult?.id) {
  const capsule = createCapsule({
    entity,
    id: recordResult.id,
    parts: resolveParts(tableName, recordResult, effectiveAction),
    version: store.version,
    source: contextInfo.source || "ws"
  });
  broadcastToBranch({ type: "capsule", capsule });
}
```

**resolveParts** can be simple at first:
- order_header → ["status","totals"]
- job_order_header → ["status","progress"]
- job_order_batch → ["status","handoff"]
- pos_shift → ["status"]

---

## 3) REST Partial Entity Endpoint

**File**: `src/server/api-router.js`

Add:
```
GET /api/entities/:entity/:id?parts=status,totals
```

Pseudo-implementation:
```js
const entity = params.entity;
const id = params.id;
const parts = parseParts(url.searchParams.get("parts"));
const def = ENTITY_MAP[entity];
if (!def) return 404;
const store = await ensureModuleStore(branchId, moduleId);
const row = store.listTable(def.table).find(r => String(r.id) === String(id));
const payload = pickParts(entity, row, parts);
jsonResponse(res, 200, { entity, id, parts, payload });
```

`pickParts()` does selective field extraction (eg: status/totals only).

---

## 4) Client Listener (Capsule → Pull → Merge)

**File**: `static/pos/mishkah.store.js` (or `posv3.js` / `kds.js`)

```js
if (msg.type === "capsule") {
  const { entity, id, parts, v } = msg.capsule;
  if (cache.hasNewer(entity, id, v)) return;
  fetch(`/api/entities/${entity}/${id}?parts=${parts.join(",")}`)
    .then(r => r.json())
    .then(({ payload }) => mergeIntoState(entity, id, payload));
}
```

Merge rules:
- **order**: merge status/totals into order_header row
- **job**: merge status/progress into job_order_header row
- **batch**: merge status/handoff into job_order_batch row
- **shift**: merge status fields into pos_shift

---

## 5) Light Snapshot + Capsules (Hybrid)

Keep Hybrid:
- **Snapshot**: minimal tables (order/job/batch + current lines if needed).
- **Capsules**: fill gaps after snapshot.

Suggested path:
1) Add `?light=1` to sync endpoints to return minimal tables.
2) Clients use capsule stream to complete partial data.

---

## 6) Batching + Dedup (Performance Boost)

**Server side**
- Coalesce capsules per `entity+id` in a 200–500ms window.
- Send a batch array instead of 1-by-1.

**Client side**
- Deduplicate: keep only newest `v` per `entity+id`.
- Batch REST pulls: `/api/entities?entity=job&ids=...`

---

## 7) Rollout Plan (Safe)

1) **Phase 1**
   - Emit capsules in parallel with existing WS payload.
   - Clients only log capsules.
2) **Phase 2**
   - KDS consumes capsules for job/batch.
   - POS still uses old WS payloads.
3) **Phase 3**
   - POS consumes capsules for order/job/batch.
4) **Phase 4**
   - Stop full WS rows for heavy entities.
   - Keep snapshots + capsules only.

---

## 8) Monitoring & Metrics

Track:
- WS payload size (bytes/sec)
- Capsule count/sec
- REST pull latency
- Merge latency on client
- Snapshot size and load time

---

## 9) Risks + Mitigations

Risk: stale merges  
Mitigation: strict versioning + idempotent merges.

Risk: REST overload  
Mitigation: batch endpoints + debounce.

Risk: missing data  
Mitigation: light snapshot + capsule gap detection.

---

## 10) Minimal First Target (Immediate ROI)

Implement capsules for:
- `order_header`
- `job_order_header`
- `job_order_batch`

They are the hottest, most frequent updates and most expensive WS payloads.


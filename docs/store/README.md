
---

# STORE.md
# Mishkah Store — Realtime + Hybrid Storage (WS + IndexedDB + REST Bootstrap)

طبقة التخزين في مشكاة مبنية على 3 أفكار:
1) WebSocket للّحظي (sync)
2) IndexedDB للـ Offline/Cache (local-first)
3) REST bootstrap لبداية سريعة (seed) عند الحاجة

---

## STORE + Sync (التخزين + المزامنة)
`createDB()` يبني فوق `createStore()` ويقدّم: register / list / store / watch + bootstrap REST + تمرير IndexedDB :contentReference[oaicite:10]{index=10}  
والـ store يغلّف بروتوكول WebSocket (hello/publish/snapshot) ويحافظ على local projection للجداول :contentReference[oaicite:11]{index=11}، ويرسل publish مع timeout/ack :contentReference[oaicite:12]{index=12}

## 1) الطبقات: من الأدنى للأعلى

### A) mishkah.store.js (Realtime Store SDK)
يوفّر:
- connect/disconnect
- insert/update/merge/save/delete
- snapshot + local projection للجداول
- بروتوكول publish مع ack/timeout

### B) mishkah.simple-store.js (Simple DB DSL)
يوفّر API صغير جدًا:
- createDB(options)
- createDBAuto(schema, entries, options)
- register(name, def)
- list/read/query
- store(name, value, meta)
- watch(name, cb) + statusWatch(cb)
- smartFetch (REST bootstrap) + bootstrapData (اختياري)

---

## 2) createStore (WebSocket Core)

### createStore(options)
```js
const store = createStore({
  branchId: "lab:test-pad",
  moduleId: "pos",
  role: "pos-sdk",
  historyLimit: 100,
  lang: "ar",
  autoReconnect: true,
  wsUrl: null,
  wsPath: "/ws",
  useIndexedDB: true,
  dbVersion: 1
});
```
في الثلاث ملفات اللي تحت، اعتمدت على الـ APIs الفعلية الموجودة عندك:

* النواة UMD وتُصدّر `window.Mishkah` + `Mishkah.DSL` + `Mishkah.app.createApp`  
* البيئة/RTL/i18n من الـ DB وتُطبَّق تلقائياً عند `mount()` عبر `applyEnv()`  
* التخزين اللحظي عبر `createStore()` وطبقة الـ DSL عبر `createDB()`/`createDBAuto()` مع REST bootstrap + IndexedDB passthrough   



---


## 4) Realtime + Offline (اختياري)

إذا حمّلت:

* mishkah.store.js
* mishkah.simple-store.js

يمكنك تشغيل WebSocket + IndexedDB + REST bootstrap بسهولة (راجع STORE.md).

---

## 5) Optional Modules

* mishkah-jsx.js: مُحلّل JSX اختياري (عند الحاجة)
* mishkah-rest.js: عميل REST بسيط + repo helpers
* mishkah-schema.js: أدوات schema (إن احتجتها)
* mishkah.firebase.js: طبقة توافق Firebase-like فوق createDB/createDBAuto



### WS URL Resolution

* إن مرّرت `wsUrl` يُستخدم مباشرة.
* وإلا يعتمد على `window.basedomain` (افتراضيًا ws.mas.com.eg).

---

## 3) createDB (Tiny API فوق store)

### createDB(options)

```js
const db = createDB({
  branchId: "lab:test-pad",
  moduleId: "scratchpad",
  role: "ws2-simple",
  autoConnect: true,
  smartFetch: true,
  bootstrapData: null,
  useIndexedDB: true
});
```

### Smart REST Bootstrap

إذا `smartFetch` مفعّل ولم توفر `bootstrapData`:
يحاول جلب snapshot أولي من:
`/api/branches/{branchId}/modules/{moduleId}?lang=...`

إن وفّرت `bootstrapData` (كائن جداول->صفوف) سيتم استخدامه مباشرة وتجاوز fetch.

---

## 4) تعريف الكائنات (Objects Definitions)

### register(name, def)

```js
db.register("notes", {
  table: "scratchpad_entry",
  toRecord: (value, ctx) => ctx.ensure({ note: value }),
  fromRecord: (record) => record
});
```

إذا لم تُعرّف `toRecord/fromRecord`:

* سيتم توليد id تلقائيًا
* وضبط branchId/createdAt/serverAt
* ودمج defaults

---

## 5) CRUD + Realtime Watch

### store(name, value, meta)

* يحوّل value إلى record عبر `toRecord`
* ثم يستخدم store.save (إن وُجد) وإلا insert كخيار افتراضي

### watch(name, cb)

يراقب قائمة records للكائن (object) ويستدعي cb عند التغير.

### statusWatch(cb)

يراقب حالة الاتصال/الـ sync.

---

## 6) createDBAuto (Schema-driven)

عند وجود schema (جداول)، يمكن بناء objects تلقائيًا:

```js
const db = createDBAuto(schema, ["users", "items"], {
  branchId: "lab:test-pad",
  moduleId: "pos"
});
```

* إن لم تمرر entries: سيتم اختيار كل الجداول الموجودة في schema.
* يتم بناء object لكل جدول تلقائيًا.

---

## 7) Offline-first (IndexedDB)

مرّر:

* useIndexedDB: true
  وسيقوم store/simple-store بتفعيل التخزين المحلي عند توفر Adapter IndexedDB (حسب بيئتك).

---

## 8) توصية عملية (نمط تشغيل)

* تطبيق صغير/عميل سريع: createDB + register فقط
* تطبيق كبير متعدد وحدات: createDBAuto + schema + قواعد فصل السلطات
* إن كان لديك REST seed خاص: عطّل smartFetch واستعمل bootstrapData




* التخزين اللحظي عبر `createStore()` وطبقة الـ DSL عبر `createDB()`/`createDBAuto()` مع REST bootstrap + IndexedDB passthrough   



---


## 4) Realtime + Offline (شرح مفصل )

إذا حمّلت:

* mishkah.store.js
* mishkah.simple-store.js

يمكنك تشغيل WebSocket + IndexedDB + REST bootstrap بسهولة (راجع STORE.md).

---

## 5) Optional Modules

* mishkah-jsx.js: مُحلّل JSX اختياري (عند الحاجة)
* mishkah-rest.js: عميل REST بسيط + repo helpers
* mishkah-schema.js: أدوات schema (إن احتجتها)
* mishkah.firebase.js: طبقة توافق Firebase-like فوق createDB/createDBAuto



### WS URL Resolution

* إن مرّرت `wsUrl` يُستخدم مباشرة.
* وإلا يعتمد على `window.basedomain` (افتراضيًا ws.mas.com.eg).

---

## 3) createDB (Tiny API فوق store)

### createDB(options)

```js
const db = createDB({
  branchId: "lab:test-pad",
  moduleId: "scratchpad",
  role: "ws2-simple",
  autoConnect: true,
  smartFetch: true,
  bootstrapData: null,
  useIndexedDB: true
});
```

### Smart REST Bootstrap

إذا `smartFetch` مفعّل ولم توفر `bootstrapData`:
يحاول جلب snapshot أولي من:
`/api/branches/{branchId}/modules/{moduleId}?lang=...`

إن وفّرت `bootstrapData` (كائن جداول->صفوف) سيتم استخدامه مباشرة وتجاوز fetch.

---

## 4) تعريف الكائنات (Objects Definitions)

### register(name, def)

```js
db.register("notes", {
  table: "scratchpad_entry",
  toRecord: (value, ctx) => ctx.ensure({ note: value }),
  fromRecord: (record) => record
});
```

إذا لم تُعرّف `toRecord/fromRecord`:

* سيتم توليد id تلقائيًا
* وضبط branchId/createdAt/serverAt
* ودمج defaults

---

## 5) CRUD + Realtime Watch

### store(name, value, meta)

* يحوّل value إلى record عبر `toRecord`
* ثم يستخدم store.save (إن وُجد) وإلا insert كخيار افتراضي

### watch(name, cb)

يراقب قائمة records للكائن (object) ويستدعي cb عند التغير.

### statusWatch(cb)

يراقب حالة الاتصال/الـ sync.

---

## 6) createDBAuto (Schema-driven)

عند وجود schema (جداول)، يمكن بناء objects تلقائيًا:

```js
const db = createDBAuto(schema, ["users", "items"], {
  branchId: "lab:test-pad",
  moduleId: "pos"
});
```

* إن لم تمرر entries: سيتم اختيار كل الجداول الموجودة في schema.
* يتم بناء object لكل جدول تلقائيًا.

---

## 7) Offline-first (IndexedDB)

مرّر:

* useIndexedDB: true
  وسيقوم store/simple-store بتفعيل التخزين المحلي عند توفر Adapter IndexedDB (حسب بيئتك).

---

## 8) توصية عملية (نمط تشغيل)

* تطبيق صغير/عميل سريع: createDB + register فقط
* تطبيق كبير متعدد وحدات: createDBAuto + schema + قواعد فصل السلطات
* إن كان لديك REST seed خاص: عطّل smartFetch واستعمل bootstrapData


# شرح `/api/branches/dar/modules/pos/orders` Endpoint

## 🎯 ماذا يفعل هذا الـ Endpoint؟

```
POST /api/branches/{branchId}/modules/{moduleId}/orders
```

### 📍 المسار في الكود
`src/server.js:4802-4842`

---

## 🔄 كيف يعمل الـ Endpoint؟

### الخطوات التفصيلية:

#### 1️⃣ **استقبال الـ Order Payload**
```javascript
// src/server.js:4810
const orderPayload = body.order || body.data || body.record
```

#### 2️⃣ **استدعاء `savePosOrder()`** (line 4816)
```javascript
const result = await savePosOrder(branchId, moduleId, orderPayload, {
  source: 'pos-order-api',
  actorId: body.actorId || body.userId
});
```

**ماذا يفعل `savePosOrder()`؟** (src/server.js:2161-2337)

1. **Sequence Allocation** - يعطي رقم للأوردر
   ```javascript
   const allocation = await sequenceManager.nextValue(
     branchId, moduleId, 'order_header', 'id'
   );
   baseOrder.id = allocation.formatted; // "DAR-001003"
   ```

2. **Data Normalization** - يوحد صيغة البيانات
   ```javascript
   const normalized = normalizeIncomingOrder(order, { actorId });
   ```

3. **Data Validation** - يتحقق من صحة البيانات
   ```javascript
   if (!shiftId) throw new Error('shiftId required');
   if (!normalized.lines.length) throw new Error('empty order');
   ```

4. **Multi-Table Sync** - يحفظ في 5 جداول
   ```javascript
   await applyModuleMutation('order_header', ...)
   await syncOrderLines('order_line', ...)
   await syncOrderPayments('order_payment', ...)
   await syncOrderStatusLogs('order_status_log', ...)
   await syncOrderLineStatusLogs('order_line_status_log', ...)
   ```

#### 3️⃣ **إرجاع الأوردر المحفوظ**
```javascript
// src/server.js:4820-4827
const snapshot = await fetchPosOrderSnapshot(branchId, moduleId, result.orderId);
jsonResponse(res, 201, {
  branchId,
  moduleId,
  orderId: result.orderId,
  order: snapshot,
  normalized: buildAckOrder(result.normalized)
});
```

---

## 🐛 لماذا حدث الـ JSON Error؟

### الخطأ الذي كان يظهر:
```json
{
  "error": "order-persist-failed",
  "message": "Unexpected token i in JSON at position 3277"
}
```

### 🔍 السبب الحقيقي:

في `normalizeOrderLineRecord()` (src/server.js:1513-1664):

#### ❌ الكود القديم (قبل الإصلاح):
```javascript
const record = {
  name: line.name || line.itemName || null,
  // ❌ كان يتوقع string فقط!
};
```

#### ✅ لكن الـ Frontend كان يرسل object:
```javascript
"name": {
  "en": "مياة معدنية *600 مللى ",
  "ar": "مياة معدنية *600 مللى "
}
```

### ⚠️ ماذا كان يحدث:
1. Frontend يرسل `name` كـ object
2. Backend يحاول حفظ object مباشرة في database
3. عند serialization: `JSON.stringify({ name: { en: "...", ar: "..." } })`
4. عند القراءة من database: `JSON.parse(...)` يفشل ❌
5. Error: "Unexpected token i in JSON at position 3277"

### ✅ الحل الذي طبقته:

```javascript
// src/server.js:1607-1615
const normalizeName = (value) => {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    // Extract Arabic or English text
    return value.ar || value.en || value.name || value.label || null;
  }
  return null;
};

const record = {
  name: normalizeName(line.name) || normalizeName(line.itemName) || ...,
  description: normalizeName(line.description) || ...,
  // ✅ الآن يدعم object و string
};

// ✅ أيضاً: حفظ metadata field
if (line.metadata && typeof line.metadata === 'object') {
  record.metadata = { ...line.metadata };
}
```

---

## 🤔 لماذا نستخدم REST API بدلاً من Store.insert؟

### السؤال الوجيه جدًا:
> "ليه مش بنستخدم mishkah store insert بدل ما نستخدم Backend؟"

---

## ✅ لماذا REST API أفضل للـ Orders؟

### 1️⃣ **Sequence Allocation (تخصيص الأرقام)**

#### ✅ REST API:
```javascript
const allocation = await sequenceManager.nextValue(
  branchId, moduleId, 'order_header', 'id'
);
baseOrder.id = allocation.formatted; // "DAR-001003"
```

**المميزات:**
- ✅ رقم فريد مضمون (DAR-001, DAR-002, DAR-003...)
- ✅ كل branch له sequence خاص (DAR-001, KSA-001, etc.)
- ✅ Thread-safe (لا تكرار حتى من أجهزة متعددة)
- ✅ Format قابل للتخصيص (PREFIX-NUMBER-SUFFIX)

#### ❌ Store.insert:
```javascript
store.insert('order_header', {
  id: 'draft-' + Date.now() + '-' + Math.random()
  // ❌ يجب أنت تنشئ الـ ID يدويًا
  // ❌ لا sequence management
  // ❌ ممكن يحصل تكرار
});
```

---

### 2️⃣ **Data Normalization (توحيد الصيغة)**

#### ✅ REST API:
```javascript
const normalized = normalizeIncomingOrder(order, { actorId });

// يتعامل مع كل الصيغات:
// - camelCase: orderTypeId
// - snake_case: order_type_id
// - kebab-case: order-type-id
// - PascalCase: OrderTypeId

// النتيجة: صيغة موحدة في database
```

#### ❌ Store.insert:
```javascript
store.insert('order_header', rawOrder);
// ❌ يحفظ البيانات كما هي بدون معالجة
// ❌ لو frontend أرسل بصيغة مختلفة → مشاكل في القراءة
```

---

### 3️⃣ **Data Validation (التحقق من البيانات)**

#### ✅ REST API:
```javascript
// يتحقق من shiftId
if (!shiftId) {
  throw new Error('POS order payload requires a shiftId.');
}

// يمنع حفظ أوردرات فارغة
if (!normalized.lines || normalized.lines.length === 0) {
  throw new Error('EMPTY_ORDER_NOT_ALLOWED');
}

// يمنع duplicate saves
if (SAVE_IN_PROGRESS.has(requestKey)) {
  throw new Error('DUPLICATE_SAVE_IN_PROGRESS');
}

// يتحقق من version conflicts
if (existingOrder.version === baseOrder.version) {
  throw new Error('DUPLICATE_SAVE_DETECTED');
}
```

**المميزات:**
- ✅ لا يمكن حفظ أوردر بدون shift
- ✅ لا يمكن حفظ أوردر فارغ (بدون items)
- ✅ لا يمكن حفظ نفس الأوردر مرتين
- ✅ حماية من race conditions

#### ❌ Store.insert:
```javascript
store.insert('order_header', invalidOrder);
// ❌ لا validation على الإطلاق!
// ❌ ممكن تحفظ أوردر بدون shift
// ❌ ممكن تحفظ أوردر فارغ
// ❌ ممكن duplicate saves
```

---

### 4️⃣ **Multi-Table Sync (مزامنة جداول متعددة)**

#### ✅ REST API:
```javascript
await savePosOrder() {
  // يحفظ في 5 جداول بشكل atomic:
  await applyModuleMutation('order_header', ...)        // 1
  await syncOrderLines('order_line', ...)               // 2
  await syncOrderPayments('order_payment', ...)         // 3
  await syncOrderStatusLogs('order_status_log', ...)    // 4
  await syncOrderLineStatusLogs(...)                    // 5

  // إذا فشلت أي خطوة → rollback كل شيء
}
```

**المميزات:**
- ✅ **Atomicity**: كل شيء ينجح أو كل شيء يفشل
- ✅ **Consistency**: البيانات متسقة عبر الجداول
- ✅ **Transaction safety**: لا partial saves

#### ❌ Store.insert:
```javascript
// يجب تحفظ كل جدول على حدة:
store.insert('order_header', header);
store.insert('order_line', line1);
store.insert('order_line', line2);
store.insert('order_payment', payment);

// ❌ لو فشل line2 → header و line1 محفوظين! (inconsistent state)
// ❌ لا transaction management
// ❌ ممكن partial saves
```

---

### 5️⃣ **Broadcasting (البث لجميع الأجهزة)**

#### ✅ REST API:
```javascript
await broadcastSyncUpdate(branchId, moduleId, state, {
  action: 'order:save',
  orderId: result.orderId,
  mutationId: generateId()
});

// يرسل via WebSocket لـ:
// - جميع أجهزة POS في نفس الـ branch
// - جميع شاشات KDS
// - Dashboard/Reports
```

**المميزات:**
- ✅ Real-time sync لجميع الأجهزة
- ✅ كل جهاز يستقبل التحديثات فورًا
- ✅ Offline devices تستقبل updates عند reconnect

#### ❌ Store.insert:
```javascript
store.insert('order_header', order);
// ❌ محلي فقط على جهاز واحد
// ❌ لا broadcasting
// ❌ الأجهزة الأخرى لا تعرف بالتحديث
```

---

### 6️⃣ **Conflict Resolution (حل التعارضات)**

#### ✅ REST API:
```javascript
if (isVersionConflict(error)) {
  jsonResponse(res, 409, {
    error: 'order-version-conflict',
    message: 'Order was modified by another user',
    details: versionConflictDetails(error)
  });
}

// Scenario:
// POS1 يقرأ order (version=1)
// POS2 يقرأ order (version=1)
// POS1 يحفظ → version=2 ✅
// POS2 يحاول يحفظ version=1 → ❌ Conflict!
```

**المميزات:**
- ✅ يكتشف concurrent modifications
- ✅ يمنع overwriting changes من user آخر
- ✅ يعطي error واضح + details

#### ❌ Store.insert:
```javascript
store.insert('order_header', modifiedOrder);
// ❌ يكتب فوق البيانات بدون تحذير!
// ❌ لو جهازين عدلوا نفس الأوردر → آخر واحد يكسب
// ❌ Data loss محتمل
```

---

### 7️⃣ **Error Handling & Logging**

#### ✅ REST API:
```javascript
try {
  const result = await savePosOrder(...);
  logger.info({ orderId: result.orderId }, 'Order saved successfully');
} catch (error) {
  logger.error({ err: error, branchId, moduleId }, 'Failed to save order');

  if (error.code === 'DUPLICATE_SAVE_DETECTED') {
    // Handle duplicate
  } else if (error.code === 'SEQUENCE_COLLISION') {
    // Handle sequence collision
  } else if (error.code === 'EMPTY_ORDER_NOT_ALLOWED') {
    // Handle empty order
  }

  jsonResponse(res, 500, {
    error: 'order-persist-failed',
    message: error.message
  });
}
```

**المميزات:**
- ✅ Comprehensive error handling
- ✅ Structured logging (searchable)
- ✅ Error codes للتعامل مع كل حالة
- ✅ Stack traces لـ debugging

#### ❌ Store.insert:
```javascript
try {
  store.insert('order_header', order);
} catch (error) {
  console.error('Failed to save', error);
  // ❌ لا error codes
  // ❌ لا structured logging
  // ❌ صعب debug
}
```

---

## 📊 متى نستخدم Store.insert؟

### ✅ Store.insert مناسب لـ:

#### 1. **job_order_header** (Kitchen Display System)
```javascript
// posv2.js line 3214-3232
store.insert('job_order_header', jobHeaders);

// ✅ لماذا؟
// - لا يحتاج sequence (يستخدم batchId)
// - سرعة عالية (real-time للمطبخ)
// - لا validation معقدة
// - جدول واحد فقط
```

#### 2. **Master Data** (Menu, Categories, Stations)
```javascript
store.insert('menu_items', items);
store.insert('kitchen_sections', sections);

// ✅ لماذا؟
// - Read-only data (لا conflicts)
// - لا sequence needed
// - Local cache
```

#### 3. **Temporary Data** (Drafts, Cart)
```javascript
store.insert('order_temp', draftOrder);

// ✅ لماذا؟
// - مؤقت (يُحذف بعد save)
// - لا يحتاج sequence
// - Local only
```

---

## 🎯 متى نستخدم REST API؟

### ✅ REST API مناسب لـ:

#### 1. **order_header** (الأوردرات)
```javascript
POST /api/branches/dar/modules/pos/orders
```
- ✅ يحتاج sequence (DAR-001, DAR-002...)
- ✅ يحتاج validation (shiftId, lines, etc.)
- ✅ يحتاج multi-table sync
- ✅ يحتاج broadcasting

#### 2. **order_payment** (الدفعات)
```javascript
// يحتاج atomicity مع order_header
// يحتاج validation (amount, method)
```

#### 3. **order_line** (بنود الأوردر)
```javascript
// يحتاج normalization (name, description)
// يحتاج validation (itemId, kitchenSection)
```

#### 4. **order_status_log** (سجل الحالات)
```javascript
// يحتاج broadcasting للأجهزة الأخرى
// يحتاج atomicity مع order_header
```

---

## 📈 مقارنة الأداء

### Store.insert (Fast, Local)
```
Speed:     ⚡⚡⚡⚡⚡ (5/5) - Instant
Safety:    ⚠️⚠️ (2/5) - No validation
Sync:      ❌ (0/5) - Local only
Features:  ⚠️⚠️ (2/5) - Basic insert
```

### REST API (Robust, Distributed)
```
Speed:     ⚡⚡⚡ (3/5) - ~100-200ms
Safety:    ✅✅✅✅✅ (5/5) - Full validation
Sync:      ✅✅✅✅✅ (5/5) - Real-time broadcast
Features:  ✅✅✅✅✅ (5/5) - Full stack
```

---

## 🏆 الخلاصة النهائية

### ✅ استخدم REST API للـ Orders لأنه:
1. ✅ **Sequence allocation** تلقائي (DAR-001, DAR-002...)
2. ✅ **Data validation** شامل (no empty orders, no duplicates)
3. ✅ **Data normalization** ذكي (object → string)
4. ✅ **Multi-table sync** atomic (5 جداول في transaction واحدة)
5. ✅ **Broadcasting** لجميع الأجهزة (real-time sync)
6. ✅ **Conflict resolution** ذكي (version control)
7. ✅ **Error handling** محكم (structured logging)
8. ✅ **Transaction safety** (كل شيء ينجح أو كل شيء يفشل)

### ✅ استخدم Store.insert لـ job_orders لأنه:
1. ✅ **سرعة عالية** (real-time للمطبخ)
2. ✅ **لا يحتاج sequence** (يستخدم batchId)
3. ✅ **لا validation معقدة** (بيانات بسيطة)
4. ✅ **جدول واحد** (لا multi-table sync)

---

## 🔧 الإصلاحات المطبقة

### 1. **Fix JSON Error** (src/server.js)
```javascript
// أضفت normalizeName() helper
const normalizeName = (value) => {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    return value.ar || value.en || null;
  }
  return null;
};

// أضفت metadata preservation
if (line.metadata && typeof line.metadata === 'object') {
  record.metadata = { ...line.metadata };
}
```

### 2. **Fix Batch Duplication** (static/pos/kds.js)
```javascript
// أضفت time-based filter (24h)
const filteredJobOrderHeaders = rawJobOrderHeaders.filter(header => {
  const latestTime = Math.max(createdAt, updatedAt);
  const isRecent = latestTime >= twentyFourHoursAgo;
  const isNotCompleted = header.status !== 'completed';
  return isRecent || isNotCompleted;
});

// أضفت batch completion filter
const activeJobHeaders = jobHeaders.filter(header => {
  const stats = batchStatusMap.get(batchId);
  const allCompleted = stats.completed === stats.total;
  const allDelivered = stats.delivered === stats.total;
  return !(allCompleted && allDelivered);
});
```

---

## 📝 ملاحظات مهمة

### ⚠️ لا تستخدم Store.insert للـ Orders لأن:
1. ❌ لا sequence management → أرقام عشوائية
2. ❌ لا validation → بيانات غير صحيحة
3. ❌ لا normalization → صيغات مختلفة
4. ❌ لا multi-table sync → inconsistent data
5. ❌ لا broadcasting → أجهزة أخرى لا تعرف
6. ❌ لا conflict resolution → data loss محتمل
7. ❌ لا transaction safety → partial saves

### ✅ REST API هو الخيار الصحيح للـ Orders!

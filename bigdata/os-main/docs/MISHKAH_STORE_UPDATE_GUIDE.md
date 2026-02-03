# Mishkah Store Update Guide - دليل تحديث البيانات

## 📋 جدول المحتويات
1. [نظرة عامة (Overview)](#نظرة-عامة)
2. [معمارية النظام (Architecture)](#معمارية-النظام)
3. [الطريقة الصحيحة للتحديث (Proper Update Procedure)](#الطريقة-الصحيحة-للتحديث)
4. [الأخطاء الشائعة (Common Mistakes)](#الأخطاء-الشائعة)
5. [أمثلة عملية (Practical Examples)](#أمثلة-عملية)
6. [استكشاف الأخطاء (Troubleshooting)](#استكشاف-الأخطاء)

---

## نظرة عامة

### ما هو Mishkah Store؟
Mishkah Store هو نظام إدارة بيانات موزع يستخدم معمارية **Insert-Only** مع **Optimistic Locking** لضمان تزامن البيانات عبر عدة أجهزة.

### الجداول المُصدَّرة (Versioned Tables)
حاليا، فقط جدولين يستخدمان نظام الإصدارات:
- `order_header`
- `order_line`

---

## معمارية النظام

### 1. Insert-Only Architecture
```
❌ لا يوجد UPDATE حقيقي في القاعدة
✅ كل "update" هو في الحقيقة INSERT لسجل جديد

مثال:
Order #001 → version: 1 (status: "pending")
Order #001 → version: 2 (status: "ready")     ← سجل جديد
Order #001 → version: 3 (status: "assembled") ← سجل جديد

عند القراءة: يتم استرجاع السجل بأعلى version
```

### 2. Optimistic Locking
```javascript
// الخطوات:
1. Client يقرأ السجل الحالي (version: 5)
2. Client يعدل البيانات محليا
3. Client يرسل update مع expectedVersion = 6
4. Backend يتحقق:
   - Current version = 5?
   - Expected version = 6 = (5 + 1)?
   - ✅ نعم → قبول
   - ❌ لا → رفض (VersionConflictError)
```

### 3. Version Validation Logic

```javascript
// من src/moduleStore.js - resolveNextVersion()

// حالة 1: سجل جديد
if (expectedVersion === 1 && currentVersion === 1) {
  return currentVersion + 1; // السماح: سجل جديد
}

// حالة 2: تحديث
if (expectedVersion !== currentVersion + 1) {
  // رفض: الإصدار المتوقع لا يساوي الإصدار الحالي + 1
  throw VersionConflictError(
    "Another device has already updated this order",
    { expectedVersion, currentVersion, reason: 'stale-version' }
  );
}

return currentVersion + 1;
```

---

## الطريقة الصحيحة للتحديث

### ⚠️ القاعدة الذهبية:
**لا تنسى أبدا إرسال `version` مع كل طلب تحديث!**

### الخطوات الصحيحة:

#### 1. قراءة السجل الحالي
```javascript
// ✅ صحيح: احفظ الـ version الحالي
const currentRecord = state.data.orderHeaders.find(h => h.id === orderId);
const currentVersion = currentRecord?.version || 1;

console.log('Current record:', {
  id: currentRecord.id,
  version: currentRecord.version,    // مثال: 5
  status: currentRecord.statusId
});
```

#### 2. حساب الـ version الجديد
```javascript
// ✅ الـ version الجديد = الحالي + 1
const nextVersion = currentVersion + 1;  // 5 + 1 = 6
```

#### 3. إرسال طلب التحديث
```javascript
// ✅ صحيح: أرسل version في الطلب
const updatePayload = {
  id: orderId,
  status: 'assembled',
  statusId: 'assembled',
  version: nextVersion,           // ← مهم جدا!
  updatedAt: new Date().toISOString()
};

await store.update('order_header', updatePayload);
```

### مثال كامل:
```javascript
const updateOrderStatus = async (orderId, newStatus) => {
  // 1. قراءة السجل الحالي
  const orderHeaders = state.data.orderHeaders || [];
  const currentHeader = orderHeaders.find(h =>
    String(h.id || h.orderId) === orderId
  );

  if (!currentHeader) {
    console.error('Order not found:', orderId);
    return;
  }

  // 2. حساب الـ version الجديد
  const currentVersion = currentHeader.version || 1;
  const nextVersion = currentVersion + 1;

  console.log('[Update] Versions:', {
    orderId,
    currentVersion,    // مثال: 5
    nextVersion,       // مثال: 6
    newStatus
  });

  // 3. Optimistic update في الـ state المحلي
  const updatedHeaders = orderHeaders.map(header => {
    if (String(header.id) === orderId) {
      return {
        ...header,
        status: newStatus,
        statusId: newStatus,
        version: nextVersion,           // ← تحديث الـ version محليا
        updatedAt: new Date().toISOString()
      };
    }
    return header;
  });

  setState({ orderHeaders: updatedHeaders });

  // 4. إرسال الطلب للـ backend
  try {
    const updatePayload = {
      id: currentHeader.id,
      status: newStatus,
      statusId: newStatus,
      version: nextVersion,           // ← إرسال الـ version
      updatedAt: new Date().toISOString()
    };

    const result = await store.update('order_header', updatePayload);

    console.log('[Update] Success:', result);

  } catch (error) {
    if (error.code === 'VERSION_CONFLICT') {
      console.error('[Update] Version conflict:', {
        expectedVersion: error.expectedVersion,
        currentVersion: error.currentVersion,
        reason: error.reason
      });

      // Rollback أو إعادة التحميل
      // TODO: Handle conflict resolution
    }
    throw error;
  }
};
```

---

## الأخطاء الشائعة

### ❌ خطأ #1: عدم إرسال version
```javascript
// ❌ خطأ: مفيش version في الطلب
const updatePayload = {
  id: orderId,
  status: 'assembled',
  statusId: 'assembled',
  // ❌ version مفقود!
  updatedAt: new Date().toISOString()
};

await store.update('order_header', updatePayload);

// النتيجة:
// VersionConflictError: "Another device has already updated this order"
// Reason: "missing-version"
```

### ❌ خطأ #2: إرسال version خطأ
```javascript
// ❌ خطأ: إرسال نفس الـ version الحالي
const currentVersion = 5;
const updatePayload = {
  id: orderId,
  version: currentVersion,  // ❌ خطأ: لازم يكون 6 مش 5
  status: 'assembled'
};

// النتيجة:
// VersionConflictError
// Expected: 6, Current: 5, Reason: "stale-version"
```

### ❌ خطأ #3: عدم تحديث الـ state المحلي
```javascript
// ❌ خطأ: تحديث الـ backend بس بدون الـ state
await store.update('order_header', {
  id: orderId,
  version: nextVersion,
  status: 'assembled'
});

// المشكلة: الـ state المحلي لسه عنده version قديم
// لو حاولت تعمل update تاني هتحصل conflict
```

### ❌ خطأ #4: تجاهل الـ version في الـ watcher updates
```javascript
// ❌ خطأ: استبدال السجل بالكامل بدون مراعاة الـ version
incomingOrderHeaders.forEach(header => {
  orderHeadersMap.set(String(header.id), header); // ❌ استبدال أعمى
});

// ✅ صحيح: مقارنة الـ versions
incomingOrderHeaders.forEach(header => {
  const existing = orderHeadersMap.get(String(header.id));
  if (!existing) {
    orderHeadersMap.set(String(header.id), header);
  } else {
    const existingVersion = existing.version || 1;
    const incomingVersion = header.version || 1;

    // احتفظ بالأحدث فقط
    if (incomingVersion > existingVersion) {
      orderHeadersMap.set(String(header.id), header);
    }
  }
});
```

---

## أمثلة عملية

### مثال 1: تحديث حالة الطلب في KDS

```javascript
// ❌ الكود القديم (خطأ)
const persistOrderHeaderStatus = async (orderId, status, timestamp) => {
  const orderHeaders = watcherState.orderHeaders || [];
  const matchingHeader = orderHeaders.find(h =>
    String(h.id) === orderId
  );

  const headerUpdate = {
    id: matchingHeader.id,
    status: status,
    statusId: status,
    updatedAt: timestamp
    // ❌ version مفقود!
  };

  await store.update('order_header', headerUpdate);
};

// ✅ الكود الصحيح
const persistOrderHeaderStatus = async (orderId, status, timestamp) => {
  const orderHeaders = watcherState.orderHeaders || [];
  const matchingHeader = orderHeaders.find(h =>
    String(h.id) === orderId
  );

  if (!matchingHeader) {
    console.error('[Update] Order not found:', orderId);
    return;
  }

  // ✅ حساب الـ version الجديد
  const currentVersion = matchingHeader.version || 1;
  const nextVersion = currentVersion + 1;

  // ✅ تحديث الـ state المحلي أولا (optimistic)
  watcherState.orderHeaders = orderHeaders.map(header => {
    if (String(header.id) === orderId) {
      return {
        ...header,
        status: status,
        statusId: status,
        version: nextVersion,    // ✅ تحديث الـ version
        updatedAt: timestamp
      };
    }
    return header;
  });

  // ✅ إرسال الطلب مع الـ version
  const headerUpdate = {
    id: matchingHeader.id,
    status: status,
    statusId: status,
    version: nextVersion,        // ✅ إرسال الـ version
    updatedAt: timestamp
  };

  try {
    await store.update('order_header', headerUpdate);
    console.log('[Update] Success:', orderId, 'version:', nextVersion);
  } catch (error) {
    if (error.code === 'VERSION_CONFLICT') {
      console.error('[Update] Version conflict - rolling back');
      // Rollback: استرجاع الـ version القديم
      watcherState.orderHeaders = orderHeaders;
    }
    throw error;
  }
};
```

### مثال 2: Smart Merge مع الـ Watcher

```javascript
// ✅ دمج ذكي يراعي الـ versions
const smartMergeOrderHeaders = (existingHeaders, incomingHeaders) => {
  const headerMap = new Map();

  // 1. إضافة السجلات الموجودة
  existingHeaders.forEach(header => {
    headerMap.set(String(header.id), header);
  });

  // 2. دمج السجلات الواردة (فقط إذا كانت أحدث)
  incomingHeaders.forEach(incomingHeader => {
    const existingHeader = headerMap.get(String(incomingHeader.id));

    if (!existingHeader) {
      // سجل جديد
      headerMap.set(String(incomingHeader.id), incomingHeader);
      return;
    }

    const existingVersion = existingHeader.version || 1;
    const incomingVersion = incomingHeader.version || 1;

    if (incomingVersion > existingVersion) {
      // السجل الوارد أحدث
      headerMap.set(String(incomingHeader.id), incomingHeader);
      console.log('[Merge] Updated to newer version:', {
        id: incomingHeader.id,
        oldVersion: existingVersion,
        newVersion: incomingVersion
      });
    } else if (incomingVersion < existingVersion) {
      // السجل المحلي أحدث (تحديث optimistic لم يصل للـ backend بعد)
      console.log('[Merge] Keeping local version (newer):', {
        id: existingHeader.id,
        localVersion: existingVersion,
        incomingVersion: incomingVersion
      });
      // احتفظ بالسجل المحلي
    } else {
      // نفس الـ version - قارن timestamp
      const existingTime = new Date(existingHeader.updatedAt).getTime();
      const incomingTime = new Date(incomingHeader.updatedAt).getTime();

      if (incomingTime >= existingTime) {
        headerMap.set(String(incomingHeader.id), incomingHeader);
      }
    }
  });

  return Array.from(headerMap.values());
};
```

---

## استكشاف الأخطاء

### خطأ: "Another device has already updated this order"

#### السبب #1: version مفقود
```javascript
// الحل: تأكد من إرسال version
console.log('Update payload:', updatePayload);
// يجب أن يحتوي على: { id, version, status, ... }
```

#### السبب #2: version قديم
```javascript
// الحل: أعد قراءة السجل الحالي قبل التحديث
const freshHeader = await store.query('order_header', { id: orderId });
const currentVersion = freshHeader.version || 1;
const nextVersion = currentVersion + 1;
```

#### السبب #3: race condition
```javascript
// المشكلة: طلبين update في نفس الوقت
update1: version 5 → 6
update2: version 5 → 6  // ❌ conflict!

// الحل: استخدام queue لتسلسل الطلبات
const updateQueue = [];
const processQueue = async () => {
  while (updateQueue.length > 0) {
    const task = updateQueue.shift();
    await task();
  }
};
```

### خطأ: البيانات تختفي بعد التحديث

#### السبب: Optimistic update بدون rollback
```javascript
// ❌ خطأ: تحديث الـ state بدون التعامل مع الأخطاء
setState({ orderHeaders: updatedHeaders });
await store.update(...); // قد يفشل!

// ✅ صحيح: حفظ النسخة القديمة و rollback عند الفشل
const oldHeaders = [...orderHeaders];
setState({ orderHeaders: updatedHeaders });

try {
  await store.update(...);
} catch (error) {
  // Rollback
  setState({ orderHeaders: oldHeaders });
  throw error;
}
```

---

## ملخص سريع

### ✅ افعل:
1. **دائما** أرسل `version = currentVersion + 1`
2. **دائما** حدّث الـ state المحلي مع الـ version الجديد
3. **دائما** تعامل مع VersionConflictError
4. **دائما** استخدم smart merge مع الـ watcher updates
5. **دائما** قارن versions عند دمج البيانات

### ❌ لا تفعل:
1. **أبدا** ترسل update بدون version
2. **أبدا** تستبدل سجل بآخر بدون مقارنة versions
3. **أبدا** تتجاهل VersionConflictError
4. **أبدا** تفترض أن الطلب نجح بدون try/catch
5. **أبدا** تنسى rollback عند الفشل

---

## المصادر

- Backend Code: `src/moduleStore.js` (resolveNextVersion, updateRecord)
- Frontend Store: `static/lib/mishkah.store.js`
- KDS Implementation: `static/pos/kds.js`

---

**آخر تحديث**: 2025-11-06
**الإصدار**: 1.0
**المؤلف**: Claude Code Assistant

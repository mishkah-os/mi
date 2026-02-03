# 🚀 نظام SQLite الديناميكي الجديد

## 💥 المشكلة في النظام القديم

### الكود القديم كان **كارثة**:

```javascript
// ❌ hardcoded لـ 4 جداول فقط!
const DEFAULT_TABLES = new Set(['order_header', 'order_line', 'order_payment', 'pos_shift']);

// ❌ كل جدول يحتاج build function منفصلة!
function buildHeaderRow(record) { ... }
function buildLineRow(record) { ... }
function buildPaymentRow(record) { ... }
function buildShiftRow(record) { ... }

// ❌ كل جدول يحتاج SQL statements منفصلة!
switch (tableName) {
  case 'order_header': ...
  case 'order_line': ...
  case 'order_payment': ...
  case 'pos_shift': ...
  // ماذا لو أضفنا 100 جدول جديد؟ 😱
}

// ❌ hardcoded CREATE TABLE لكل جدول!
db.exec(`CREATE TABLE IF NOT EXISTS order_header ...`);
db.exec(`CREATE TABLE IF NOT EXISTS order_line ...`);
// ... إلخ
```

### المشاكل:
1. ❌ **غير قابل للتوسع** - كل جدول جديد = كتابة كود جديد
2. ❌ **أخطاء صامتة** - نسيت إضافة item_id في buildLineRow؟ لن تعرف!
3. ❌ **صيانة مستحيلة** - آلاف الأسطر من duplicate code
4. ❌ **لا يتبع schema** - يجب مزامنة يدوية مع definition.json

---

## ✅ النظام الديناميكي الجديد

### المبدأ الأساسي:
**"Schema is the source of truth"**

```javascript
// ✅ يقرأ schema من definition.json تلقائياً
// ✅ يبني SQL statements ديناميكياً
// ✅ يعمل مع أي جدول بدون كتابة كود جديد
```

---

## 🔧 كيف يعمل النظام الجديد

### 1️⃣ قراءة Schema تلقائياً

```javascript
// يقرأ جميع schema definitions من:
// data/branches/{branch}/modules/{module}/schema/definition.json

function getTableDefinition(branchId, moduleId, tableName) {
  const schema = loadSchemaDefinition(branchId, moduleId);
  return schema.tables.find(t => t.name === tableName);
}
```

### 2️⃣ بناء Row ديناميكياً

```javascript
// ✅ يعمل مع أي جدول!
function buildRow(tableName, record, context) {
  const tableDef = getTableDefinition(...);

  // استخراج indexed fields تلقائياً من schema
  const indexedFields = getIndexedFields(tableDef);

  const row = {
    branch_id,
    module_id,
    payload: JSON.stringify(record)
  };

  // دمج جميع indexed fields
  for (const field of indexedFields) {
    const value = record[field.name] || record[field.columnName];
    row[field.columnName] = convertToSqlType(value, field.sqlType);
  }

  return row;
}
```

### 3️⃣ بناء SQL ديناميكياً

```javascript
// ✅ يبني INSERT/UPDATE تلقائياً لأي جدول!
function buildUpsertSQL(tableName, tableDef) {
  const indexedFields = getIndexedFields(tableDef);

  const columns = ['branch_id', 'module_id'];
  const values = ['@branch_id', '@module_id'];
  const updates = [];

  for (const field of indexedFields) {
    columns.push(field.columnName);
    values.push(`@${field.columnName}`);
    if (!field.primaryKey) {
      updates.push(`${field.columnName} = excluded.${field.columnName}`);
    }
  }

  columns.push('payload');
  values.push('@payload');
  updates.push('payload = excluded.payload');

  return `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${values.join(', ')})
    ON CONFLICT(...) DO UPDATE SET ${updates.join(', ')}
  `;
}
```

### 4️⃣ استرجاع البيانات ديناميكياً

```javascript
// ✅ يقرأ columns + payload ويدمجهم!
export function loadTableRecords(tableName, context) {
  const tableDef = getTableDefinition(...);
  const indexedFields = getIndexedFields(tableDef);

  // SQL: SELECT item_id, status, stage, ..., payload FROM table
  const rows = statements.load.all(...);

  return rows.map(row => {
    const record = JSON.parse(row.payload);

    // دمج indexed fields من columns في record
    for (const field of indexedFields) {
      if (row[field.columnName] != null) {
        record[field.name] = row[field.columnName];
        record[field.columnName] = row[field.columnName];
      }
    }

    return record;
  });
}
```

---

## 🎯 المميزات

### ✅ Zero Code للجداول الجديدة
```javascript
// القديم: أضف جدول جديد = 100+ سطر كود
// الجديد: أضف جدول في definition.json فقط!
```

### ✅ Auto-sync مع Schema
```javascript
// إضافة field جديد في definition.json؟
// يتم استخراجه وحفظه تلقائياً! ✅
```

### ✅ Smart Field Detection
```javascript
// يستخرج indexed fields تلقائياً:
// - Primary keys
// - Unique fields
// - Fields with index: true
// - Fields ending with _id
// - status, stage, created_at, updated_at
```

### ✅ Flexible Name Support
```javascript
// يدعم camelCase + snake_case:
record.itemId || record.item_id
```

---

## 📊 مقارنة

### النظام القديم:
```javascript
// إضافة جدول جديد:
1. ✍️ إضافة في DEFAULT_TABLES
2. ✍️ كتابة buildXRow function
3. ✍️ إضافة case في getBuilder
4. ✍️ كتابة SQL statements في getStatements
5. ✍️ إضافة CREATE TABLE في createTables
= 150+ سطر كود لكل جدول! 😱
```

### النظام الجديد:
```javascript
// إضافة جدول جديد:
1. ✍️ إضافة في definition.json
= 0 سطر كود! 🎉

// يعمل تلقائياً مع:
- buildRow ✅
- buildUpsertSQL ✅
- buildLoadSQL ✅
- getStatements ✅
- persistRecord ✅
- loadTableRecords ✅
```

---

## 🔄 كيفية الاستخدام

### نفس الـ API القديم:
```javascript
import {
  persistRecord,
  loadTableRecords,
  deleteRecord,
  truncateTable
} from './db/dynamic-sqlite.js';

// ✅ يعمل مع أي جدول!
persistRecord('order_line', record, context);
persistRecord('menu_item', item, context);
persistRecord('any_new_table', data, context);
```

---

## 📝 الملفات المعدلة

1. **`src/db/dynamic-sqlite.js`** (جديد) ✨
   - نظام ديناميكي بالكامل
   - يستبدل src/db/sqlite.js القديم

2. **`src/hybridStore.js`** (محدث)
   - يستورد من dynamic-sqlite بدلاً من sqlite

3. **`src/server.js`** (محدث)
   - يستورد من dynamic-sqlite بدلاً من sqlite

---

## 🎉 النتيجة

### قبل:
- ❌ 650+ سطر من hardcoded SQL
- ❌ 4 جداول فقط
- ❌ أخطاء صامتة
- ❌ صيانة مستحيلة

### بعد:
- ✅ 500+ سطر من dynamic logic
- ✅ unlimited جداول
- ✅ auto-sync مع schema
- ✅ صيانة سهلة

---

## 🧭 علاقة النظام الديناميكي بـ HybridStore

حتى بعد التحول للنظام الديناميكي، **قرار ما إذا كان الجدول يُكتب إلى SQLite أم لا** يتم عبر معيار آخر:

1) `HybridStore` يستقبل `persistedTables` من `moduleDefinition.tables`.
2) ثم يتم فلترتها عبر `isManagedTable` في `src/database/sqlite-ops.js`.
3) **فقط الجداول الموجودة في `DEFAULT_TABLES` تدخل SQLite write-through.**

هذا يعني:
- وجود جدول في الـ schema لا يضمن حفظه في SQLite.
- إذا أردنا ضمان ديمومة جدول معيّن، يجب إضافته إلى `DEFAULT_TABLES`.

للتفاصيل العملية، راجع:
- `src/docs/HYBRID-STORE.md`

---

## 🚀 الخطوات التالية

1. ✅ اختبر النظام الجديد
2. ✅ تأكد أن itemId يظهر بشكل صحيح الآن
3. ✅ أضف جداول جديدة في definition.json فقط
4. ✅ استمتع بالنظام الديناميكي! 🎊

---

**التاريخ:** 2025-11-05
**الملفات الجديدة:**
- `src/db/dynamic-sqlite.js`
- `DYNAMIC-SQLITE-SYSTEM.md`

**الملفات المعدلة:**
- `src/hybridStore.js`
- `src/server.js`

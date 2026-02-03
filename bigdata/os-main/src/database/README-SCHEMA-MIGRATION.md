# نظام التحقق والهجرة التلقائي للـ Schema في SQLite

## المشكلة التي يحلها النظام

كانت هناك مشكلة في تطابق أنواع البيانات بين الـ schema المعرف في `definition.json` والجداول الفعلية في SQLite. مثلاً:
- في `order_line` كان حقل `item_id` معرف كـ `integer` في SQLite
- بينما في `definition.json` هو `string` (UUID)
- هذا التضارب تسبب في أن `item_id` كان يظهر دائمًا كـ `null`

## الحل

نظام متكامل يتحقق تلقائيًا من تطابق الـ schema عند بدء التطبيق ويقوم بعمليات الـ migration اللازمة.

## المكونات

### 1. Schema Logger (`schema-logger.js`)
نظام logging متقدم يسجل:
- **DDL Log**: عمليات `CREATE`, `ALTER`, `INDEX`
- **DML Log**: عمليات `INSERT`, `UPDATE`, `DELETE` الفاشلة
- **Migration Log**: عمليات الهجرة والتحويل

الملفات تُحفظ في:
```
data/branches/{branchId}/modules/{moduleId}/logs/
  ├── ddl-2025-11-05.log
  ├── dml-2025-11-05.log
  ├── migration-2025-11-05.log
  └── migration-report-2025-11-05T10-30-00.json
```

### 2. Schema Loader (`schema-loader.js`)
يقرأ جميع ملفات `definition.json` من:
```
data/branches/{branchId}/modules/{moduleId}/schema/definition.json
```

### 3. Schema Validator (`schema-validator.js`)
يقارن بين:
- الـ schema الفعلي في SQLite (باستخدام `PRAGMA table_info`)
- الـ schema المعرف في `definition.json`

يكتشف:
- ✅ جداول مفقودة
- ✅ حقول مفقودة
- ✅ اختلافات في الأنواع (type mismatch)
- ✅ اختلافات في nullable/not null
- ✅ اختلافات في primary keys

### 4. Schema Migrator (`schema-migrator.js`)
يقوم بعمليات الهجرة التلقائية:
- ✅ `CREATE TABLE` للجداول المفقودة
- ✅ `ALTER TABLE ADD COLUMN` للحقول المفقودة
- ✅ `CREATE INDEX` للـ indexes المعرفة
- ⚠️ لا يقوم بعمل `DROP` لتجنب فقدان البيانات

**ملاحظة**: تغيير نوع الحقل (type modification) يتطلب migration يدوي لأن SQLite لا يدعم `ALTER COLUMN TYPE`.

## كيفية الاستخدام

### تفعيل النظام (مفعل افتراضيًا)

```javascript
import { initializeSqlite } from './db/sqlite.js';

// التفعيل الافتراضي - يقوم بالتحقق والهجرة تلقائيًا
const db = initializeSqlite();

// أو مع خيارات
const db = initializeSqlite({
  enableAutoMigration: true, // افتراضي: true
  rootDir: process.cwd()
});
```

### تعطيل النظام

```javascript
const db = initializeSqlite({
  enableAutoMigration: false
});
```

### تفعيل Verbose Logging للـ DML

لتسجيل جميع عمليات INSERT/UPDATE/DELETE الناجحة:

```bash
export SQLITE_VERBOSE_DML=true
node your-app.js
```

## مثال على الـ Output

```
🔍 Starting schema validation and migration...

📋 Found 3 schema definition(s):

📦 Processing: dar/pos
   Schema file: /home/user/os/data/branches/dar/modules/pos/schema/definition.json
   Tables: 15 total, 13 valid, 2 need migration
   Issues found: 3

🔄 Starting schema migration for dar/pos...
  ✓ Migrated table: order_line (1 operations)
  ✓ Migrated table: menu_item (2 operations)
✓ Migration completed. Total operations: 3

   Created 5 index(es) for order_line

✅ Schema migration completed. Check logs for details.
```

## محتوى ملفات الـ Log

### DDL Log
```
[2025-11-05T10:30:15.123Z] [INFO] [DDL]
DDL Operation: ADD_COLUMN
SQL: ALTER TABLE order_line ADD COLUMN item_id TEXT DEFAULT ''
Status: success
Metadata: {
  "operation": "ADD_COLUMN",
  "status": "success",
  "sql": "ALTER TABLE order_line ADD COLUMN item_id TEXT DEFAULT ''",
  "tableName": "order_line",
  "columnName": "item_id",
  "columnType": "TEXT"
}
================================================================================
```

### Migration Report (JSON)
```json
{
  "generatedAt": "2025-11-05T10:30:15.456Z",
  "branchId": "dar",
  "moduleId": "pos",
  "totalMigrations": 3,
  "successful": 3,
  "failed": 0,
  "migrations": [
    {
      "action": "ADD_COLUMN",
      "tableName": "order_line",
      "columnName": "item_id",
      "success": true,
      "sql": "ALTER TABLE order_line ADD COLUMN item_id TEXT DEFAULT ''"
    }
  ]
}
```

## الحماية من فقدان البيانات

النظام مصمم ليكون آمنًا:

1. **لا يقوم بعمل DROP**: لا يحذف جداول أو حقول أبدًا
2. **يضيف DEFAULT VALUES**: عند إضافة حقل NOT NULL، يضيف قيمة افتراضية
3. **يسجل كل شيء**: جميع العمليات مسجلة في logs مفصلة
4. **يحذر من العمليات الخطرة**: مثل تغيير نوع الحقل

## العمليات التي تتطلب Migration يدوي

### تغيير نوع الحقل (Type Modification)

عندما يكتشف النظام اختلاف في نوع الحقل (مثل `integer` → `string`)، لا يقوم بالتغيير تلقائيًا.

**السبب**: SQLite لا يدعم `ALTER COLUMN TYPE` بشكل مباشر. يحتاج:
1. إنشاء جدول جديد بالـ schema الصحيح
2. نسخ البيانات (مع التحويل)
3. حذف الجدول القديم
4. إعادة تسمية الجدول الجديد

**الحل**: سيظهر تحذير في الـ console وفي الـ logs:

```
⚠️  Type mismatch detected for order_line.item_id
   Expected type: TEXT
   This requires manual migration. See migration logs for details.
```

## الخطوات التالية

إذا واجهت type mismatch:

1. افتح ملف الـ migration log
2. راجع التفاصيل
3. قم بعمل migration يدوي باستخدام السكريبت التالي:

```javascript
import { getDatabase } from './db/sqlite.js';

const db = getDatabase();

// 1. Create new table with correct schema
db.exec(`
  CREATE TABLE order_line_new (
    branch_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    item_id TEXT,  -- Changed from INTEGER to TEXT
    status TEXT,
    stage TEXT,
    created_at TEXT,
    updated_at TEXT,
    version INTEGER DEFAULT 1,
    payload TEXT NOT NULL,
    PRIMARY KEY (branch_id, module_id, id)
  )
`);

// 2. Copy data with conversion
db.exec(`
  INSERT INTO order_line_new
  SELECT
    branch_id,
    module_id,
    id,
    order_id,
    CAST(item_id AS TEXT),  -- Convert integer to text
    status,
    stage,
    created_at,
    updated_at,
    version,
    payload
  FROM order_line
`);

// 3. Drop old table
db.exec('DROP TABLE order_line');

// 4. Rename new table
db.exec('ALTER TABLE order_line_new RENAME TO order_line');

// 5. Recreate indexes
db.exec('CREATE INDEX IF NOT EXISTS order_line_order_idx ON order_line (branch_id, module_id, order_id)');
```

## الأسئلة الشائعة

### لماذا لا يتم تحويل الأنواع تلقائيًا؟

لتجنب فقدان البيانات بالخطأ. تحويل الأنواع قد يؤدي لفقدان أو تلف البيانات.

### هل يمكن تعطيل النظام؟

نعم، مرر `enableAutoMigration: false` لـ `initializeSqlite()`.

### أين تُحفظ الـ logs؟

في `data/branches/{branchId}/modules/{moduleId}/logs/`

### كيف أعرف ما حدث في آخر migration؟

راجع ملف `migration-report-*.json` في مجلد الـ logs.

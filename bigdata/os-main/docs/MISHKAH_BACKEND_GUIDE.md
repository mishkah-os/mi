# 🔧 Mishkah Backend Architecture Guide
# دليل بنية Mishkah للخلفية

**For Claude Code AI: Use this as a reference guide for understanding Mishkah backend systems**

---

## 📋 Table of Contents / جدول المحتويات

1. [نظرة عامة / Overview](#overview)
2. [المعمارية / Architecture](#architecture)
3. [نظام البيانات / Data System](#data-system)
4. [Schema Engine / محرك المخطط](#schema-engine)
5. [HybridStore / التخزين الهجين](#hybrid-store)
6. [WebSocket Communication](#websocket)
7. [Sequence Manager / إدارة المتسلسلات](#sequences)
8. [أفضل الممارسات / Best Practices](#best-practices)
9. [أمثلة عملية / Practical Examples](#examples)

---

## <a name="overview"></a>🎯 نظرة عامة / Overview

### ما هو Mishkah Backend؟

**Mishkah Backend** هو نظام خلفية مبني على **Node.js** مصمم للتطبيقات Real-time مع تخزين هجين (In-Memory + SQLite).

**الفلسفة:**
- ✅ Real-time First - البيانات الفورية أولاً
- ✅ Schema-Driven - مدفوع بالمخطط
- ✅ Branch-Based - نظام فروع
- ✅ Hybrid Storage - تخزين هجين (سريع + دائم)
- ✅ WebSocket Native - دعم أصلي لـ WebSocket

---

## <a name="architecture"></a>🏗️ المعمارية / Architecture

### البنية الأساسية

```
src/
├── server.js              # نقطة الدخول الرئيسية
├── schema/
│   ├── engine.js         # محرك المخطط
│   ├── registry.js       # مسجل المخطط
│   └── legacy-loader.js  # محمل المخطط القديم
├── db/
│   └── sqlite.js         # تشغيل SQLite
├── hybridStore.js        # نظام التخزين الهجين
├── eventStore.js         # متجر الأحداث
├── moduleStore.js        # مخزن المودولات
├── sequenceManager.js    # إدارة المتسلسلات
├── logger.js             # نظام التسجيل
└── utils.js              # أدوات مساعدة
```

### تدفق البيانات / Data Flow

```
┌─────────────┐
│   Client    │ Browser
└──────┬──────┘
       │ WebSocket
       ↓
┌─────────────┐
│   Server    │ Node.js + WebSocket
└──────┬──────┘
       │
       ↓
┌─────────────┐
│ HybridStore │ In-Memory + Events
└──────┬──────┘
       │
       ↓
┌─────────────┐
│   SQLite    │ Persistent Storage
└─────────────┘
```

---

## <a name="data-system"></a>📊 نظام البيانات / Data System

### 1. هيكل البيانات الأساسي

#### Branches (الفروع)
```
data/branches/
├── dar/              # فرع دار
├── remal/            # فرع رمال
└── gim/              # فرع الجيم
```

**ملف التكوين:** `data/branches.config.json`
```json
{
  "branches": {
    "dar": {
      "label": "دار — الفرع الرئيسي",
      "modules": ["pos"]
    },
    "gim": {
      "label": "جيم — نظام إدارة الجيم",
      "modules": ["gym"]
    }
  },
  "patterns": [
    {
      "match": "^gym:",
      "modules": ["gym"]
    }
  ],
  "defaults": ["pos"]
}
```

#### Modules (المودولات)
```
data/branches/{branch}/modules/{module}/
├── schema/
│   └── definition.json    # تعريف الجداول والحقول
├── seeds/
│   └── initial.json       # البيانات الأولية
└── live/
    └── data.json          # البيانات المباشرة (الأحداث)
```

**ملف التكوين:** `data/modules.json`
```json
{
  "modules": {
    "gym": {
      "label": "Gym Management",
      "schemaPath": "schema/definition.json",
      "seedPath": "seeds/initial.json",
      "livePath": "live/data.json",
      "historyPath": "history",
      "tables": [
        "gym_config",
        "staff",
        "gym_member",
        "membership_plan",
        "membership_subscription"
      ],
      "description": "Gym management system"
    }
  }
}
```

### 2. أنواع الملفات

#### A. Schema Definition (schema/definition.json)
```json
{
  "version": 1,
  "moduleId": "gym",
  "description": {
    "en": "Gym Management System",
    "ar": "نظام إدارة الجيم"
  },
  "tables": {
    "gym_member": {
      "fields": {
        "id": { "type": "text", "primaryKey": true },
        "member_code": { "type": "text" },
        "full_name": { "type": "json" },
        "email": { "type": "text" },
        "phone": { "type": "text" },
        "status": { "type": "text" },
        "created_at": { "type": "timestamp" },
        "updated_at": { "type": "timestamp" }
      }
    }
  }
}
```

**أنواع البيانات المدعومة:**
- `text` - نص
- `integer` - عدد صحيح
- `decimal` - عدد عشري
- `boolean` - صح/خطأ
- `date` - تاريخ
- `timestamp` - تاريخ ووقت
- `json` - JSON object

#### B. Seeds (seeds/initial.json)
```json
{
  "version": 1,
  "meta": {
    "branchId": "gim",
    "moduleId": "gym",
    "generatedAt": "2025-10-29T10:00:00Z"
  },
  "tables": {
    "gym_member": [
      {
        "id": "member_001",
        "member_code": "GYM001",
        "full_name": {
          "en": "Ahmed Hassan",
          "ar": "أحمد حسن"
        },
        "email": "ahmed@email.com",
        "phone": "+20 10 1234 5678",
        "status": "active",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### C. Live Data (live/data.json)
```json
{
  "version": 1,
  "meta": {
    "branchId": "gim",
    "moduleId": "gym",
    "lastModified": "2025-10-29T10:00:00Z"
  },
  "events": [
    {
      "id": "evt_001",
      "type": "INSERT",
      "table": "gym_member",
      "data": { ... },
      "timestamp": "2025-10-29T10:00:00Z"
    }
  ]
}
```

---

## <a name="schema-engine"></a>🔨 Schema Engine / محرك المخطط

### كيف يعمل؟

```javascript
// في src/schema/engine.js

// 1. قراءة ملف schema/definition.json
const schemaDef = await loadSchemaDefinition(branchId, moduleId);

// 2. إنشاء جداول SQLite
for (const [tableName, tableDef] of Object.entries(schemaDef.tables)) {
  const sql = generateCreateTableSQL(tableName, tableDef);
  await db.exec(sql);
}

// 3. تحميل البيانات الأولية من seeds/initial.json
const seedData = await loadSeedData(branchId, moduleId);
for (const [tableName, rows] of Object.entries(seedData.tables)) {
  for (const row of rows) {
    await db.insert(tableName, row);
  }
}

// 4. تطبيق الأحداث من live/data.json
const liveData = await loadLiveData(branchId, moduleId);
for (const event of liveData.events) {
  await applyEvent(event);
}
```

### مثال SQL المولد

```sql
-- من schema definition
CREATE TABLE IF NOT EXISTS gym_member (
  id TEXT PRIMARY KEY,
  member_code TEXT,
  full_name TEXT,  -- JSON يُخزن كـ TEXT
  email TEXT,
  phone TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_gym_member_status
ON gym_member(status);

CREATE INDEX IF NOT EXISTS idx_gym_member_email
ON gym_member(email);
```

---

## <a name="hybrid-store"></a>💾 HybridStore / التخزين الهجين

### المفهوم

**HybridStore** يجمع بين:
1. **In-Memory Store** - للقراءة السريعة
2. **SQLite** - للتخزين الدائم
3. **Event Log** - لتتبع التغييرات

```javascript
// في src/hybridStore.js

class HybridStore {
  constructor(db, moduleId) {
    this.db = db;              // SQLite connection
    this.moduleId = moduleId;
    this.cache = {};           // In-memory cache
    this.subscribers = [];     // للإشعارات
  }

  // قراءة جميع الصفوف (من الذاكرة)
  list(tableName) {
    return this.cache[tableName] || [];
  }

  // قراءة صف واحد (من الذاكرة)
  get(tableName, id) {
    const rows = this.cache[tableName] || [];
    return rows.find(r => r.id === id);
  }

  // إضافة صف (يكتب للذاكرة + SQLite + Event Log)
  async insert(tableName, data) {
    // 1. كتابة إلى SQLite
    await this.db.insert(tableName, data);

    // 2. تحديث الذاكرة
    if (!this.cache[tableName]) {
      this.cache[tableName] = [];
    }
    this.cache[tableName].push(data);

    // 3. كتابة Event
    await this.logEvent({
      type: 'INSERT',
      table: tableName,
      data: data
    });

    // 4. إشعار المشتركين
    this.notify(tableName);
  }

  // تحديث صف
  async update(tableName, id, changes) {
    // مشابه لـ insert
  }

  // حذف صف
  async delete(tableName, id) {
    // مشابه لـ insert
  }

  // الاشتراك في التغييرات
  subscribe(tableName, callback) {
    this.subscribers.push({ tableName, callback });
  }

  // إشعار المشتركين
  notify(tableName) {
    this.subscribers
      .filter(s => s.tableName === tableName)
      .forEach(s => s.callback(this.list(tableName)));
  }
}
```

### ميزات HybridStore

1. **سرعة القراءة** - من الذاكرة مباشرة
2. **ديمومة البيانات** - SQLite للتخزين
3. **Real-time Updates** - WebSocket للمزامنة
4. **Event Sourcing** - تتبع كل التغييرات
5. **Crash Recovery** - استرجاع البيانات من SQLite

### معيار الحفظ في SQLite (مهم جدًا)

- ليس كل جدول يُكتب إلى SQLite.
- يتم تمرير `persistedTables` من `moduleDefinition.tables`، ثم تُفلتر عبر `isManagedTable`.
- `isManagedTable` يعتمد على قائمة ثابتة `DEFAULT_TABLES` داخل `src/database/sqlite-ops.js`.
- أي جدول خارج `DEFAULT_TABLES` لن يُكتب إلى SQLite (حتى لو كان موجودًا في الـ schema).

📌 للتفاصيل الدقيقة، راجع الوثيقة المرجعية:
- `src/docs/HYBRID-STORE.md`

**ملخص الأوضاع:**
- Full SQL
- Hybrid SQL (Payload + Indexed Columns)
- Live Data Only

---

## <a name="websocket"></a>🔌 WebSocket Communication

### البروتوكول

#### 1. الاتصال الأولي

```javascript
// Server: src/server.js
wss.on('connection', (ws) => {
  console.log('Client connected');

  // إرسال Snapshot كامل
  const snapshot = hybridStore.getFullSnapshot();
  ws.send(JSON.stringify({
    type: 'SNAPSHOT',
    data: snapshot
  }));
});
```

```javascript
// Client: في التطبيق
const ws = new WebSocket('ws://localhost:8080');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'SNAPSHOT') {
    // تحميل البيانات الكاملة
    loadSnapshot(message.data);
  } else if (message.type === 'DELTA') {
    // تطبيق التغيير
    applyDelta(message.data);
  }
};
```

#### 2. التحديثات التدريجية (Delta)

```javascript
// Server: عند حدوث تغيير
hybridStore.on('change', (event) => {
  // إرسال Delta لجميع العملاء
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'DELTA',
        data: event
      }));
    }
  });
});
```

```javascript
// Delta Event Structure
{
  "type": "DELTA",
  "data": {
    "table": "gym_member",
    "operation": "INSERT",  // أو UPDATE أو DELETE
    "id": "member_013",
    "changes": {
      "full_name": { "ar": "محمد", "en": "Mohamed" },
      "email": "mohamed@email.com"
    },
    "timestamp": "2025-10-29T10:30:00Z"
  }
}
```

#### 3. أوامر من العميل

```javascript
// Client يرسل أمر
ws.send(JSON.stringify({
  type: 'INSERT',
  table: 'gym_member',
  data: {
    id: 'member_013',
    member_code: 'GYM013',
    full_name: { ar: 'محمد', en: 'Mohamed' },
    email: 'mohamed@email.com',
    status: 'active'
  }
}));

// Server يعالج الأمر
ws.on('message', async (message) => {
  const command = JSON.parse(message);

  if (command.type === 'INSERT') {
    await hybridStore.insert(command.table, command.data);
    // سيتم إرسال DELTA تلقائياً لجميع العملاء
  }
});
```

---

## <a name="sequences"></a>🔢 Sequence Manager / إدارة المتسلسلات

### ما هي Sequences؟

نظام لإنشاء IDs فريدة لكل فرع.

**ملف التكوين:** `data/sequence-rules.json`
```json
{
  "branches": {
    "dar": {
      "pos": {
        "order_header": {
          "id": {
            "prefix": "DAR",
            "start": 1001,
            "format": "{prefix}-{number:05d}"
          }
        }
      }
    },
    "gim": {
      "gym": {
        "gym_member": {
          "member_code": {
            "prefix": "GYM",
            "start": 1,
            "format": "GYM{number:03d}"
          }
        }
      }
    }
  }
}
```

### الاستخدام

```javascript
// في src/sequenceManager.js

class SequenceManager {
  constructor(configPath) {
    this.config = loadConfig(configPath);
    this.counters = {};
  }

  // إنشاء ID جديد
  next(branchId, moduleId, tableName, fieldName) {
    const rule = this.config.branches[branchId][moduleId][tableName][fieldName];

    if (!this.counters[branchId]) {
      this.counters[branchId] = {};
    }
    if (!this.counters[branchId][tableName]) {
      this.counters[branchId][tableName] = rule.start;
    }

    const number = this.counters[branchId][tableName]++;
    return this.format(rule.format, rule.prefix, number);
  }

  format(template, prefix, number) {
    return template
      .replace('{prefix}', prefix)
      .replace('{number:03d}', String(number).padStart(3, '0'))
      .replace('{number:05d}', String(number).padStart(5, '0'));
  }
}

// الاستخدام
const seqMgr = new SequenceManager('data/sequence-rules.json');
const memberId = seqMgr.next('gim', 'gym', 'gym_member', 'member_code');
// نتيجة: "GYM001"
```

---

## <a name="best-practices"></a>✅ أفضل الممارسات / Best Practices

### 1. تصميم Schema

```javascript
// ✅ جيد: استخدم JSON للبيانات متعددة اللغات
{
  "full_name": {
    "type": "json",
    "description": "Name in multiple languages"
  }
}

// ✅ جيد: استخدم timestamp للتواريخ
{
  "created_at": { "type": "timestamp" },
  "updated_at": { "type": "timestamp" }
}

// ✅ جيد: استخدم enums للحالات
{
  "status": {
    "type": "text",
    "enum": ["active", "inactive", "suspended"]
  }
}

// ❌ سيء: حقول متعددة لنفس البيانات
{
  "name_ar": { "type": "text" },
  "name_en": { "type": "text" }
}
```

### 2. البيانات الأولية (Seeds)

```javascript
// ✅ جيد: بيانات واقعية ومفصلة
{
  "gym_member": [
    {
      "id": "member_001",
      "member_code": "GYM001",
      "full_name": {
        "ar": "أحمد حسن",
        "en": "Ahmed Hassan"
      },
      "email": "ahmed.hassan@email.com",
      "phone": "+20 10 1234 5678",
      "date_of_birth": "1995-05-15",
      "gender": "male",
      "address": {
        "ar": "مدينة نصر، القاهرة",
        "en": "Nasr City, Cairo"
      },
      "emergency_contact": {
        "name": "Hassan Ahmed",
        "phone": "+20 10 9876 5432",
        "relation": "father"
      },
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}

// ❌ سيء: بيانات غير كاملة
{
  "gym_member": [
    {
      "id": "1",
      "name": "Test",
      "status": "active"
    }
  ]
}
```

### 3. Events و Logging

```javascript
// ✅ جيد: تسجيل الأحداث المهمة
await logEvent({
  type: 'MEMBER_CREATED',
  table: 'gym_member',
  id: member.id,
  data: member,
  user: currentUser.id,
  timestamp: new Date().toISOString()
});

// ✅ جيد: معالجة الأخطاء
try {
  await hybridStore.insert('gym_member', data);
} catch (error) {
  logger.error('Failed to insert member:', error);
  throw new Error('Database operation failed');
}
```

### 4. الأداء

```javascript
// ✅ جيد: استخدم الفهارس
{
  "tables": {
    "gym_member": {
      "fields": { ... },
      "indexes": [
        { "fields": ["email"], "unique": true },
        { "fields": ["status"] },
        { "fields": ["member_code"], "unique": true }
      ]
    }
  }
}

// ✅ جيد: استخدم المعاملات للعمليات المتعددة
await db.transaction(async (tx) => {
  await tx.insert('gym_member', memberData);
  await tx.insert('membership_subscription', subscriptionData);
  await tx.insert('payment_transaction', paymentData);
});
```

### 5. الأمان

```javascript
// ✅ جيد: تنظيف المدخلات
function sanitizeInput(data) {
  // إزالة الحقول غير المطلوبة
  const allowed = ['name', 'email', 'phone'];
  return Object.keys(data)
    .filter(key => allowed.includes(key))
    .reduce((obj, key) => {
      obj[key] = data[key];
      return obj;
    }, {});
}

// ✅ جيد: التحقق من البيانات
function validateMember(data) {
  if (!data.email || !data.email.includes('@')) {
    throw new Error('Invalid email');
  }
  if (!data.phone || data.phone.length < 10) {
    throw new Error('Invalid phone');
  }
  return true;
}
```

---

## <a name="examples"></a>💡 أمثلة عملية / Practical Examples

### مثال 1: إنشاء Module جديد

#### الخطوة 1: إنشاء الهيكل
```bash
mkdir -p data/branches/myapp/modules/mymodule/{schema,seeds,live}
```

#### الخطوة 2: Schema Definition
```json
// data/branches/myapp/modules/mymodule/schema/definition.json
{
  "version": 1,
  "moduleId": "mymodule",
  "description": {
    "en": "My Module",
    "ar": "المودول الخاص بي"
  },
  "tables": {
    "my_table": {
      "fields": {
        "id": { "type": "text", "primaryKey": true },
        "name": { "type": "json" },
        "created_at": { "type": "timestamp" }
      }
    }
  }
}
```

#### الخطوة 3: Seed Data
```json
// data/branches/myapp/modules/mymodule/seeds/initial.json
{
  "version": 1,
  "meta": {
    "branchId": "myapp",
    "moduleId": "mymodule",
    "generatedAt": "2025-10-29T10:00:00Z"
  },
  "tables": {
    "my_table": [
      {
        "id": "item_001",
        "name": {
          "ar": "عنصر أول",
          "en": "First Item"
        },
        "created_at": "2025-10-29T10:00:00Z"
      }
    ]
  }
}
```

#### الخطوة 4: Live Data (فارغ في البداية)
```json
// data/branches/myapp/modules/mymodule/live/data.json
{
  "version": 1,
  "meta": {
    "branchId": "myapp",
    "moduleId": "mymodule",
    "lastModified": "2025-10-29T10:00:00Z"
  },
  "events": []
}
```

#### الخطوة 5: تحديث التكوين
```json
// data/branches.config.json
{
  "branches": {
    "myapp": {
      "label": "تطبيقي",
      "modules": ["mymodule"]
    }
  }
}

// data/modules.json
{
  "modules": {
    "mymodule": {
      "label": "My Module",
      "schemaPath": "schema/definition.json",
      "seedPath": "seeds/initial.json",
      "livePath": "live/data.json",
      "tables": ["my_table"]
    }
  }
}
```

### مثال 2: تشغيل Server

```javascript
// src/server.js (مبسط)

const express = require('express');
const WebSocket = require('ws');
const { createHybridStore } = require('./hybridStore');
const { loadSchema } = require('./schema/engine');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Static files
app.use(express.static('static'));
app.use('/projects', express.static('projects'));

// تحميل Modules
const stores = {};

async function initializeModule(branchId, moduleId) {
  const schema = await loadSchema(branchId, moduleId);
  const store = await createHybridStore(schema);
  stores[`${branchId}:${moduleId}`] = store;

  // الاشتراك في التغييرات
  store.on('change', (event) => {
    broadcast({
      type: 'DELTA',
      branch: branchId,
      module: moduleId,
      data: event
    });
  });
}

// WebSocket
wss.on('connection', (ws, req) => {
  console.log('Client connected');

  // استخراج branch و module من URL
  const params = new URLSearchParams(req.url.split('?')[1]);
  const branchId = params.get('branch') || 'default';
  const moduleId = params.get('module') || 'default';

  const storeKey = `${branchId}:${moduleId}`;
  const store = stores[storeKey];

  if (!store) {
    ws.send(JSON.stringify({ error: 'Module not found' }));
    ws.close();
    return;
  }

  // إرسال Snapshot
  ws.send(JSON.stringify({
    type: 'SNAPSHOT',
    data: store.getSnapshot()
  }));

  // معالجة الرسائل
  ws.on('message', async (message) => {
    try {
      const command = JSON.parse(message);

      switch (command.type) {
        case 'INSERT':
          await store.insert(command.table, command.data);
          break;
        case 'UPDATE':
          await store.update(command.table, command.id, command.changes);
          break;
        case 'DELETE':
          await store.delete(command.table, command.id);
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({ error: error.message }));
    }
  });
});

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// تحميل جميع الفروع والمودولات
async function init() {
  const config = require('../data/branches.config.json');

  for (const [branchId, branchConfig] of Object.entries(config.branches)) {
    for (const moduleId of branchConfig.modules) {
      await initializeModule(branchId, moduleId);
      console.log(`Loaded: ${branchId}:${moduleId}`);
    }
  }
}

// البدء
init().then(() => {
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
```

### مثال 3: Client-Side Integration

```javascript
// في التطبيق (projects/myapp/app.js)

import { createPosDb } from '../../static/pos/pos-mini-db.js';

const BRANCH_ID = 'myapp';
const MODULE_ID = 'mymodule';

let db;

async function init() {
  // الاتصال بالسيرفر
  const result = await createPosDb({
    branchId: BRANCH_ID,
    moduleId: MODULE_ID
  });

  db = result.db;
  await db.ready();

  // الآن يمكن استخدام قاعدة البيانات
  const items = db.list('my_table');
  console.log('Items:', items);

  // الاشتراك في التحديثات
  db.subscribe('my_table', (items) => {
    console.log('Items updated:', items);
    render();
  });

  // عرض التطبيق
  render();
}

function render() {
  const items = db.list('my_table');
  // ... بناء الواجهة
}

// إضافة عنصر جديد
async function addItem(name) {
  await db.insert('my_table', {
    id: `item_${Date.now()}`,
    name: name,
    created_at: new Date().toISOString()
  });
  // سيتم التحديث تلقائياً عبر subscription
}

init();
```

---

## 🔍 Troubleshooting / حل المشاكل

### مشكلة: البيانات لا تظهر

**الحل:**
1. تأكد من أن الـ schema صحيح
2. تأكد من أن seed data موجود
3. افحص الـ console للأخطاء
4. تأكد من اتصال WebSocket

```javascript
// افحص الاتصال
ws.onopen = () => console.log('Connected');
ws.onerror = (error) => console.error('WebSocket error:', error);
ws.onclose = () => console.log('Disconnected');
```

### مشكلة: التحديثات لا تصل للعملاء

**الحل:**
1. تأكد من أن Events تُسجل بشكل صحيح
2. تأكد من broadcast يعمل
3. افحص subscription

```javascript
// في Server
store.on('change', (event) => {
  console.log('Change event:', event);
  broadcast({ type: 'DELTA', data: event });
});
```

### مشكلة: أداء بطيء

**الحل:**
1. أضف فهارس للجداول
2. استخدم pagination للبيانات الكبيرة
3. افحص حجم الـ snapshot

```javascript
// في Schema
{
  "tables": {
    "gym_member": {
      "fields": { ... },
      "indexes": [
        { "fields": ["email"], "unique": true },
        { "fields": ["status"] }
      ]
    }
  }
}
```

---

## 📚 مراجع / References

### الملفات المهمة
1. `src/server.js` - السيرفر الرئيسي
2. `src/hybridStore.js` - نظام التخزين
3. `src/schema/engine.js` - محرك المخطط
4. `static/pos/pos-mini-db.js` - Client-side database

### الأنماط الموصى بها
1. استخدم schema-driven development
2. اختبر مع بيانات واقعية
3. استخدم Events للتتبع
4. راقب الأداء

---

## ✅ Checklist للModule الجديد

- [ ] أنشئ هيكل المجلدات
- [ ] اكتب schema definition
- [ ] أنشئ seed data واقعي
- [ ] حدث branches.config.json
- [ ] حدث modules.json
- [ ] أنشئ sequence rules (إن وجد)
- [ ] اختبر Schema Engine
- [ ] اختبر WebSocket Connection
- [ ] اختبر CRUD operations
- [ ] اختبر Real-time updates
- [ ] راجع الأداء
- [ ] وثّق الـ API

---

**هذا الدليل سيساعدك في فهم وبناء Backend لأي تطبيق Mishkah!** 🚀

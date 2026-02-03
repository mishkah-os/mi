# Clinic Test Server - Quick Start Guide

## 🚀 تشغيل سريع

```bash
# 1. Initialize database (creates tables from clinic_schema.json)
npm run clinic:init

# 2. Start test server on port 3001
npm run clinic:test

# OR do both في أمر واحد:
npm run clinic:dev
```

## 📋 الوصول إلى الواجهة

بعد التشغيل، افتح المتصفح:

```
http://localhost:3001/crud-knex.html
```

## 🔌 API Endpoints

### 1. البحث والقراءة

```bash
# Get all companies (Arabic)
GET http://localhost:3001/api/v1/crud/match/companies?lang=ar

# Get all companies (English)
GET http://localhost:3001/api/v1/crud/match/companies?lang=en

# Search companies
GET http://localhost:3001/api/v1/crud/match/companies?lang=ar&q=أمل

# Get single company
GET http://localhost:3001/api/v1/crud/companies/comp-1?lang=ar
```

### 2. الإضافة (Create)

```bash
POST http://localhost:3001/api/v1/crud/companies
Content-Type: application/json

{
  "id": "comp-1",
  "tax_number": "123456789",
  "translations": {
    "ar": { "name": "شركة الأمل" },
    "en": { "name": "Hope Company" }
  }
}
```

## 🧪 مميزات النظام الجديد

### ✅ Auto Translation Attachment

السجلات تُرجع مع الترجمة الصحيحة حسب اللغة:

```json
{
  "id": "comp-1",
  "tax_number": "123456789",
  "name": "شركة الأمل"  // ← من companies_lang تلقائياً
}
```

### ✅ Smart FK Hydration

الـ Foreign Keys تُحوّل لـ Objects تلقائياً:

```json
{
  "id": "user-1",
  "username": "ahmed",
  "company_id": "comp-1",  // ← الـ ID الأصلي
  "company": {             // ← الكائن الذكي
    "id": "comp-1",
    "name": "شركة الأمل"
  }
}
```

### ✅ Real SQL Tables

لا مزيد من JSON blobs! الجداول حقيقية:

```sql
-- في clinic-knex.sqlite
SELECT * FROM companies;
SELECT * FROM companies_lang WHERE lang = 'ar';
```

## 📂 الملفات المهمة

| الملف | الوظيفة |
|-------|---------|
| `knexfile.js` | إعدادات قاعدة البيانات |
| `test-server.js` | السيرفر المستقل |
| `src/orm/schema-to-knex.js` | محول Schema → SQL |
| `src/orm/init-clinic-db.js` | إنشاء الجداول |
| `static/crud-knex.html` | واجهة الاختبار |
| `data/clinic-knex.sqlite` | قاعدة البيانات |

## 🛡️ ملاحظات مهمة

1. **معزول تماماً عن POS**:
   - السيرفر على port 3001 (POS على 8080)
   - قاعدة بيانات منفصلة (`clinic-knex.sqlite`)

2. **لا يؤثر على النظام الحالي**:
   - الكود الموجود لم يتغير
   - يمكن حذف كل شيء بأمان إذا لم ينجح

3. **جاهز للـ PostgreSQL**:

   ```javascript
   // في knexfile.js - Production
   client: 'pg',
   connection: {
     host: 'ws.mas.com.eg',
     database: 'clinic_prod',
     // ...
   }
   ```

## 🔧 Troubleshooting

### المشكلة: `MODULE_NOT_FOUND`

```bash
# التأكد من تثبيت الحزم
npm install
```

### المشكلة: `SQLITE_CANTOPEN`

```bash
# التأكد من وجود المجلد
mkdir -p data

# إعادة إنشاء القاعدة
npm run clinic:init
```

### المشكلة: Port مستخدم

```bash
# استخدام port مختلف
TEST_PORT=3002 npm run clinic:test
```

## 📊 الخطوة التالية

بعد التأكد من عمل النظام محلياً:

1. ✅ Deploy على `ws.mas.com.eg`
2. ✅ تغيير `knexfile.js` للـ production
3. ✅ اختبار مع PostgreSQL
4. ✅ دمج مع النظام الحالي (Dual-write mode)

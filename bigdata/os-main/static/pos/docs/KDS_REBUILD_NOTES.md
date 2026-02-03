# KDS Screen Rebuild Notes

## Overview
شاشة KDS تم إعادة بنائها من الصفر مع **توحيد كامل للتسميات** بناءً على `pos_schema.json` كمصدر وحيد للحقيقة.

## المشاكل التي تم حلها

### 1. تضارب التسميات
- **قبل**: استخدام أسماء مختلفة للحقول (camelCase, snake_case, أسماء مخصصة)
- **بعد**: استخدام الأسماء من `pos_schema.json` فقط بدون أي fallback أو alias

### 2. استخدام الجداول الخاطئة
- **قبل**: KDS كان يستخدم `order_header` و `order_line` مباشرة
- **بعد**: KDS الآن يستخدم `job_order_header` و `job_order_detail` (الجداول الصحيحة للمطبخ)

### 3. ظهور IDs بدلاً من الأسماء
- **قبل**: الأصناف تظهر كـ IDs
- **بعد**: استخدام `itemNameAr` و `itemNameEn` من `job_order_detail` مباشرة

### 4. تعقيد معالجة البيانات
- **قبل**: كود معقد جداً مع العديد من التحويلات والـ mapping
- **بعد**: كود مبسط يعتمد مباشرة على البيانات من WebSocket

### 5. إلغاء localStorage
- **قبل**: استخدام localStorage لحفظ حالة handoff
- **بعد**: الاعتماد كلياً على WebSocket watch بدون تخزين محلي

## Changes Made

### 1. توحيد التسميات في pos_schema.json
جميع الحقول الآن تستخدم الأسماء من `pos_schema.json` فقط:

#### job_order_header:
```javascript
id -> job_order_id
orderId -> order_id
orderNumber -> order_number
serviceMode -> service_mode
stationId -> station_id
stationCode -> station_code
status -> status
tableLabel -> table_label
customerName -> customer_name
totalItems -> total_items
completedItems -> completed_items
acceptedAt -> accepted_at
createdAt -> created_at
```

#### job_order_detail:
```javascript
id -> detail_id
jobOrderId -> job_order_id
itemId -> item_id
itemNameAr -> item_name_ar
itemNameEn -> item_name_en
quantity -> quantity
status -> status
prepNotes -> prep_notes
```

### 2. تحديث modules.json
إضافة الجداول الناقصة وتصحيح الأسماء:
- تصحيح: `pos_terminals` → `pos_terminal`
- إضافة: `job_order_header`
- إضافة: `job_order_detail`
- إضافة: `job_order_detail_modifier`
- إضافة: `job_order_status_history`
- إضافة: `order_return_header`
- إضافة: `order_return_line`

### 3. هيكل البيانات النهائي
الملف الجديد يعتمد على:
- `job_order_header` - رأس كل طلب لكل قسم مطبخ (من الـ schema)
- `job_order_detail` - تفاصيل الأصناف في كل طلب (من الـ schema)
- `kitchen_sections` - أقسام المطبخ

### 4. إزالة جميع الـ Fallbacks
- **لا يوجد fallbacks**: الكود الآن يستخدم الأسماء من الـ schema فقط
- **لا aliases**: إزالة جميع الأسماء البديلة
- **لا guessing**: إذا لم يكن الحقل موجوداً، لن يحاول البحث عنه بأسماء أخرى

### 5. تدفق البيانات المبسط

```
WebSocket Watch (db.watch)
    ↓
job_order_header (التسميات من pos_schema.json)
job_order_detail (التسميات من pos_schema.json)
    ↓
processData() - معالجة بسيطة بدون تحويلات
    ↓
state.jobOrders - قائمة مبسطة للعرض
    ↓
render() - عرض UI
```

## Important Rules

### ⚠️ قواعد صارمة للتسميات

1. **pos_schema.json هو المصدر الوحيد للحقيقة**
   - جميع أسماء الجداول يجب أن تطابق الـ schema
   - جميع أسماء الحقول يجب أن تطابق الـ schema
   - لا استثناءات

2. **ممنوع منعاً باتاً**
   - ❌ استخدام fallbacks (مثل: `header.id || header.order_id`)
   - ❌ استخدام aliases (مثل: `order_number` بدلاً من `orderNumber`)
   - ❌ استخدام أسماء مخصصة غير موجودة في الـ schema

3. **الاستخدام الصحيح**
   - ✅ استخدام الأسماء من الـ schema مباشرة
   - ✅ التحقق من وجود الحقل قبل الاستخدام
   - ✅ استخدام قيم افتراضية واضحة (مثل: `|| ''`, `|| 0`)

## State Structure

```javascript
const state = {
  lang: 'ar',              // اللغة الحالية
  theme: 'dark',           // المظهر
  activeTab: 'prep',       // التبويب النشط
  activeSection: null,     // القسم المحدد (null = الكل)

  // البيانات من WebSocket - أسماء من pos_schema.json فقط
  jobOrderHeaders: [],     // job_order_header table
  jobOrderDetails: [],     // job_order_detail table
  kitchenSections: [],     // kitchen_sections table

  // البيانات المعالجة للعرض
  jobOrders: [],          // قائمة مبسطة من job_order_header + details

  isOnline: false
}
```

## UI Features

### 1. Header
- عنوان الشاشة
- حالة الاتصال (متصل/غير متصل)
- زر تغيير اللغة

### 2. Tabs
- كل الأقسام (Prep)
- شاشة التجميع (Expo)

### 3. Section Filters
- عرض كل الأقسام أو قسم محدد
- تبويبات لكل قسم مطبخ

### 4. Job Cards
- رقم الطلب
- الطاولة والعميل
- القسم المطبخي
- قائمة الأصناف مع:
  - الاسم الكامل (بدلاً من ID)
  - الكمية
  - الحالة
  - الملاحظات
- أزرار الإجراءات

## Files

- `/static/pos/kds.js` - الملف الجديد المبسط
- `/static/pos/kds.js.backup` - نسخة احتياطية من الملف القديم
- `/static/pos/kds-new.js` - الملف المؤقت (يمكن حذفه بعد التأكد)
- `/static/pos/kds.html` - ملف HTML (لم يتغير)

## Testing

للاختبار:
1. افتح الشاشة: `/static/pos/kds.html?brname=dar`
2. تأكد من ظهور أسماء الأصناف (وليس IDs)
3. تأكد من عمل الفلترة حسب القسم
4. تأكد من تحديث البيانات تلقائياً عبر WebSocket

## Migration Notes

إذا كنت تريد العودة للنسخة القديمة:
```bash
cp /home/user/os/static/pos/kds.js.backup /home/user/os/static/pos/kds.js
```

## Next Steps

- [ ] إضافة دعم لتحديث حالة الطلبات
- [ ] إضافة دعم للإشعارات الصوتية
- [ ] تحسين UI للشاشات الكبيرة
- [ ] إضافة إحصائيات وقت التحضير

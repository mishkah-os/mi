# تنظيف job_order tables القديمة

## المشكلة

job_order_header القديمة تم إنشاؤها بـ ID format قديم (قبل commit d05cefa):
```
DAR-001001-uuid-timestamp-random  (بدون stationId!)
```

الـ ID الجديد الصحيح:
```
DAR-001001-uuid-STATIONID-timestamp-random
```

## الحل

احذف كل job_order tables وابدأ من جديد:

```sql
-- في PostgreSQL:
DELETE FROM job_order_detail_modifier;
DELETE FROM job_order_detail;
DELETE FROM job_order_status_history;
DELETE FROM job_order_header;
DELETE FROM job_order_batch;

-- إعادة تعيين sequences (optional):
ALTER SEQUENCE job_order_header_id_seq RESTART WITH 1;
```

## الخطوات

1. افتح pgAdmin أو psql
2. نفذ الـ DELETE statements أعلاه
3. أعد تشغيل POS
4. أنشئ طلب جديد
5. تحقق من أن job_order_header لها ID صحيح بـ stationId

## التحقق

بعد إنشاء طلب جديد، تحقق من job_order_header:

```sql
SELECT id, station_id, status FROM job_order_header ORDER BY created_at DESC LIMIT 5;
```

يجب أن يظهر ID مثل:
```
DAR-001001-uuid-kitchen_grills-1763140923640-abc123
                 ^^^^^^^^^^^^^^^
                 stationId موجود!
```

# Mishkah Watch Security

هذه المذكرة تلخّص كيفية تحميل البيانات عند استخدام `mishkah.simple-store` وما تم اعتماده لحماية الحقول الحساسة في الـ API.

## كيف يعمل `watch()` و `list()`
- أوّل `db.watch(table, handler)` يقوم بتسجيل الجدول إن لم يكن مسجلاً ثم يطلق `fetchInitialSnapshot`.
- `fetchInitialSnapshot` يطلب `GET /api/branches/:branch/modules/:module` ويضع كل الجداول في الـ cache قبل إرسال أوّل استدعاء للـ handler، وبعدها يتحوّل التحديث إلى بث WebSocket (`server:snapshot` ثم `table:update`).
- `db.list(name)` لا يضرب الخادم؛ هو فقط يرجع نسخة من الـ cache الداخلي الناتج عن `watch()` أو من أحداث الـ WS.
- لذلك أي حقل يصل من REST سيتكرر آلياً في الـ WebSocket ومن ثم أي `list()` إذا لم نفلتره في الخادم.

## ملف الحقول السرّية
- تمت إضافة الملف `data/security/secret_fields.json` بالشكل التالي:

```json
{
  "secretFields": {
    "sbn_users": ["password_hash", "phone", "email"],
    "sbn_users_lang": ["bio"],
    "sbn_notifications": ["payload"]
  },
  "lockedTables": []
}
```

- **القاعدة:** كل الجداول تعتبر عامة ما لم تُذكر هنا. ضع اسم الجدول في `secretFields` مع قائمة الحقول التي يجب حذفها من الردود العامة.
- في حال احتجنا منع الجدول بالكامل عن أي `watch`/`list` نضيف اسمه إلى `lockedTables` فيرجع دائماً مصفوفة فارغة على الواجهة العامة.

## أين تُطبق الحماية؟
- مسارات `/api/branches/...` و `/api/query/module` وطلبات CRUD تستخدم الآن `sanitizeTableRows()` قبل الرد، لذلك حتى REST snapshot لا يعيد الحقول السرّية.
- بث WebSocket (`server:snapshot`, `server:event`, `table:update`) يمر عبر `sanitizeModuleSnapshot()` و `sanitizeRecordForClient()`، بالتالي أي `watch()` سيستقبل البيانات بعد الفلترة ولن يرى `password_hash` أو أرقام الهاتف.
- الاستجابات التي تعيد سجلاً واحداً (POST/PATCH/PUT/DELETE) تستعمل نفس الدالة بحيث يحصل العميل على نسخة آمنة من السجل الذي تم إنشاؤه أو تعديله.

## كيفية التوسعة
1. أضف الجدول/الحقول إلى `data/security/secret_fields.json` ثم احفظ الترتيب الأبجدي إن أمكن لتسهيل المراجعة.
2. لا حاجة لإعادة تشغيل الخادم في وضع التطوير؛ الملف يُقرأ عند إقلاع الخادم، لذا لإعادة تحميله يجب إعادة التشغيل (أو أضف مراقب إن احتجت لاحقاً).
3. جرّب عبر وحدة التحكم في PWA باستخدام `SBN_PWA_DUMP('table')` وستلاحظ اختفاء الحقول التي تم وسمها.

باتباع هذه السياسة نبقي الأصل مفتوحاً ونقفل فقط ما نحتاجه، بدون كتابة قوائم عملاقة لكل جدول. أي فريق يضيف جدولاً حساساً عليه تحديث الملف لكي تبقى واجهات Mishkah آمنة.

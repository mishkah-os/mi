# نظام المصادقة التجريبي (غير آمن للإنتاج)

هذا النظام مخصص للتجارب فقط. يعتمد على:
- **كلمة مرور مُهاش** داخل سجل المستخدمين `users.password_hash`.
- **نسخة مشفرة قابلة للفك** في `users.password_enc` لأغراض الاختبار.
- تشفير أسماء المستخدمين (اختياري) عبر `users.username_enc`.
- حماية بسيطة عبر API Key وحدود حظر مؤقت عند تكرار المفتاح الخاطئ.

> ملاحظة: هذه الآليات غير آمنة للإنتاج وتُستخدم فقط في بيئة تجريبية.

## المتغيرات الافتراضية

- API Key الافتراضي: `demo-auth-key`
- Secret الافتراضي للتشفير: `demo-auth-secret`

يمكن تعديلها عبر متغيرات البيئة:
- `DEMO_AUTH_API_KEY`
- `DEMO_AUTH_SECRET`

## حدود الحظر (API Key)

- 5 محاولات خاطئة خلال 10 دقائق -> حظر مؤقت لمدة 15 دقيقة.

## Endpoints (يتطلب `x-api-key`)

كل المسارات التالية تتطلب ترويسة:

```
X-API-Key: demo-auth-key
```

### 1) تشفير اسم المستخدم
`POST /api/v1/auth/encrypt-username`

Body:
```
{ "username": "Ahmed" }
```

Response:
```
{ "username_enc": "gcm$..." }
```

### 2) فك تشفير اسم المستخدم
`POST /api/v1/auth/decrypt-username`

Body:
```
{ "username_enc": "gcm$..." }
```

Response:
```
{ "username": "Ahmed" }
```

### 3) هاش كلمة المرور
`POST /api/v1/auth/hash-password`

Body:
```
{ "password": "P@ssw0rd" }
```

Response:
```
{ "password_hash": "scrypt$...", "password_enc": "gcm$..." }
```

### 4) التحقق من كلمة المرور
`POST /api/v1/auth/verify-password`

Body:
```
{ "password": "P@ssw0rd", "password_hash": "scrypt$..." }
```

Response:
```
{ "ok": true }
```

### 5) فك تشفير كلمة المرور (للتجربة فقط)
`POST /api/v1/auth/decrypt-password`

Body:
```
{ "password_enc": "gcm$..." }
```

Response:
```
{ "password": "P@ssw0rd" }
```

### 6) تعيين كلمة مرور لمستخدم
`POST /api/v1/auth/users/set-password`

Body:
```
{ "branch_id": "branch-1", "user_id": "user-uuid", "password": "P@ssw0rd" }
```

Response:
```
{ "ok": true, "user_id": "user-uuid" }
```

### 7) تسجيل الدخول (للواجهة)
`POST /api/v1/auth/login`

Body:
```
{ "branch_id": "branch-1", "user_id": "user-uuid", "password": "P@ssw0rd" }
```

Response:
```
{ "ok": true, "user_id": "user-uuid" }
```

> يمكن تمرير `username` بدل `user_id`، وسيتم البحث في `users_lang.name`.

---

## كيف تضيف مستخدم جديد؟

1) إنشاء سجل المستخدم عبر CRUD:

```
POST /api/v1/crud/users
Content-Type: application/json

{
  "record": {
    "company_id": "comp-1",
    "branch_id": "branch-1",
    "role": "admin",
    "is_active": 1,
    "begin_date": "2024-01-01T00:00:00.000Z"
  },
  "translations": {
    "ar": { "name": "أحمد" },
    "en": { "name": "Ahmed" }
  }
}
```

2) عيّن كلمة المرور عبر:

```
POST /api/v1/auth/users/set-password
X-API-Key: demo-auth-key

{ "branch_id": "branch-1", "user_id": "user-uuid", "password": "P@ssw0rd" }
```

## كيف تعدّل كلمة مرور مستخدم حالي؟

أعد استدعاء نفس المسار:

```
POST /api/v1/auth/users/set-password
X-API-Key: demo-auth-key

{ "branch_id": "branch-1", "user_id": "user-uuid", "password": "NewPass123" }
```

## كيف تفك تشفير كلمة المرور الحالية؟

1) اقرأ قيمة `password_enc` من سجل المستخدم.
2) نفّذ:

```
POST /api/v1/auth/decrypt-password
X-API-Key: demo-auth-key

{ "password_enc": "gcm$..." }
```

سيعيد كلمة المرور الأصلية (للتجربة فقط).

---

## ملاحظة أمنية

- هذا النظام **غير مناسب للإنتاج**.
- فك التشفير متاح عمداً لأغراض الاختبار فقط.

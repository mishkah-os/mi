# Clinic Auth Endpoints (Demo)

هذا التوثيق يشرح نقاط المصادقة الخاصة بواجهة الديمو في السيرفر.

## إعدادات مهمة

- `DEMO_AUTH_API_KEY`
  - الافتراضي: `demo-auth-key`
  - مطلوب في الهيدر `x-api-key` أو `Authorization: Bearer <key>`
- `DEMO_AUTH_SECRET`
  - الافتراضي: `demo-auth-secret`
  - يستخدم لاشتقاق مفتاح تشفير AES-256-GCM
- `DEMO_AUTH_EMERGENCY_PASSWORD`
  - الافتراضي: `demo-emergency-override`
  - كلمة مرور طوارئ للديمو (تتجاوز التحقق من كلمة المرور لأي مستخدم)
  - ملاحظة: يجب تعطيلها في الإنتاج

## تنسيق التشفير والتجزئة

- تشفير نصي (AES-256-GCM):
  - التنسيق: `gcm$<iv_base64>$<tag_base64>$<ciphertext_base64>`
  - المفتاح: `SHA-256(DEMO_AUTH_SECRET)`
- تجزئة كلمات المرور (scrypt):
  - التنسيق: `scrypt$N$r$p$<salt_base64>$<derived_base64>`
  - القيم الافتراضية: `N=16384, r=8, p=1`

## Endpoints

كل النقاط هنا تتطلب:
- Method: `POST`
- هيدر: `x-api-key: <DEMO_AUTH_API_KEY>`
- Content-Type: `application/json`

### 1) Encrypt Username
- Path: `/api/v1/auth/encrypt-username`
- Body:
  - `username` (string)
- Response:
  - `username_enc` (string)

### 2) Decrypt Username
- Path: `/api/v1/auth/decrypt-username`
- Body:
  - `username_enc` (string)
- Response:
  - `username` (string)

### 3) Hash Password
- Path: `/api/v1/auth/hash-password`
- Body:
  - `password` (string)
- Response:
  - `password_hash` (string)
  - `password_enc` (string)

### 4) Verify Password
- Path: `/api/v1/auth/verify-password`
- Body:
  - `password` (string)
  - `password_hash` (string)
- Response:
  - `ok` (boolean)

### 5) Decrypt Password
- Path: `/api/v1/auth/decrypt-password`
- Body:
  - `password_enc` (string)
- Response:
  - `password` (string)

### 6) Set User Password
- Path: `/api/v1/auth/users/set-password`
- Body:
  - `user_id` (string)
  - `password` (string)
  - `branch_id` (string, اختياري)
  - `module_id` (string, اختياري)
- Response:
  - `ok` (boolean)
  - `user_id` (string)

### 7) Login
- Path: `/api/v1/auth/login`
- Body:
  - `branch_id` (string)
  - `module_id` (string, اختياري)
  - `password` (string)
  - `user_id` (string) أو `username` (string)
- Response:
  - `ok` (boolean)
  - `user_id` (string)

## ملاحظة مهمة عن كلمة مرور الطوارئ

إذا كان `password` يساوي `DEMO_AUTH_EMERGENCY_PASSWORD`، سيتم السماح بالدخول لأي مستخدم بدون تحقق من كلمته.
هذا مخصص للديمو فقط ويجب تعطيله في الإنتاج.

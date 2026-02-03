# Brocker v2 (PWA)

يوضح هذا الملف كيف يعمل نظام Brocker v2 داخل المشروع، وما هي الملفات الأساسية المطلوبة لتشغيله.

## الفكرة العامة
- Brocker v2 عبارة عن واجهة PWA موبايل مبنية على **Mobile Kit (AppKit)**.
- تعتمد على **Schema-First** بحيث يكون المخطط هو المصدر الوحيد للحقيقة.
- تدعم أسلوب الترجمة الرأسية (Vertical Translation) باستخدام جداول `_lang`.

## الملفات الأساسية

### 1) نقطة الدخول
- `index-v2.html`
  - يقوم بتحميل مكتبات Mishkah.
  - يجلب الـ schema من `/api/schema` (أو يستخدم `mock=1`).
  - ينشئ اتصال WebSocket عبر `createDBAuto`.
  - يحمل `app-v2.js` ديناميكياً.

### 2) منطق التطبيق
- `app-v2.js`
  - يستخدم `AppKit` لبناء الواجهة.
  - يدير الحالة (language/theme/profile).
  - يحتوي على الشاشات: onboarding / home / reels / compose / profile.

### 3) مكتبات الموبايل
- `static/lib/mobile-kit.js`
  - يوفر مكونات UI جاهزة (Shell, Header, TabBar, Card, Feed, ReelCard...).
  - يدير الثيم واللغة والـ PWA hooks.

### 4) مكتبة الميديا
- `static/lib/mishkah.media-stream.js`
  - رفع الفيديوهات، معاينة، وتحضير مصادر البث.
  - تُستخدم لميزة Reels.

## وضع التطوير (Mock Mode)
- افتح الرابط مع `?mock=1` لتشغيل بيانات تجريبية بدون اتصال فعلي:
  - مثال: `index-v2.html?mock=1`

## ملاحظات مهمة
- لا يتم تعريف الحقول أو الأعمدة داخل الواجهة.
- أي جدول مترجم يجب أن يكون له جدول `_lang`.
- التبديل بين اللغة والثيم يتم بدون إعادة تحميل الصفحة.

## روابط ذات صلة
- `data/schemas/brocker_schema_v2.json` (مخطط Brocker v2)
- `docs/mishkah-mobile-kit.md` (تفاصيل Mobile Kit)

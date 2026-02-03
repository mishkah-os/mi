# Mishkah Mobile Kit v2 (Brocker)

> هذا الدليل يوضح الحد الأدنى من الملفات المطلوبة لتشغيل تطبيق PWA بنمط Mobile Kit مع منهجية **Schema-First**.

## الملفات الأساسية (Minimum Required Files)

### 1) مكتبات Mishkah الأساسية
- `static/lib/mishkah-utils.js`
- `static/lib/mishkah.core.js`
- `static/lib/mishkah-ui.js`
- `static/lib/mishkah-schema.js`
- `static/lib/mishkah.store.js`
- `static/lib/mishkah.simple-store.js`

### 2) Mobile Kit UI
- `static/lib/mobile-kit.js`
  - يحتوي على القوالب الأساسية للموبايل (Shell, Header, TabBar, Card, Modal, Sheet, Feed).
  - يتعامل مع الـ Theme والـ Direction بشكل موحد عبر `AppKit`.

### 3) Media Streaming (رفع الفيديو + تشغيله)
- `static/lib/mishkah.media-stream.js`
  - مسؤول عن رفع الفيديو، وإنشاء المعاينات، وربط المشغل (Video Player) مع مصادر البث.
  - يعمل مع API موحد مثل `/api/media/upload` أو أي endpoint مخصص لاحقاً.

### 4) تطبيق Brocker v2 (واجهة الموبايل)
- `static/projects/brocker/index-v2.html`
- `static/projects/brocker/app-v2.js`

## ملاحظات تشغيل مهمة

1) **Schema-First**
   - لا نكتب أسماء الحقول أو قوائم الأعمدة داخل الفرونت.
   - يتم الاعتماد على مخطط البيانات (Schema) والـ Smart Features لجلب الحقول المترجمة تلقائياً.

2) **الترجمة الرأسية (Vertical Translation)**
   - أي جداول قابلة للترجمة يجب أن تمتلك جدولاً مناظراً لاحقته `_lang`.
   - القيم النصية تُفلطن تلقائياً على مستوى الكائن بدون تدخل الفرونت.

3) **PWA**
   - يتم التقاط حدث التثبيت `beforeinstallprompt` وإظهار شريط التثبيت عبر `AppKit.PWA`.
   - مسار الـ service worker قابل للتخصيص عند الحاجة.

4) **Media Reels**
   - يستخدم التطبيق خاصية Reels بشكل تجريبي.
   - يمكن الربط لاحقاً مع خدمة بث فعلية عبر `MishkahMedia`.

## ملف المخطط المقترح
- `data/schemas/brocker_schema_v2.json`
  - نسخة محسنة لتدفق العقارات بنظام اجتماعي (Posts, Reels, Likes, Comments, Media).
  - مبنية على أساس Schema-First مع جداول ترجمة منفصلة.

# خطة إضافة دعم PWA مدمج في مشكاة

## 1. الرؤية العامة
- إنشاء طبقة "Auto PWA" تعكس فلسفة `U.twcss.auto` لكن متخصصة للـ PWA، بحيث يمكن تشغيلها عبر سطر واحد: `U.pwa.auto(database, app);`.
- تصميم منظومة معيارية تتكون من ثلاثة أجزاء مترابطة: تعريف البيانات (database)، أوامر التشغيل (orders)، والمخرجات التلقائية (scaffolding) التي تُنشئ ملفات الـ PWA (manifest, service worker) وتربطها بواجهة مشكاة.
- ضمان بقاء ملفات الـ PWA قابلة للتعديل يدويًا عبر توليد ملفات مرجعية داخل مجلد `pwa/` مع آلية مزامنة ذكية.

## 2. مخرجات المرحلة الأولى: التصوير والتسوية
1. **توسيع الـ database الأساسي**
   - إضافة مفتاح `pwa` داخل `database.env` يشمل:
     - `enabled` (boolean) للتحكم في تفعيل الـ PWA.
     - `manifest` ككائن يصف بيانات manifest القياسية (name, short_name, theme_color, background_color, start_url, display, icons...).
     - `assets` قائمة بالملفات الحرجة التي يجب تخزينها في الـ cache.
     - `sw` لتحديد استراتيجيات التخزين (cacheFirst, networkFirst...) لكل نطاق URL.
   - توفير مخطط JSON معياري داخل `docs/schemas/pwa-config.schema.json` لتوثيق الصيغة.

2. **تصميم DSL للتهيئة البصرية**
   - إضافة مكونين في `mishkah-ui.js`:
     - `UI.Badges.PwaStatus` لعرض حالة تفعيل الـ PWA.
     - `UI.Forms.PwaToggle` كزر تفعيل يربط بأمر `pwa:toggle`.
   - استخدام ذرات `D.Forms.Button`, `D.Text.Span`, `D.Media.Img` وفق التصنيف لضمان الالتزام بالـ DSL.

3. **تجهيز قوالب HTMLx (اختياري)**
   - إنشاء قالب `pwa-settings.htmlx` داخل `docs/templates` يعرض إعدادات الـ PWA ويعمل مع نفس الأوامر.

## 3. مخرجات المرحلة الثانية: نفخ الروح
1. **أوامر الخدمة (orders)**
   - بناء مساحة أسماء `pwa:*` داخل ملف أوامر مركزي (مثلاً `mishkah.pwa.orders.js`).
   - أوامر أساسية:
     - `pwa:toggle`: تفعيل/تعطيل `database.env.pwa.enabled`.
     - `pwa:manifest:update`: مزامنة تعديلات المستخدم مع ملف `pwa/manifest.json` باستخدام أدوات `Mishkah.utils.io`.
     - `pwa:sw:refresh`: إعادة بناء service worker وحفظه.
     - `pwa:assets:scan`: استخدام أداة `utils.assets.scan()` (جديدة) لتوليد قائمة ملفات افتراضية.
   - كل أمر يلتزم بالهيكل (`on`, `gkeys`, `handler`) ويستعمل `context.setState` بدون تعديل مباشر للحالة.

2. **طبقة الخدمة الذاتية U.pwa.auto**
   - إضافة وحدة جديدة `mishkah.pwa.js` تحتوي على دالة `U.pwa.auto(database, app)`.
   - خطوات الدالة:
     1. قراءة `database.env.pwa`. إن لم تكن موجودة، توليد قيم افتراضية.
     2. توليد ملفات `pwa/manifest.json` و`pwa/service-worker.js` إذا لم توجد، مع وضع تعليقات توضح إمكانية التعديل.
     3. تحديث `<head>` عبر `Mishkah.Head.use` لإضافة `<link rel="manifest">` ومتعقبات الأيقونات.
     4. إدراج سكريبت تسجيل الخدمة في `app.mount` تلقائيًا (باستخدام `app.onMounted`).
     5. دمج أوامر `pwa` مع أوامر التطبيق (`app.setOrders`).
     6. إضافة أدوات جاهزة داخل `Mishkah.utils.pwa` (مثل `registerServiceWorker`, `updateManifest`).

3. **التكامل مع auto الأساسي**
   - تعديل `U.twcss.auto` ليستدعي `U.pwa.auto` تلقائيًا إذا كان `database.env.pwa.enabled` صحيحًا، مما يجعل الأمر الوحيد المطلوب من المطوّر هو `U.twcss.auto(database, app);`.

## 4. البنية المعيارية للملفات
```
pwa/
  manifest.json          # يُنشأ تلقائيًا مع القدرة على التعديل اليدوي
  service-worker.js      # يستخدم قوالب caching قابلة للتخصيص
  sw-builder.js          # ملف مساعد لتجميع استراتيجيات التخزين
mishkah.pwa.js           # الوحدة الرئيسية التي تحتوي auto + أوامر دعم
mishkah.pwa.orders.js    # أوامر مستقلة يمكن استيرادها في التطبيقات الخاصة
```

## 5. سير عمل التوليد التلقائي
1. يضيف المطوّر `database.env.pwa = { enabled: true }`.
2. يستدعي `U.twcss.auto(database, app);`.
3. تقوم `auto` بتنفيذ التسلسل:
   - `U.pwa.auto` → إنشاء/تحديث الملفات.
   - `U.twcss.auto` → ضبط الثيم واللغة.
   - `app.setOrders` → دمج أوامر `pwa` و`ui` والتطبيق.
   - `app.mount('#app')` → التشغيل النهائي.
4. تعرض الواجهة عنصر `UI.Badges.PwaStatus` ويصبح بإمكان المطوّر تعديل manifest و service worker عبر محرر داخلي أو خارجي.

## 6. خطة التنفيذ الزمنية
1. **الخطوة 1**
   - توثيق المخطط (schema) وتهيئة `mishkah.pwa.js` بالهياكل الفارغة.
   - بناء أدوات utils اللازمة (`utils.pwa`).
2. **الخطوة 2**
   - تطوير أوامر `pwa:*` وربطها بالـ UI.
   - إنشاء قوالب manifest و service worker.
3. **الخطوة 3**
   - اختبار تكامل `U.pwa.auto` مع تطبيق تجريبي.
   - كتابة أدلة الاستخدام في `docs/pwa-guide.md`.
4. **الخطوة 4**
   - تحسين الأداء (cache strategies) ودعم التخصيص المتقدم (Workbox اختيارية).
   - إعداد اختبارات تلقائية داخل `tests/pwa.spec.js` للتحقق من توليد الملفات.

## 7. الحوكمة والجودة
- الالتزام بـ `Mishkah.utils` لتجميع كل الوظائف المساعدة (قراءة/كتابة ملفات، إدارة التخزين، تسجيل الخدمة).
- إنشاء اختبارات smoke للتأكد من تسجيل الـ service worker في المتصفح.
- مراجعة  للكود للتأكد من احترام تصنيف الذرات داخل أي مكونات جديدة.

## 8. المخرجات النهائية
- إضافة وحدة Auto PWA تعمل تلقائيًا مع استدعاء واحد.
- ملفات manifest و service worker معيارية قابلة للتعديل.
- أوامر PWA جاهزة للاستخدام داخل أي تطبيق مشكاة.
- إنشاء وثيقة وإرشادات تفصيلية للمطورين.

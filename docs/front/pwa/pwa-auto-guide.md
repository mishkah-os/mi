# Mishkah PWA Auto — دليل الاستخدام والممارسات الفضلى

## 1. فكرة النظام
يوفّر `Mishkah.utils.pwa.auto` طبقة إعداد تلقائية للـ PWA تشبه عمل `U.twcss.auto`. يكفي ضبط `database.env.pwa.enabled = true` (أو تمرير خيار `enabled` عند النداء) ليقوم النظام بما يلي:

- توليد/تطبيع إعدادات الـ PWA داخل الحالة (`database.env.pwa`).
- نشر متغيرات جاهزة عبر `window.Mishkah.env.PWA` يمكن قراءتها من أي سكربت آخر.
- حقن عناصر `<meta name="theme-color">` وروابط `<link rel="manifest">` والأيقونات عند الحاجة.
- إنشاء service worker افتراضي ديناميكي (عبر Blob) أو تسجيل ملف خارجي موجود مسبقًا.
- ربط أوامر جاهزة للتحديث اليدوي (`pwa:sw:refresh`) ومسح الكاش (`pwa:cache:clear`).
- دمج التسجيل التلقائي للـ service worker مع دورة حياة `app.mount` بدون أي سكربت إضافي.

## 2. بنية التهيئة داخل `database.env.pwa`
```js
const database = {
  env: {
    pwa: {
      enabled: true,
      manifestInline: true, // استخدام blob داخلي بدل ملف ثابت (افتراضيًا true عند توفير manifest)
      manifestUrl: './pwa/manifest.json',
      manifest: {
        name: 'اسم التطبيق',
        short_name: 'الاسم المختصر',
        start_url: './index.html',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#f8fafc'
      },
      icons: [
        { src: './pwa/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: './pwa/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
      ],
      assets: ['./index.html', './schema.js'],
      offlineFallback: './index.html',
      runtimeCaching: [
        { pattern: '^https://fonts\\.gstatic\\.com/', strategy: 'cacheFirst', sameOrigin: false }
      ],
      cache: { prefix: 'my-app-pwa', version: 'v1' },
      registerDelay: 500,
      sw: {
        inline: true,
        strategy: 'networkFirst',
        scope: './',
        cleanupPrefix: 'my-app-pwa'
      }
    }
  }
};
```

> **ملاحظة:** يتم دمج القيم أعلاه مع افتراضات آمنة، لذلك يمكن الإبقاء فقط على `enabled: true` والاكتفاء بالحد الأدنى.

## 3. كيف يعمل التسجيل التلقائي؟
1. عند استدعاء `const twx = U.twcss.auto(database, app);` يقوم `twcss.auto` داخليًا باستدعاء `U.pwa.auto`.
2. تقوم الدالة بتطبيع الإعدادات، وتعرض المتغيرات في `window.Mishkah.env.PWA`, وتحقن عناصر `<head>` الضرورية.
3. في حال `sw.inline === true` يتم بناء service worker افتراضي يطبق الاستراتيجيات المحددة (`cacheFirst`, `networkFirst`, `staleWhileRevalidate`).
4. يتم تأخير التسجيل حتى اكتمال `app.mount`، ثم انتظار حدث `load` قبل التسجيل الفعلي لضمان جاهزية الأصول.
5. يمكن للمطور تنفيذ أوامر جاهزة عبر gkeys:
   - `data-m-gkey="pwa:sw:refresh"` لإعادة التسجيل/التحديث يدويًا.
   - `data-m-gkey="pwa:cache:clear"` لمسح التخزين المؤقت المرتبط بالبادئة المحددة.

## 4. أفضل الممارسات
- **اضبط أسماء الكاش:** استخدم `cache.prefix` و`cache.version` لتوليد أسماء ثابتة (`prefix-version`). عند إصدار نسخة جديدة قم بزيادة `version` لتُحذف النسخ السابقة تلقائيًا.
- **أدر الأيقونات من نفس المكان:** استعمل مصفوفة `icons` ليُعاد استعمالها داخل manifest وكذلك كروابط `<link rel="icon">`.
- **حدد أصول التثبيت الحرجة:** أضف الملفات الأساسية داخل `assets`. ستتم إضافتها تلقائيًا مع الأيقونات وملف manifest والصفحة الرئيسية.
- **استراتيجية زمن التشغيل:** مرر مصفوفة `runtimeCaching` لتحديد مجالات خارجية أو مسارات داخلية تحتاج إستراتيجية معينة.
- **fallback خارج الشبكة:** لتجربة أوفلاين محسّنة، وفّر صفحة HTML ثابتة أو JSON داخل `offlineFallback`.
- **تكامل مع مشاريع قديمة:** إذا رغبت باستعمال ملف `service-worker.js` يدوي، ضع `sw.inline = false` واحتفظ بمنطقك الخاص. ستتولى الدالة التسجيل والتهيئة فقط.
- **التعامل مع manifest خارجي:** عند الرغبة في تحرير الملف يدويًا احتفظ بـ `manifestInline: false` وسيُستخدم الرابط المحدد في `manifestUrl` كما هو.

## 5. خارطة الطريق الهندسية المقترحة
1. **محرر بصري لإعدادات PWA:** إنشاء واجهة HTMLx تعتمد أوامر `pwa:*` لتمكين التعديل اللحظي على manifest وبيانات الكاش.
2. **مزامنة الملفات إلى القرص:** إضافة أدوات ضمن `Mishkah.utils.io` لتوليد ملفات `manifest.json` و`service-worker.js` الفعلية عند العمل داخل بيئة Node.
3. **اختبارات تلقائية:** بناء ملفات `tests/pwa.spec.js` للتحقق من أن `U.pwa.auto` يحقن الروابط ويُسجل الخدمة بنجاح.
4. **دعم Workbox اختياري:** فتح نقطة امتداد لإدراج Workbox تلقائيًا في حال توفره مع الاحتفاظ بالحل الافتراضي الخفيف.
5. **مراقبة تحديثات الـ SW:** إضافة أوامر لمراقبة حالة التحديث وإظهار Snackbar للمستخدم عند توفر نسخة جديدة.

## 6. مثال سريع
```html
<script>
  const database = { env: { pwa: { enabled: true } } };
  const orders = {};
  const app = Mishkah.app.createApp(database, orders);
  const auto = Mishkah.utils.twcss.auto(database, app);
  app.setOrders(Object.assign({}, orders, auto.orders));
  app.mount('#app');
</script>
```

سيقوم المثال أعلاه بتهيئة PWA مع جميع الافتراضات تلقائيًا دون أي سكربت إضافي.

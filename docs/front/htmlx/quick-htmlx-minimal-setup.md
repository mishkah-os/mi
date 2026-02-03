# إعداد quick-htmlx في بيئة معزولة

> **المشكلة الشائعة**: نقل ملف `quick-htmlx.html` وحده بجوار `mishkah.js` يعطي صفحة فارغة بلا أخطاء لأن ملف التحميل يعتمد تلقائيًا على حزمة من الملفات و/أو مكتبات CDN لا تكون متاحة في النسخة المختزلة.

## الوحدات المطلوبة من Mishkah
عند تحميل `mishkah.js` يقوم تلقائيًا بتحميل الوحدات الأساسية التالية، ما لم يتم تعريف مسارات بديلة داخل `MishkahAutoConfig.paths`:

- `mishkah-utils.js` لدوال الأدوات (تهيئة Tailwind، تنسيقات النص، أدوات HTMLx).
- `mishkah.core.js` لتشغيل نواة التطبيق وحالة MishkahAuto.
- `mishkah-ui.js` لتعريف المكوّنات مثل `theme-switcher` و`lang-switcher` إضافة إلى جسر Chart.js.
- `mishkah-htmlx.js` لمفسّر HTMLx الذي يقرأ `<template id="...">` ويركّب الواجهة.

يمكن التأكد من ذلك من مصفوفة `resources` داخل `mishkah.js`، حيث تُحدَّد أسماء الملفات الافتراضية ويُسمح بتعديلها عبر الكائن `paths`. 【F:mishkah.js†L120-L176】

## الاعتماد على مكتبات من CDN
حتى مع وجود كل ملفات Mishkah محليًا، يعتمد التحميل التلقائي على مكتبتين من CDN لتحليل قوالب HTMLx:

- `acorn@8` لتحليل JavaScript داخل القالب.
- `acorn-walk@8` لاجتياز الشجرة الناتجة من Acorn.

كما تحاول مكوّنات الرسوميات تحميل `chart.js` من CDN إذا لم يتوفر ملف محلّي. 【F:mishkah.js†L147-L168】【F:mishkah-ui.js†L129-L174】

في حال عدم توفّر اتصال بالإنترنت تظهر الصفحة فارغة لأن HTMLx لن يُفسِّر القالب، ولأن محرك الرسوميات سيتوقف عن التهيئة. للحلول دون ذلك نزّل الملفات وضعها داخل مجلد (مثل `vendor/`) ثم عرّف المسارات قبل استدعاء `mishkah.js`:

```html
<script>
  window.MishkahAutoConfig = {
    paths: {
      utils: './mishkah-utils.js',
      core: './mishkah.core.js',
      ui: './mishkah-ui.js',
      htmlx: './mishkah-htmlx.js',
      acorn: './vendor/acorn.min.js',
      acornWalk: './vendor/acorn-walk.min.js',
      css: './mishkah-css.css'
    },
    chart: { cdn: './vendor/chart.umd.min.js' }
  };
</script>
<script src="./mishkah.js" data-htmlx data-css="env"></script>
```

> توجد نسخة من `chart.umd.min.js` بالفعل تحت `vendor/` داخل المستودع، ويمكن إعادة استخدامها لتفادي التحميل من الإنترنت. 【F:vendor/chart.umd.min.js†L1-L9】

## المحافظة على القالب `<template>`
يجب أن يبقى تعريف القالب داخل الصفحة أو يُستورد خارجيًا مع الحفاظ على `data-htmlx="quick-dashboard"` في وسم `<html>`، لأن هذا المعرف هو ما يخبر HTMLx بالبحث عن `<template id="quick-dashboard">` داخل الصفحة. إزالة القالب أو تغيير الـ`id` يؤدي إلى صفحة فارغة لعدم وجود محتوى يركّبه المحرك. 【F:quick-htmlx.html†L1-L118】

## خطوات التحقق السريعة
1. ضع جميع الملفات المذكورة أعلاه في نفس المجلد أو حدّث المسارات داخل `MishkahAutoConfig.paths`.
2. تأكد من تحميل Acorn وAcorn Walk محليًا أو السماح بالوصول إلى الإنترنت.
3. احتفظ بـ`<template id="quick-dashboard">` والسكريبتات `data-path="env"` و`data-path="i18n.strings"` لأن HTMLx يعتمد عليها لإنشاء الحالة الأولية.
4. افتح الصفحة عبر خادوم محلي (مثل `npx serve .`) لتفادي قيود `file://` على بعض المتصفحات.

باتباع الخطوات السابقة ستعمل نسخة `quick-htmlx.html` المعزولة بنفس الشكل الموجود داخل المشروع الكامل.

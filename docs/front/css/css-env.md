# التحكم في مكتبات CSS والخطوط عبر `env`

يوفّر إصدار HTMLx الجديد خيارًا صريحًا لقراءة إعدادات الأنماط من ملف البيئة بدلاً من الاعتماد على القيمة الثابتة `data-css="mishkah"`. يكفي تمرير السمة `data-css="env"` إلى محمّل `mishkah.js` ثم تحديد المكتبات المطلوبة في `env`.

## اختيار مكتبات CSS

- حمّل `mishkah.js` هكذا:

  ```html
  <script src="./mishkah.js" data-htmlx data-css="env"></script>
  ```

- داخل `env` ضع مصفوفة `css` أو `cssLibraries` بالأسماء المطلوبة. لا يتم تحميل `mishkah-css.css` إلا إذا ذُكر الاسم صراحة:

  ```json
  {
    "css": ["mishkah"],
    "tailwind": true
  }
  ```

- إن أردت تعطيل Tailwind المدمج، ضع `"tailwind": false`. بخلاف ذلك يتم تفعيله افتراضيًا للحفاظ على التوافق مع المشاريع السابقة.

## تخصيص الخطوط

يدعم `mishkah.js` الآن قراءة خصائص الخط من `env.fonts` أو `env.font`. يمكن تمرير اسم واحد أو كائن يحدد الخط العربي واللاتيني وخط العناوين بالإضافة إلى مصفوفة `fallbacks` اختيارية:

```json
{
  "fonts": {
    "ar": "Almarai",
    "en": "Inter",
    "display": "Almarai",
    "fallbacks": ["Cairo", "Noto Naskh Arabic"]
  }
}
```

عند توفر هذه القيم يقوم المحمّل بتحديث المتغيّرات `--mk-font-sans-ar`, `--mk-font-sans-lat`, و`--mk-font-display` مباشرة دون الحاجة لتعديل CSS يدوي.

## ملاحظات التوافق

- في حال عدم تحديد `data-css="env"` يبقى السلوك القديم كما هو، أي تحميل `mishkah-css.css` افتراضيًا.
- يمكن تمرير نفس المفاتيح عبر `MishkahAutoConfig` إذا كانت الصفحة تُنشأ برمجيًا.
- يعتمد اختيار المكتبة على المعرّفات المختصرة (`mishkah`, `mi`, `tailwind`, `tw`).

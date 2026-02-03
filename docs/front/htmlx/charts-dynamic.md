# دليل الرسوم البيانية الديناميكية في HTMLx السريعة

يوضّح هذا الدليل كيفية إدارة بيانات الرسوم البيانية في الصفحات السريعة مثل `quick-htmlx.html` بحيث تتغذى من الحالة (`state`) بدلاً من سمات ثابتة.

## بنية البيانات

يحتوي قسم `data` على كائن `analytics` يتضمن:

```json
{
  "analytics": {
    "unit": "K",
    "unitLabelKey": "quick.sales.unit",
    "months": { "ar": ["يناير", "فبراير", ...], "en": ["Jan", "Feb", ...] },
    "monthIndex": 11,
    "series": [
      { "id": "espresso", "nameKey": "quick.cart.items.espresso", "color": "#f97316", "values": [12.4, ...] }
    ],
    "chart": { "type": "line", "height": 320, "titleKey": "quick.sales.title" }
  }
}
```

- `values` تمثل المبيعات بالآلاف لكل شهر.
- `monthIndex` يحدد الشهر الحالي لعرضه في البطاقة الجانبية.
- يمكن إضافة أصناف جديدة بمجرد إضافتها إلى `series` بنفس البنية.

## دالة `syncSalesChart`

تتولى الدالة `syncSalesChart(state, ctx)` بناء بيانات الرسم البياني في كل مرة تتغير فيها الحالة:

1. استخراج الأشهر بناءً على لغة الواجهة عبر `resolveMonths`.
2. إنشاء مجموعات البيانات (`datasets`) باستخدام الألوان المعرفة في `series` أو من لوحة ألوان افتراضية.
3. بناء حمولة Chart.js عبر `Mishkah.UI.Chart.buildPayload` ثم حقنها في `data-m-chart`.
4. استدعاء `ensureLibrary` و`hydrate` لضمان تحديث الرسم الحالي دون إعادة تحميل الصفحة.

يتم ربط هذه الدالة بنظام الحالة من خلال:

```js
window.MishkahAuto.onState(function (snapshot) {
  syncSalesChart(snapshot);
  ensureCountdownLoop(snapshot);
});
```

## توليد بيانات عشوائية

تقوم دالة `randomizeCart` بإنشاء بيانات مبيعات لكل صنف عبر `generateSalesSeries`:

- يتم حساب خط أساس يعتمد على المبيعات السابقة وسعر الصنف.
- يتم استخدام `aggregateAnalytics` لحساب إجمالي المبيعات (بالألف) وعدد الطلبات التقريبي، ثم تحديث `metrics` المعروضة في البطاقات.
- في كل تحديث يتم تعيين `analytics.updatedAt` و`analytics.monthIndex` لتواكب آخر شهر.

## تنسيقات العرض

- تعرض القائمة الجانبية لكل صنف قيمة الشهر الأخير (`latestValue`) والمجموع السنوي (`sumSeries`) مع وظيفة `formatThousands` لإبراز أن القيم بالآلاف.
- يتحكم النص `quick.sales.legend` في العبارة التوضيحية أسفل الرسم لتذكير المستخدم بوحدة القياس.

## خطوات إضافة رسم جديد

1. أضف كائن `analytics` إلى بيانات الحالة الخاصة بك بنفس البنية.
2. استدعِ `syncSalesChart` بعد كل تحديث، أو استخدم `MishkahAuto.onState` كما في المثال.
3. اربط الرسم في القالب بـ `id` خاص مثل `quick-sales-chart`، بدون الحاجة لملء `data-chart-values` يدويًا.
4. استخدم `formatThousands` و`currentAnalyticsMonth` لتنسيق القيم النصية في الواجهة.

بهذه البنية يمكن توصيل البيانات من خادم أو من قاعدة بيانات فعلية لاحقًا بمجرد تمرير القيم إلى الحالة، وستقوم الواجهة بتحديث الرسم والبطاقات تلقائيًا.

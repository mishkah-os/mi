# Mishkah React/JSX Guide

هذه المذكرة تشرح كيفية استخدام طبقة Mishkah.React و Mishkah JSX (mishkah-jsx.js)
لإنشاء مكونات شبيهة بريأكت 100% مع نواة `mishkah.core.js`.

## الفكرة العامة
- `mishkah-react.js` يضيف دوال `createElement`، و Hooks مبسطة (`useState`, `useEffect`,
  `useMemo`, `useRef`, `useCallback`) مع رندر كامل يعتمد على VDOM في `mishkah.core.js`.
- `mishkah-jsx.js` يحول وسوم JSX إلى استدعاءات `Mishkah.React.createElement` حتى تعمل
  مباشرة في المتصفح بدون Babel.
- المخرجات ما زالت تستخدم عقد Mishkah VDOM، لكن الواجهة البرمجية موجهة للمطورين
  المعتادين على React.

## كيفية الاستخدام
1. **تحميل المكتبات**
   ```html
   <script src="mishkah.core.js"></script>
   <script src="mishkah-react.js"></script>
   <script src="mishkah-jsx.js"></script>
   ```

2. **كتابة JSX مباشرة**
   ضع كودك داخل `<script type="text/jsx">`، وسيتم تحويله تلقائياً عند `DOMContentLoaded`.
   ```jsx
   const { useState } = Mishkah.React;

   function Counter() {
     const [count, setCount] = useState(0);
     return (
       <div>
         <p>Count: {count}</p>
         <button onClick={() => setCount(count + 1)}>+1</button>
       </div>
     );
   }

   Mishkah.React.render(Counter, document.getElementById('app'));
   ```

3. **قواعد المكونات**
   - أي وسم يحتوي حرفاً كبيراً أو نقطة (`UI.Button`) يُعتبر مكوناً وسيتم استدعاء
     دالته بدلاً من إنشاء عنصر DOM مباشر (إصلاح دعم camelCase في JSX موجود الآن).
   - `props.children` تصل كمصفوفة مسطحة مشابهة لـ React.
   - `className` تُحوّل إلى `class` تلقائياً. باقي الخصائص تمر كـ `attrs` إلى VDOM.

4. **الأحداث**
   - استخدم صيغ مثل `onClick`, `onChange`, `onInput`.
   - يتم تعليق المستمعات بعد عملية الـ render تلقائياً على الـ DOM الناتج.

5. **Fragments**
   - استخدم `<> ... </>` أو `Mishkah.React.Fragment` لإرجاع عدة عناصر دون حاوية.

## نصائح للإنتاجية (React-like)
- حافظ على استقرار ترتيب المكونات بين الرندرات (خصوصاً عند التكرار) حتى لا يتداخل
  تخزين الحالة المبني على الترتيب.
- استعمل `key` عند استخدام `.map` لضمان تحديثات VDOM صحيحة.
- `useEffect` يعمل بعد الرسم عبر `setTimeout` 0؛ في الأعمال الإنتاجية يمكن تعديل
  الاستراتيجية لاحقاً لاستخدام microtasks إذا احتجت.
- يمكن تمرير كائن `style` كما في React، وسيتم تحويله إلى خصائص `style` على العنصر.
- احرص على أن تكون الدوال المعطاة للأحداث نقية وخفيفة لأن الرندر يعيد بناء الشجرة
  بالكامل لكل تغيير حالة.

## رأي وتحسينات مستقبلية
- طبقة JSX الحالية خفيفة وتكفي للتجارب، لكن لتقريبها أكثر من React يمكن إضافة:
  - إعادة استخدام DOM بالتDiffing بدلاً من إعادة البناء الكامل في كل setState.
  - دعم lazy loading و Context إذا احتجتها التطبيقات الكبيرة.
  - إضافة واجهة تطوير (DevTools) بسيطة لعرض الحالة وتسلسل الرندرات.
- التحويل المباشر في المتصفح مناسب للتجريب، لكن للإنتاج يُفضّل إضافة خطوة بناء
  مسبقة (أو cache) لتقليل زمن الإقلاع.

## مثال Counter V2 (محدّث)
المثال `lib/test_react_v2.html` يعمل لإثبات الأساسيات. يمكن نسخه لأي صفحة أخرى:
```html
<script type="text/jsx">
  const { useState } = Mishkah.React;
  function Counter() {
    const [count, setCount] = useState(0);
    return (
      <div>
        <h2>Counter Test</h2>
        <div>{count}</div>
        <button onClick={() => setCount(count + 1)}>+</button>
        <button onClick={() => setCount(count - 1)}>-</button>
      </div>
    );
  }
  Mishkah.React.render(Counter, document.getElementById('app'));
</script>
```

## إصلاح اختبار Full
- تم تحسين كشف وسوم المكونات في `mishkah-jsx.js` ليدعم الأسماء ذات الأحرف الكبيرة
  في أي موضع (مثل `myComponent` أو `UI.Card`). هذا يمنع JSX من تفسيرها كعناصر DOM
  خام ويضمن استدعاء الدالة الخاصة بالمكون.
- بعد هذا التغيير يجب أن يعمل مثال `lib/test_jsx_full.html` بنفس سلاسة مثال Counter V2.

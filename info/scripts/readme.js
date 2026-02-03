 (function (window) {
   const M = window.Mishkah = window.Mishkah || {};

   let arREADME = `# مشكاة (Mishkah)
## هندسة الانبثاق: حرية منظمة لبناء واجهات قابلة للاستمرار

> "من بساطة القوانين، يولد تعقيد الأنظمة الإبداعية."

في صناعة الواجهات، أغلب الانهيارات لا تأتي من "صعوبة رسم UI"، بل من تراكم التعقيد عبر الزمن: تشتت الحالة، تشابك الاعتماديات، وتحوّل التغييرات الصغيرة إلى مخاطرة عالية.

مشكاة يبني نموذج **حرية منظمة**:  
سطح كتابة خفيف وسريع للمطور، مع نواة صارمة تفرض سلامة البنية، وتُبقي النظام قابلاً للرصد والاختبار والتوسع.

---

## لماذا مشكاة؟

أطر العمل الحديثة عادةً تسير في أحد اتجاهين:

- **تعب أدوات (Tooling Fatigue)**: طبقات بناء وتجميع وتهيئة تزيد التكلفة المعمارية قبل أن يبدأ المنتج.
- **حرية هشة (Fragile Freedom)**: مرونة كبيرة في البداية، ثم تآكل تدريجي في الاتساق والمعايير مع نمو المشروع.

مشكاة لا "يدير الفوضى" ولا "يفرض بيروقراطية".  
هو يضع **قواعد أولية قليلة** + **حدود حماية واضحة**، ثم يترك مساحة داخلية واسعة للإبداع.

---

## الملخص التنفيذي

- **SSOT**: شجرة حالة واحدة (database) + قناة تغيير واحدة (orders)
- **View Contract**: واجهة بلا منطق تنفيذي؛ الربط السلوكي عبر gkeys
- **DSL بسيط + دلالة محمية**: تكتب D.h1 أو (اختيارياً) D.Text.h1، والنواة تصنف وتتحقق
- **Mishkah Store (Hybrid)**: ذاكرة + IndexedDB + مزامنة لحظية WebSocket
- **No‑Build Delivery**: UMD + Pure JS؛ تطبيقك يمكن أن يكون ملف HTML ثابت
- **Global‑Ready Core**: RTL‑First + i18n + Theming كجزء من البنية
- **Governance**: Guardian + Auditor + DevTools لضمانات قابلة للقياس

---

## المعمارية: حلقة أحادية الاتجاه

مشكاة يعمل كحلقة واضحة:

1) **State**: database (لقطة كاملة للنظام)  
2) **Logic**: orders (تحويلات بيانات/معاملات)  
3) **View**: DSL (تعريف عرض فقط)

النتيجة: الواجهة تصبح دالة في الحالة، والتغيير يصبح معاملة يمكن تتبعها.

---

## DSL: واجهة خفيفة… ونواة دلالية صارمة

الـ DSL في مشكاة يُصمم لسرعة الكتابة، دون التخلي عن الدلالة:

- المسار المختصر: D.h1(...), D.input(...), D.img(...)
- المسار الدلالي (اختياري للتنظيم): D.Text.h1(...), D.Forms.input(...), D.Media.img(...)

**كلا المسارين متكافئان داخلياً**:  
النواة تستنتج فئة العنصر (Text / Forms / Media / Containers …) وتطبق قواعد التحقق المناسبة.

هذا يحقق شيئين معاً:
- لا نجبر المطور على كتابة التصنيف
- ولا نفقد قدرة التحقق الجماعي على مستوى الفئات (مثلاً سياسات الوصول على عناصر Media، أو سياسات الأمان على الروابط)

---

## طبقة البيانات: Mishkah Store (Realtime + Offline)

مشكاة يأتي مع طبقة تخزين هجينة:

- **Memory Store** للسرعة
- **IndexedDB** للاستمرارية والعمل دون اتصال
- **WebSocket Sync** لتحديثات لحظية عند توفر خادم بيانات
- نفس الـ Store يغذي database، وبالتالي يظل تدفق البيانات موحداً

بهذا الشكل يصبح من الممكن إرسال تطبيقك كملف **Static HTML** (أو مجموعة ملفات ثابتة)، يعمل فوراً لدى العميل، مع قدرة على:
- العمل Offline‑First
- ثم المزامنة تلقائياً عند الاتصال

---

## التوزيع: UMD + Pure JS (No Build)

مشكاة يدعم تشغيله مباشرة في المتصفح دون Compiler أو Bundler:

- لا React runtime
- لا build pipeline إلزامي
- لا خادم Frontend إلزامي

النتيجة العملية: نشر سريع، واعتماديات أقل، ومخاطر أقل في بيئات الشركات.

---

## الأركان المعمارية السبعة

1) **State Integrity & SSOT**  
مصدر حقيقة واحد يقلل الغموض ويرفع قابلية الرصد.

2) **Constrained View Contract**  
العرض يصف الهيكل فقط؛ السلوك عبر orders و gkeys.

3) **Semantic Core + Inference**  
كتابة مختصرة مع تحقق دلالي صارم على مستوى العنصر والفئة.

4) **Composable UI Library**  
مكونات قابلة للتركيب تتبع نفس العقد والسياسات.

5) **Global‑Ready Core (RTL + i18n + Theming)**  
اللغة والاتجاه والثيمات بنية تحتية وليست إضافات.

6) **Standardized Utilities**  
تقليل التشتت والاعتماديات عبر أدوات موحدة.

7) **Reactive by Default, Control on Demand**  
تحديثات تلقائية مع أدوات تحكم عند الحاجة (Batching / Freeze / Flush حسب دعم المحرك).

---

## Governance Subsystem

- **Guardian**: تحقق بنيوي + Sanitization + سياسات أمان
- **Auditor**: Telemetry للأداء + كشف اختناقات + فحص A11y
- **DevTools**: تتبع الأوامر، فحص شجرة العرض، تقارير التحقق والأداء

---

## البدء السريع (UMD)

~~~html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Mishkah App</title>
    <script src="./mishkah.umd.js"></script>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const M = window.Mishkah;
      const database = { data: { counter: 0 }, env: { lang: "ar", dir: "rtl", theme: "system" } };

      const orders = {
        "counter.add": {
          on: ["click"],
          gkeys: ["btn:add"],
          handler: (e, ctx) => ctx.setState(s => ({ ...s, data: { counter: s.data.counter + 1 } }))
        }
      };

      const view = (db) => M.D.div({ class: "p-4" }, [
        M.D.h1({ class: "text-2xl" }, [String(db.data.counter)]),
        M.UI.Button({ attrs: { gkey: "btn:add" } }, ["+"])
      ]);

      M.mount({ target: "#app", database, orders, view });
    </script>
  </body>
</html>
~~~

---

## الترخيص والمساهمة

مشكاة مفتوح المصدر تحت **MIT License**.  
المساهمة مرحب بها في: DSL، سياسات التحقق، الحوكمة، أدوات المطور، ومكتبة المكونات.
`;

 let enREADME = `# Mishkah
## The Engineering of Emergence: Organized Freedom for UI Systems

> "From simple rules, creative system complexity emerges."

UI projects rarely fail because rendering is hard. They fail because complexity accumulates: fragmented state, tangled dependencies, and fragile change.

Mishkah is built around **organized freedom**:
an ergonomic authoring surface for developers, backed by a strict semantic core that preserves integrity, observability, and long‑term maintainability.

---

## Why Mishkah?

Modern UI stacks often drift toward one of two extremes:

- **Tooling fatigue**: build pipelines and layers that add architectural cost before you ship.
- **Fragile freedom**: fast starts that gradually degrade into entropy as apps grow.

Mishkah takes a different route:
**few primitives + clear safety boundaries**, with a large internal space for creative composition.

---

## Highlights

- **SSOT**: one state tree (database) and one mutation channel (orders)
- **View contract**: logic‑less views; behavior bound via gkeys
- **Ergonomic DSL with a strict semantic core**: D.h1 or optionally D.Text.h1
- **Mishkah Store (hybrid)**: memory + IndexedDB + realtime WebSocket sync
- **No‑Build delivery**: UMD + pure JS; ship as static HTML when needed
- **Global‑ready core**: RTL‑first, i18n, theming as infrastructure
- **Governance**: Guardian + Auditor + DevTools

---

## Architecture: a unidirectional loop

1) **State**: database  
2) **Logic**: orders  
3) **View**: DSL

The UI becomes a function of state, and every change becomes a traceable transaction.

---

## DSL: ergonomic surface, semantic rigor

You can write:

- Short form: D.h1(...), D.input(...)
- Explicit namespaces (optional): D.Text.h1(...), D.Forms.input(...)

Both compile to the same internal classification, enabling category‑level validation and policies without forcing verbose authoring.

---

## Data layer: realtime + offline

Mishkah Store provides:

- in‑memory speed
- IndexedDB persistence for offline‑first flows
- WebSocket sync when a backend is available

This makes “static HTML delivery” a practical deployment mode, without giving up realtime capabilities when connected.

---

## Distribution: UMD + Pure JS (No Build)

Mishkah can run directly in the browser without a mandatory compiler or bundler:
fewer moving parts, fewer deployment risks, faster iteration.

---

## License

MIT.
`;



let ar_README_BASE =`# مشكاة (Mishkah)
## إطار واجهات عالمي بروح عربية… بمعايير هندسية

> "من بساطة القوانين، يولد تعقيد الأنظمة الإبداعية."

نطمح إلى إطار واجهات **عالمي** لا يُعرّف نفسه بالانغلاق، بل بالانطلاق من قيود واقعية أهملتها كثير من الأدوات السائدة:  
اتجاه RTL، تعدد اللغات، حساسية الخطوط والهوية البصرية، ومتطلبات التشغيل الخفيف في بيئات الشركات.

هذه ليست دعوة لرفض ما هو موجود. بل دعوة لتعلمه بعمق، ثم البناء فوقه كمهندسي نظم.

---

## لماذا "روح عربية"؟

"الروح" هنا ليست شعاراً، بل مواصفات هندسية:

- **RTL‑First** كقيد تأسيسي وليس طبقة CSS لاحقة  
- **i18n** كمسار طبيعي داخل دورة التصيير، لا كمكتبة إضافية  
- **Theming** كجزء من البيانات والهوية، لا كألوان متفرقة في الكود  

الفكرة بسيطة:  
النظام الذي يتعامل مع أصعب حالات العرض واللغة كحالات افتراضية، يمتلك مرونة هيكلية تجعله صالحاً عالمياً.

---

## منطق البداية: مضمار يمكن اقتحامه

لسنا بحاجة لقفزات دعائية. البداية المنطقية هي مساحة يمكن بناؤها بصرامة، ثم تتوسع:

هندسة الواجهات مضمار أصغر نسبياً من مجالات أكثر تعقيداً، لكنه حساس ومعياري، ويمكن أن ينتج عنه أثر عالمي إذا صيغت القواعد جيداً.

---

## فلسفة مشكاة: حرية منظمة

مشكاة يبني "إطاراً حامياً" يضمن:

- **صدق الحالة واتساق البيانات**  
- **عقد عرض واضح يمنع خلط المنطق بالواجهة**  
- **تحقق دلالي يمنع الأخطاء الهيكلية مبكراً**  

ثم يترك مساحة داخلية واسعة للتركيب الإبداعي دون كسر القواعد.

---

## مبدأ التشغيل الخفيف: No‑Build as a First‑Class Mode

إحدى أهم نقاط مشكاة: تقليل طبقات التشغيل قدر الإمكان.

- **UMD + Pure JS** تشغيل مباشر
- نشر سريع كملف/ملفات ثابتة
- قابلية التطور نحو PWA وOffline‑First دون تعقيد حتمي في البداية

الهدف: تقليل الاحتكاك بين الفكرة والتشغيل، وتقليل المخاطر التشغيلية في الواقع العملي.

---

## ما الذي يجعله "عالمياً" فعلاً؟

ليس لأننا نضع كلمة "عالمي" في العنوان، بل لأن البنية تدعم:

- اتجاهات متعددة
- لغات متعددة
- ثيمات متعددة
- تشغيل خفيف
- طبقة بيانات هجينة (ذاكرة + IndexedDB + مزامنة لحظية)

هذه هي نقاط الاختبار الحقيقية لأي إطار يسعى للمنافسة.

---

## الخلاصة

مشكاة محاولة هندسية لبناء إطار واجهات:
**قواعده قليلة وواضحة، ضماناته قوية وقابلة للقياس، ومساحة الإبداع فيه كبيرة.**

إذا تعلمنا الأطر الكبرى كمهندسين، يمكننا أن نكتب ما ينافسها، بما يناسبنا، وبما يصلح للعالم.
`;



let en_README_BASE = `# Mishkah
## A global UI framework with Arabic-first foundations

> "From simple rules, creative system complexity emerges."

Mishkah aims to be global by design — not by slogans, but by starting from real constraints many stacks treat as afterthoughts:
RTL layout, multi-language UX, typography sensitivity, and low-friction deployment in enterprise environments.

This is not a rejection of existing frameworks. It is an invitation to learn them deeply — then build as system engineers.

---

## Why “Arabic-first”?

“Arabic-first” here means engineering requirements:

- RTL-first as a core constraint, not a late CSS patch
- i18n as part of the render lifecycle, not an optional addon
- theming as data and identity, not scattered styles

A system that treats the hardest layout/language cases as defaults tends to become structurally elastic — and therefore globally viable.

---

## Organized freedom

Mishkah is a protective framework that preserves:

- state integrity
- a strict view contract
- semantic validation

while keeping a large internal space for creative composition.

---

## No-build as a first-class mode

UMD + pure JS is a supported runtime mode:
ship fast, reduce moving parts, and keep the path open for offline-first / PWA evolution when needed.

---

## License

MIT.
`;

  Mishkah.readme  ={base:{ar:ar_README_BASE ,en:en_README_BASE} ,tec:{ar:arREADME,en:enREADME}}


})(window);

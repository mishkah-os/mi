# مواصفات "Mishkah CSS" v1.0 — تعليمات موجّهة للذكاء الاصطناعي

> هذا المستند يُستخدم كما هو لتلقين أي مولّد كود أو ذكاء اصطناعي كيفية بناء مكتبة CSS عربية حديثة باسم **Mishkah CSS**. التزم بالأقسام التالية حرفيًا لضمان إنتاج مخرجات متسقة، هوية تصميمية واضحة، وقابلية تخصيص كاملة عبر المتغيرات.

---

## 1) المبادئ

* **هوية عربية مشرقة**: ألوان مستوحاة من الطبيعة والسماء والبحر والرمال، مع لمسات قرآنية (وقار + بهجة + صفاء).
* **بساطة قابلة للتوسع**: نظام رموز (Design Tokens) صارم + مكوّنات جاهزة + Utilities ضرورية فقط.
* **قابلية الثيمات**: تبديل فوري عبر CSS Variables و`data-theme`.
* **RTL أولًا**: دعم كامل للعربية (RTL) واللاتينية (LTR) بدون تفرّع معقّد.
* **إتساق آلي**: واجهات أسماء ثابتة، طبقات CSS واضحة، وسلوكيات حالات عبر `data-*`.
* **تكامل/بديل لـ Tailwind**: قابل للتعايش (اختياري) أو العمل وحده بكفاءة.
* **تجريد كامل للمكوّنات**: جميع أنماط المكوّنات تُستمد حصريًا من المتغيرات (Design Tokens) لضمان التبديل السلس بين مكتبات أو ثيمات CSS.

---

## 2) هيكل المعمارية (CSS Layers)

استخدم طبقات CSS الحديثة للمحافظة على النظام وإمكانية التجزئة:

```css
@layer reset, tokens, base, components, utilities;
```

* `reset`: تطبيع أنيق (Modern Normalize).
* `tokens`: تعريف المتغيرات (الألوان، المسافات، الخطوط…).
* `base`: قواعد الطباعة والجذور والوثيقة.
* `components`: أنماط المكوّنات (Buttons, Cards, Inputs…).
* `utilities`: أدوات صغيرة سريعة (display, gaps, alignment…).

---

## 3) أسماء وأسلوب التسمية

* **بادئة عامة** للمكتبة: `mk-` (mishkah).
* **المكوّن**: `.mk-btn`, `.mk-card`.
* **المعدّلات**: `.mk-btn--primary`, `.mk-card--soft`.
* **الحالات/النسخ** عبر Data Attributes:
  `[data-variant="primary"]`, `[data-tone="soft"]`, `[data-size="sm|md|lg"]`, `[data-state="open|active|loading"]`.
* **Utilities** ببادئة قصيرة: `.u-…` (مثل `.u-flex`, `.u-gap-2`, `.u-grid`).
* **تجريد المكوّنات**: أي خصائص خاصة بمكوّن تُختزن في `--mk-*` أو متغيرات محلية (`--btn-*`, `--card-*`…) ولا تُكتب كقيم ثابتة.

> الهدف: أسماء يسهل على الذكاء الاصطناعي توليدها بثبات ودون التباس مع ضمان أن كل قيمة قابلة لإعادة التعيين لاحقًا.

---

## 4) Design Tokens (متغيرات أساسية)

### 4.1 ألوان (مستوحاة من الطبيعة + المعاني القرآنية)

عرّف **دلالات** وليس أسماء تقنية، واجعل القيم قابلة للتبديل بالثيم:

```css
@layer tokens {
  :root {
    /* لوحة أساسية */
    --mk-bg: #0b0f13;          /* ليلٌ هادئ */
    --mk-surface-0: #12171d;   /* طبقة سطح */
    --mk-surface-1: #1a2129;
    --mk-fg: #e8eef4;          /* نص أساسي */
    --mk-muted: #aab6c3;       /* نص ثانوي */

    /* دلالات */
    --mk-primary: #2aa5a0;     /* زمرد/بحر */
    --mk-primary-contrast: #071314;
    --mk-secondary: #ca8a04;   /* عسل/رمال */
    --mk-accent: #8b5cf6;      /* بنفسج سماوي */
    --mk-success: #10b981;
    --mk-warning: #f59e0b;
    --mk-danger:  #ef4444;
    --mk-info:    #38bdf8;

    /* حدود وظلال */
    --mk-border: #26303a;
    --mk-outline: #3b4957;
    --mk-shadow: 0 6px 24px rgba(0,0,0,.25);

    /* المسافات */
    --mk-space-1: .25rem;  /* 4px */
    --mk-space-2: .5rem;   /* 8px */
    --mk-space-3: .75rem;  /* 12px */
    --mk-space-4: 1rem;    /* 16px */
    --mk-space-5: 1.5rem;  /* 24px */
    --mk-space-6: 2rem;    /* 32px */

    /* الأحجام والزوايا */
    --mk-radius-sm: .5rem;
    --mk-radius-md: .75rem;
    --mk-radius-lg: 1rem;
    --mk-radius-2xl: 1.5rem;

    /* الخطوط (عربي/لاتيني) */
    --mk-font-sans-ar: "Cairo", "Noto Naskh Arabic", "Amiri", system-ui, sans-serif;
    --mk-font-sans-lat: Inter, ui-sans-serif, system-ui, sans-serif;

    /* المقاسات الطباعية */
    --mk-fs-xs: .75rem;
    --mk-fs-sm: .875rem;
    --mk-fs-md: 1rem;
    --mk-fs-lg: 1.125rem;
    --mk-fs-xl: 1.25rem;
    --mk-fs-2xl: 1.5rem;

    /* السرعات والحركة */
    --mk-ease: cubic-bezier(.2,.7,.2,1);
    --mk-speed-1: 150ms;
    --mk-speed-2: 250ms;
    --mk-speed-3: 400ms;

    /* طبقات Z */
    --mk-z-docked: 10;
    --mk-z-dropdown: 100;
    --mk-z-modal: 1000;
    --mk-z-toast: 1100;
  }

  /* الثيم الفاتح */
  :root[data-theme="light"] {
    --mk-bg: #f8fafb;
    --mk-surface-0: #ffffff;
    --mk-surface-1: #f2f5f8;
    --mk-fg: #0e141b;
    --mk-muted: #475467;

    --mk-border: #d7dde4;
    --mk-outline: #c7d1db;
    --mk-shadow: 0 10px 30px rgba(16,24,40,.08);
  }
}
```

### 4.2 اتجاه اللغة

* الجذر يحمل `[dir="rtl"]` للعربية، `[dir="ltr"]` للغات الأخرى.
* اعتمد خواص منطقيّة (logical properties): `margin-inline`, `padding-inline`, `border-start-end-radius…`.

---

## 5) قواعد أساسية (Base)

```css
@layer base {
  html { color-scheme: light dark; }
  :root { font-family: var(--mk-font-sans-ar); }
  [lang="en"] { font-family: var(--mk-font-sans-lat); }

  body {
    background: var(--mk-bg);
    color: var(--mk-fg);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  a { color: var(--mk-primary); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* عناية بالنص القرآني/العربي */
  .quran {
    font-feature-settings: "ss01" 1, "calt" 1, "kern" 1;
    letter-spacing: .2px;
  }
}
```

---

## 6) Utilities مختارة (ضرورية فقط)

* **عرض/تموضع**: `.u-flex`, `.u-inline-flex`, `.u-grid`, `.u-wrap`, `.u-center`, `.u-justify-between`, `.u-items-center`.
* **فجوات**: `.u-gap-1…u-gap-6` ← تستخدم `--mk-space-*`.
* **حواف**: `.u-rounded-sm|md|lg|2xl`.
* **تباعد داخلي/خارجي**: `.u-p-1..6`, `.u-px-1..6`, `.u-py-1..6`, `.u-m-1..6`…
* **ألوان خلفية/نص**: `.u-bg-surface-0|1`, `.u-bg-primary`, `.u-text-muted`, `.u-text-fg`.
* **ظلال/حدود**: `.u-shadow`, `.u-border`, `.u-outline-focus`.
* **حالات**: `.is-loading`, `.is-active` (أو عبر `data-state`).

> كل Utility يجب أن يقرأ من المتغيرات فقط—لا قيم صلبة قدر الإمكان لضمان إمكانية إعادة التشكيل عند الدمج مع مكتبات أخرى.

---

## 7) المكوّنات (Components)

### 7.1 زر (Button)

```css
@layer components {
  .mk-btn {
    --btn-bg: var(--mk-surface-1);
    --btn-fg: var(--mk-fg);
    --btn-bd: var(--mk-border);

    display:inline-flex; align-items:center; justify-content:center;
    gap: var(--mk-space-2);
    padding-inline: var(--mk-space-4);
    height: 2.5rem;
    border-radius: var(--mk-radius-lg);
    border: 1px solid var(--btn-bd);
    background: var(--btn-bg);
    color: var(--btn-fg);
    font-weight: 600;
    transition: background var(--mk-speed-2) var(--mk-ease),
                border-color var(--mk-speed-2) var(--mk-ease),
                transform var(--mk-speed-1) var(--mk-ease);
  }
  .mk-btn:hover { transform: translateY(-1px); }
  .mk-btn:active { transform: translateY(0); }

  .mk-btn[data-variant="primary"] {
    --btn-bg: var(--mk-primary);
    --btn-fg: var(--mk-primary-contrast);
    --btn-bd: transparent;
  }

  .mk-btn[data-tone="soft"] {
    --btn-bg: color-mix(in oklab, var(--mk-primary) 12%, transparent);
    --btn-fg: var(--mk-fg);
    --btn-bd: color-mix(in oklab, var(--mk-primary) 35%, var(--mk-border));
  }

  .mk-btn[data-size="sm"] { height: 2rem; padding-inline: var(--mk-space-3); font-size: var(--mk-fs-sm); }
  .mk-btn[data-size="lg"] { height: 3rem; padding-inline: var(--mk-space-5); font-size: var(--mk-fs-lg); }

  .mk-btn[disabled], .mk-btn[aria-disabled="true"] { opacity:.6; pointer-events:none; }
}
```

### 7.2 بطاقة (Card)

```css
@layer components {
  .mk-card {
    --card-bg: var(--mk-surface-0);
    --card-border: var(--mk-border);
    --card-radius: var(--mk-radius-2xl);
    --card-padding: var(--mk-space-5);
    --card-shadow: var(--mk-shadow);

    background: var(--card-bg);
    border: 1px dashed var(--card-border);
    border-radius: var(--card-radius);
    padding: var(--card-padding);
    box-shadow: var(--card-shadow);
  }
  .mk-card[data-tone="soft"] {
    --card-bg: var(--mk-surface-1);
    --card-border: var(--mk-border);
    border-style: solid;
  }
}
```

### 7.3 إدخالات (Input)

```css
@layer components {
  .mk-input {
    --input-height: 2.75rem;
    --input-padding-inline: var(--mk-space-4);
    --input-radius: var(--mk-radius-lg);
    --input-bg: var(--mk-surface-0);
    --input-border: var(--mk-border);
    --input-color: var(--mk-fg);

    width: 100%;
    height: var(--input-height);
    padding-inline: var(--input-padding-inline);
    border-radius: var(--input-radius);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--input-color);
    transition: border-color var(--mk-speed-2) var(--mk-ease), box-shadow var(--mk-speed-2) var(--mk-ease);
  }
  .mk-input:focus {
    border-color: var(--mk-primary);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--mk-primary) 25%, transparent);
    outline: none;
  }
  .mk-input[aria-invalid="true"] { border-color: var(--mk-danger); }
}
```

> كرّر النمط نفسه لمكوّنات: Tabs, Modal, Drawer, Navbar, Sidebar, Tooltip, Toast, Badge, Chip, Table, Pagination، مع الحرص على أن تكون كل قيمة مرئية مستمدة من متغيرات قابلة للتخصيص.

---

## 8) الحركة (Motion) والروح الجمالية

* استخدم حركات **هادئة رشيقة** (ease-out، Durations قصيرة مشتقة من `--mk-speed-*`).
* حركات دخول/خروج موحّدة:
  * Fade + Slide (inline-start/end) للتوافق مع RTL/LTR.
* احترم تفضيل المستخدم:

  ```css
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }
  ```

---

## 9) الوصولية (A11y)

* نسبة تباين ≥ 4.5:1 للنصوص الأساسية.
* حالات تركيز مرئية دومًا (`:focus-visible` + ظلال مميّزة مستمدة من المتغيرات).
* دعم `aria-*`، واستخدام `[data-state]` لتعريف الحالات بصريًا.
* عناصر تفاعلية بارتفاع/عرض لمس مريح ≥ 40px.

---

## 10) RTL/LTR

* اجعل كل الفواصل/الأسهم واتجاهات الانزلاق تعتمد خصائص منطقية:

  * `.slide-in { transform: translateX(var(--dir-shift, 8px)); }`
  * على الجذر: `[dir="rtl"] { --dir-shift: -8px; }`, `[dir="ltr"] { --dir-shift: 8px; }`

* أي فرق في محاذاة أو حشوات يجب ضبطه عبر متغيرات (`--mk-inline-gap`, `--mk-card-padding-inline`) بدل قيم ثابتة.

---

## 11) التكامل مع Tailwind (اختياري)

* **تعايش**: من يود استخدام Tailwind، يكتفي بقواعدنا كـ base + components، ويترك Utilities لـ Tailwind.
* **بديل كامل**: من دون Tailwind، لدينا `.u-*` كافية للتركيب السريع.
* **Plugin اختياري لاحقًا**: يمكن إنشاء Plugin يربط `mk-*` بـ theme Tailwind تلقائيًا، لكن لا نجعل ذلك شرطًا.

---

## 12) واجهة كتابة واضحة للذكاء الاصطناعي

### 12.1 قواعد توليد الكود

* استخدم دائمًا مكوّنات `mk-*` أولًا (إن وجدت)، ثم أضف Utilities `u-*` للتعديل البسيط.
* لا تضف ألوانًا صلبة؛ استعمل متغيرات فقط.
* استعمل `data-variant`, `data-tone`, `data-size`, `data-state`.
* احترم `dir` و`data-theme`.
* اجعل الهياكل بسيطة ومسطّحة، وتجنّب العمق الزائد في DOM.
* عند الحاجة لتخصيص إضافي، عرّف متغيرًا جديدًا (`--mk-card-border-style` مثلًا) بدل كتابة قيمة ثابتة.

### 12.2 مثال HTML

```html
<section class="mk-card u-gap-4" data-tone="soft">
  <h2 class="u-text-fg" style="font-size: var(--mk-fs-xl)">مرحبا بمشكاة ✨</h2>
  <p class="u-text-muted">جمال حديث، روح أصيلة، وواجهة عربية الهوى.</p>

  <div class="u-flex u-gap-3">
    <button class="mk-btn" data-variant="primary" data-size="md">ابدأ الآن</button>
    <button class="mk-btn" data-tone="soft">استكشاف</button>
  </div>

  <div class="u-grid" style="grid-template-columns: repeat(3, minmax(0,1fr)); gap: var(--mk-space-4)">
    <div class="mk-card"><p>بطاقة 1</p></div>
    <div class="mk-card"><p>بطاقة 2</p></div>
    <div class="mk-card"><p>بطاقة 3</p></div>
  </div>
</section>
```

---

## 13) حِزم البناء (اختياري وليست إلزامية)

* **PostCSS**: nesting, autoprefixer.
* **تصدير متعدد**: ملف أساسي صغير + حِزم "components-only" و "utilities-only".
* **CSS Variables فقط** لضمان خفة التبديل بين الثيمات.

---

## 14) خريطة طريق قصيرة

1. تطبيق **tokens + base**.
2. إطلاق **Utilities الأساسية**.
3. بناء مجموعة **Components الأساسية**: Button, Card, Input, Tabs, Modal, Drawer.
4. إضافة **ثيم فاتح/داكن** + تبديل لحظي.
5. ضمان **RTL/LTR** وإتاحة ضبط `dir` على الجذر.
6. تحسين الوصولية والأداء (حجم CSS < 20KB مضغوط كبداية).

---

### الخلاصة

* نعم: نجعل Tailwind "خيرًا"، لكن **لدينا بديل أقوى بهويتنا**: متغيرات دلالية، مكوّنات عربية الروح، Utilities منتقاة، وثيمات قابلة للتبديل.
* هذه المواصفات تمنح الذكاء الاصطناعي **قواعد واضحة وحتمية** ليكتب كود متسق وجميل—وتمنحنا نحن **هوية مميّزة** لا تُخطئها العين.
* أي تخصيص مستقبلي يجب أن يتم عبر المتغيرات فقط لضمان التوافق مع مكتبات أخرى أو ثيمات جديدة دون إعادة كتابة المكوّنات.


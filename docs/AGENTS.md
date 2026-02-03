# الدستور المعماري: واجهة مستخدم مبنية على المخطط (Schema-Driven UI)

> [!CAUTION]
> **تحذير شديد اللهجة**: يمنع منعاً باتاً تعريف أي متغيرات، قوائم حقول، مسميات أعمدة، أو إعدادات واجهة (Config) داخل كود الـ Frontend. أي مخالفة لهذا الدستور تعتبر "كوداً ميتاً" (Legacy Code) ويجب إزالته فوراً.

## المبدأ الأساسي: الباك إند هو مصدر الحقيقة الوحيد (Single Source of Truth)

الـ Frontend هو مجرد "عارض غبي" (Dumb Renderer) لا يعرف شيئاً عن طبيعة البيانات أو كيفية عرضها إلا ما يمليه عليه الـ Backend.

- **المخطط الصلب (Database + Smart Features) هو المصدر الوحيد للحقيقة**: أي حقل، علاقة، أو مجموعة أعمدة يتم استنتاجها من البنية الفعلية والجداول المرافقة (مثل جداول اللغة) وليس من إعدادات عشوائية في الواجهة.
- الجدول الأصلي وجدول اللغة يتم التعامل معهما كوحدة واحدة لا تنفصل في كل مسار البيانات (استرجاع، عرض، وإدخال).

---

## 1. وحدة اللغة الرأسية (The Vertical Language Unity)

نحن نتبع **Vertical Language Model**. هذا يعني أن الجدول الأصلي (مثلاً `clinic_services`) وجدول الترجمة الخاص به (مثلاً `clinic_services_lang`) هما **كيان واحد لا يتجزأ** في نظر النظام.

### القواعد

1. **الدمج التلقائي (Auto-Flattening)**: عند استرجاع البيانات، يقوم الباك إند بدمج حقول اللغة المناسبة (حسب لغة المستخدم الحالية `ar` أو `en`) مباشرة في الكائن الرئيسي.
   - مثال: `record.name` تعود بـ "عاجل" إذا كانت اللغة عربية، وبـ "Urgent" إذا كانت إنجليزية. لا يحتاج الفرونت للوصول لـ `record.lang.ar.name`.
2. **الشفافية**: الفرونت لا يعلم بوجود جدول `_lang` منفصل. هو يتعامل مع كائن واحد موحد.
3. **عمود اللغة دائم التغير حسب لغة العرض**: قيمة عمود اللغة تتبدل فور تغيير لغة الجلسة بدون أي منطق إضافي في الواجهة.
4. **حزمة واحدة للغة والأصل**: عند بناء كائن السجل في `smart_features`، يتم دمج العمود الأصلي مع العمود المفلطن (لغة) ومع كائن الـ FK في بنية واحدة ليظل المسار رأسياً وواضحاً.

### قاعدة الجداول المترجمة (Base + Lang Table Rule)
- أي جدول بيانات يجب أن يمتلك جدول ترجمة مطابق بالاسم مع لاحقة `_lang` (مثال: `clinic_referral_doctors` + `clinic_referral_doctors_lang`).
- الجدول الأساسي يحتوي دائماً على `id`, `company_id`, `begin_date` كحقول نظامية مشتركة، والحقول القابلة للترجمة تكون في جدول الـ `_lang`.

---

## 2. بنية الكائن الموحد (The Unified Object Structure)

أي صف بيانات (Row) يتم استرجاعه من الباك إند يجب أن يلتزم بهذا الهيكل الموحد، والذي يحتوي على ثلاثة أنواع من الأعمدة:

### أ. العمود الأصلي (Direct Column)

بيانات خام لا تتأثر باللغة.

- مثال: `price`, `created_at`, `code`.

### ب. عمود اللغة (Flattened Language Column)

بيانات نصية تتغير قيمتها ديناميكياً حسب لغة العرض الحالية.

- المصدر: جدول `_lang`.
- السلوك: الباك إند يختار القيمة المناسبة ويضعها في الجذر (Root) للكائن.
- العرض: عند التبديل بين `ar` و `en` يتم تحديث قيمة الحقل فوراً بدون وجود حقول فرعية أو لواحق (`_ar`, `_en`).

### ج. كائن العلاقة (Foreign Key Object)

أي حقل علاقة (Foreign Key) **يجب** أن يُرسل ككائن كامل `{ id, name }` وليس مجرد رقم `id`.

- ❌ **مرفوض**: `doctor_id: "uuid-123"`
- ✅ **مقبول**: `doctor: { id: "uuid-123", name: "د. أحمد خليل" }`

> **قاعدة ذهبية**: الفرونيت لا يقوم أبداً بعمل "Lookups" لأسماء العلاقات. الاسم يأتي جاهزاً من الباك إند داخل كائن العلاقة.

---

## 3. قاعدة اسم العرض العميق (Deep Display Name Rule)

كيف نحدد "اسم" السجل المعروض للمستخدم؟ نتبع قاعدة صارمة وموحدة في `smart_features`:

1. **الأساس**: كل جدول يحدد `display_rule` في المخطط.
2. **العمق (Recursion)**: إذا اعتمد الاسم على حقل علاقة (FK)، فإن النظام يذهب "بعمق" لجدول العلاقة ليجلب اسمه المترجم أيضاً.
3. **الأولوية**:
   - `display_rule` (تجميع مخصص للأعمدة والنصوص).
   - `translations.display_name` (من جدول اللغة).
   - `name` / `title` / `label` (حقول بديهية).
   - `id` (الملاذ الأخير).

---

## المحظورات السبع (The 7 Sins)

1. 🚫 **يمنع** كتابة `const FIELDS = [...]` تعريف الحقول يدوياً.
2. 🚫 **يمنع** كتابة `label: 'الاسم'` أو أي ترجمة نصية (Hardcoded String).
3. 🚫 **يمنع** تحديد الأيقونات في الجافاسكريبت (مثل `icon: '👤'`).
4. 🚫 **يمنع** تحديد ترتيب الأعمدة (Columns Order) يدوياً. الترتيب يأتي من `sort` داخل `smart_features.columns`.
5. 🚫 **يمنع** تحديد الحقول التي تظهر في البحث يدوياً.
6. 🚫 **يمنع** كتابة أي منطق لربط العلاقات (Foreign Keys) يدوياً في الفرونت.
7. 🚫 **يمنع** التعامل مع `foo_id` كـ Primitive لعرض الاسم. يجب التعامل مع كائن `foo`.

---

## مثال حي (The Perfect Schema)

```json
{
  "name": "clinic_patients",
  "smart_features": {
    "settings": {
      "icon": "🤒",
      "colors": { "primary": "#ef4444" }
    },
    "columns": [
      {
        "name": "patient_code",
        "source": "direct",
        "sort": 10,
        "labels": { "ar": "الكود", "en": "Code" }
      },
      {
        "name": "name", // <-- Flattened Language Field
        "source": "lang",
        "sort": 20,
        "labels": { "ar": "الاسم", "en": "Name" }
      },
      {
        "name": "doctor", // <-- FK Object (Not doctor_id)
        "source": "fk",
        "sort": 30,
        "labels": { "ar": "الطبيب المعالج", "en": "Doctor" },
        "component": "smart-select"
      }
    ]
  }
}
```

هذا الدستور هو القانون الأعلى للنظام. أي كود يخالفه سيتم رفضه وإعادة كتابته.

---

## 4. The Vertical Language Architecture & Record Experience

The architecture treats "Language" not as a separate afterthought, but as a vertical slice of the record itself.

### 4.1. The Unified Record Object

In the UI Component layer, we **NEVER** deal with raw database rows separated from their language counterparts. A "Record" is a fused object:
`Record = Base_Table_Row + Language_Table_Row (Flattened)`

### 4.2. The Triple Nature of Columns

Every column in our system falls into one of three strict categories:

1. **Direct Value Column**: A raw value from the base table (e.g., `birth_date`, `status`, `created_at`). Source of truth is the base table.
2. **Flattened Language Column**: A column that conceptually exists on the record but physically resides in the translation table.
    - *Rule*: The backend/ORM flattens this automatically.
    - *UI View*: `record.name` returns the value for the *current active language*. You do not access `record.name_ar` directly unless specifically editing that field.
3. **Foreign Key (FK) Object**: We **NEVER** treat an FK as just an ID (e.g., `clinic_id: 5`).
    - *Rule*: An FK is a distinct Object `{ id, display_name }`.
    - *UI View*: The UI receives the expanded object or resolves it via the loaded Schema/Cache.
    - *Input*: Always a Selection component (Select/Combobox), never a raw text input.
    - *Detection*: FKs are detected via `smart_features.columns` (`source: 'fk'`) or strict naming convention (`_id` suffix).

### 4.3. Deep Intertwined Display Name Rules

Determining the "Display Name" of any record is not arbitrary. It follows a strict cascade (The "Intertwined Priority"):

1. **Language Specific Label**: `labels[current_lang]` (from schema metadata).
2. **Flattened Name**: `record.name` (dynamic language column).
3. **Fallback Title/Label**: `record.title` or `record.label`.
4. **Identity Code**: `record.code` (if semantically relevant).
5. **Primary Key**: `record.id` (Last resort).

All UI components must implement this resolver function centralizing this logic.

## 5. Module Hierarchy & Field Grouping

### 5.1. Hierarchical Module System

The application navigation is driven by a strict Tree Structure:
- **Modules** are Recursive Nodes (`id`, `parent_id`, `label`, `icon`).
- **Tables** are Leaf Nodes assigned to a specific Module ID.
- **Front-End Responsibility**: The sidebar must render this tree precisely. `settings`, `operations`, `reports` are conceptually just root or branch modules, not arbitrary "types".
- **تصنيف الجداول (Modules Tree)**: الجداول يجب أن تتبع شجرة الموديولات (إعدادات، حركات، تقارير، Logs، Audit...)، مع استخدام نفس البيانات لعرض المسميات المترجمة في الواجهة.
- **Labels & i18n**: كل Module أو Group يملك `labels` ثنائية اللغة (مثلاً `{ ar: "الإعدادات", en: "Settings" }`) ويجب عرضها حسب لغة الواجهة.

### 5.2. Field Grouping (Tabs & Sections)

To avoid "Wall of Inputs" or "Wall of Data", we use Logical Grouping:

- **Schema Definition**: Groups are defined in `smart_features.settings.groups` (e.g., `basic`, `contact`, `medical`).
- **Column Assignment**: Each column belongs to a group (`group: 'contact'`).
- **UI - Tables**:
    1. **Default View**: SHOW ONLY the first group (e.g., 'Basic').
    2. **Expansion**: Other groups are hidden behind toggleable UI elements (Checkboxes/Tabs) ويمكن اختيارها عبر Checkbox على مستوى المجموعة أو العمود.
    3. **Override**: A column with `is_table_show: true` MUST appear regardless of its group's visibility (العمود يظهر حتى لو كانت مجموعته مخفية).
    4. **Context Actions**: القائمة السياقية لكل سجل يجب أن تعرض البروفايل الكامل في Modal منظم بنفس الـ Sections مع خيار طباعة.
- **UI - Forms (Edit/View)**:
    1. All inputs must be categorized into Tabs/Sections matching the schema groups.
    2. **NEVER** dump all fields into one long form.
    3. **View Mode**: Uses the same Group/Tab structure but in Read-Only mode.
    4. **Insert/Edit**: نفس الـ Tabs المستخدمة في العرض تنطبق على الإدخال والتعديل لتجنب "حقول سايحة".

---

## 7. Internationalized Modules, Groups, and Columns

- كل Module، Group، و Column يحتوي على `labels` ثنائية اللغة (العربية والإنجليزية) ويجب أن تُعرض بحسب لغة المستخدم الحالية.
- بيانات الترجمة تأتي من المخطط أو جدول اللغة، وليس من نصوص ثابتة في الواجهة.
- عند دمج الحقول (Direct + Lang + FK) داخل `smart_features` يجب أن يحتفظ كل كائن بملصقاته المترجمة ليُستهلك في الـ Tabs، الـ Context Menu، وفي الـ Modal view.

---

## 8. FKs from Schema, Not Guesswork

- تعريف الـ FK يعتمد على البنية الحقيقية (المفاتيح الأجنبية الفعلية أو `source: 'fk'` داخل `smart_features.columns`).
- أي عمود ينتهي بـ `_id` يتم التعامل معه ككائن علاقة `{ id, name }`، مع استخدام قاعدة العرض العميق لجلب `display_name` المترجم من الجدول المرتبط.
- لا يُسمح بالاعتماد على إعدادات يدوية أو بيانات ناقصة في الواجهة لتحديد الـ FK أو أسماء العرض.

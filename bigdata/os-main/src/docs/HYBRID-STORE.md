# HybridStore: قواعد التخزين الهجين (SQLite + Live JSON)

هذه الوثيقة تشرح كيف يعمل HybridStore فعليًا داخل المشروع، وما هو معيار تحديد الجداول التي تُكتب إلى SQLite مقابل الجداول التي تعيش في الـ Live JSON.

## 1) طبقات التخزين (بشكل مبسّط)

HybridStore يجمع ثلاث طبقات:

1) **In-Memory Cache**
   - كل جدول يتم تحميله في الذاكرة لتسريع القراءة.
   - القراءة الافتراضية من الذاكرة (مع صلاحية كاش قصيرة).

2) **Live JSON Snapshot**
   - كل Module يملك ملف حيّ يتم تحديثه عبر `persistModuleStore`.
   - المسار الافتراضي: `data/branches/<branch>/modules/<module>/live/data.json`.
   - هذا الملف هو المصدر الذي يُعاد منه تحميل الـ Store بعد الـ restart.

3) **SQLite (Write-through)**
   - يستخدم لكتابة بعض الجداول فقط بشكل دائم وسريع.
   - هذه الطبقة لا تعمل لكل الجداول؛ تعمل فقط لـ **الجداول المُدارة** (managed tables).

> الخلاصة: **ليس كل جدول يُكتب إلى SQLite**. معيار الكتابة محدّد بدقة داخل الكود.

---

## 1.1) أوضاع التخزين الثلاثة (المعيار العام)

لدينا ثلاثة أوضاع منطقية لتخزين الجداول:

1) **Full SQL**
   - جدول SQL كامل بأعمدة تمثل معظم الحقول المهمة مباشرةً.
   - مناسب للتقارير الثقيلة والاستعلامات المركبة.
   - غير مفعل افتراضيًا داخل HybridStore، لكنه ممكن كمحطة مستقبلية أو عبر Adapter منفصل.

2) **Hybrid SQL (Payload + Indexed Columns)**
   - الوضع الافتراضي الحالي داخل HybridStore.
   - يتم تخزين أعمدة قليلة مهمة + حقل `payload` يحتوي كامل السجل كـ JSON.
   - مناسب للتوازن بين الأداء والديمومة والمرونة.

3) **Live Data Only**
   - بيانات تُحفظ فقط في الـ Live JSON + الذاكرة.
   - تُفقد إذا لم يتم حفظ الـ snapshot أو حدثت إعادة تشغيل دون حفظ.
   - مناسب للبيانات المؤقتة أو واجهات UI.

---

## 2) معيار تحديد الجداول التي تُكتب إلى SQLite

المعيار النهائي يُحسم في مكانين:

### (A) `moduleDefinition.tables`
- قائمة الجداول الخاصة بالـ module (تُقرأ من `modules.json` أو من الـ schema عند عدم وجود قائمة).

### (B) `isManagedTable(tableName)`
- موجودة في `src/database/sqlite-ops.js`.
- حاليًا تعتمد على **قائمة ثابتة** `DEFAULT_TABLES`.
- أي جدول غير موجود في `DEFAULT_TABLES` **لن يُكتب إلى SQLite** حتى لو كان ضمن `moduleDefinition.tables`.

النتيجة في `HybridStore`:
- `persistedTables = normalizePersistedTables(options.persistedTables, this.tables)`
- وهذا يقوم بفلترة الجداول باستخدام `isManagedTable`.

**إذا لم يكن الجدول في DEFAULT_TABLES → لن يتم حفظه في SQLite.**

---

## 2.1) كيف نحدد “الحقول المهمة”؟

في وضع Hybrid (Payload)، لا نُخزن كل الحقول كأعمدة SQL، بل نختار **مجموعة حقول مهمة** فقط.

**معايير الاختيار المقترحة:**
- الحقول التي نبحث عنها أو نفلتر بها كثيرًا (مثل `phone`, `status`).
- الحقول التي نرتب بها النتائج (`created_at`, `updated_at`).
- المفاتيح الأساسية أو الأجنبية (`id`, `*_id`).
- أي حقل يُستخدم في Join أو تقارير حساسة.

**التنفيذ الحالي في الكود:**
- في `src/database/sqlite-ops.js` الاختيار **يدوي** لكل جدول (أعمدة محددة + payload).
- في `src/database/dynamic-sqlite.js` (عند استخدامه) يوجد استخراج تلقائي للحقل المهم بناءً على:
  - `primaryKey`, `index`, `unique`
  - أسماء تنتهي بـ `_id`
  - الحقول `status`, `stage`, `created_at`, `updated_at`

الخلاصة: **الحقل المهم = حقل نحتاجه لاستعلام سريع بدون فك payload.**

---

## 3) أين تُدار قائمة الجداول المُدارة؟

الملف الأساسي:
- `src/database/sqlite-ops.js`

المقطع المهم:
- `DEFAULT_TABLES` + `isManagedTable(tableName)`

هذه القائمة هي **المرجع الأول** لتحديد ما يُكتب في SQLite.

---

## 4) ما الذي يتم حفظه فعلًا عند الـ restart؟

- **SQLite**: يحتفظ فقط بالجداول المُدارة (DEFAULT_TABLES).
- **Live JSON**: يحتفظ بكل الجداول الموجودة في الـ store عند لحظة الحفظ.

إذا لاحظت أن بيانات معينة تختفي بعد restart:
1) تأكد أنها تُكتب فعليًا إلى الـ Live JSON.
2) تأكد أنها ليست فقط في الذاكرة دون حفظ.
3) إذا كانت مهمة جدًا ويجب ضمان بقائها، فكّر في إضافتها إلى DEFAULT_TABLES.

---

## 5) مثال عملي: customer_profiles (POS)

في `data/schemas/pos_schema.json` يوجد جدول:
- `customer_profiles`

لكن هذا الجدول **غير موجود** في `DEFAULT_TABLES`، لذلك:
- لا يتم حفظه في SQLite.
- يعتمد بقاؤه على الـ Live JSON وحده.

إذا أردنا ضمان عدم ضياع بيانات العملاء حتى مع أي restart:
- إمّا ضمان حفظه في Live JSON بشكل دوري.
- أو إضافته إلى `DEFAULT_TABLES` ليدخل ضمن الـ SQLite write-through.

---

## 5.1) خطوات ترقية جدول من Live إلى Hybrid SQL

1) أضف اسم الجدول إلى `DEFAULT_TABLES` في `src/database/sqlite-ops.js`.
2) أضف DDL للجداول في `createModuleTables` (أعمدة مهمة + payload).
3) أضف Builder في `getBuilder` لإخراج الصف (columns + payload).
4) أضف Statements في `getStatements` (upsert/remove/truncate/load).
5) اختبر إعادة التشغيل وتحقق من بقاء البيانات.

---

## 6) إعدادات مهمة

- `HYBRID_CACHE_TTL_MS`: مدة صلاحية كاش الذاكرة (افتراضي 1500ms، حد أدنى 250ms).
- مسار SQLite:
  - `data/branches/<branch>/modules/<module>/sqlite/hybrid-store.sqlite`

---

## 7) أين أراجع الكود؟

- `src/hybridStore.js` - منطق التخزين الهجين والكاش
- `src/database/sqlite-ops.js` - SQLite ops + قائمة DEFAULT_TABLES
- `src/runtime/module-store-manager.js` - إنشاء الـ store وتمرير persistedTables
- `src/runtime/stores.js` - مسار بديل لإدارة الـ stores
- `src/server/storage/module-store.js` - حفظ الـ Live JSON

---

## 8) قرارات مستقبلية

قبل توسيع DEFAULT_TABLES:
- هل نريد كل الجداول في SQLite؟
- ما أثر ذلك على الأداء وحجم قاعدة البيانات؟
- هل توجد جداول حسّاسة تحتاج ديمومة أعلى؟

هذه الوثيقة هي المرجع الأساسي لأي قرار تخصيص التخزين الهجين.

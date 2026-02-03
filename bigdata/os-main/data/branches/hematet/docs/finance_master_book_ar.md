# المرجع الشامل للنظام المالي (Finance Master Book) - PEG v5

## 1. المبادئ المقدسة (Sacred Principles)

تحتوي **جميع** الجداول (31 جدولاً) المذكورة أدناه بلا استثناء على "أعمدة البنية التحتية" التالية لضمان تعددية الشركات (Multi-Tenancy) والتدقيق (Auditing):

| العمود | النوع | الوصف |
|--------|-------|-------|
| `id` | UUID | المفتاح الأساسي الفريد. |
| `company_id` | UUID | (Multi-Tenancy) معرف الشركة المالكة للبيانات. |
| `branch_id` | UUID | (Multi-Tenancy) معرف الفرع (إن وجد). |
| `created_date` | Date | تاريخ الإنشاء (تلقائي). |
| `user_insert` | UUID | المستخدم الذي أنشأ السجل. |
| `last_update` | Date | تاريخ آخر تعديل. |

---

## 2. استراتيجية الترجمة (Vertical Multi-Language)

يعتمد النظام على **جداول الترجمة الرأسية (`_lang`)** وليس الأعمدة الأفقية، لضمان دعم عدد لا نهائي من اللغات.

* الجدول الأصلي: يحتوي على `name` (الاسم الافتراضي/النظامي).
* جدول الترجمة: يربط `ref_id` (السجل) + `lang_code` ('ar', 'fr') + `name` (الترجمة).

---

## 3. موديول الإعدادات (Settings)

### 3.1 العملات (`fin_currencies` & `_lang`)

| الجدول | الوصف |
|--------|-------|
| `fin_currencies` | تعريف العملة (`USD`)، الرمز والدقة. |
| `fin_currencies_lang` | ترجمة اسم العملة (دولار، Dollar). |
| `fin_currency_rates` | سجل تاريخي لأسعار الصرف. |

### 3.2 أنواع القيود (`fin_journal_types` & `_lang`)

دفاتر اليومية (مبيعات، بنك..).

| الجدول | الوصف |
|--------|-------|
| `fin_journal_types` | الأكواد، التسلسل، الحساب الافتراضي. |
| `fin_journal_types_lang` | ترجمة اسم الدفتر. |

### 3.3 شروط السداد (`fin_payment_terms` & `_lang`)

سياسات الاستحقاق.

| الجدول | الوصف |
|--------|-------|
| `fin_payment_terms` | عدد الأيام، طريقة الحساب. |
| `fin_payment_terms_lang`| ترجمة اسم الشرط. |

### 3.4 السنوات والفترات (`fin_fiscal_*` & `_lang`)

الهيكل الزمني للنظام.

| الجدول | الوصف |
|--------|-------|
| `fin_fiscal_years` | تعريف السنة (البداية/النهاية/الإغلاق). |
| `fin_fiscal_years_lang` | ترجمة اسم السنة. |
| `fin_fiscal_periods` | تعريف الشهور وحالتها (OPEN/CLOSED). |
| `fin_fiscal_periods_lang`| ترجمة اسم الفترة. |

### 3.5 الضرائب (`fin_tax_codes` & `_lang`)

| الجدول | الوصف |
|--------|-------|
| `fin_tax_codes` | الكود، النسبة، حساب الضريبة. |
| `fin_tax_codes_lang` | ترجمة اسم الضريبة. |

### 3.6 الكيانات (`fin_entities` & `_lang`)

| الجدول | الوصف |
|--------|-------|
| `fin_entity_types` | أنواع الكيانات (عميل/مورد). |
| `fin_entity_types_lang` | ترجمة الأنواع. |
| `fin_entities` | السجل الموحد للكيان + الرقم الضريبي. |
| `fin_entities_lang` | ترجمة اسم الكيان (شركة أرامكو / Aramco). |

### 3.7 دليل الحسابات (`fin_chart_of_accounts` & `_lang`)

| العمود (في الجدول الرئيسي) | الوصف |
|--------------------------|-------|
| `code` | رقم الحساب. |
| `name` | الاسم الافتراضي. |
| `account_type` | **نوع الحساب** (`ASSETS`, `LIABILITIES`, `EQUITY`, `REVENUE`, `EXPENSE`). |
| `parent_id` / `report_type` | الهيكلية والنوع. |
| **`fin_chart_of_accounts_lang`** | **جدول الترجمة المساند**. |

### 3.8 مراكز التكلفة (`fin_cost_centers` & `_lang`)

| الجدول | الوصف |
|--------|-------|
| `fin_cost_centers` | شجرة مراكز التكلفة. |
| `fin_cost_centers_lang` | ترجمة أسماء المراكز. |

---

## 4. المحاسبة التحليلية والموازنات

### 4.1 الخطط والحسابات (`fin_analytic_*`)

| الجدول | الوصف |
|--------|-------|
| `fin_analytic_plans` | خطط التحليل (مشاريع). (+ `_lang`) |
| `fin_analytic_accounts` | عناصر التحليل. (+ `_lang`) |
| `fin_analytic_lines` | التوزيع الفعلي (بدون lang). |

### 4.2 الموازنات (`fin_budgets`)

| الجدول | الوصف |
|--------|-------|
| `fin_budgets` | رأس الموازنة. (+ `_lang`) |
| `fin_budget_lines` |، تفاصيل الموازنة. |

---

## 5. العمليات اليومية (Daily Operations)

### 5.1 رؤوس القيود (`fin_journal_headers`)

| العمود | النوع | الوصف |
|--------|-------|-------|
| `journal_type_id` | UUID | نوع الدفتر (يحدد السيريال). |
| `gl_sequence` | string | رقم القيد المولد تلقائياً (SALE-001). |
| `journal_date` | date | تاريخ القيد المحاسبي. |
| `source_module` | string | المصدر (SALES, PURCHASE...). |
| `source_id` | string | معرف المستند الأصلي (UUID الفاتورة). |
| `reversal_of_journal_id` | UUID | **(جديد)** رابط القيد الأصلي (في حال العكس). |
| `reversal_date` | date | **(جديد)** تاريخ عكس القيد. |
| `batch_run_id` | UUID | **(جديد)** رابط دفعة الترحيل (Batch). |
| `status` | enum | `DRAFT`, `POSTED`, `VOID`. |

### 5.2 بنود القيود (`fin_journal_lines`)

| العمود | النوع | الوصف |
|--------|-------|-------|
| `header_id` | UUID | القيد الأب. |
| `account_id` | UUID | الحساب. |
| `entity_id` | UUID | الكيان (عميل/مورد). |
| `cost_center_id` | UUID | مركز التكلفة. |
| `debit_local` / `credit_local` | decimal | المبلغ بعملة الشركة. |
| `debit_foreign` / `credit_foreign` | decimal | المبلغ بالعملة الأجنبية. |
| `currency_id` | UUID | عملة السطر. |
| `exchange_rate` | decimal | سعر الصرف. |
| `due_date` | date | تاريخ الاستحقاق. |
| `tax_id` | UUID | كود الضريبة. |

### 5.3 تشغيلات الدفعات (`fin_batch_runs`)

**جديد**: لتجميع القيود وترحيلها ككتلة واحدة.

| العمود | النوع | الوصف |
|--------|-------|-------|
| `description` | string | وصف الدفعة. |
| `run_date` | datetime | تاريخ التشغيل. |
| `status` | enum | `PROCESSING`, `COMPLETED`. |
| `total_debit` / `credit` | decimal | إجمالي الدفعة. |

### 5.4 التسويات (`fin_reconciliations`)

| العمود | النوع | الوصف |
|--------|-------|-------|
| `reconcile_date` | date | تاريخ التسوية. |
| `total_amount` | decimal | المبلغ الإجمالي. |

### 5.5 بنود التسوية (`fin_reconciliation_items`)

| العمود | النوع | الوصف |
|--------|-------|-------|
| `reconciliation_id` | UUID | التسوية الأم. |
| `journal_line_id` | UUID | السطر المسوى. |
| `allocated_amount` | decimal | المبلغ المخصص. |

---

## 6. العمليات الدورية (Periodic Operations)

### 6.1 جدولة الاستحقاقات (`fin_accrual_schedules`)

**جديد**: لتوزيع المصاريف (الإيجار) أو الإيرادات على أشهر.

| العمود | النوع | الوصف |
|--------|-------|-------|
| `source_journal_line_id` | UUID | سطر المصروف الأصلي. |
| `months` | int | عدد الأشهر. |
| `monthly_amount` | decimal | المبلغ الشهري. |
| `deferred_account_id` | UUID | حساب الميزانية (مقدم/مستحق). |
| `target_account_id` | UUID | حساب الأرباح والخسائر. |

### 6.2 أقساط الاستحقاق (`fin_accrual_schedule_items`)

| العمود | النوع | الوصف |
|--------|-------|-------|
| `schedule_id` | UUID | الجدول الأم. |
| `due_date` | date | تاريخ استحقاق القسط. |
| `generated_journal_id` | UUID | القيد المولد (عند الاستحقاق). |

### 6.3 القيود المتكررة (`fin_journal_templates`)

| الجدول | الوصف |
|--------|-------|
| `fin_journal_templates` | القوالب (+ `_lang`). |
| `fin_journal_template_lines` | بنود القالب (Fixed/Percent). |
| `fin_recurring_schedules` | الجدولة (توليد دوري). |

---

## 7. إدارة النقد والشيكات (Cash & Cheque Management)

### 7.1 إدارة الشيكات (`fin_cheques`)

**الهدف**: متابعة دورة حياة الشيكات (الواردة والصادرة) بدقة.

| العمود | النوع | الوصف |
|--------|-------|-------|
| `cheque_number` | string | رقم الشيك. |
| `due_date` | date | تاريخ الاستحقاق. |
| `amount` | decimal | القيمة. |
| `beneficiary` | string | المستفيد / الساحب. |
| `status` | enum | `ON_HAND`, `DEPOSITED`, `CLEARED`, `BOUNCED`... |
| `type` | enum | `INBOUND` (قبض), `OUTBOUND` (صرف). |
| `journal_line_id` | UUID | رابط القيد المحاسبي الحالي. |

### 7.2 سجل تتبع الشيكات (`fin_cheque_history`)

**الهدف**: تتبع من قام بتغيير حالة الشيك ومتى (Audit Trail).

| العمود | النوع | الوصف |
|--------|-------|-------|
| `cheque_id` | UUID | الشيك. |
| `status_from` / `status_to` | string | التحول في الحالة (من مودع -> مرتجع). |
| `changed_by` | UUID | المستخدم. |
| `notes` | string | سبب التغيير (مثلاً: رفض البنك للتوقيع). |

### 7.3 كشوف الحسابات البنكية (`fin_bank_statements`)

**الهدف**: استيراد كشف البنك للمطابقة.

| العمود | النوع | الوصف |
|--------|-------|-------|
| `account_id` | UUID | حساب البنك في النظام. |
| `start_balance` / `end_balance` | decimal | الرصيد الافتتاحي والنهائي (للمطابقة). |
| `status` | enum | `DRAFT`, `RECONCILED`. |

### 7.4 بنود كشف البنك (`fin_bank_statement_lines`)

**الهدف**: الحركات التفصيلية الواردة من البنك.

| العمود | النوع | الوصف |
|--------|-------|-------|
| `reference` | string | المرجع البنكي. |
| `amount` | decimal | المبلغ (موجب إيداع، سالب سحب). |
| `is_reconciled` | bit | هل تمت مطابقته؟ |
| `matched_journal_line_id` | UUID | السطر المقابل في دفترنا (القيد). |

---

## 8. التقارير المالية الديناميكية (Dynamic Reporting)

لتمكين المستخدم من بناء قوائمه المالية بنفسه (مثل الميزانية العمومية وقائمة الدخل) دون تعديلات برمجية.

### 8.1 قوالب التقارير (`fin_report_layouts`)

| العمود | النوع | الوصف |
|--------|-------|-------|
| `name` | string | اسم التقرير (مثلاً: الميزانية العمومية 2024). |
| `type` | enum | `BALANCE_SHEET`, `PROFIT_LOSS`, `CASH_FLOW`. |
| `is_system` | bit | هل هو تقرير نظام (لا يحذف)؟ |

### 8.2 بنود القوالب (`fin_report_layout_lines`)

تحدد محتوى كل سطر في التقرير.

| العمود | النوع | الوصف |
|--------|-------|-------|
| `sequence` | int | ترتيب العرض. |
| `label` | string | العنوان (مثلاً: الأصول المتداولة). |
| `rule_type` | enum | `ACCOUNT_TYPE`, `ACCOUNT_RANGE`, `FORMULA`. |
| `rule_value` | string | القيمة (مثلاً: `ASSETS`, أو `TOTAL_A + TOTAL_B`). |
| `sign_reversal` | bit | قلب الإشارة (لعرض المبيعات الدائنة كموجب). |

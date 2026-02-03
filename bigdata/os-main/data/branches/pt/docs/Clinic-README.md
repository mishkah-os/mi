 — ده **شرح عملي لكل جدول** في الهيكل (v3) “Vertical Grid + Intersection”، مع توضيح دوره داخل الـ ERP الطبي + أهم العلاقات والقيود (PK/FK/Unique)     لمنع الدوبلكيت والربط.

---

## 1) Multi-Tenant & Global

### **companies** — الشركات

* **وظيفته:** تعريف الشركة/الكيان (Tenant) اللي كل بيانات العيادة بتتبني تحته.
* **يرتبط بـ:** أغلب الجداول عبر `company_id`.
* **قيود مهمة:** `PK(id)`، و **Unique** على `name_ar` لمنع تكرار اسم شركة. *(UQ: name_ar)*

### **branches** — الفروع

* **وظيفته:** فروع الشركة (مكان التشغيل الفعلي).
* **يرتبط بـ:** `companies` عبر `company_id`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار اسم/كود الفرع داخل نفس الشركة. *(UQ: company_id+name_ar, company_id+code)*

### **users** — المستخدمين

* **وظيفته:** المستخدمين (استقبال/أطباء/أوبريتور/إدارة…).
* **يرتبط بـ:** `companies`، و`branches` (اختياري)، و`clinic_specialties` (اختياري).
* **قيود مهمة:** `PK(id)` + فهارس لتسريع الاستعلامات حسب الشركة/الفرع.

---

## 2) الإعدادات الطبية والكتالوج

### **clinic_specialties** — تخصصات الأطباء

* **وظيفته:** قاموس تخصصات (علاج طبيعي، سمنة…).
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة لمنع تكرار اسم التخصص. *(UQ: company_id+name_ar)*

### **clinic_service_domains** — مجالات الخدمات

* **وظيفته:** تصنيف الخدمات (Slimming/Therapy/Recovery…).
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة لمنع تكرار `code` و`name_ar`. *(UQ: company_id+code, company_id+name_ar)*

### **clinic_types** — أنواع الأقسام/العيادات

* **وظيفته:** تعريف نوع العيادة/القسم (ومدة قياسية).
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة لمنع تكرار `type_name`. *(UQ: company_id+type_name)*

### **clinic_rooms** — الغرف/العيادات

* **وظيفته:** الغرفة/العيادة الفعلية داخل الفرع.
* **يرتبط بـ:** `companies`, `branches`, `clinic_types`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الفرع لمنع تكرار اسم الغرفة + داخل الفرع للكود لو موجود. *(UQ: branch_id+room_name, branch_id+room_code)*

### **clinic_stations** — الأسرة/المحطات داخل الغرفة

* **وظيفته:** تقسيم الغرفة لمحطات (Beds/Stations) اللي عليها Slots.
* **يرتبط بـ:** `companies`, `clinic_rooms`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الغرفة لمنع تكرار اسم/كود المحطة. *(UQ: room+station_name, room+station_code)*

### **clinic_services** — الخدمات (Catalog)

* **وظيفته:** كتالوج الخدمات (سعر + مدة + نوع القسم + مجال الخدمة + هل هي باكدج).
* **يرتبط بـ:** `companies`, `clinic_types`, `clinic_service_domains`.
* **منطق مهم:**

  * `is_package` يحدد هل الخدمة قابلة لعمل باكدجات.
  * `min_duration_with_others` يدعم اختزال مدة الخدمة عند دمجها مع خدمات أخرى.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار كود الخدمة واسمها داخل الشركة. *(UQ: company_id+code, company_id+service_name)*

### **clinic_service_packages** — باكدجات الخدمة (Header)

* **وظيفته:** تعريف “باكدج” مرتبط بخدمة معينة (اسم باكدج).
* **يرتبط بـ:** `companies`, `clinic_services`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة (وبداخل الخدمة) لمنع تكرار اسم الباكدج لنفس الخدمة. *(UQ: company_id+service+package_name)*

### **clinic_service_package_tiers** — شرائح الباكدج (3/6/9/12…)

* **وظيفته:** مستويات الباكدج (عدد جلسات + سعر إجمالي + خصم + افتراضي).
* **يرتبط بـ:** `companies`, `clinic_service_packages`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار نفس `sessions_count` لنفس الباكدج. *(UQ: package+sessions_count)*

### **clinic_devices** — الأجهزة (Assets)

* **وظيفته:** تعريف الأجهزة المستخدمة في خطوات البروتوكول (ليزر/كرايو…).
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة لمنع تكرار الاسم/الكود. *(UQ: company_id+device_name, company_id+code)*

### **clinic_protocol_templates** — قوالب البروتوكول (Header)

* **وظيفته:** Template لبروتوكول خدمة معينة (مع Version + Default).
* **يرتبط بـ:** `companies`, `clinic_services`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار نفس (Service + Version). *(UQ: service+version_no)*

### **clinic_protocol_template_steps** — خطوات البروتوكول (Template Steps)

* **وظيفته:** خطوات مرتبة داخل Template (اسم خطوة + جهاز افتراضي + مدة + يمكن بالتوازي).
* **يرتبط بـ:** `companies`, `clinic_protocol_templates`, `clinic_devices`(اختياري).
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار `order_seq` داخل نفس الـ Template. *(UQ: protocol_template+order_seq)*

### **clinic_items** — خامات/مستهلكات

* **وظيفته:** تعريف المستهلكات وقطع الغيار التي تُصرف أثناء الزيارة.
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة للاسم والكود. *(UQ: company_id+item_name, company_id+code)*

---

## 3) Scheduling (Vertical Grid) + Doctor Setup

### **ref_week_days** — أيام الأسبوع

* **وظيفته:** جدول مرجعي ثابت لأيام الأسبوع (للتيمبلتات والدوام).
* **قيود مهمة:** `PK(id)`.

### **clinic_room_open_hours** — مواعيد عمل الغرف

* **وظيفته:** ساعات فتح/غلق الغرفة لكل يوم أسبوع (Master Schedule للغرفة).
* **يرتبط بـ:** `companies`, `clinic_rooms`, `ref_week_days`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار (Room + Day). *(UQ: room+day)*

### **clinic_doctors** — ملف الطبيب (Extension)

* **وظيفته:** امتداد لجدول `users` لإضافة خصائص الطبيب (تخصص/غرفة افتراضية).
* **يرتبط بـ:** `companies`, `users`, `clinic_specialties`(اختياري), `clinic_rooms`(اختياري).
* **قيود مهمة:** `PK(id)`، و **Unique** يضمن علاقة 1:1 مع `users`. *(UQ: user)*

### **clinic_doctor_schedule_templates** — قوالب جدول الطبيب (Header)

* **وظيفته:** Template لجدول الطبيب مع فترة صلاحية (valid_from/to) + Default.
* **يرتبط بـ:** `companies`, `clinic_doctors`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار اسم Template لنفس الطبيب. *(UQ: doctor+template_name)*

### **clinic_doctor_schedule_template_lines** — خطوط قالب جدول الطبيب

* **وظيفته:** تفاصيل الدوام: يوم + غرفة + شيفت من/إلى + override لمدة الـ slot.
* **يرتبط بـ:** `companies`, `clinic_doctor_schedule_templates`, `ref_week_days`, `clinic_rooms`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار نفس (Template + Day + Room + Shift). *(UQ: template+day+room+shift_start+shift_end)*

### **clinic_holidays** — الإجازات الرسمية

* **وظيفته:** تعطيلات عامة للشركة (كاملة اليوم أو جزئية بـ from_time/to_time).
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس الإجازة بنفس توقيتها داخل الشركة. *(UQ: company_id+holiday_date+from_time+to_time)*

### **clinic_doctor_leaves** — غياب/إجازات الأطباء

* **وظيفته:** غياب طبيب (كامل اليوم أو جزئي) يؤثر على الـ Slots.
* **يرتبط بـ:** `companies`, `clinic_doctors`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس الغياب لنفس الطبيب بنفس توقيته. *(UQ: doctor+leave_date+from_time+to_time)*

### **clinic_slots_inventory** — مخزون المواعيد (Generated Vertical Grid)

* **وظيفته:** ده “المخزون” اللي بيتولد مسبقاً: كل Slot (دكتور + محطة + وقت).
* **يرتبط بـ:** `companies`, `branches`, `clinic_doctors`, `clinic_stations`, و`users` (للإلغاء).
* **منطق مهم (Reschedule Nightmare):**

  * `slot_status`: قيم زي **Available/Booked/Blocked/Cancelled** بدل الاعتماد على `is_booked` فقط.
  * عند غياب/تعديل جدول: تعمل Update للـ Available → Blocked، والـ Booked تتطلب متابعة وتنبيه.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس Slot لنفس المحطة/الدكتور. *(UQ: company_id+station+slot_date+slot_time_start, company_id+doctor+slot_date+slot_time_start)*
  *(وموجود فهارس لتسريع البحث حسب التاريخ/الحالة والدكتور)*

---

## 4) Patients + Contracts + Tickets

### **clinic_patients** — المرضى

* **وظيفته:** ملف المريض + بيانات التواصل + الخصوصية (consent_date/type) + كود مريض.
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار كود/موبايل داخل الشركة (إن وُجد). *(UQ: company_id+patient_code, company_id+mobile)*

### **clinic_contracts_header** — العقود/الخطط (Header)

* **وظيفته:** عقد علاج للمريض داخل فرع (إجمالي مبلغ + حالة عقد).
* **يرتبط بـ:** `companies`, `branches`, `clinic_patients`, `users` (من أنشأ).
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس (Patient + Contract Date) داخل الفرع. *(UQ: branch_id+patient+contract_date)*

### **clinic_contracts_lines** — بنود العقد (Lines)

* **وظيفته:** خدمات العقد + عدد جلسات لكل خدمة + سعر إجمالي + Frequency.
* **يرتبط بـ:** `companies`, `clinic_contracts_header`, `clinic_services`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس الخدمة داخل نفس العقد. *(UQ: contract+service)*

### **clinic_session_tickets** — تذاكر جلسات العقد (Expanded Sessions)

* **وظيفته:** تفريد جلسات العقد: جلسة 1..N لكل بند (عشان المتابعة الدقيقة).
* **يرتبط بـ:** `companies`, `clinic_contracts_lines`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس رقم الجلسة داخل نفس بند العقد. *(UQ: contract_line+session_sequence)*

### **clinic_visit_tickets** — تذاكر الزيارات (Visit Ticket)

* **وظيفته:** “زيارة” قابلة للحجز على Slot، وقد تشمل عدة Sessions + خدمات إضافية.
* **يرتبط بـ:** `companies`, `clinic_contracts_header`, `clinic_patients`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار رقم الزيارة داخل نفس العقد. *(UQ: contract+visit_sequence)*

### **clinic_visit_ticket_session_links** — ربط الزيارة بجلسات العقد

* **وظيفته:** يربط Visit Ticket بمجموعة Session Tickets (بدون Nulls).
* **يرتبط بـ:** `companies`, `clinic_visit_tickets`, `clinic_session_tickets`.
* **منطق مهم:** Session Ticket لا يجب أن تُستخدم في أكثر من زيارة.
* **قيود مهمة:** `PK(id)`، و **Unique** لضمان:

  * كل Session Ticket ترتبط مرة واحدة فقط. *(UQ: session_ticket)*
  * وعدم تكرار نفس الربط داخل الزيارة. *(UQ: visit_ticket+session_ticket)*

### **clinic_visit_ticket_adhoc_services** — خدمات إضافية داخل الزيارة (بدون عقد)

* **وظيفته:** خدمات “مرة واحدة” تُضاف للزيارة (مثل خدمة إضافية مدفوعة).
* **يرتبط بـ:** `companies`, `clinic_visit_tickets`, `clinic_services`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس الخدمة مرتين لنفس الزيارة. *(UQ: visit_ticket+service)*

---

## 5) Intersection Layer: Booking + Check-in

### **clinic_bookings** — الحجوزات (Intersection)

* **وظيفته:** قلب المعمارية: **يربط Slot واحد بـ Visit Ticket واحد**.
* **يرتبط بـ:** `companies`, `branches`, `clinic_slots_inventory`, `clinic_visit_tickets`, `users`.
* **قيود مهمة:** `PK(id)`، و **Unique** يضمن:

  * Slot لا يتحجز إلا مرة. *(UQ: slot)*
  * Visit Ticket لا تتحجز إلا مرة. *(UQ: visit_ticket)*

### **clinic_checkins** — الحضور (Check-in)

* **وظيفته:** تسجيل وصول المريض للموعد (وقت وصول + من سجّل).
* **يرتبط بـ:** `companies`, `branches`, `clinic_bookings`, `users`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع أكثر من Check-in لنفس الحجز. *(UQ: booking)*

---

## 6) Billing: Invoices + Payments + Wallet Ledger

### **clinic_invoices_header** — الفواتير (Header)

* **وظيفته:** فاتورة إمّا:

  * **بالزيارة** (مرتبطة بـ `booking`)
  * أو **باكدج/عقد مسبق الدفع** (مرتبطة بـ `contract`)
* **حقول محورية:** `invoice_scope` (booking/contract)، و`invoice_no`.
* **يرتبط بـ:** `companies`, `branches`, `clinic_bookings`(اختياري), `clinic_contracts_header`(اختياري), `users`.
* **منطق مهم:** لازم يتحقق XOR: يا booking يا contract (مش الاتنين).
* **قيود مهمة:** `PK(id)`، و **Unique**:

  * فاتورة واحدة لكل Booking. *(UQ: booking)*
  * رقم فاتورة مميز داخل الشركة/الفرع. *(UQ: company_id+branch_id+invoice_no)*
    *(ملحوظة: لو قاعدة بيانات تمنع تكرار NULL في Unique، طبّق Filter/Partial Unique على الحقول الاختيارية)*

### **clinic_invoices_lines** — الفواتير (Lines)

* **وظيفته:** بنود الفاتورة: خدمة + كمية + سعر + إجمالي.
* **يرتبط بـ:** `companies`, `clinic_invoices_header`, `clinic_services`.
* **قيود مهمة:** `PK(id)`.

### **clinic_payments** — المدفوعات (Payments)

* **وظيفته:** حركات دفع على الفاتورة (كاش/فيزا/تحويل…).
* **يرتبط بـ:** `companies`, `branches`, `clinic_invoices_header`, `users`.
* **منطق مهم:** يدعم منع تكرار دفع مُعاد من بوابة دفع عبر `request_uid/external_ref`.
* **قيود مهمة:** `PK(id)`، و **Unique**:

  * منع تكرار `request_uid` داخل الشركة. *(UQ: company_id+request_uid)*
  * منع تكرار `external_ref` داخل الشركة. *(UQ: company_id+external_ref)*

### **clinic_patient_ledger** — محفظة/دفتر المريض (Wallet Ledger)

* **وظيفته:** أهم جدول لسد ثغرة الـ Prepaid:

  * العقد/الباكدج يُسجل **Debit**
  * الدفع يُسجل **Credit**
  * الزيارات/الاستهلاك تخصم من الرصيد
* **يرتبط بـ:** `companies`, `branches`, `clinic_patients`, `clinic_contracts_header`(اختياري), `clinic_bookings`(اختياري), `clinic_invoices_header`(اختياري), `users`.
* **منطق مهم:** كل حركة تكون دائن أو مدين (مش الاتنين) — تُنفذ كـ Check/Trigger حسب DB.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار الحركة القادمة من نفس Request. *(UQ: company_id+request_uid)*

---

## 7) Visit Execution: Progress + Consumables

### **clinic_visit_progress_header** — سجل الزيارة (Progress Header)

* **وظيفته:** فتح/قفل الزيارة فعلياً (Started/Ended) وتسجيل ملاحظات.
* **يرتبط بـ:** `companies`, `clinic_bookings`.
* **قيود مهمة:** `PK(id)`، و **Unique** Progress واحد لكل Booking. *(UQ: booking)*

### **clinic_visit_progress_steps** — خطوات الزيارة الفعلية

* **وظيفته:** تنفيذ خطوات البروتوكول فعلياً (Start/End/Duration) + من نفّذ + جهاز مستخدم.
* **يرتبط بـ:** `companies`, `clinic_visit_progress_header`, `clinic_devices`(اختياري), `users`(operator اختياري).
* **منطق مهم:**

  * `step_type` لتحديد هل الخطوة Device ولا Manual… (مهم للحوافز).
  * `order_seq` لترتيب الخطوات.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار رقم ترتيب الخطوة داخل نفس Progress. *(UQ: progress+order_seq)*

### **clinic_visit_consumables** — مستهلكات تم صرفها داخل الزيارة

* **وظيفته:** تسجيل ما تم صرفه من خامات أثناء زيارة مرتبطة بـ Booking.
* **يرتبط بـ:** `companies`, `clinic_bookings`, `clinic_items`, `users`(اختياري).
* **قيود مهمة:** `PK(id)`.

---

## 8) Incentives / Commissions (الحوافز)

### **clinic_incentive_rules** — قواعد الحوافز

* **وظيفته:** تعريف قواعد الحافز (per_device / per_minute / fixed) مع `value` وربط اختياري بجهاز.
* **يرتبط بـ:** `companies`, `clinic_devices`(اختياري).
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار اسم القاعدة داخل الشركة. *(UQ: company_id+rule_name)*

### **clinic_incentive_transactions** — حركات الحوافز (Auto Calculated)

* **وظيفته:** نتائج الحساب الفعلي للحوافز بعد اكتمال Step (خصوصاً device steps).
* **يرتبط بـ:** `companies`, `clinic_incentive_rules`, `clinic_visit_progress_steps`, `users`.
* **منطق مهم:** Trigger/Job بعد `end_time` يحسب ويسجل هنا بدل الحساب اليدوي.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار نفس الحافز لنفس (Step + Rule + User)، وأيضاً منع تكرار `request_uid`. *(UQ: company_id+progress_step+rule+user, company_id+request_uid)*

---

## 9) Exercises & Patient Programs

### **clinic_exercise_library** — مكتبة التمارين

* **وظيفته:** كتالوج تمارين (اسم/جزء الجسم/فيديو/وصف).
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** داخل الشركة لمنع تكرار اسم التمرين. *(UQ: company_id+exercise_name)*

### **clinic_patient_exercise_programs** — برامج التمارين للمريض

* **وظيفته:** برنامج تمارين مرتبط بمريض (وممكن عقد) مع `share_token` لمشاركة البرنامج.
* **يرتبط بـ:** `companies`, `clinic_patients`, `clinic_contracts_header`(اختياري).
* **قيود مهمة:** `PK(id)`، و **Unique**:

  * `share_token` فريد عالميًا. *(UQ: share_token)*
  * اسم البرنامج لا يتكرر لنفس المريض. *(UQ: patient+program_name)*

### **clinic_patient_exercise_program_lines** — تفاصيل برنامج التمارين

* **وظيفته:** عناصر البرنامج: تمرين + reps/sets + تكرار أسبوعي + ترتيب.
* **يرتبط بـ:** `companies`, `clinic_patient_exercise_programs`, `clinic_exercise_library`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار نفس التمرين داخل نفس البرنامج. *(UQ: program+exercise)*

### **clinic_patient_exercise_logs** — تسجيل تنفيذ التمارين

* **وظيفته:** تسجيل التزام المريض: يوم التنفيذ + done_count + وقت بداية/نهاية.
* **يرتبط بـ:** `companies`, `clinic_patient_exercise_program_lines`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار Log لنفس Program Line في نفس اليوم. *(UQ: program_line+log_date)*

---

## 10) Online Booking + Notifications + Feedback

### **clinic_online_booking_requests** — طلبات الحجز الأونلاين

* **وظيفته:** طلب حجز (Pending/Approved/…)، مدخل للحجز الخارجي مع `share_link`.
* **يرتبط بـ:** `companies`, `clinic_patients`, `clinic_services`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار `request_uid` داخل الشركة. *(UQ: company_id+request_uid)*

### **clinic_notification_templates** — قوالب الرسائل

* **وظيفته:** Templates للإرسال (WhatsApp/SMS/Email) عبر `template_code`.
* **يرتبط بـ:** `companies`.
* **قيود مهمة:** `PK(id)`، و **Unique** على `template_code`. *(UQ: template_code)*
  *(ملاحظة تصميم: لو عايز Multi-tenant بالكامل، الأفضل يكون Unique = company_id+template_code)*

### **clinic_notification_queue** — طابور الإشعارات

* **وظيفته:** Queue للإرسال المجدول مع retries (`attempts`) وتسجيل `sent_at/response_code/provider_message_id`.
* **يرتبط بـ:** `companies`, `clinic_patients`, `clinic_notification_templates`.
* **قيود مهمة:** `PK(id)`، و **Unique** لمنع تكرار نفس الرسالة عبر `dedupe_key`. *(UQ: company_id+dedupe_key)*

### **clinic_feedback** — تقييم الخدمة

* **وظيفته:** تقييم المريض بعد انتهاء الزيارة (rating/comment).
* **يرتبط بـ:** `companies`, `clinic_bookings`, `clinic_patients`.
* **قيود مهمة:** `PK(id)`، و **Unique** يمنع تكرار تقييم لنفس Booking. *(UQ: booking)*

---

## 11) Auditing

### **clinic_audit_logs** — سجل التدقيق

* **وظيفته:** تتبع أي Insert/Update/Delete: الجدول + record_id + المستخدم + changes_json + timestamp.
* **يرتبط بـ:** `companies`, `users`(اختياري).
* **قيود مهمة:** `PK(id)` + فهرس قوي للتصفية حسب (table_name, record_id, timestamp).

---

### ملاحظة ختامية مهمة (علشان “تقفل الثغرات” فعلاً)

* الجداول اللي فيها **حقول اختيارية** داخل Unique (زي `booking` في invoices) لو قاعدة البيانات عندك بتعامل NULL بشكل “مُقيِّد”، طبّق **Filtered/Partial Unique Index** أو enforce من التطبيق/Trigger.
* حقول الـ `status` الموجودة كـ nvarchar: تقدر لاحقًا تعمل جدول `ref_statuses` لو عايز **توحيد قيم الحالة + ترجمة UI** بدون قيم عشوائية.

------

1. **شرح لكل جدول “إيه بيعمل”** (الهيكل الحالي v3) مختصر
2. **تعديل بروفايل العميل/المريض** بإضافة جداول تعريفية (Lookup) + مفاتيح خارجية FK + جداول ربط (M2M) للبيانات التصنيفية (v4)

---

## شرح كل جدول وماذا يفعل

### 1) الأساس (Multi-Tenant / إدارة النظام)

* **companies**: شركة/عميل النظام (Tenant). كل بيانات العيادة مربوطة بـ company_id.
* **branches**: فروع الشركة (العبور/التجمع…)، ويُستخدم في الحجز والخدمات والمناطق.
* **users**: مستخدمي النظام (دكتور/استقبال/إدارة…).

### 2) الدليل الطبي والخدمات (Catalog)

* **clinic_specialties**: تخصصات (علاج طبيعي/تخسيس/…)، تربط بالأطباء والخدمات.
* **clinic_service_domains**: نطاق الخدمة (Slimming / Physio / …) لتجميع الخدمات وتصنيفها.
* **clinic_types**: نوع العيادة/القسم (للتقسيم الإداري والتنظيمي).
* **clinic_rooms**: الغرف داخل الفرع (غرفة علاج/غرفة قياسات…).
* **clinic_stations**: “محطة/سرير/جهاز” داخل الغرفة يُستخدم لتوليد الـ Slots.
* **clinic_services**: الخدمات الفعلية (كشف/جلسة/إنبودي…)، تسعيرها ومدة تنفيذها وربطها بالبروتوكولات.
* **clinic_service_packages**: باقات مرتبطة بخدمة (Package Header).
* **clinic_service_package_tiers**: شرائح/مستويات الباقة (عدد جلسات، إجمالي سعر…).
* **clinic_devices**: الأجهزة الطبية/الليزر/… لاستخدامها في خطوات البروتوكول والمتابعة.
* **clinic_protocol_templates**: قالب بروتوكول للخدمة (خطة تنفيذ قياسية).
* **clinic_protocol_template_steps**: خطوات البروتوكول (ترتيب، جهاز، زمن…).
* **clinic_items**: المستلزمات/المستهلكات (جل/شاش/…)، تُستخدم في تسجيل الاستهلاك لكل زيارة.

### 3) التقويم والمواعيد (Scheduling)

* **ref_week_days**: مرجع ثابت لأيام الأسبوع.
* **clinic_room_open_hours**: ساعات عمل الغرف حسب اليوم/الفترة.
* **clinic_doctors**: بروفايل الطبيب (مرتبط بالمستخدم/التخصص/الفرع…).
* **clinic_doctor_schedule_templates**: قالب جدول للطبيب (Template).
* **clinic_doctor_schedule_template_lines**: تفاصيل القالب (اليوم، الغرفة، فترات العمل…).
* **clinic_holidays**: الإجازات الرسمية/إغلاق العيادة.
* **clinic_doctor_leaves**: إجازات الطبيب الخاصة.
* **clinic_slots_inventory**: مخزون الـ Slots المولّد (الدكتور/الغرفة/المحطة/التاريخ/الحالة) — ده أساس الحجز.

### 4) المرضى/العملاء (Patients)

* **clinic_patients**: المريض/العميل (Master) + بياناته الأساسية + (بعد التعديل v4 أضفنا بروفايل غني بـ FKs).
* **clinic_patient_ledger**: دفتر حساب المريض (Wallet/Ledger) حركات مدينة/دائنة وربطها بفواتير/عقود.

### 5) التعاقدات والزيارات (Sales / Visits)

* **clinic_contracts_header**: عقد/باقة مباعة للمريض (Header).
* **clinic_contracts_lines**: تفاصيل العقد (الخدمة، عدد الجلسات، السعر…).
* **clinic_session_tickets**: “تيكت جلسة” يتولد من العقد لاستهلاك الجلسات بطريقة دقيقة.
* **clinic_visit_tickets**: تيكت الزيارة (النية للحضور) وقد يستهلك أكثر من Session Ticket.
* **clinic_visit_ticket_session_links**: ربط الزيارة بالجَلسات المستهلكة (consumption).
* **clinic_visit_ticket_adhoc_services**: خدمات إضافية على الزيارة (Upsell/Extra).
* **clinic_bookings**: الحجز الفعلي: ربط Slot بزيارة (الكيان المركزي للمواعيد).
* **clinic_checkins**: تسجيل حضور (Check-in) لحجز معيّن.

### 6) الفواتير والتحصيل (Billing)

* **clinic_invoices_header**: رأس الفاتورة (قد تكون مرتبطة بـ Booking أو Contract).
* **clinic_invoices_lines**: بنود الفاتورة (خدمة/باقة/مستلزم…).
* **clinic_payments**: المدفوعات على الفواتير (طرق دفع/مراجع خارجية…).

### 7) تنفيذ الخدمة والمتابعة (Execution / Progress)

* **clinic_visit_progress_header**: متابعة تنفيذ الحجز (بداية/نهاية/ملاحظات).
* **clinic_visit_progress_steps**: تنفيذ خطوات البروتوكول فعليًا (وقت/جهاز/منفّذ…).
* **clinic_visit_consumables**: المستهلكات التي استُخدمت في الزيارة.
* **clinic_feedback**: تقييم المريض بعد الزيارة/الحجز.

### 8) التمارين (Physio Exercises)

* **clinic_exercise_library**: مكتبة التمارين.
* **clinic_patient_exercise_programs**: برنامج تمارين للمريض + مشاركة عبر token.
* **clinic_patient_exercise_program_lines**: تفاصيل البرنامج (التمارين/التكرارات…).
* **clinic_patient_exercise_logs**: لوج تنفيذ المريض للتمارين.

### 9) الإشعارات والعمولات والأتمتة

* **clinic_notification_templates**: قوالب رسائل (SMS/WhatsApp/Email…).
* **clinic_notification_queue**: طابور الإرسال + الحالة + إعادة المحاولة.
* **clinic_incentive_rules**: قواعد عمولة/حوافز (للطبيب/الأخصائي…).
* **clinic_incentive_transactions**: حركات الحوافز الفعلية الناتجة من خطوات/زيارات.
* **clinic_online_booking_requests**: طلبات حجز أونلاين قبل تحويلها لحجز فعلي.
* **clinic_audit_logs**: سجل تدقيق تغييرات (مين عمل إيه ومتى).

---

## تركيزنا: بروفايل العميل (Diet vs Full_Data)

* **Diet Sheet (CSV)**: ده عملي/تشغيلي (جلسات + رسوم + حالة…) وليس بروفايل.
* **Patients Data (Full_Data XLSX)**: ده فيه **بروفايل** (Gender/Occupation/Marital/Activity/Address/…)، وفيه أعمدة تقارير/تشخيص — أنت قلت مش محتاجينها الآن ✅

---

## التعديل v4: إثراء بروفايل المريض بـ Lookup + FK

### A) جداول تعريفية Lookup (تصنيفية)

أضفت الجداول دي (Company-scoped حيث يلزم):

* **ref_genders**: مرجع النوع.
* **ref_smoking_statuses**: مرجع حالة التدخين (Non-smoker/Smoker/Ex-smoker).
* **clinic_occupations**: المهن.
* **clinic_marital_statuses**: الحالة الاجتماعية.
* **clinic_activity_factors**: مستوى النشاط + factor_value اختياري.
* **clinic_areas**: مناطق/أحياء/عناوين قياسية (مع branch_id اختياري).
* **clinic_food_addiction_types**: أنواع إدمان السكر/الدهون… (حسب شيتك).
* **clinic_complaint_types**: تصنيفات الشكوى الرئيسية (اختياري لو حابب تعمل dropdown بدل free-text).
* **clinic_medical_conditions**: الأمراض/التاريخ المرضي.
* **clinic_medications**: الأدوية.
* **clinic_surgery_types**: أنواع العمليات/الإجراءات.
* **clinic_measurement_types**: أنواع القياسات (Weight/Height/…).

### B) تعديل جدول clinic_patients (إضافة FK + أعمدة بروفايل)

أضفت أعمدة بروفايل رئيسية (كلها Nullable لتسهيل الاستيراد تدريجيًا)، أهمها:

* **gender_id → ref_genders**
* **occupation_id → clinic_occupations**
* **marital_status_id → clinic_marital_statuses**
* **area_id → clinic_areas**
* **activity_factor_id → clinic_activity_factors**
* **smoking_status_id → ref_smoking_statuses**
* **food_addiction_type_id → clinic_food_addiction_types**
* **complaint_type_id → clinic_complaint_types**
* **children_count, weight_kg, height_cm, target_weight_kg, weight_at_21_kg, water_l_per_day**
* **had_previous_diet (bit)**
* **wake_up_time, sleep_time, last_meal_time**
* **address_text + chief_complaint**
* (اختياري للتوافق مع الشيت) **last_service_id / current_package_id / current_package_tier_id**

> ملحوظة مهمة: أنا **لم أحذف** عمود `gender` القديم الموجود عندك (نصي) عشان ما نكسرش القديم، لكن الأفضل تدريجيًا تعتمد على `gender_id`.

### C) جداول ربط M2M (بيانات متعددة القيم بدل Text)

بدل ما Medical History / Medications / Surgeries تبقى كلام في عمود واحد:

* **clinic_patient_conditions**: (patient ↔ condition) + notes
* **clinic_patient_medications**: (patient ↔ medication) + dose_notes
* **clinic_patient_surgeries**: (patient ↔ surgery_type) + date + notes
* **clinic_patient_measurements**: Timeline قياسات (patient ↔ measurement_type) + value + measure_date

---

## Mapping مباشر من شيت Patients Data إلى الهيكل الجديد

* Gender → `clinic_patients.gender_id`
* Occupation → `clinic_patients.occupation_id`
* Marital Status → `clinic_patients.marital_status_id`
* Children Count → `clinic_patients.children_count`
* Address → `clinic_patients.area_id` (والنص الخام في `address_text`)
* Activity Factor → `clinic_patients.activity_factor_id`
* Smoker (Y/N) → `clinic_patients.smoking_status_id`
* Previous Diet (Y/N) → `clinic_patients.had_previous_diet`
* Sugar/Fats Addict → `clinic_patients.food_addiction_type_id`
* Weight/Height/Target/Water… → أعمدة البروفايل + (اختياري) تسجيلها كذلك في `clinic_patient_measurements`
* Medical History → تفكيكها عناصر وتسجيلها في `clinic_patient_conditions`
* Medications → `clinic_patient_medications`
* Surgery History → `clinic_patient_surgeries`

---

لو تحب الخطوة التالية فورًا: أطلع لك **Script Import** (SQL Server أو PostgreSQL حسب نظامك) يقرأ الـ XLSX ويعمل:

1. Upsert للـ Lookup tables
2. Insert/Update للـ clinic_patients
3. تفكيك Medical History/Medications/Surgery إلى جداول الربط

قولي بس قاعدة البيانات عندك SQL Server ولا PostgreSQL.

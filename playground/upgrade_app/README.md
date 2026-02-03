# 📦 Mishkah Lab Upgrade Files

هذا المجلد يحتوي على كل الأكواد المطلوبة لترقية التطبيق بشكل منظم.

---

## 📝 ترتيب التنفيذ

نفذ الملفات **بالترتيب التالي**:

### 1️⃣ `1-state-update.js`
- **الهدف:** إضافة state fields جديدة
- **البحث عن:** `const database = {` ثم `showReadme: false,`
- **الإضافة:** 3 fields (activePreviewTab, showHistoryModal, codeHistory)

### 2️⃣ `2-handlers.js`
- **الهدف:** إضافة 5 handlers جديدة
- **البحث عن:** `const orders = {` ثم آخر handler
- **الإضافة:** save_as_standard, history.show, history.restore, history.close, app.reset

### 3️⃣ `3-autosave-update.js`
- **الهدف:** إضافة حفظ التاريخ في autoSave
- **البحث عن:** `const autoSave = debounce(` ثم نهاية الfunction
- **الإضافة:** كود حفظ history (6 أسطر)

### 4️⃣ `4-sidebar-footer.js`
- **الهدف:** استبدال footer Sidebar بأزرار منظمة
- **البحث عن:** `function Sidebar(db)` ثم آخر Div
- **الاستبدال:** كود Footer الجديد

### 5️⃣ `5-toolbar-update.js`
- **الهدف:** إضافة أزرار الكود وحذف الأزرار القديمة
- **البحث عن:** `function Toolbar(db)`
- **الإضافة:** Code Actions buttons
- **الحذف:** الأزرار القديمة من Right Actions

### 6️⃣ `6-preview-pane.js`
- **الهدف:** استبدال PreviewPane بنظام tabs
- **البحث عن:** `function PreviewPane(db)`
- **الاستبدال:** الfunction كاملة

### 7️⃣ `7-history-modal.js`
- **الهدف:** إضافة History Modal
- **البحث عن:** `function ExampleModal(db)` و `function MainLayout(db)`
- **الإضافة:** HistoryModal component و استدعاؤه في MainLayout

---

## ⚠️ ملاحظات مهمة

1. **عمل Backup:** تأكد من وجود backup قبل البدء ✅
2. **الترتيب مهم:** نفذ الملفات بالترتيب المذكور
3. **التعليقات:** كل ملف فيه تعليقات واضحة "ابحث عن إيه"
4. **الاختبار:** بعد كل مرحلة، شغل التطبيق للتأكد من عدم وجود أخطاء

---

## 🎯 النتيجة النهائية

بعد تطبيق كل الملفات:

### الأزرار الجديدة:
- **Sidebar Footer:**
  - ➕ Add Example
  - ✏️ Edit Example
  - ⬇️⬆️ Download/Import JSON
  - ☀️/🌙 Theme
  - EN/عر Language
  - 🔄 Reset All

- **Toolbar (Code Actions):**
  - ↩️ Reset Code
  - 💾 Save as Standard
  - 📜 History

- **Preview Tabs:**
  - ▶️ Execute
  - 📖 Code Wiki
  - ℹ️ Example Info
  - 📚 Full Wiki

### الميزات الجديدة:
✅ History tracking (آخر 20 تعديل)
✅ Save as Standard
✅ Reset All App Data
✅ Preview Tabs System
✅ WikiMini Integration

---

## 🐛 في حالة وجود مشاكل

1. **مسح البيانات:** اضغط Reset All
2. **الرجوع للbackup:** استعد من `app.js.backup-*`
3. **console.log:** تأكد من عدم وجود أخطاء في Console

---

**Good Luck! 🚀**

# نظام ERP لإدارة عيادات العلاج الطبيعي
## Physical Therapy Clinic ERP System

---

## 📋 نظرة عامة | Overview

نظام متكامل لإدارة عيادات العلاج الطبيعي مع موقع إلكتروني ثنائي اللغة (عربي/إنجليزي) مبني باستخدام **Mishkah.js** و **Mishkah Store**.

A comprehensive system for managing physical therapy clinics with a bilingual website (Arabic/English) built using **Mishkah.js** and **Mishkah Store**.

---

## ✨ المميزات | Features

### 🌐 الموقع الإلكتروني | Website

- ✅ واجهة ثنائية اللغة (عربي/إنجليزي) مع دعم RTL/LTR
- ✅ صفحة رئيسية جذابة مع معلومات العيادة
- ✅ عرض الخدمات المتاحة بشكل تفاعلي
- ✅ نموذج حجز مواعيد أونلاين
- ✅ قسم آراء المرضى
- ✅ معلومات الاتصال والعنوان
- ✅ تصميم متجاوب (Responsive) يعمل على جميع الأجهزة

### 💾 قاعدة البيانات | Database

نظام قاعدة بيانات شامل يتضمن 40+ جدول:

#### الجداول الأساسية | Core Tables
- **Companies** - إدارة معلومات العيادات
- **Users** - إدارة المستخدمين والصلاحيات
- **Roles** - الأدوار والصلاحيات

#### إدارة المرضى والأطباء | Patients & Doctors Management
- **Patients** + **Patients_lang** - بيانات المرضى مع دعم اللغات
- **Doctors** + **Doctors_lang** - بيانات الأطباء مع دعم اللغات
- **Doctor_Specializations** + **Doctor_Specializations_lang** - التخصصات
- **Medical_Chronic_Diseases** + **Medical_Chronic_Diseases_lang** - الأمراض المزمنة
- **Patient_Chronic_Diseases** - ربط المرضى بأمراضهم
- **Patient_Allergies** + **Patient_Allergies_lang** - حساسية المرضى

#### إدارة المواعيد والجلسات | Appointments & Sessions
- **Appointments** - حجز المواعيد
- **Sessions** + **Sessions_lang** - جلسات العلاج
- **Online_Bookings** - الحجوزات الأونلاين من الموقع

#### الخدمات والعلاجات | Services & Treatments
- **Services** + **Services_lang** - الخدمات المقدمة
- **Treatments** + **Treatments_lang** - أنواع العلاجات
- **Treatment_Plans** + **Treatment_Plans_lang** - خطط العلاج

#### السجلات الطبية | Medical Records
- **Medical_Records** + **Medical_Records_lang** - السجلات الطبية
- **Assessments** + **Assessments_lang** - تقييمات المرضى

#### الفواتير والمدفوعات | Invoices & Payments
- **Invoices** - الفواتير
- **Invoice_Items** - بنود الفاتورة
- **Payments** - المدفوعات
- **Payment_Methods** + **Payment_Methods_lang** - طرق الدفع

#### المخزون والمعدات | Inventory & Equipment
- **Equipment** + **Equipment_lang** - المعدات الطبية
- **Rooms** + **Rooms_lang** - الغرف
- **Inventory** + **Inventory_lang** - المخزون
- **Inventory_Transactions** - حركات المخزون

#### الموقع الإلكتروني | Website
- **Website_Pages** + **Website_Pages_lang** - صفحات الموقع

---

## 🏗️ البنية التقنية | Technical Architecture

### Frontend
- **Mishkah.js** - إطار عمل UI مع VDOM
- **Pure JavaScript** - لا حاجة لبناء أو تجميع (Zero-build)
- **UMD Pattern** - تحميل مباشر في المتصفح

### Backend
- **Mishkah Store** - نظام بيانات Realtime مع WebSocket
- **IndexedDB** - تخزين محلي للعمل Offline
- **Dynamic SQLite** - نظام قاعدة بيانات ديناميكي

### Multi-Language Support
كل جدول رئيسي يحتوي على جدول لغات منفصل بنفس الاسم + `_lang`:
```sql
CREATE TABLE Services (
  ID NVARCHAR(60) PRIMARY KEY,
  Service_Name NVARCHAR(200),
  lang CHAR(2) DEFAULT 'ar',
  ...
);

CREATE TABLE Services_lang (
  ID NVARCHAR(60) PRIMARY KEY,
  Service_ID NVARCHAR(60) REFERENCES Services(ID),
  Service_Name NVARCHAR(200),
  lang CHAR(2),
  ...
);
```

---

## 📁 هيكل المشروع | Project Structure

```
os/
├── static/projects/physical-therapy-clinic/
│   ├── index.html              # الصفحة الرئيسية
│   ├── css/
│   │   └── styles.css          # ملف التنسيقات
│   ├── js/                     # ملفات JavaScript (اختياري)
│   ├── images/                 # الصور
│   └── README.md               # هذا الملف
│
└── data/branches/clinic-main/modules/erp/
    └── schema/
        └── definition.json     # تعريف قاعدة البيانات
```

---

## 🚀 التشغيل | Getting Started

### 1. متطلبات التشغيل | Requirements
- خادم ويب (Web Server) - مثل Apache, Nginx, أو Python SimpleHTTPServer
- مكتبات Mishkah.js (موجودة في `static/lib/`)

### 2. التشغيل المحلي | Local Development

#### باستخدام Python
```bash
cd static/projects/physical-therapy-clinic
python3 -m http.server 8000
```

ثم افتح المتصفح على: `http://localhost:8000`

#### باستخدام Node.js (http-server)
```bash
cd static/projects/physical-therapy-clinic
npx http-server -p 8000
```

### 3. تغيير اللغة | Change Language
- انقر على زر "ع" للعربية
- انقر على زر "EN" للإنجليزية

---

## 🗄️ إعداد قاعدة البيانات | Database Setup

### Schema Definition
ملف `definition.json` يحتوي على تعريف كامل لجميع الجداول:

```json
{
  "version": "1.0",
  "description": "Physical Therapy Clinic ERP System - Schema Definition",
  "tables": [
    {
      "name": "TableName",
      "columns": [...],
      "indexes": [...]
    }
  ]
}
```

### إنشاء الجداول | Creating Tables
النظام يستخدم **Dynamic SQLite** الذي يقرأ ملف `definition.json` تلقائياً وينشئ الجداول.

---

## 📝 استخدام النماذج | Using Forms

### نموذج الحجز الأونلاين | Online Booking Form

الحقول المطلوبة:
- الاسم الأول (First Name) *
- الاسم الأخير (Last Name) *
- رقم الهاتف (Phone) *
- التاريخ المفضل (Preferred Date) *

الحقول الاختيارية:
- البريد الإلكتروني (Email)
- الخدمة المطلوبة (Service)
- الوقت المفضل (Time)
- ملاحظات (Notes)

---

## 🎨 التخصيص | Customization

### تغيير الألوان | Change Colors
عدّل ملف `css/styles.css`:

```css
:root {
  --primary-color: #0891b2;      /* اللون الأساسي */
  --primary-dark: #0e7490;       /* اللون الأساسي الداكن */
  --secondary-color: #10b981;    /* اللون الثانوي */
  --text-dark: #1f2937;          /* لون النص الداكن */
  --text-light: #6b7280;         /* لون النص الفاتح */
}
```

### إضافة خدمات جديدة | Add New Services
عدّل ملف `index.html` في قسم `db.data.services`:

```javascript
{
  id: 7,
  name_ar: 'اسم الخدمة بالعربي',
  name_en: 'Service Name in English',
  description_ar: 'الوصف بالعربي',
  description_en: 'Description in English',
  icon: '🏥'
}
```

### إضافة صفحات جديدة | Add New Pages
أنشئ صفحة جديدة بنفس النمط:
1. أضف Section جديد في `index.html`
2. أنشئ Component function
3. أضف رابط في Navbar

---

## 📱 التصميم المتجاوب | Responsive Design

الموقع متجاوب بالكامل ويعمل على:
- 💻 أجهزة الكمبيوتر المكتبية
- 📱 الهواتف الذكية
- 📱 الأجهزة اللوحية
- 🖥️ الشاشات الكبيرة

---

## 🔐 الأمان | Security

### حماية البيانات | Data Protection
- تشفير الاتصالات (HTTPS في الإنتاج)
- التحقق من صحة البيانات (Validation)
- حماية من XSS و SQL Injection
- صلاحيات وأدوار للمستخدمين

---

## 🧪 الاختبار | Testing

### اختبار الموقع | Website Testing
1. افتح الموقع في المتصفح
2. جرّب تغيير اللغة
3. جرّب نموذج الحجز
4. تأكد من عمل جميع الروابط

### اختبار قاعدة البيانات | Database Testing
```bash
# سيتم إضافة أدوات اختبار لاحقاً
```

---

## 📚 الموارد | Resources

### التوثيق | Documentation
- [Mishkah.js Documentation](../../docs/MISHKAH-TECHNICAL-GUIDE.md)
- [Mishkah Store Documentation](../../docs/MISHKAH-STORE-DOCUMENTATION.md)
- [Mishkah Cookbook](../../docs/MISHKAH_COOKBOOK.md)

### أمثلة | Examples
- [Sales Report Example](../../examples/sales-report.html)
- [POS Tablet Example](../../pos/pos-tablet.html)

---

## 🤝 المساهمة | Contributing

نرحب بالمساهمات! يرجى:
1. Fork المشروع
2. إنشاء فرع جديد للميزة
3. Commit التغييرات
4. Push إلى الفرع
5. فتح Pull Request

---

## 📄 الترخيص | License

هذا المشروع مرخص تحت [MIT License](LICENSE)

---

## 📞 الدعم | Support

للدعم والاستفسارات:
- 📧 Email: info@marwaclinic.com
- 📱 Phone: +966 50 123 4567
- 🌐 Website: [marwaclinic.com](https://marwaclinic.com)

---

## 🎯 خارطة الطريق | Roadmap

### الإصدار الحالي v1.0 | Current Version
- ✅ موقع إلكتروني ثنائي اللغة
- ✅ نموذج حجز أونلاين
- ✅ قاعدة بيانات كاملة
- ✅ دعم متعدد اللغات

### الإصدارات القادمة | Future Versions

#### v1.1
- 🔄 لوحة تحكم ERP
- 🔄 نظام تسجيل الدخول
- 🔄 إدارة المرضى
- 🔄 إدارة المواعيد

#### v1.2
- 🔄 نظام الفواتير
- 🔄 تقارير وإحصائيات
- 🔄 نظام الرسائل والإشعارات

#### v1.3
- 🔄 تطبيق الهاتف المحمول
- 🔄 نظام الدفع الإلكتروني
- 🔄 التكامل مع أنظمة خارجية

---

## 👥 الفريق | Team

- **Developer**: Mishkah.js Team
- **Client**: Dr. Marwa Hussein Physical Therapy Clinics

---

## 📝 ملاحظات | Notes

### دعم اللغات | Language Support
- النظام يدعم العربية والإنجليزية افتراضياً
- يمكن إضافة لغات إضافية بسهولة
- كل جدول في قاعدة البيانات له جدول `_lang` منفصل

### الأداء | Performance
- تحميل سريع بدون بناء أو تجميع
- تخزين مؤقت ذكي
- دعم العمل دون اتصال (Offline)

### التوافق | Compatibility
- متوافق مع جميع المتصفحات الحديثة
- Chrome, Firefox, Safari, Edge
- دعم كامل للأجهزة المحمولة

---

**تم البناء بحب باستخدام Mishkah.js ❤️**

**Built with love using Mishkah.js ❤️**

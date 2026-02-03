# تعليمات الحصول على التحديثات - Update Instructions

## العربية

### المشكلة
التطبيق PWA يستخدم الـ cache القديم ولا يظهر التحديثات الجديدة.

### الحل - خطوات بسيطة:

**الطريقة 1: من المتصفح (الأسهل)**

1. افتح **Developer Tools** (اضغط F12)
2. اذهب إلى تبويب **Application**
3. من القائمة اليسار اختر **Service Workers**
4. اضغط على **Unregister** لكل service worker
5. ثم اذهب إلى **Storage** > **Clear site data**
6. اضغط **Clear site data**
7. أعد تحميل الصفحة (Ctrl+Shift+R أو Cmd+Shift+R)

**الطريقة 2: من Chrome على الجوال**

1. افتح القائمة (⋮)
2. اختر **Settings** (الإعدادات)
3. اختر **Privacy and security** (الخصوصية والأمان)
4. اختر **Clear browsing data** (مسح بيانات التصفح)
5. اختر **Cached images and files**
6. اضغط **Clear data**
7. أعد فتح التطبيق

**الطريقة 3: تحديث تلقائي (بعد هذا الإصدار)**
بعد الحصول على هذا التحديث، سيظهر زر 🔄 **تحديث** في الزاوية اليمنى العليا.
اضغط عليه وسيتم التحديث تلقائياً!

---

## English

### Problem
PWA is using old cache and not showing new updates.

### Solution - Simple Steps:

**Method 1: From Browser (Easiest)**

1. Open **Developer Tools** (Press F12)
2. Go to **Application** tab
3. From left menu select **Service Workers**
4. Click **Unregister** for each service worker
5. Then go to **Storage** > **Clear site data**
6. Click **Clear site data**
7. Hard reload the page (Ctrl+Shift+R or Cmd+Shift+R)

**Method 2: From Chrome on Mobile**

1. Open menu (⋮)
2. Select **Settings**
3. Select **Privacy and security**
4. Select **Clear browsing data**
5. Select **Cached images and files**
6. Click **Clear data**
7. Reopen the app

**Method 3: Automatic Update (After this version)**
After getting this update, you'll see a 🔄 **Reload** button in the top-right corner.
Click it for automatic updates!

---

## التحديثات في هذا الإصدار - Updates in This Version

### ✅ زر Hard Reload
- يظهر في الزاوية اليمنى العليا
- ينظف كل الـ cache تلقائياً
- يحدث التطبيق بضغطة واحدة

### ✅ إصلاح Zoom Scrolling
- الآن يمكنك التحريك في جميع الاتجاهات عند التكبير
- منطقة العمل تتوسع تلقائياً

### ✅ إصلاح Zen Mode
- **PDF Navigation** تظهر دائماً ✓
- **Zoom Controls** تختفي في وضع القراءة ✓
- **Reload Button** يختفي في وضع القراءة ✓

### ✅ تصدير جزئي للصفحات
- اختيار صفحات محددة للتصدير
- دعم page ranges (1-10, 15, 20-25)
- مؤشر تحميل مع progress

---

## ملاحظات تقنية - Technical Notes

### Service Worker Changes:
- Cache version updated: `v1` → `v3`
- HTML files use **Network First** strategy
- Other resources use **Cache First** strategy
- Auto cleanup of old caches

### What This Means:
- ✅ You'll always get the latest HTML
- ✅ Offline support still works
- ✅ Faster loading for CSS/JS/images
- ✅ Automatic updates from now on

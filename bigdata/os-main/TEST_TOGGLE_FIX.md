# اختبار إصلاح Toggle - دليل التشخيص

## المشكلة
- زر Theme لا يعمل
- زر Language يغير Direction لكن المحتوى يظل عربي

## الإصلاحات المطبقة

### 1. إضافة Debugging شامل
```javascript
// في كل handler:
console.log('[Brocker PWA] Theme toggle clicked');
console.log('[Brocker PWA] Lang toggle clicked');

// في كل function:
console.log('[Brocker PWA] setEnvTheme:', nextTheme);
console.log('[Brocker PWA] setEnvLanguage:', nextLang);
console.log('[Brocker PWA] Reloading data with lang:', lang);
```

### 2. تحسين setEnvTheme
```javascript
// إضافة rebuild() بعد setState
setTimeout(function() {
  if (ctx && typeof ctx.rebuild === 'function') {
    ctx.rebuild();
  } else {
    // fallback: setState مرة أخرى
    ctx.setState(function(db) { return db; });
  }
}, 50);
```

### 3. تحسين reloadDataWithLanguage
```javascript
// استخدام appInstance fallback
var targetApp = app || appInstance;

// delay أطول قبل reconnect
setTimeout(function() {
  bootstrapRealtime(targetApp, lang);
}, 200);
```

---

## خطوات الاختبار

### الخطوة 1: تشغيل السيرفر
```bash
cd /home/user/os
npm run dev
```

### الخطوة 2: فتح المتصفح
```
URL: http://localhost:3200/projects/brocker/index.html?branch=aqar&module=brocker
```

### الخطوة 3: فتح Console
```
- اضغط F12 (أو Ctrl+Shift+I على Windows/Linux)
- اضغط Cmd+Option+I (على Mac)
- اختر تبويب "Console"
```

### الخطوة 4: اختبار Theme Toggle

1. **انقر على زر 🌙** (القمر)
2. **راقب Console**، يجب أن ترى:
   ```
   [Brocker PWA] Theme toggle clicked
   [Brocker PWA] Switching theme from dark to light
   [Brocker PWA] setEnvTheme: light
   [Brocker PWA] Theme state updated, new env: {...}
   [Brocker PWA] Calling rebuild()
   ```
3. **راقب الواجهة**: يجب أن تتغير الألوان من Dark → Light

### الخطوة 5: اختبار Language Toggle

1. **انقر على زر EN** 🇬🇧
2. **راقب Console**، يجب أن ترى:
   ```
   [Brocker PWA] Lang toggle clicked
   [Brocker PWA] Switching lang from ar to en
   [Brocker PWA] setEnvLanguage: en dir: ltr
   [Brocker PWA] State updated, new env: {...}
   [Brocker PWA] Reloading data with lang: en
   [Brocker PWA] Disconnecting old realtime connection
   [Brocker PWA] Bootstrapping realtime with lang: en
   ```
3. **راقب الواجهة**:
   - Direction يتغير (RTL → LTR) ✅
   - Spinner يظهر لثواني ✅
   - البيانات **قد** لا تتغير (بسبب Backend) ⚠️

---

## تحليل النتائج

### حالة 1: لا توجد رسائل Console على الإطلاق ❌

**التشخيص**: Orders غير مربوطة بشكل صحيح

**الحل**:
1. تحقق من أن `mishkah.js` محمل بشكل صحيح
2. افتح Console واكتب:
   ```javascript
   console.log(window.Mishkah);
   console.log(window.BrockerPwaApp);
   ```
3. إذا كان `BrockerPwaApp` موجود، جرب:
   ```javascript
   // اختبار يدوي
   window.BrockerPwaApp.setState(function(db) {
     return Object.assign({}, db, {
       env: Object.assign({}, db.env, { theme: 'light' })
     });
   });
   ```

---

### حالة 2: رسائل Console موجودة لكن Theme لا يتغير ⚠️

**التشخيص**: `rebuild()` لا يعمل أو `themed()` function لا تقرأ state الجديد

**الحل البديل 1**: استخدام `forceUpdate()`
```javascript
// في setEnvTheme
setTimeout(function() {
  if (ctx && typeof ctx.forceUpdate === 'function') {
    ctx.forceUpdate();
  }
}, 50);
```

**الحل البديل 2**: Reload الصفحة
```javascript
// في setEnvTheme
setTimeout(function() {
  window.location.reload();
}, 100);
```

---

### حالة 3: Theme يعمل لكن Language لا يتغير المحتوى ⚠️

**التشخيص**: هذا متوقع! Backend لا يدعم الترجمة بعد

**ما يجب أن يحدث**:
- ✅ Direction يتغير (RTL ↔ LTR)
- ✅ Spinner يظهر
- ✅ WebSocket reconnect
- ❌ البيانات تظل عربية (لأن Backend لا يفهم `lang` parameter)

**لاختبار أن النظام يعمل**:
1. افتح Network Tab
2. اختر WebSocket
3. انقر Language toggle
4. يجب أن ترى WebSocket connection جديد

---

### حالة 4: كل شيء يعمل ما عدا Backend Translation ✅

**الحل**: تطبيق Backend Translation Support

راجع ملف `TRANSLATION_SYSTEM_IMPLEMENTATION.md` وطبق:
1. تعديل `src/server.js` لقراءة `lang` parameter
2. تعديل `src/moduleStore.js` لعمل LEFT JOIN
3. إضافة بيانات مثال في `initial.json`

---

## الحلول السريعة (Quick Fixes)

### إذا Theme Toggle لا يعمل إطلاقاً

**الحل الفوري**: إعادة تحميل الصفحة بعد تغيير Theme
```javascript
function setEnvTheme(ctx, theme) {
  var nextTheme = theme === 'light' ? 'light' : 'dark';
  ctx.setState(function (db) {
    var nextEnv = Object.assign({}, db.env, { theme: nextTheme });
    persistPrefs(nextEnv);
    syncDocumentEnv(nextEnv);
    return Object.assign({}, db, { env: nextEnv });
  });

  // Reload الصفحة بعد delay قصير
  setTimeout(function() {
    window.location.reload();
  }, 100);
}
```

### إذا Language Toggle لا يُحمّل البيانات

**التحقق اليدوي**:
1. افتح Console
2. اكتب:
   ```javascript
   window.BrockerPwaApp.setState(function(db) {
     console.log('Current state:', db);
     return db;
   });
   ```
3. تحقق من `db.env.lang` و `db.data`

---

## ملفات للمراجعة

### إذا احتجت تطبيق Backend:
1. `TRANSLATION_SYSTEM_IMPLEMENTATION.md` - دليل Backend الكامل
2. `data/schemas/brocker_schema.json` - جداول الترجمة
3. `data/branches/aqar/modules/brocker/seeds/initial.json` - البيانات

### إذا احتجت تعديل Frontend:
1. `static/projects/brocker/app.js` - الكود الرئيسي
2. `static/lib/mishkah.simple-store.js` - نظام Store

---

## الخلاصة

**المتوقع الآن**:
- ✅ Console logs تعمل (تؤكد أن Handlers تُستدعى)
- ✅ Theme toggle يجب أن يعمل (مع rebuild)
- ✅ Language toggle يغير Direction
- ⚠️ البيانات تظل عربية (حتى يُطبق Backend)

**إذا لم يعمل أي شيء**:
1. تحقق من أن Server يعمل: `npm run dev`
2. تحقق من أن الملف محمل: افتح Sources tab في DevTools
3. تحقق من Console errors: هل هناك أخطاء JavaScript؟
4. جرب Reload الصفحة: Ctrl+Shift+R (Hard reload)

---

**التالي**: بمجرد أن نتأكد أن Handlers تُستدعى (من Console logs)، سنعرف بالضبط أين المشكلة وسنصلحها!

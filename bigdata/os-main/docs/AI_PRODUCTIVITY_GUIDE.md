# 🤖 دليل إنتاجية الذكاء الاصطناعي لمشكاة
## AI Productivity Guide for Mishkah

> **للمساعدين الذكاء الاصطناعي (Claude, GPT, etc.)**
>
> هذا الدليل يساعدك على تحقيق أقصى إنتاجية عند كتابة كود Mishkah بدون أخطاء.

---

## 🎯 القواعد الأساسية - Core Rules

### ✅ ALWAYS DO

```javascript
// 1. ✅ استخدم IIFE دائماً
(async function() {
  const M = Mishkah;
  const D = M.DSL;
  // ...
})();

// 2. ✅ استخدم Global Objects
const M = Mishkah;
const UI = M.UI;
const U = M.utils;

// 3. ✅ استخدم DSL Atoms
D.Containers.Div({}, [/* children */])
D.Text.H1({}, ['Title'])
D.Forms.Button({}, ['Click'])

// 4. ✅ استخدم gkey للأحداث
attrs: {
  gkey: 'namespace:action'
}

// 5. ✅ اعمل rebuild بعد تحديث state
context.db.data.value = newValue;
context.rebuild();
```

### ❌ NEVER DO

```javascript
// 1. ❌ لا تستخدم ES6 imports أبداً
import { div } from '../../lib/mishkah.div.js'; // WRONG!

// 2. ❌ لا تستخدم document.createElement
const div = document.createElement('div'); // WRONG!

// 3. ❌ لا تستخدم innerHTML مباشرة
element.innerHTML = '<div>...</div>'; // WRONG!

// 4. ❌ لا تستخدم inline events
<button onclick="alert()">Click</button> // WRONG!

// 5. ❌ لا تنسى rebuild بعد تحديث state
context.db.data.value = newValue;
// Missing: context.rebuild(); // WRONG!
```

---

## 📋 Checklist - قبل كتابة أي كود

قبل أن تبدأ بكتابة كود Mishkah، تأكد من:

- [ ] **البنية**: استخدم IIFE pattern
- [ ] **المكتبات**: محملة كـ `<script>` عادية، ليس `type="module"`
- [ ] **Globals**: استخدم `const M = Mishkah`
- [ ] **DSL**: استخدم `D.Category.Element()`
- [ ] **Events**: استخدم `gkey` ليس `onclick`
- [ ] **State**: اعمل `rebuild()` بعد كل تحديث
- [ ] **Testing**: اختبر في المتصفح مباشرة

---

## 🏗️ Architecture Pattern - النمط المعماري

### المعمارية الكاملة لأي تطبيق:

```javascript
// ============================================
// 1. SETUP - الإعداد
// ============================================
(async function() {
  const M = Mishkah;        // ✅ Core
  const D = M.DSL;          // ✅ Atoms (Containers, Text, Forms, Inputs, etc.)
  const UI = M.UI;          // ✅ Components (Button, Card, Modal, etc.)
  const U = M.utils;        // ✅ Utilities
  const { tw, token } = U.twcss || {};  // ✅ CSS utilities

  // ============================================
  // 2. DATABASE - قاعدة البيانات
  // ============================================
  const db = {
    // Environment
    env: {
      lang: 'ar',           // اللغة
      theme: 'light',       // السمة
      dir: 'rtl'           // الاتجاه
    },

    // Application Data
    data: {
      users: [],
      currentUser: null,
      loading: false,
      error: null,
      // ... your data
    },

    // i18n (optional)
    i18n: {
      welcome: 'مرحباً',
      save: 'حفظ',
      cancel: 'إلغاء'
    }
  };

  // ============================================
  // 3. ORDERS - معالجات الأحداث
  // ============================================
  const orders = {
    // Pattern: 'namespace:action:target'
    'users:load': async function(event, context) {
      context.db.data.loading = true;
      context.rebuild();

      try {
        const users = await fetchUsers();
        context.db.data.users = users;
        context.db.data.loading = false;
      } catch (error) {
        context.db.data.error = error.message;
        context.db.data.loading = false;
      }

      context.rebuild();
    },

    'users:delete': function(event, context) {
      const userId = event.target.dataset.userId;
      if (confirm('هل أنت متأكد؟')) {
        context.db.data.users = context.db.data.users.filter(
          u => u.id !== userId
        );
        context.rebuild();
      }
    },

    'form:input': function(event, context) {
      const { name, value } = event.target;
      context.db.data.form[name] = value;
      // No rebuild needed for inputs
    },

    'form:submit': function(event, context) {
      event.preventDefault();
      // Process form
      context.rebuild();
    }
  };

  // ============================================
  // 4. UI BODY - الواجهة
  // ============================================
  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;

    // Conditional rendering
    if (state.loading) {
      return D.Text.P({}, ['جاري التحميل...']);
    }

    if (state.error) {
      return D.Text.P({ attrs: { class: 'error' } }, [state.error]);
    }

    // Main UI
    return D.Containers.Div({ attrs: { class: 'app' } }, [
      D.Text.H1({}, ['عنوان التطبيق']),

      // Content based on state
      D.Containers.Div({}, state.users.map(user =>
        D.Containers.Div({ attrs: { class: 'user-card' } }, [
          D.Text.H3({}, [user.name]),
          D.Forms.Button({
            attrs: {
              gkey: 'users:delete',
              'data-user-id': user.id
            }
          }, ['حذف'])
        ])
      ))
    ]);
  });

  // ============================================
  // 5. MOUNT - تشغيل التطبيق
  // ============================================
  M.app.createApp(db, orders).mount('#app');
})();
```

---

## 🔍 Pattern Recognition - التعرف على الأنماط

### عندما ترى هذا في الطلب → استخدم هذا النمط:

| الطلب | النمط |
|-------|-------|
| "إنشاء صفحة/تطبيق" | استخدم IIFE + Full structure |
| "إنشاء نموذج/form" | استخدم `D.Forms.Form` + inputs + submit handler |
| "إنشاء جدول/table" | استخدم `D.Tables.Table` + map over data |
| "إنشاء قائمة/list" | استخدم `D.Lists.Ul/Ol` + map over items |
| "إضافة زر/button" | استخدم `D.Forms.Button` + gkey |
| "إضافة modal/dialog" | استخدم conditional render + overlay pattern |
| "تحميل بيانات/fetch" | استخدم async handler + loading state |
| "بحث/filter" | استخدم filter pattern + filteredItems |
| "تحديث/edit" | استخدم handler + rebuild |
| "حذف/delete" | استخدم handler + filter + rebuild |

---

## 📦 Component Lookup - دليل المكونات

### DSL Atoms Categories:

```javascript
// ✅ استخدم هذه المرجع عند اختيار المكون

D.Containers.Div         // <div>
D.Containers.Section     // <section>
D.Containers.Article     // <article>
D.Containers.Header      // <header>
D.Containers.Footer      // <footer>
D.Containers.Main        // <main>
D.Containers.Nav         // <nav>
D.Containers.Aside       // <aside>

D.Text.H1               // <h1>
D.Text.H2               // <h2>
D.Text.H3               // <h3>
D.Text.H4               // <h4>
D.Text.H5               // <h5>
D.Text.H6               // <h6>
D.Text.P                // <p>
D.Text.Span             // <span>
D.Text.Strong           // <strong>
D.Text.Em               // <em>
D.Text.Small            // <small>
D.Text.A                // <a>

D.Forms.Form            // <form>
D.Forms.Button          // <button>
D.Forms.Label           // <label>
D.Forms.Fieldset        // <fieldset>
D.Forms.Legend          // <legend>

D.Inputs.Input          // <input>
D.Inputs.Textarea       // <textarea>
D.Inputs.Select         // <select>
D.Inputs.Option         // <option>

D.Lists.Ul              // <ul>
D.Lists.Ol              // <ol>
D.Lists.Li              // <li>
D.Lists.Dl              // <dl>
D.Lists.Dt              // <dt>
D.Lists.Dd              // <dd>

D.Tables.Table          // <table>
D.Tables.Thead          // <thead>
D.Tables.Tbody          // <tbody>
D.Tables.Tr             // <tr>
D.Tables.Th             // <th>
D.Tables.Td             // <td>

D.Media.Img             // <img>
D.Media.Video           // <video>
D.Media.Audio           // <audio>
D.Media.Picture         // <picture>

D.SVG.Svg               // <svg>
D.SVG.Path              // <path>
D.SVG.Circle            // <circle>
D.SVG.Rect              // <rect>
```

### UI Components (High-level):

```javascript
// ✅ استخدم هذه للمكونات الجاهزة
UI.Button({ variant, size, label, onClick })
UI.Card({ title, subtitle, content, footer })
UI.Badge({ text, variant, size })
UI.Modal({ title, content, actions })
UI.Toast({ message, type, duration })
UI.Toolbar({ items })
UI.Numpad({ ... })
```

---

## 🎨 Common Patterns - أنماط شائعة

### Pattern 1: Loading State

```javascript
// ✅ نمط التحميل القياسي
const db = {
  data: {
    loading: false,
    error: null,
    data: []
  }
};

M.app.setBody((stateWrapper, D) => {
  const state = stateWrapper.data;

  if (state.loading) {
    return D.Text.P({}, ['جاري التحميل...']);
  }

  if (state.error) {
    return D.Text.P({ attrs: { class: 'error' } }, [state.error]);
  }

  return D.Containers.Div({}, [/* content */]);
});
```

### Pattern 2: Form Handling

```javascript
// ✅ نمط النموذج القياسي
const db = {
  data: {
    form: {
      name: '',
      email: ''
    },
    errors: {},
    submitting: false
  }
};

const orders = {
  'form:input': function(event, context) {
    const { name, value } = event.target;
    context.db.data.form[name] = value;
    // Clear error for this field
    delete context.db.data.errors[name];
  },

  'form:submit': async function(event, context) {
    event.preventDefault();

    // Validate
    const errors = {};
    if (!context.db.data.form.name) {
      errors.name = 'الاسم مطلوب';
    }
    if (!context.db.data.form.email) {
      errors.email = 'البريد مطلوب';
    }

    if (Object.keys(errors).length) {
      context.db.data.errors = errors;
      context.rebuild();
      return;
    }

    // Submit
    context.db.data.submitting = true;
    context.rebuild();

    try {
      await submitForm(context.db.data.form);
      context.db.data.form = { name: '', email: '' };
      context.db.data.submitting = false;
      alert('تم الإرسال بنجاح');
    } catch (error) {
      context.db.data.errors = { _form: error.message };
      context.db.data.submitting = false;
    }

    context.rebuild();
  }
};
```

### Pattern 3: List with Actions

```javascript
// ✅ نمط القائمة مع إجراءات
const db = {
  data: {
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ]
  }
};

const orders = {
  'item:delete': function(event, context) {
    const itemId = parseInt(event.target.dataset.itemId);
    if (confirm('حذف؟')) {
      context.db.data.items = context.db.data.items.filter(
        item => item.id !== itemId
      );
      context.rebuild();
    }
  },

  'item:edit': function(event, context) {
    const itemId = parseInt(event.target.dataset.itemId);
    const item = context.db.data.items.find(i => i.id === itemId);
    // Edit logic
  }
};

M.app.setBody((stateWrapper, D) => {
  const state = stateWrapper.data;

  return D.Lists.Ul({}, state.items.map(item =>
    D.Lists.Li({}, [
      D.Text.Span({}, [item.name]),
      D.Forms.Button({
        attrs: {
          gkey: 'item:edit',
          'data-item-id': item.id
        }
      }, ['تعديل']),
      D.Forms.Button({
        attrs: {
          gkey: 'item:delete',
          'data-item-id': item.id
        }
      }, ['حذف'])
    ])
  ));
});
```

### Pattern 4: Filter/Search

```javascript
// ✅ نمط البحث والفلترة
const db = {
  data: {
    items: [/* all items */],
    searchQuery: '',
    filteredItems: [/* filtered items */]
  }
};

// Initialize
db.data.filteredItems = db.data.items.slice();

const orders = {
  'search:input': function(event, context) {
    const query = event.target.value.toLowerCase();
    context.db.data.searchQuery = query;

    context.db.data.filteredItems = context.db.data.items.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    );

    context.rebuild();
  }
};

M.app.setBody((stateWrapper, D) => {
  const state = stateWrapper.data;

  return D.Containers.Div({}, [
    // Search box
    D.Inputs.Input({
      attrs: {
        type: 'search',
        placeholder: 'بحث...',
        value: state.searchQuery,
        gkey: 'search:input'
      }
    }),

    // Results
    D.Text.P({}, [`عرض ${state.filteredItems.length} من ${state.items.length}`]),

    // Items
    D.Containers.Div({}, state.filteredItems.map(item =>
      D.Containers.Div({}, [item.name])
    ))
  ]);
});
```

### Pattern 5: Modal Dialog

```javascript
// ✅ نمط Modal القياسي
const db = {
  data: {
    showModal: false,
    modalData: null
  }
};

const orders = {
  'modal:open': function(event, context) {
    context.db.data.showModal = true;
    context.db.data.modalData = {
      title: 'تأكيد',
      message: 'هل أنت متأكد؟'
    };
    context.rebuild();
  },

  'modal:close': function(event, context) {
    context.db.data.showModal = false;
    context.db.data.modalData = null;
    context.rebuild();
  },

  'modal:confirm': function(event, context) {
    // Do action
    context.db.data.showModal = false;
    context.rebuild();
  }
};

M.app.setBody((stateWrapper, D) => {
  const state = stateWrapper.data;

  return D.Containers.Div({}, [
    D.Forms.Button({
      attrs: { gkey: 'modal:open' }
    }, ['فتح Modal']),

    // Modal
    state.showModal ? D.Containers.Div({
      attrs: {
        class: 'modal-overlay',
        gkey: 'modal:close'
      }
    }, [
      D.Containers.Div({
        attrs: { class: 'modal-content' },
        events: {
          click: function(e) { e.stopPropagation(); }
        }
      }, [
        D.Text.H2({}, [state.modalData.title]),
        D.Text.P({}, [state.modalData.message]),
        D.Containers.Div({ attrs: { class: 'modal-actions' } }, [
          D.Forms.Button({
            attrs: { gkey: 'modal:close' }
          }, ['إلغاء']),
          D.Forms.Button({
            attrs: { gkey: 'modal:confirm' }
          }, ['تأكيد'])
        ])
      ])
    ]) : null
  ].filter(Boolean));
});
```

---

## 🚨 Common Mistakes - أخطاء شائعة وحلولها

### خطأ 1: ES6 Imports

```javascript
// ❌ خطأ
import { div } from '../../lib/mishkah.div.js';

// ✅ الحل
(async function() {
  const M = Mishkah;
  const D = M.DSL;
})();
```

### خطأ 2: نسيان rebuild

```javascript
// ❌ خطأ - لن تتحدث الواجهة
'action:update': function(event, context) {
  context.db.data.value = 'new';
  // Missing rebuild!
}

// ✅ الحل
'action:update': function(event, context) {
  context.db.data.value = 'new';
  context.rebuild(); // ✅
}
```

### خطأ 3: استخدام document API

```javascript
// ❌ خطأ
const div = document.createElement('div');
div.textContent = 'Hello';

// ✅ الحل
D.Containers.Div({}, ['Hello'])
```

### خطأ 4: Inline Events

```javascript
// ❌ خطأ
D.Forms.Button({
  attrs: {
    onclick: "alert('hi')"
  }
}, ['Click'])

// ✅ الحل
D.Forms.Button({
  attrs: {
    gkey: 'action:click'
  }
}, ['Click'])

// في orders:
const orders = {
  'action:click': function() {
    alert('hi');
  }
};
```

### خطأ 5: تحميل المكتبات كـ modules

```html
<!-- ❌ خطأ -->
<script type="module" src="../../static/lib/mishkah.core.js"></script>

<!-- ✅ الحل -->
<script src="../../static/lib/mishkah.core.js"></script>
```

---

## 🎯 Decision Tree - شجرة القرارات

عند كتابة كود Mishkah، اتبع هذه الشجرة:

```
هل تنشئ صفحة جديدة؟
├─ نعم → استخدم Full HTML Template (mk-html snippet)
└─ لا → هل تضيف feature لصفحة موجودة؟
    ├─ نعم → هل تحتاج form؟
    │   ├─ نعم → استخدم Form Pattern (mk-form snippet)
    │   └─ لا → هل تحتاج table؟
    │       ├─ نعم → استخدم Table Pattern (mk-table snippet)
    │       └─ لا → هل تحتاج list؟
    │           ├─ نعم → استخدم List Pattern (mk-list snippet)
    │           └─ لا → اختر المكون المناسب من DSL Reference
    └─ لا → هل تصلح bug؟
        └─ نعم → تحقق من Common Mistakes أولاً
```

---

## 📚 Quick Reference Card

### Setup (كل تطبيق يبدأ بهذا):
```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;
  const UI = M.UI;
  const U = M.utils;
})();
```

### Structure (الهيكل الكامل):
```javascript
// 1. db = { env, data, i18n }
// 2. orders = { 'namespace:action': handler }
// 3. M.app.setBody((stateWrapper, D) => { ... })
// 4. M.app.createApp(db, orders).mount('#app')
```

### Elements (المكونات):
```javascript
D.Containers.Div({}, [])      // Container
D.Text.H1({}, [])              // Heading
D.Forms.Button({}, [])         // Button
D.Inputs.Input({})             // Input
D.Lists.Ul({}, [])             // List
D.Tables.Table({}, [])         // Table
```

### Events (الأحداث):
```javascript
// In element:
attrs: { gkey: 'namespace:action' }

// In orders:
'namespace:action': function(event, context) {
  // do something
  context.rebuild();
}
```

### State (الحالة):
```javascript
// Read:
const state = stateWrapper.data;
const value = state.myValue;

// Update:
context.db.data.myValue = newValue;
context.rebuild();
```

---

## 🎓 تمارين للتدريب - Practice Exercises

### تمرين 1: صفحة بسيطة
```
الطلب: "إنشاء صفحة تعرض 'مرحباً بك في مشكاة'"

الحل:
1. استخدم mk-html snippet
2. في setBody، أضف D.Text.H1({}, ['مرحباً بك في مشكاة'])
3. اختبر في المتصفح
```

### تمرين 2: نموذج تسجيل
```
الطلب: "إنشاء نموذج تسجيل دخول بحقلين (username, password)"

الحل:
1. استخدم Form Pattern
2. أضف input لـ username
3. أضف input لـ password
4. أضف handler للـ submit
5. اختبر
```

### تمرين 3: جدول مستخدمين
```
الطلب: "عرض جدول المستخدمين مع زر حذف"

الحل:
1. استخدم Table Pattern
2. أضف data: { users: [...] }
3. استخدم map لعرض الصفوف
4. أضف زر حذف لكل صف مع gkey
5. أضف handler للحذف
6. اختبر
```

---

## 🔗 الموارد - Resources

1. **MISHKAH_COOKBOOK.md** - مرجع شامل لكل الأنماط
2. **mishkah-vscode-snippets.json** - Snippets للإنتاجية
3. **HTMLX_IMPROVEMENTS.md** - تحسينات مقترحة
4. **mishkah.core.js** - الكود المصدري للـ DSL
5. **pos-tablet.html** - مثال كامل لتطبيق DSL
6. **quick.html** - مثال كامل لتطبيق HTMLx

---

## 🤝 تعاون مع المطور - Collaborating with Developer

عند العمل على Mishkah مع مطور:

1. **اطرح أسئلة واضحة** عن النمط المطلوب (DSL أم HTMLx)
2. **اتبع البنية الموجودة** في المشروع
3. **اقترح أمثلة** من COOKBOOK قبل الكتابة
4. **اختبر** الكود ذهنياً قبل الإرسال
5. **اعترف بالأخطاء** إذا استخدمت ES6 imports أو document API

---

## ✅ Checklist النهائي - Final Checklist

قبل إرسال أي كود Mishkah، تأكد:

- [ ] استخدمت IIFE: `(async function() { ... })()`
- [ ] استخدمت Global Objects: `const M = Mishkah`
- [ ] استخدمت DSL Atoms: `D.Category.Element()`
- [ ] استخدمت `gkey` لكل الأحداث
- [ ] أضفت `context.rebuild()` بعد كل تحديث للحالة
- [ ] لم أستخدم ES6 imports
- [ ] لم أستخدم `document.createElement()`
- [ ] لم أستخدم `innerHTML`
- [ ] اتبعت Pattern من COOKBOOK
- [ ] الكود جاهز للاختبار في المتصفح

---

**مشكاة - Mishkah**
Browser-native. Zero-build. AI-friendly.

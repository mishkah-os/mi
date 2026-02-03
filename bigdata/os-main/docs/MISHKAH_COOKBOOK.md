# 📘 Mishkah Cookbook
## دليل الطبخ الشامل لمشكاة

> **الدليل المرجعي الشامل للمطورين ومساعدي الذكاء الاصطناعي**
>
> Everything you need to build with Mishkah - patterns, examples, and best practices.

---

## 🎯 جدول المحتويات
### Table of Contents

1. [البداية السريعة](#1-البداية-السريعة-quick-start)
2. [الهيكل الأساسي](#2-الهيكل-الأساسي-basic-structure)
3. [DSL Atoms Reference](#3-dsl-atoms-reference)
4. [UI Components Reference](#4-ui-components-reference)
5. [HTMLx Templates](#5-htmlx-templates)
6. [أنماط التعامل مع الأحداث](#6-event-handling-patterns)
7. [إدارة الحالة](#7-state-management)
8. [20 مثال عملي](#8-20-practical-examples)
9. [Anti-Patterns](#9-anti-patterns---ما-لا-يجب-فعله)
10. [AI Productivity Tips](#10-ai-productivity-tips)

---

## 1. البداية السريعة • Quick Start

### الهيكل الأساسي لأي تطبيق Mishkah:

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تطبيق مشكاة</title>
  <!-- ✅ تحميل المكتبات كـ scripts عادية، ليس modules -->
  <script src="../../static/lib/mishkah-utils.js"></script>
  <script src="../../static/lib/mishkah.core.js"></script>
  <script src="../../static/lib/mishkah-ui.js"></script>
</head>
<body>
  <div id="app"></div>

  <!-- ✅ الكود الرئيسي -->
  <script>
    (async function() {
      const M = Mishkah;
      const D = M.DSL;
      const UI = M.UI;
      const U = M.utils;

      // بناء التطبيق
      M.app.setBody((stateWrapper, D) => {
        return D.Containers.Div({}, ['مرحباً بك في مشكاة!']);
      });

      // تشغيل التطبيق
      const db = { env: { lang: 'ar' }, data: {} };
      M.app.createApp(db, {}).mount('#app');
    })();
  </script>
</body>
</html>
```

### ✅ القواعد الذهبية:

| ✅ DO | ❌ DON'T |
|-------|----------|
| استخدم IIFE: `(async function(){ ... })()` | لا تستخدم ES6 imports |
| حمّل المكتبات كـ `<script>` | لا تستخدم `type="module"` للمكتبات |
| استخدم Global Objects: `const M = Mishkah` | لا تستخدم `document.createElement()` |
| استخدم DSL Atoms: `D.Text.H1()` | لا تستخدم `innerHTML` مباشرة |
| استخدم `gkey` للأحداث | لا تستخدم `onclick=""` inline |

---

## 2. الهيكل الأساسي • Basic Structure

### A. IIFE Pattern (الأساس)

```javascript
// ✅ النمط الصحيح - IIFE + Global Objects
(async function() {
  // 1. الإعدادات الأساسية
  const M = Mishkah;        // Core
  const D = M.DSL;          // Atoms
  const UI = M.UI;          // Components
  const U = M.utils;        // Utilities
  const { tw, token } = U.twcss || {};  // CSS utilities

  // 2. البيانات
  const db = {
    env: { lang: 'ar', theme: 'light' },
    data: { /* your data */ }
  };

  // 3. الأوامر (Orders)
  const orders = {
    'namespace:action': function(event, context) {
      // handle event
    }
  };

  // 4. بناء الواجهة
  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;
    return D.Containers.Div({}, [/* children */]);
  });

  // 5. تشغيل التطبيق
  M.app.createApp(db, orders).mount('#app');
})();
```

### B. ملف منفصل Pattern

**index.html:**
```html
<script type="module">
  import { createPosDb } from './pos-mini-db.js';
  const { db } = await createPosDb({ branchId: 'main', moduleId: 'app' });
  window.__APP_DB__ = db;
  await db.ready();
  await import('./app.js'); // ✅ app.js يكون IIFE عادي
</script>
```

**app.js:**
```javascript
// ✅ IIFE عادي، بدون ES6 exports
(async function() {
  const M = Mishkah;
  const db = window.__APP_DB__;
  // ... بقية الكود
})();
```

---

## 3. DSL Atoms Reference

### A. Containers

```javascript
// ✅ جميع العناصر الحاوية
D.Containers.Div({ attrs: { class: 'container' } }, [/* children */])
D.Containers.Section({ attrs: { id: 'main' } }, [/* children */])
D.Containers.Article({}, [/* children */])
D.Containers.Header({}, [/* children */])
D.Containers.Footer({}, [/* children */])
D.Containers.Main({}, [/* children */])
D.Containers.Nav({}, [/* children */])
D.Containers.Aside({}, [/* children */])
```

### B. Text Elements

```javascript
// ✅ جميع عناصر النص
D.Text.H1({ attrs: { class: 'title' } }, ['عنوان رئيسي'])
D.Text.H2({}, ['عنوان فرعي'])
D.Text.H3({}, ['عنوان'])
D.Text.H4({}, [])
D.Text.H5({}, [])
D.Text.H6({}, [])
D.Text.P({}, ['فقرة نصية'])
D.Text.Span({ attrs: { class: 'badge' } }, ['تسمية'])
D.Text.Strong({}, ['نص قوي'])
D.Text.Em({}, ['نص مائل'])
D.Text.Small({}, ['نص صغير'])
D.Text.A({ attrs: { href: '#' } }, ['رابط'])
```

### C. Forms

```javascript
// ✅ عناصر النماذج
D.Forms.Form({
  attrs: { method: 'post' },
  events: { gkey: 'form:submit' }
}, [/* children */])

D.Forms.Button({
  attrs: {
    type: 'button',
    class: 'btn',
    gkey: 'action:save'
  }
}, ['حفظ'])

D.Forms.Label({ attrs: { for: 'name' } }, ['الاسم:'])
D.Forms.Fieldset({}, [/* children */])
D.Forms.Legend({}, ['مجموعة حقول'])
```

### D. Inputs

```javascript
// ✅ عناصر الإدخال
D.Inputs.Input({
  attrs: {
    type: 'text',
    name: 'username',
    placeholder: 'اسم المستخدم',
    value: state.username,
    gkey: 'input:username'
  }
})

D.Inputs.Textarea({
  attrs: {
    name: 'notes',
    rows: 5,
    gkey: 'input:notes'
  }
}, [state.notes])

D.Inputs.Select({
  attrs: {
    name: 'category',
    gkey: 'select:category'
  }
}, [
  D.Inputs.Option({ attrs: { value: '' } }, ['اختر...']),
  D.Inputs.Option({ attrs: { value: '1' } }, ['خيار 1']),
  D.Inputs.Option({ attrs: { value: '2' } }, ['خيار 2'])
])
```

### E. Lists

```javascript
// ✅ القوائم
D.Lists.Ul({ attrs: { class: 'menu' } }, [
  D.Lists.Li({}, ['عنصر 1']),
  D.Lists.Li({}, ['عنصر 2']),
  D.Lists.Li({}, ['عنصر 3'])
])

D.Lists.Ol({}, [
  D.Lists.Li({}, ['أولاً']),
  D.Lists.Li({}, ['ثانياً'])
])

D.Lists.Dl({}, [
  D.Lists.Dt({}, ['مصطلح']),
  D.Lists.Dd({}, ['تعريف'])
])
```

### F. Tables

```javascript
// ✅ الجداول
D.Tables.Table({ attrs: { class: 'data-table' } }, [
  D.Tables.Thead({}, [
    D.Tables.Tr({}, [
      D.Tables.Th({}, ['الاسم']),
      D.Tables.Th({}, ['البريد']),
      D.Tables.Th({}, ['الحالة'])
    ])
  ]),
  D.Tables.Tbody({}, state.users.map(user =>
    D.Tables.Tr({}, [
      D.Tables.Td({}, [user.name]),
      D.Tables.Td({}, [user.email]),
      D.Tables.Td({}, [user.status])
    ])
  ))
])
```

### G. Media

```javascript
// ✅ الوسائط
D.Media.Img({
  attrs: {
    src: '/images/logo.png',
    alt: 'الشعار',
    width: '200'
  }
})

D.Media.Video({
  attrs: {
    src: '/videos/intro.mp4',
    controls: true
  }
})

D.Media.Audio({
  attrs: {
    src: '/audio/sound.mp3',
    controls: true
  }
})
```

### H. SVG

```javascript
// ✅ رسومات SVG
D.SVG.Svg({
  attrs: {
    width: '24',
    height: '24',
    viewBox: '0 0 24 24'
  }
}, [
  D.SVG.Circle({ attrs: { cx: '12', cy: '12', r: '10' } }),
  D.SVG.Path({ attrs: { d: 'M12 2L2 7l10 5 10-5-10-5z' } })
])
```

---

## 4. UI Components Reference

```javascript
// ✅ المكونات الجاهزة في Mishkah.UI

// A. Button
UI.Button({
  variant: 'primary',    // primary, secondary, ghost, danger
  size: 'md',           // sm, md, lg
  label: 'حفظ',
  icon: '💾',
  onClick: function() { /* ... */ }
})

// B. Card
UI.Card({
  title: 'العنوان',
  subtitle: 'عنوان فرعي',
  content: D.Text.P({}, ['محتوى البطاقة']),
  footer: UI.Button({ label: 'إجراء' })
})

// C. Badge
UI.Badge({
  text: 'جديد',
  variant: 'success',   // success, warning, danger, info
  size: 'sm'
})

// D. Modal
UI.Modal({
  title: 'تأكيد الحذف',
  content: D.Text.P({}, ['هل أنت متأكد من الحذف؟']),
  actions: [
    UI.Button({ label: 'إلغاء', variant: 'ghost' }),
    UI.Button({ label: 'حذف', variant: 'danger' })
  ]
})

// E. Toast
UI.Toast({
  message: 'تم الحفظ بنجاح',
  type: 'success',      // success, error, warning, info
  duration: 3000
})

// F. Toolbar
UI.Toolbar({
  items: [
    { icon: '🏠', label: 'الرئيسية', action: '...' },
    { icon: '⚙️', label: 'الإعدادات', action: '...' }
  ]
})
```

---

## 5. HTMLx Templates

### A. Template الأساسي

```html
<template id="my-component">
  <!-- Style (optional) -->
  <style>
    .my-component {
      padding: 1rem;
      border: 1px solid #ccc;
    }
  </style>

  <!-- HTML Content -->
  <div class="my-component">
    <h2>{{data.title}}</h2>
    <p>{{data.description}}</p>
    <button data-m-key="my-component:save">حفظ</button>
  </div>

  <!-- Data (optional) -->
  <script type="application/json" data-m-path="data">
    {
      "title": "عنوان",
      "description": "وصف"
    }
  </script>

  <!-- Logic -->
  <script>
    function myComponentMount(app, helpers) {
      console.log('Component mounted!');
    }
  </script>
  <script data-after-mount="myComponentMount"></script>
</template>
```

### B. Placeholders

```html
<!-- ✅ أنواع Placeholders -->

<!-- 1. Data access -->
<p>{{data.username}}</p>
<p>{{data.user.profile.name}}</p>

<!-- 2. Environment -->
<p>{{env.lang}}</p>
<p>{{env.theme}}</p>

<!-- 3. i18n -->
<p>{{i18n.welcome}}</p>
<p>{{i18n.messages.success}}</p>

<!-- 4. Functions -->
<p>{trans('key')}</p>
<p>{formatCurrency(data.price)}</p>
<p>{formatDate(data.createdAt)}</p>
```

### C. Directives

```html
<!-- ✅ x-for: Loop -->
<ul>
  <li x-for="item in data.items" key="item.id">
    {{item.name}} - {{item.price}}
  </li>
</ul>

<!-- ✅ x-if: Conditional -->
<div x-if="data.isActive">
  المحتوى ظاهر فقط إذا كان isActive = true
</div>

<!-- ✅ x-bind: Dynamic attributes -->
<button x-bind:disabled="data.isLoading">
  حفظ
</button>
```

---

## 6. Event Handling Patterns

### A. باستخدام gkey (الطريقة الأساسية)

```javascript
// ✅ في DSL
D.Forms.Button({
  attrs: {
    gkey: 'namespace:action:save'
  }
}, ['حفظ'])

// ✅ في Orders
const orders = {
  'namespace:action:save': function(event, context) {
    console.log('Event:', event);
    console.log('Context:', context);
    console.log('Database:', context.db);
    console.log('Element:', event.target);
  }
};
```

### B. باستخدام HTMLx

```html
<!-- ✅ في Template -->
<button data-m-key="form:submit">حفظ</button>

<script>
  function formSubmit(event, context) {
    event.preventDefault();
    // handle submission
  }

  // Register handler
  if (window.Mishkah && window.Mishkah.orders) {
    window.Mishkah.orders['form:submit'] = formSubmit;
  }
</script>
```

### C. Event Delegation Pattern

```javascript
// ✅ نمط Event Delegation الكامل
const orders = {
  // Action على عنصر محدد
  'users:edit:123': function(event, context) {
    editUser('123');
  },

  // Action عام مع data attribute
  'users:edit': function(event, context) {
    const userId = event.target.dataset.userId;
    editUser(userId);
  },

  // Action مع parameter من gkey
  'products:*': function(event, context) {
    const fullKey = event.target.getAttribute('gkey');
    const parts = fullKey.split(':');
    const action = parts[1];
    const productId = parts[2];
    handleProduct(action, productId);
  }
};
```

---

## 7. State Management

### A. Basic State

```javascript
// ✅ إنشاء state أساسي
const db = {
  env: {
    lang: 'ar',
    theme: 'dark'
  },
  data: {
    users: [],
    currentUser: null,
    loading: false
  }
};

// ✅ قراءة State
M.app.setBody((stateWrapper, D) => {
  const state = stateWrapper.data;
  return D.Text.P({}, [state.currentUser?.name || 'لا يوجد مستخدم']);
});
```

### B. Updating State

```javascript
// ✅ تحديث State باستخدام context
const orders = {
  'app:login': function(event, context) {
    // Update state
    context.db.data.currentUser = { id: 1, name: 'أحمد' };
    context.db.data.loading = false;

    // Rebuild UI
    context.rebuild();
  }
};
```

### C. Advanced State with setState

```javascript
// ✅ استخدام setState للتحديث المنظم
const orders = {
  'app:loadUsers': async function(event, context) {
    // Set loading
    context.setState({ loading: true });

    try {
      const users = await fetchUsers();
      context.setState({
        users: users,
        loading: false
      });
    } catch (error) {
      context.setState({
        error: error.message,
        loading: false
      });
    }
  }
};
```

---

## 8. 20 Practical Examples

### مثال 1: صفحة تسجيل دخول بسيطة

```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;

  const db = {
    env: { lang: 'ar' },
    data: { username: '', password: '', error: null }
  };

  const orders = {
    'login:submit': function(event, context) {
      event.preventDefault();
      const username = context.db.data.username;
      const password = context.db.data.password;

      if (username === 'admin' && password === 'admin') {
        alert('تم تسجيل الدخول بنجاح');
      } else {
        context.db.data.error = 'بيانات خاطئة';
        context.rebuild();
      }
    },

    'input:username': function(event, context) {
      context.db.data.username = event.target.value;
    },

    'input:password': function(event, context) {
      context.db.data.password = event.target.value;
    }
  };

  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;

    return D.Containers.Div({ attrs: { class: 'login-page' } }, [
      D.Text.H1({}, ['تسجيل الدخول']),

      state.error ? D.Text.P({ attrs: { class: 'error' } }, [state.error]) : null,

      D.Forms.Form({ events: { gkey: 'login:submit' } }, [
        D.Forms.Label({}, ['اسم المستخدم:']),
        D.Inputs.Input({
          attrs: {
            type: 'text',
            name: 'username',
            gkey: 'input:username'
          }
        }),

        D.Forms.Label({}, ['كلمة المرور:']),
        D.Inputs.Input({
          attrs: {
            type: 'password',
            name: 'password',
            gkey: 'input:password'
          }
        }),

        D.Forms.Button({ attrs: { type: 'submit' } }, ['دخول'])
      ])
    ].filter(Boolean));
  });

  M.app.createApp(db, orders).mount('#app');
})();
```

### مثال 2: جدول بيانات مع بحث

```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;

  const db = {
    env: { lang: 'ar' },
    data: {
      users: [
        { id: 1, name: 'أحمد حسن', email: 'ahmed@example.com', status: 'نشط' },
        { id: 2, name: 'فاطمة علي', email: 'fatima@example.com', status: 'نشط' },
        { id: 3, name: 'محمد سالم', email: 'mohamed@example.com', status: 'معطل' }
      ],
      searchQuery: '',
      filteredUsers: []
    }
  };

  // Initialize filtered users
  db.data.filteredUsers = db.data.users.slice();

  const orders = {
    'search:input': function(event, context) {
      const query = event.target.value.toLowerCase();
      context.db.data.searchQuery = query;

      // Filter users
      context.db.data.filteredUsers = context.db.data.users.filter(user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );

      context.rebuild();
    },

    'user:delete': function(event, context) {
      const userId = parseInt(event.target.dataset.userId);
      if (confirm('هل تريد حذف هذا المستخدم؟')) {
        context.db.data.users = context.db.data.users.filter(u => u.id !== userId);
        context.db.data.filteredUsers = context.db.data.filteredUsers.filter(u => u.id !== userId);
        context.rebuild();
      }
    }
  };

  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;

    return D.Containers.Div({ attrs: { class: 'users-table' } }, [
      D.Text.H1({}, ['إدارة المستخدمين']),

      // Search box
      D.Containers.Div({ attrs: { class: 'search-box' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: 'بحث...',
            value: state.searchQuery,
            gkey: 'search:input'
          }
        })
      ]),

      // Table
      D.Tables.Table({ attrs: { class: 'data-table' } }, [
        D.Tables.Thead({}, [
          D.Tables.Tr({}, [
            D.Tables.Th({}, ['#']),
            D.Tables.Th({}, ['الاسم']),
            D.Tables.Th({}, ['البريد']),
            D.Tables.Th({}, ['الحالة']),
            D.Tables.Th({}, ['إجراءات'])
          ])
        ]),
        D.Tables.Tbody({}, state.filteredUsers.map(user =>
          D.Tables.Tr({}, [
            D.Tables.Td({}, [user.id]),
            D.Tables.Td({}, [user.name]),
            D.Tables.Td({}, [user.email]),
            D.Tables.Td({}, [user.status]),
            D.Tables.Td({}, [
              D.Forms.Button({
                attrs: {
                  class: 'btn-delete',
                  gkey: 'user:delete',
                  'data-user-id': user.id
                }
              }, ['حذف'])
            ])
          ])
        ))
      ]),

      // Results count
      D.Text.P({}, [
        `عرض ${state.filteredUsers.length} من ${state.users.length} مستخدم`
      ])
    ]);
  });

  M.app.createApp(db, orders).mount('#app');
})();
```

### مثال 3: نموذج ديناميكي

```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;

  const db = {
    env: { lang: 'ar' },
    data: {
      form: {
        name: '',
        email: '',
        phone: '',
        category: ''
      },
      categories: ['دعم فني', 'مبيعات', 'استفسار عام'],
      submitted: false
    }
  };

  const orders = {
    'form:input': function(event, context) {
      const fieldName = event.target.name;
      const value = event.target.value;
      context.db.data.form[fieldName] = value;
    },

    'form:submit': function(event, context) {
      event.preventDefault();
      const form = context.db.data.form;

      // Validate
      if (!form.name || !form.email) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
      }

      // Submit
      console.log('Submitting:', form);
      context.db.data.submitted = true;
      context.rebuild();
    },

    'form:reset': function(event, context) {
      context.db.data.form = {
        name: '',
        email: '',
        phone: '',
        category: ''
      };
      context.db.data.submitted = false;
      context.rebuild();
    }
  };

  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;

    if (state.submitted) {
      return D.Containers.Div({ attrs: { class: 'success-message' } }, [
        D.Text.H2({}, ['تم الإرسال بنجاح!']),
        D.Text.P({}, ['شكراً لتواصلك معنا']),
        D.Forms.Button({
          attrs: { gkey: 'form:reset' }
        }, ['إرسال رسالة جديدة'])
      ]);
    }

    return D.Containers.Div({ attrs: { class: 'contact-form' } }, [
      D.Text.H1({}, ['نموذج الاتصال']),

      D.Forms.Form({ events: { gkey: 'form:submit' } }, [
        // Name
        D.Forms.Label({}, ['الاسم الكامل *']),
        D.Inputs.Input({
          attrs: {
            type: 'text',
            name: 'name',
            value: state.form.name,
            required: true,
            gkey: 'form:input'
          }
        }),

        // Email
        D.Forms.Label({}, ['البريد الإلكتروني *']),
        D.Inputs.Input({
          attrs: {
            type: 'email',
            name: 'email',
            value: state.form.email,
            required: true,
            gkey: 'form:input'
          }
        }),

        // Phone
        D.Forms.Label({}, ['رقم الهاتف']),
        D.Inputs.Input({
          attrs: {
            type: 'tel',
            name: 'phone',
            value: state.form.phone,
            gkey: 'form:input'
          }
        }),

        // Category
        D.Forms.Label({}, ['نوع الرسالة']),
        D.Inputs.Select({
          attrs: {
            name: 'category',
            gkey: 'form:input'
          }
        }, [
          D.Inputs.Option({ attrs: { value: '' } }, ['اختر...']),
          ...state.categories.map(cat =>
            D.Inputs.Option({
              attrs: {
                value: cat,
                selected: state.form.category === cat
              }
            }, [cat])
          )
        ]),

        // Submit
        D.Forms.Button({
          attrs: { type: 'submit', class: 'btn-primary' }
        }, ['إرسال'])
      ])
    ]);
  });

  M.app.createApp(db, orders).mount('#app');
})();
```

### مثال 4: Todo List

```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;

  const db = {
    env: { lang: 'ar' },
    data: {
      todos: [
        { id: 1, text: 'شراء البقالة', completed: false },
        { id: 2, text: 'الاجتماع الساعة 3', completed: true }
      ],
      newTodo: '',
      filter: 'all' // all, active, completed
    }
  };

  let nextId = 3;

  const orders = {
    'todo:add': function(event, context) {
      event.preventDefault();
      const text = context.db.data.newTodo.trim();
      if (!text) return;

      context.db.data.todos.push({
        id: nextId++,
        text: text,
        completed: false
      });
      context.db.data.newTodo = '';
      context.rebuild();
    },

    'todo:input': function(event, context) {
      context.db.data.newTodo = event.target.value;
    },

    'todo:toggle': function(event, context) {
      const id = parseInt(event.target.dataset.todoId);
      const todo = context.db.data.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
        context.rebuild();
      }
    },

    'todo:delete': function(event, context) {
      const id = parseInt(event.target.dataset.todoId);
      context.db.data.todos = context.db.data.todos.filter(t => t.id !== id);
      context.rebuild();
    },

    'filter:change': function(event, context) {
      context.db.data.filter = event.target.dataset.filter;
      context.rebuild();
    }
  };

  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;

    // Filter todos
    const filteredTodos = state.todos.filter(todo => {
      if (state.filter === 'active') return !todo.completed;
      if (state.filter === 'completed') return todo.completed;
      return true;
    });

    const activeCount = state.todos.filter(t => !t.completed).length;

    return D.Containers.Div({ attrs: { class: 'todo-app' } }, [
      D.Text.H1({}, ['قائمة المهام']),

      // Add form
      D.Forms.Form({ events: { gkey: 'todo:add' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: 'أضف مهمة جديدة...',
            value: state.newTodo,
            gkey: 'todo:input'
          }
        }),
        D.Forms.Button({ attrs: { type: 'submit' } }, ['إضافة'])
      ]),

      // Filters
      D.Containers.Div({ attrs: { class: 'filters' } }, [
        D.Forms.Button({
          attrs: {
            class: state.filter === 'all' ? 'active' : '',
            gkey: 'filter:change',
            'data-filter': 'all'
          }
        }, ['الكل']),
        D.Forms.Button({
          attrs: {
            class: state.filter === 'active' ? 'active' : '',
            gkey: 'filter:change',
            'data-filter': 'active'
          }
        }, ['نشطة']),
        D.Forms.Button({
          attrs: {
            class: state.filter === 'completed' ? 'active' : '',
            gkey: 'filter:change',
            'data-filter': 'completed'
          }
        }, ['مكتملة'])
      ]),

      // Todo list
      D.Lists.Ul({ attrs: { class: 'todo-list' } }, filteredTodos.map(todo =>
        D.Lists.Li({
          attrs: {
            class: todo.completed ? 'completed' : ''
          }
        }, [
          D.Inputs.Input({
            attrs: {
              type: 'checkbox',
              checked: todo.completed,
              gkey: 'todo:toggle',
              'data-todo-id': todo.id
            }
          }),
          D.Text.Span({}, [todo.text]),
          D.Forms.Button({
            attrs: {
              class: 'btn-delete',
              gkey: 'todo:delete',
              'data-todo-id': todo.id
            }
          }, ['×'])
        ])
      )),

      // Stats
      D.Text.P({ attrs: { class: 'stats' } }, [
        `${activeCount} مهمة نشطة من ${state.todos.length}`
      ])
    ]);
  });

  M.app.createApp(db, orders).mount('#app');
})();
```

### مثال 5: Modal Dialog

```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;
  const UI = M.UI;

  const db = {
    env: { lang: 'ar' },
    data: {
      showModal: false,
      modalTitle: '',
      modalContent: ''
    }
  };

  const orders = {
    'modal:open': function(event, context) {
      context.db.data.showModal = true;
      context.db.data.modalTitle = 'تأكيد الحذف';
      context.db.data.modalContent = 'هل أنت متأكد من حذف هذا العنصر؟';
      context.rebuild();
    },

    'modal:close': function(event, context) {
      context.db.data.showModal = false;
      context.rebuild();
    },

    'modal:confirm': function(event, context) {
      alert('تم التأكيد');
      context.db.data.showModal = false;
      context.rebuild();
    }
  };

  M.app.setBody((stateWrapper, D) => {
    const state = stateWrapper.data;

    return D.Containers.Div({ attrs: { class: 'app' } }, [
      D.Text.H1({}, ['مثال Modal']),

      D.Forms.Button({
        attrs: {
          class: 'btn-primary',
          gkey: 'modal:open'
        }
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
          D.Text.H2({}, [state.modalTitle]),
          D.Text.P({}, [state.modalContent]),
          D.Containers.Div({ attrs: { class: 'modal-actions' } }, [
            D.Forms.Button({
              attrs: {
                class: 'btn-secondary',
                gkey: 'modal:close'
              }
            }, ['إلغاء']),
            D.Forms.Button({
              attrs: {
                class: 'btn-danger',
                gkey: 'modal:confirm'
              }
            }, ['تأكيد'])
          ])
        ])
      ]) : null
    ].filter(Boolean));
  });

  M.app.createApp(db, orders).mount('#app');
})();
```

---

## 9. Anti-Patterns - ما لا يجب فعله

### ❌ Anti-Pattern 1: ES6 Imports

```javascript
// ❌ خطأ
import { div, button } from '../../static/lib/mishkah.div.js';

// ✅ صحيح
(async function() {
  const M = Mishkah;
  const D = M.DSL;
})();
```

### ❌ Anti-Pattern 2: Direct DOM Manipulation

```javascript
// ❌ خطأ
const div = document.createElement('div');
div.innerHTML = '<h1>Title</h1>';
document.body.appendChild(div);

// ✅ صحيح
M.app.setBody((stateWrapper, D) => {
  return D.Containers.Div({}, [
    D.Text.H1({}, ['Title'])
  ]);
});
```

### ❌ Anti-Pattern 3: Inline Event Handlers

```javascript
// ❌ خطأ
D.Forms.Button({
  attrs: {
    onclick: "alert('clicked')"
  }
}, ['Click'])

// ✅ صحيح
D.Forms.Button({
  attrs: { gkey: 'action:click' }
}, ['Click'])

const orders = {
  'action:click': function(event, context) {
    alert('clicked');
  }
};
```

### ❌ Anti-Pattern 4: State Mutation Without Rebuild

```javascript
// ❌ خطأ - لن يتم تحديث الواجهة
const orders = {
  'update:data': function(event, context) {
    context.db.data.value = 'new value';
    // Missing: context.rebuild();
  }
};

// ✅ صحيح
const orders = {
  'update:data': function(event, context) {
    context.db.data.value = 'new value';
    context.rebuild(); // ✅ إعادة بناء الواجهة
  }
};
```

### ❌ Anti-Pattern 5: Loading Libraries as Modules

```html
<!-- ❌ خطأ -->
<script type="module" src="../../static/lib/mishkah.core.js"></script>

<!-- ✅ صحيح -->
<script src="../../static/lib/mishkah.core.js"></script>
```

---

## 10. AI Productivity Tips

### A. Patterns للـ AI

عند العمل مع Mishkah، اتبع هذه الأنماط:

**1. ابدأ دائماً بـ IIFE:**
```javascript
(async function() {
  const M = Mishkah;
  const D = M.DSL;
  const UI = M.UI;
  const U = M.utils;
  // ... rest of code
})();
```

**2. استخدم Structure Pattern:**
```javascript
// 1. Setup
const M = Mishkah;

// 2. Data
const db = { env: {}, data: {} };

// 3. Orders
const orders = {};

// 4. Body
M.app.setBody((stateWrapper, D) => { ... });

// 5. Mount
M.app.createApp(db, orders).mount('#app');
```

**3. اتبع Naming Conventions:**
```javascript
// gkey pattern: namespace:action:target
'users:edit:123'
'form:submit'
'modal:close'
'filter:change'
```

### B. Checklist للتطبيقات

عند إنشاء تطبيق جديد:

- [ ] استخدم IIFE pattern
- [ ] حمّل المكتبات كـ `<script>` عادية
- [ ] أنشئ `db` object بـ env و data
- [ ] أنشئ `orders` object للأحداث
- [ ] استخدم DSL Atoms من `D.*`
- [ ] استخدم `gkey` للأحداث
- [ ] اعمل `rebuild()` بعد تحديث الحالة
- [ ] اختبر في المتصفح مباشرة

### C. Common Patterns Reference

**Loading Pattern:**
```javascript
const db = {
  data: {
    loading: false,
    error: null,
    data: []
  }
};

const orders = {
  'data:load': async function(event, context) {
    context.db.data.loading = true;
    context.rebuild();

    try {
      const result = await fetchData();
      context.db.data.data = result;
      context.db.data.loading = false;
    } catch (error) {
      context.db.data.error = error.message;
      context.db.data.loading = false;
    }

    context.rebuild();
  }
};
```

**Form Pattern:**
```javascript
const db = {
  data: {
    form: {},
    errors: {},
    submitting: false
  }
};

const orders = {
  'form:input': function(event, context) {
    const { name, value } = event.target;
    context.db.data.form[name] = value;
  },

  'form:submit': async function(event, context) {
    event.preventDefault();
    context.db.data.submitting = true;
    context.rebuild();

    try {
      await submitForm(context.db.data.form);
      context.db.data.form = {};
      context.db.data.submitting = false;
      context.rebuild();
    } catch (error) {
      context.db.data.errors = error.errors;
      context.db.data.submitting = false;
      context.rebuild();
    }
  }
};
```

**Filter/Search Pattern:**
```javascript
const db = {
  data: {
    items: [...],
    filter: '',
    filteredItems: [...]
  }
};

const orders = {
  'filter:change': function(event, context) {
    const query = event.target.value.toLowerCase();
    context.db.data.filter = query;
    context.db.data.filteredItems = context.db.data.items.filter(item =>
      item.name.toLowerCase().includes(query)
    );
    context.rebuild();
  }
};
```

---

## 🎓 الخلاصة • Summary

### ✅ ما يجب تذكره:

1. **UMD Pattern** - كل شيء global objects
2. **IIFE** - لف كودك في `(async function() { ... })()`
3. **DSL Atoms** - استخدم `D.Category.Element()`
4. **gkey Events** - نظام event delegation
5. **rebuild()** - بعد كل تحديث للحالة

### 📚 الموارد:

- `mishkah.core.js` - DSL Atoms و VDOM
- `mishkah-ui.js` - UI Components
- `mishkah-htmlx.js` - Template system
- `quick.html` - مثال HTMLx كامل
- `pos-tablet.html` - مثال DSL كامل

### 🚀 البداية السريعة:

```bash
# نسخ Template الأساسي
cp static/quick.html my-app.html

# تعديل حسب الحاجة
# تشغيل في المتصفح مباشرة
```

---

**مشكاة - Mishkah**
Zero-build, browser-native, productive.

# Mishkah-Inspired Modular Architecture

> **نظام العيادة الإلكترونية - معمارية موديلار مستوحاة من Mishkah**

---

## 📐 نظرة عامة

هذا المشروع يستخدم **Mishkah-Inspired Modular Architecture** - وهي معمارية هجينة تجمع بين:

- ✅ **مكونات Mishkah** (DSL, UI, REST)
- ✅ **Orders Pattern** (event handlers with gkeys)
- ✅ **Modular Screens** (كل شاشة في ملف منفصل)
- ❌ **بدون Single Body Function** (لأن المشروع كبير)

---

## 🏗️ البنية الهيكلية

```
clinic/
├── index.html              # نقطة الدخول
├── dashboard.js            # Orchestrator - يدير كل الشاشات
├── UniversalComp.js        # مكونات مشتركة
├── screens/                # الشاشات المنفصلة
│   ├── screen-home.js      # الصفحة الرئيسية
│   ├── screen-contracts.js # إدارة العقود (6000 سطر)
│   ├── screen-profiles.js  # ملفات العملاء
│   ├── screen-bookings.js  # الحجوزات
│   ├── screen-progress.js  # متابعة التقدم
│   └── screen-finance.js   # المالية
└── components/             # مكونات UI قابلة لإعادة الاستخدام
```

---

## 🔄 كيف يعمل النظام؟

### 1. التهيئة (Initialization)

```javascript
// index.html يحمل كل الملفات بالترتيب
<script src="../../lib/mishkah.core.js"></script>
<script src="../../lib/mishkah-ui.js"></script>
<script src="./UniversalComp.js"></script>
<script src="./screens/screen-contracts.js"></script>
<script src="./dashboard.js"></script>
```

### 2. تسجيل الشاشات (Screen Registration)

كل screen يسجل نفسه في global namespace:

```javascript
// screen-contracts.js
(function (global) {
  'use strict';
  
  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.contracts = {
    load: async function(ctx) { ... },    // تحميل البيانات
    render: function(app) { ... },        // رسم الـ UI
    orders: { ... }                        // event handlers
  };
})(window);
```

### 3. الـ Dashboard Orchestration

```javascript
// dashboard.js
var initialState = {
  env: { theme: 'light', lang: 'ar' },
  data: {
    activeScreen: 'home',
    screens: {
      contracts: { list: [], selected: null, ... }
    }
  }
};

function body(state) {
  var activeScreen = state.data.activeScreen;
  
  // Main content
  var content = null;
  if (activeScreen === 'contracts' && ClinicScreens.contracts) {
    content = ClinicScreens.contracts.render(state);
  }
  // ...
  
  return D.Div({}, [
    renderSidebar(state),
    content,
    renderNotifications(state)
  ]);
}

// All orders from all screens
var orders = Object.assign(
  {},
  dashboardOrders,
  ClinicScreens.contracts?.orders || {},
  ClinicScreens.profiles?.orders || {}
  // ...
);

M.app.create(initialState, orders).mount('#app');
```

---

## 📦 بناء Screen جديد

### الهيكل الأساسي

```javascript
// screens/screen-example.js
(function (global) {
  'use strict';
  
  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M && M.UI;
  var D = M && M.DSL;
  
  // ========================================
  // Helper Functions
  // ========================================
  
  function formatData(value) {
    // utility functions
  }
  
  // ========================================
  // Data Loading
  // ========================================
  
  async function loadExampleData(ctx) {
    var state = ctx.getState();
    var lang = state.env.lang;
    
    // Fetch data
    var repo = M.REST.repo('example_table');
    var res = await repo.search({ lang: lang, limit: 20 });
    
    // Update state
    ctx.setState(function(prev) {
      var sc = prev.data.screens.example || {};
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            example: Object.assign({}, sc, {
              list: res.data || [],
              loading: false
            })
          })
        })
      });
    });
  }
  
  // ========================================
  // Screen Registration
  // ========================================
  
  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.example = {
    
    // Load: يُستدعى عند فتح الشاشة أول مرة
    load: async function(ctx) {
      await loadExampleData(ctx);
    },
    
    // Render: يُستدعى في كل re-render
    render: function(app) {
      var state = app.data || app;
      var sc = state.screens.example || {};
      var lang = state.env?.lang || 'ar';
      
      return D.Div({ attrs: { class: 'example-screen' } }, [
        D.H1({}, [lang === 'ar' ? 'شاشة المثال' : 'Example Screen']),
        
        // List
        D.Div({ attrs: { class: 'list' } }, 
          (sc.list || []).map(function(item) {
            return D.Div({ attrs: { 
              class: 'item',
              gkey: 'example:select',
              'data-id': item.id
            } }, [item.name]);
          })
        )
      ]);
    },
    
    // Orders: event handlers
    orders: {
      'example:select': {
        on: ['click'],
        gkeys: ['example:select'],
        handler: function(ev, ctx) {
          var id = ev.target.getAttribute('data-id');
          console.log('Selected:', id);
        }
      }
    }
  };
  
})(window);
```

---

## 🎯 الـ Patterns الأساسية

### 1. State Management

```javascript
// State structure
state = {
  env: { theme, lang, dir },
  data: {
    activeScreen: 'contracts',
    screens: {
      contracts: {
        list: [],           // القائمة الرئيسية
        selected: null,     // العنصر المختار
        editor: {           // محرر العقد
          form: {},
          patientModal: {}  // المودلات الفرعية
        }
      }
    }
  }
};

// Update pattern
ctx.setState(function(prev) {
  var sc = prev.data.screens.contracts || {};
  return Object.assign({}, prev, {
    data: Object.assign({}, prev.data, {
      screens: Object.assign({}, prev.data.screens, {
        contracts: Object.assign({}, sc, {
          selected: newValue
        })
      })
    })
  });
});
```

### 2. Modal Rendering

```javascript
// Helper function للمودل
function renderExampleModal(ctx) {
  var state = ctx.getState ? ctx.getState() : ctx;
  var modal = state.data.screens.example.modal;
  
  if (!modal || !modal.open) return null;
  
  return UI.Modal({
    open: true,
    title: 'عنوان المودل',
    closeGkey: 'example:modal-close',
    content: D.Form({}, [...]),
    actions: [
      UI.Button({ 
        label: 'حفظ', 
        gkey: 'example:modal-save' 
      })
    ]
  });
}

// في الـ render
render: function(app) {
  var base = renderMainScreen(app);
  var modal = renderExampleModal(app);
  return D.Div({}, [base, modal].filter(Boolean));
}
```

### 3. Orders Pattern

```javascript
orders: {
  // Open modal
  'example:modal-open': {
    on: ['click'],
    gkeys: ['example:modal-open'],
    handler: async function(_ev, ctx) {
      // Initialize modal state
      ctx.setState(function(prev) {
        var sc = prev.data.screens.example || {};
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              example: Object.assign({}, sc, {
                modal: { open: true, form: {} }
              })
            })
          })
        });
      });
    }
  },
  
  // Close modal
  'example:modal-close': {
    on: ['click'],
    gkeys: ['example:modal-close'],
    handler: function(_ev, ctx) {
      ctx.setState(function(prev) {
        var sc = prev.data.screens.example || {};
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              example: Object.assign({}, sc, { modal: null })
            })
          })
        });
      });
    }
  }
}
```

---

## 🔑 مبادئ أساسية

### 1. Separation of Concerns

```
Helper Functions  → formatters, validators
Data Loading      → API calls, state updates  
Rendering         → UI structure (pure functions)
Orders            → Event handlers (side effects)
```

### 2. Immutable State Updates

```javascript
// ❌ خطأ - mutation مباشر
sc.selected = newValue;

// ✅ صح - immutable update
Object.assign({}, sc, { selected: newValue })
```

### 3. Safe State Access

```javascript
// ✅ دائمًا استخدم fallbacks
var sc = state.data.screens.contracts || {};
var form = sc.editor?.form || {};
```

### 4. Rendering Helpers

```javascript
// فصل الـ rendering في functions
function renderPatientModal(ctx) { ... }
function renderBookingCalendar(ctx) { ... }

// ثم استدعاءهم في الـ main render
render: function(app) {
  var base = renderScreen(app);
  var modal = renderPatientModal(app);
  var calendar = renderBookingCalendar(app);
  return D.Div({}, [base, modal, calendar].filter(Boolean));
}
```

---

## ⚡ Best Practices

### 1. تسمية الـ gkeys

```javascript
// Pattern: 'screen:action'
'contracts:new'
'contracts:save'
'contracts:patient-modal-open'
'contracts:patient-modal-close'
```

### 2. تنظيم State

```javascript
// ❌ سيء - flat structure
data: {
  contractsList: [],
  contractSelected: null,
  patientModalOpen: false
}

// ✅ جيد - nested structure
data: {
  screens: {
    contracts: {
      list: [],
      selected: null,
      patientModal: { open: false }
    }
  }
}
```

### 3. Error Handling

```javascript
handler: async function(_ev, ctx) {
  try {
    var res = await M.REST.repo('table').create(data);
    // success
    pushNotification(ctx, 'success', 'تم الحفظ');
  } catch (error) {
    console.error('[Screen] Error:', error);
    pushNotification(ctx, 'error', 'فشل الحفظ: ' + error.message);
  }
}
```

### 4. Loading States

```javascript
// Set loading
ctx.setState(function(prev) {
  var sc = prev.data.screens.example || {};
  return Object.assign({}, prev, {
    data: Object.assign({}, prev.data, {
      screens: Object.assign({}, prev.data.screens, {
        example: Object.assign({}, sc, { loading: true })
      })
    })
  });
});

// API call

// Reset loading
ctx.setState(function(prev) {
  var sc = prev.data.screens.example || {};
  return Object.assign({}, prev, {
    data: Object.assign({}, prev.data, {
      screens: Object.assign({}, prev.data.screens, {
        example: Object.assign({}, sc, { loading: false })
      })
    })
  });
});
```

---

## 📊 المقارنة

### Pure Mishkah DSL vs Mishkah-Inspired

| الميزة | Pure Mishkah | Mishkah-Inspired |
|--------|--------------|------------------|
| **حجم المشروع** | صغير (< 1000 سطر) | كبير (> 5000 سطر) |
| **عدد الشاشات** | 1-3 شاشات | 5+ شاشات |
| **الملفات** | ملف واحد | ملف لكل screen |
| **الـ State** | Single object | Nested screens |
| **الـ Body** | Function واحدة | Helper functions |
| **التعاون** | صعب (conflic ts) | سهل (ملفات منفصلة) |
| **الصيانة** | الملف يكبر | Modular و managed |
| **التعقيد** | بسيط | متوسط |

### متى تستخدم كل واحدة؟

**Pure Mishkah** للـ:

- Landing pages
- Simple dashboards  
- Internal tools
- Prototypes

**Mishkah-Inspired** للـ:

- Enterprise applications
- Multi-screen apps
- Team projects
- Complex workflows

---

## 🛠️ خطوات إضافة Screen جديد

### 1. إنشاء الملف

```bash
touch screens/screen-newfeature.js
```

### 2. الكود الأساسي

```javascript
(function (global) {
  'use strict';
  
  var M = global.Mishkah;
  var D = M && M.DSL;
  var UI = M && M.UI;
  
  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.newfeature = {
    load: async function(ctx) {
      // Load data
    },
    render: function(app) {
      return D.Div({}, ['New Feature Screen']);
    },
    orders: {}
  };
})(window);
```

### 3. إضافة للـ index.html

```html
<script src="./screens/screen-newfeature.js"></script>
```

### 4. إضافة للـ dashboard.js

```javascript
// في initialState
data: {
  screens: {
    newfeature: { loading: false }
  }
}

// في body function
if (activeScreen === 'newfeature') {
  content = ClinicScreens.newfeature.render(state);
}

// في orders
var orders = Object.assign(
  {},
  dashboardOrders,
  ClinicScreens.newfeature?.orders || {}
);
```

### 5. إضافة لـ Sidebar

```javascript
// في renderSidebar
D.Li({}, [
  D.Button({
    attrs: {
      gkey: 'crud:switch-screen',
      'data-screen': 'newfeature'
    }
  }, ['الميزة الجديدة'])
])
```

---

## 🎓 مثال كامل: Patient Modal

راجع [`screen-contracts.js`](file:///d:/git/os/static/projects/clinic/screens/screen-contracts.js) للمثال الحي:

```javascript
// Lines 3956-4124: Orders
'contracts:patient-modal-open'
'contracts:patient-modal-close'
'contracts:patient-modal-update-field'
'contracts:patient-modal-save'

// Lines 5799-5874: Rendering
function renderPatientModal(ctx) { ... }

// Line 3414: Integration
render: function(app) {
  var patientModal = renderPatientModal(app);
  return D.Div({}, [base, modal, patientModal].filter(Boolean));
}
```

---

## 📝 ملاحظات مهمة

### 1. الـ Context (ctx vs app)

```javascript
// في Orders - ctx بيكون MishkahApp instance
handler: function(ev, ctx) {
  var state = ctx.getState();
  ctx.setState(function(prev) { ... });
}

// في Render - app بيكون الـ state object
render: function(app) {
  var state = app.data || app;
}
```

### 2. Screen State Initialization

```javascript
// في dashboard.js initialState
screens: {
  contracts: {
    loading: false,
    list: [],
    selected: null,
    editor: null  // Important: initialize nested objects
  }
}
```

### 3. Safe Filtering

```javascript
// دائمًا استخدم filter(Boolean) لإزالة null
return D.Div({}, [
  base,
  modal1,
  modal2,
  modal3
].filter(Boolean));
```

---

## 🎯 الخلاصة

**Mishkah-Inspired Architecture** هي:

- ✅ **Scalable** - تقدر تكبر لـ 50+ screen
- ✅ **Maintainable** - سهل الصيانة والتطوير
- ✅ **Team-friendly** - كل developer يشتغل على screen
- ✅ **Performance-conscious** - code splitting ممكن
- ✅ **Mishkah-compatible** - بتستخدم نفس المكونات

**متى تستخدمها؟**

- المشروع > 3000 سطر
- أكثر من 5 شاشات
- فريق عمل > شخص واحد
- Complex business logic

---

## 📚 مراجع

- [Mishkah Pure DSL Guide](file:///d:/git/os/static/docs/dsl/README.md)
- [Implementation Plan](file:///C:/Users/Hussein/.gemini/antigravity/brain/2bd093eb-eb6b-48c2-b2b3-556a2dbd8365/implementation_plan.md)
- [Walkthrough Example](file:///C:/Users/Hussein/.gemini/antigravity/brain/2bd093eb-eb6b-48c2-b2b3-556a2dbd8365/walkthrough.md)

---

**تاريخ التحديث:** 2026-01-17  
**الإصدار:** 1.0  
**المؤلف:** Mishkah Team + AI Assistant

# Mishkah.js - Technical Reference Guide for AI Systems

## بسم الله الرحمن الرحيم

**Document Type:** Technical Reference for AI Code Assistants
**Target Audience:** AI systems (Claude, GPT, Copilot, etc.) assisting developers with Mishkah
**Version:** 1.0
**Last Updated:** 2025-11-09

---

## 🎯 Quick Start for AI Systems

When you see Mishkah code or are asked to write Mishkah applications, follow these principles:

### **Core Philosophy:**
1. **Single Source of Truth**: All state lives in ONE place (`database` object)
2. **Strict Separation**: Structure (DSL) is separate from behavior (orders)
3. **Zero Build**: Pure UMD modules - no bundler, no compiler
4. **Centralized Events**: All events handled via delegation
5. **Virtual DOM**: Efficient reconciliation with LIS algorithm for lists

---

## 📦 Module System (UMD)

### Loading Order (CRITICAL):
```html
<!-- 1. Core (required first) -->
<script src="/lib/mishkah.core.js"></script>

<!-- 2. Utils (optional but recommended) -->
<script src="/lib/mishkah-utils.js"></script>

<!-- 3. UI Components (optional) -->
<script src="/lib/mishkah-ui.js"></script>

<!-- 4. HTMLx (if using template-based approach) -->
<script src="/lib/mishkah-htmlx.js"></script>

<!-- 5. Store (if using realtime data) -->
<script src="/lib/mishkah.simple-store.js"></script>
```

### Global Namespace:
```javascript
// All available as:
window.Mishkah
window.M  // Alias

// Structure:
Mishkah.DSL       // Atoms (building blocks)
Mishkah.UI        // Components
Mishkah.app       // Application factory
Mishkah.utils     // Utilities
Mishkah.Head      // <head> management
```

---

## 🏗️ Architecture Layers

### Layer 1: DSL Atoms (Building Blocks)

**IMPORTANT**: Atoms are categorized by **function**, not HTML semantics.

```javascript
const D = Mishkah.DSL;

// ✅ CORRECT Categories:
D.Containers.Div({attrs: {class: 'container'}}, ['content'])
D.Text.H1({attrs: {id: 'title'}}, ['Hello'])
D.Forms.Button({attrs: {'data-m-gkey': 'submit'}}, ['Submit'])
D.Inputs.Input({attrs: {type: 'text', value: ''}})
D.Media.Img({attrs: {src: '/image.jpg', alt: 'Description'}})
D.Tables.Table({}, [D.Tables.Thead({}, ...)])
D.Lists.Ul({}, [D.Lists.Li({}, ['Item'])])
```

#### ⚠️ AI Common Mistakes:

**MISTAKE 1: Confusing Forms vs Inputs**
```javascript
// ❌ WRONG - Button is in Forms, not Inputs
D.Inputs.Button(...)

// ✅ CORRECT
D.Forms.Button(...)
```

**MISTAKE 2: Using HTML directly**
```javascript
// ❌ WRONG - Mishkah uses DSL, not raw HTML in body function
function body(db, D) {
  return '<div>Hello</div>'; // This won't work!
}

// ✅ CORRECT
function body(db, D) {
  return D.Containers.Div({}, ['Hello']);
}
```

**MISTAKE 3: Forgetting attrs object**
```javascript
// ❌ WRONG
D.Text.P('class', 'text-center', ['Hello'])

// ✅ CORRECT
D.Text.P({attrs: {class: 'text-center'}}, ['Hello'])
```

#### Complete Atoms Reference:

```javascript
// Containers (layout/structure)
Containers: Div, Section, Article, Header, Footer, Main, Nav, Aside, Address

// Text (typography)
Text: P, Span, H1, H2, H3, H4, H5, H6, Strong, Em, B, I, Small, Mark,
      Code, Pre, Blockquote, Time, Sup, Sub, A

// Lists
Lists: Ul, Ol, Li, Dl, Dt, Dd

// Forms (structure, NOT input elements)
Forms: Form, Label, Button, Fieldset, Legend, Datalist, Output, Progress, Meter

// Inputs (actual input elements)
Inputs: Input, Textarea, Select, Option, Optgroup

// Media
Media: Img, Video, Audio, Source, Track, Picture, Iframe

// Tables
Tables: Table, Thead, Tbody, Tfoot, Tr, Th, Td, Caption, Col, Colgroup

// Semantic
Semantic: Details, Summary, Figure, Figcaption, Template

// Embedded
Embedded: Canvas, Svg

// SVG
SVG: Svg, G, Path, Circle, Ellipse, Rect, Line, Polyline, Polygon,
     Text, Tspan, Defs, Use, ClipPath, Mask, etc.

// Misc
Misc: Hr, Br
```

---

### Layer 2: Application Structure

```javascript
// Step 1: Define body function (UI structure)
Mishkah.app.setBody(function(database, D) {
  return D.Containers.Div(
    {attrs: {class: 'app'}},
    [
      D.Text.H1({}, [database.title]),
      D.Forms.Button(
        {attrs: {'data-m-gkey': 'increment'}},
        ['Count: ' + database.count]
      )
    ]
  );
});

// Step 2: Create app with initial state
const app = Mishkah.app.createApp(
  // database (state)
  {
    title: 'Counter App',
    count: 0
  },
  // orders (event handlers)
  {
    'counter.increment': {
      on: ['click'],
      gkeys: ['increment'],
      handler: function(event, ctx) {
        ctx.setState(function(prevState) {
          return {
            ...prevState,
            count: prevState.count + 1
          };
        });
      }
    }
  }
);

// Step 3: Mount to DOM
app.mount('#app');
```

---

### Layer 3: Event System (Orders)

**Critical Concept**: Events are NOT attached to elements. Everything is delegated.

#### Order Structure:
```javascript
{
  'order.name': {
    on: ['click', 'input', 'change'],  // Event types
    keys: ['item-123', 'product-*'],   // data-m-key matches
    gkeys: ['submit', 'cancel'],       // data-m-gkey matches
    disabled: false,                   // Optional: disable order
    handler: function(event, ctx) {
      // ctx.getState() - get current state
      // ctx.setState(updater) - update state
      // ctx.rebuild() - force re-render
      // ctx.freeze() - pause updates
      // ctx.unfreeze() - resume updates

      // Scoped queries:
      // ctx.scopeQuery('selector')
      // ctx.scopeQueryAll('selector')

      // Stop propagation:
      // ctx.stop()
    }
  }
}
```

#### Key vs GKey:

```javascript
// `key` - for data/identity (React-like)
D.Lists.Li({attrs: {key: 'user-' + user.id}}, [user.name])

// `gkey` - for event binding (Mishkah-specific)
D.Forms.Button({attrs: {'data-m-gkey': 'save-user'}}, ['Save'])

// ✅ Both can be used together
D.Forms.Button({
  attrs: {
    key: 'edit-' + user.id,        // For VDOM reconciliation
    'data-m-gkey': 'edit-user'     // For event handling
  }
}, ['Edit'])
```

#### Pattern Matching:

```javascript
// Exact match
keys: ['submit-button']

// Wildcard prefix
keys: ['user-*']  // Matches: user-123, user-abc

// Wildcard suffix
keys: ['*-action']  // Matches: save-action, delete-action

// Match all
keys: ['*']

// Multiple patterns
keys: ['user-*', 'product-*', 'exact-key']
```

---

## 🔄 State Management

### Rules:
1. **Never mutate state directly**
2. **Always return new object**
3. **Updates are async (batched)**

```javascript
// ❌ WRONG
function handler(event, ctx) {
  const state = ctx.getState();
  state.count = state.count + 1;  // Direct mutation!
  ctx.setState(state);
}

// ✅ CORRECT (functional update)
function handler(event, ctx) {
  ctx.setState(function(prevState) {
    return {
      ...prevState,
      count: prevState.count + 1
    };
  });
}

// ✅ CORRECT (object merge - shallow)
function handler(event, ctx) {
  ctx.setState({count: ctx.getState().count + 1});
}
```

### Batching Updates:

```javascript
// Multiple setState calls are batched automatically
function handler(event, ctx) {
  ctx.setState(s => ({...s, step: 1}));
  ctx.setState(s => ({...s, step: 2}));  // Only renders once!
}

// For manual control:
ctx.freeze();  // Pause rendering
ctx.setState({step: 1});
ctx.setState({step: 2});
ctx.setState({step: 3});
ctx.unfreeze();  // Renders once with all changes
```

---

## 🌐 Internationalization (i18n)

### Setup:
```javascript
const database = {
  env: {
    lang: 'ar',
    dir: 'rtl',
    theme: 'dark'
  },
  i18n: {
    dict: {
      'app.title': {
        ar: 'لوحة التحكم',
        en: 'Dashboard'
      },
      'app.welcome': {
        ar: 'مرحباً',
        en: 'Welcome'
      }
    }
  }
};
```

### Usage in Body:
```javascript
function body(db, D) {
  const t = function(key) {
    const lang = db.env.lang || 'ar';
    const dict = db.i18n.dict || {};
    return dict[key] && dict[key][lang] ? dict[key][lang] : key;
  };

  return D.Text.H1({}, [t('app.title')]);
}
```

### Auto-Apply to <html>:
Mishkah automatically sets:
- `<html lang="ar" dir="rtl" data-theme="dark">`
- Based on `database.env`

---

## 📊 HTMLx (Template-Based Approach)

### Structure:
```html
<template id="my-app">
  <!-- Data -->
  <script type="application/json" data-m-data data-m-path="data">
    {
      "users": [
        {"id": 1, "name": "أحمد"}
      ]
    }
  </script>

  <!-- HTML with expressions -->
  <div data-m-scope="my-app">
    <h1>{trans('app.title')}</h1>
    <ul>
      <li x-for="user in state.data.users" key="user.id">
        {user.name}
      </li>
    </ul>
    <button onclick="handleClick(event, ctx)">Click</button>
  </div>

  <!-- JavaScript -->
  <script>
    function handleClick(event, ctx) {
      ctx.setState(s => ({
        ...s,
        data: {
          ...s.data,
          users: [...s.data.users, {id: 2, name: 'محمد'}]
        }
      }));
    }

    function __init__(app, helpers) {
      // Called after mount
    }
  </script>
</template>
```

### Expressions:
- `{state.data.value}` - output value
- `{trans('key')}` - translation
- `x-for="item in array"` - loop
- `x-if="condition"` - conditional

---

## 🗄️ Simple Store (Realtime Data)

### Setup:
```javascript
const db = createDB({
  branchId: 'app:main',
  moduleId: 'users',
  wsUrl: 'wss://api.example.com',
  useIndexedDB: true,
  objects: {
    users: {
      table: 'users_table',
      toRecord: (value, ctx) => ctx.ensure({
        id: ctx.uuid('user'),
        name: value.name,
        createdAt: ctx.now()
      }),
      fromRecord: (record) => ({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt
      })
    }
  }
});

// Connect
await db.connect();

// Watch for changes
db.watch('users', (usersList) => {
  console.log('Users updated:', usersList);
});

// Insert
await db.insert('users', {name: 'أحمد'});

// Update
await db.update('users', {id: '123', name: 'محمد'});

// Delete
await db.delete('users', {id: '123'});
```

### Features:
- **Smart Fetch**: Automatically fetches initial data from REST API
- **WebSocket Sync**: Real-time updates via WebSocket
- **IndexedDB Cache**: Offline support
- **Priority**: WebSocket > Smart Fetch > REST > Empty

---

## 🎨 Common Patterns for AI

### Pattern 1: Counter
```javascript
Mishkah.app.setBody(function(db, D) {
  return D.Containers.Div({}, [
    D.Text.P({}, ['Count: ' + db.count]),
    D.Forms.Button({attrs: {'data-m-gkey': 'inc'}}, ['+'])
  ]);
});

const app = Mishkah.app.createApp(
  {count: 0},
  {
    'inc': {
      on: ['click'],
      gkeys: ['inc'],
      handler: (e, ctx) => ctx.setState(s => ({count: s.count + 1}))
    }
  }
);
app.mount('#app');
```

### Pattern 2: Form
```javascript
Mishkah.app.setBody(function(db, D) {
  return D.Forms.Form({}, [
    D.Inputs.Input({
      attrs: {
        type: 'text',
        value: db.name,
        'data-m-gkey': 'name-input'
      }
    }),
    D.Forms.Button({
      attrs: {'data-m-gkey': 'submit', type: 'submit'}
    }, ['Submit'])
  ]);
});

const app = Mishkah.app.createApp(
  {name: ''},
  {
    'form.input': {
      on: ['input'],
      gkeys: ['name-input'],
      handler: (e, ctx) => ctx.setState({name: e.target.value})
    },
    'form.submit': {
      on: ['submit'],
      gkeys: ['submit'],
      handler: (e, ctx) => {
        e.preventDefault();
        console.log('Submitted:', ctx.getState().name);
      }
    }
  }
);
```

### Pattern 3: List with Dynamic Data
```javascript
Mishkah.app.setBody(function(db, D) {
  return D.Containers.Div({}, [
    D.Lists.Ul({}, db.items.map(function(item) {
      return D.Lists.Li({attrs: {key: item.id}}, [
        item.text,
        D.Forms.Button({
          attrs: {
            'data-m-key': 'delete-' + item.id,
            'data-m-gkey': 'delete'
          }
        }, ['Delete'])
      ]);
    }))
  ]);
});

const app = Mishkah.app.createApp(
  {items: [{id: 1, text: 'Task 1'}]},
  {
    'list.delete': {
      on: ['click'],
      gkeys: ['delete'],
      handler: (e, ctx) => {
        const keysPath = computeKeysPath(e.target);
        const itemId = extractIdFromKey(keysPath);
        ctx.setState(s => ({
          items: s.items.filter(i => i.id !== itemId)
        }));
      }
    }
  }
);
```

---

## ⚠️ Common AI Mistakes to Avoid

### 1. **Using HTML strings in body**
```javascript
// ❌ WRONG
function body(db, D) {
  return `<div>${db.title}</div>`;
}

// ✅ CORRECT
function body(db, D) {
  return D.Containers.Div({}, [db.title]);
}
```

### 2. **Attaching events directly**
```javascript
// ❌ WRONG
D.Forms.Button({
  attrs: {
    onclick: function() { alert('clicked'); }
  }
}, ['Click'])

// ✅ CORRECT
// Define in orders, reference via gkey
D.Forms.Button({attrs: {'data-m-gkey': 'alert'}}, ['Click'])
```

### 3. **Mutating state**
```javascript
// ❌ WRONG
handler: (e, ctx) => {
  ctx.getState().count++;
}

// ✅ CORRECT
handler: (e, ctx) => {
  ctx.setState(s => ({count: s.count + 1}));
}
```

### 4. **Forgetting keys for lists**
```javascript
// ❌ WRONG (no key)
db.items.map(item => D.Lists.Li({}, [item.text]))

// ✅ CORRECT
db.items.map(item => D.Lists.Li({attrs: {key: item.id}}, [item.text]))
```

---

## 📚 Quick Reference Card

### Minimal App:
```javascript
Mishkah.app.setBody((db, D) =>
  D.Text.H1({}, ['Hello Mishkah'])
);
Mishkah.app.createApp({}, {}).mount('#app');
```

### With State:
```javascript
Mishkah.app.setBody((db, D) =>
  D.Text.H1({}, [db.message])
);
Mishkah.app.createApp({message: 'Hello'}, {}).mount('#app');
```

### With Events:
```javascript
Mishkah.app.setBody((db, D) =>
  D.Forms.Button({attrs: {'data-m-gkey': 'click'}}, [db.message])
);
Mishkah.app.createApp(
  {message: 'Click me'},
  {
    'btn.click': {
      on: ['click'],
      gkeys: ['click'],
      handler: (e, ctx) => ctx.setState({message: 'Clicked!'})
    }
  }
).mount('#app');
```

---

## 🔍 Status of Features (Critical for AI)

### ✅ Production Ready:
- VDOM & Reconciliation
- Event Delegation
- State Management
- DSL Atoms
- HTMLx Transformations
- Simple Store (Beta)
- i18n Support
- Head Management

### 🔮 Planned/Stub (Do NOT rely on):
- Guardian full implementation
- Auditor grading system
- RuleCenter evaluation
- Devtools advanced features

**AI INSTRUCTION**: When these are referenced in code, treat them as no-ops. They won't block functionality.

---

## 💡 AI Best Practices When Writing Mishkah Code

1. **Always use DSL, never raw HTML strings**
2. **Always provide `key` for list items**
3. **Never mutate state directly**
4. **Use `data-m-gkey` for event bindings**
5. **Reference correct Atom category** (Forms vs Inputs!)
6. **Batch updates with freeze/unfreeze for performance**
7. **Use functional setState for derived values**
8. **Remember: `attrs` object is required, not flat props**

---

## 📖 Further Reading

- `/README.md` - Philosophy and vision (703 lines)
- `/static/lib/mishkah.core.js` - Core implementation (1226 lines)
- `/static/examples/sales-report.html` - Real-world example (1318 lines)

---

**END OF TECHNICAL GUIDE**

*This document is designed to be parsed by AI systems. Human-readable, machine-actionable.*

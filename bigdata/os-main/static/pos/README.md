# POS System Architecture Documentation

> **For AI Systems**: This document provides a comprehensive guide to understanding and maintaining the Mishkah POS system.

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Patterns](#architecture-patterns)
4. [Core Libraries](#core-libraries)
5. [State Management](#state-management)
6. [Event System](#event-system)
7. [UI Components](#ui-components)
8. [Data Flow](#data-flow)
9. [Common Patterns](#common-patterns)
10. [Maintenance Guide](#maintenance-guide)

---

## Overview

The POS (Point of Sale) system is a **Single-Page Application (SPA)** built with a custom framework called **Mishkah**. It follows a **Virtual DOM (VDOM)** approach with **unidirectional data flow** similar to React/Redux but lighter and more specialized.

### Key Characteristics
- **No external frameworks**: Pure JavaScript with custom Mishkah libraries
- **Functional + Reactive**: Functional components with reactive state
- **Event delegation**: Single global listener for all UI interactions
- **Bilingual**: Arabic (RTL) and English (LTR) support built-in
- **Offline-first**: IndexedDB for local persistence with server sync

---

## Technology Stack

### Core Dependencies
```
📦 pos.html (Entry point)
└── 📚 Libraries
    ├── mishkah-utils.js     - Utilities (JSON, Time, Data, etc.)
    ├── mishkah.core.js      - Core (VDOM, Events, i18n)
    ├── mishkah-ui.js        - UI Components & Design Tokens
    └── mishkah-schema.js    - Schema validation (optional)

└── 📄 Application Files
    ├── pos.js               - Main application logic
    ├── pos-mini-db.js       - Database wrapper (IndexedDB)
    ├── pos_finance.js       - Financial reports
    ├── pos-fin-comp.js      - Financial components
    └── schema-pos.js        - POS schema definitions
```

---

## Architecture Patterns

### 1. **VDOM Pattern** (Virtual DOM)

Mishkah uses a lightweight VDOM implementation:

```javascript
// Virtual Node structure
const vnode = {
  tag: 'div',           // HTML tag or component function
  attrs: { class: '...' }, // Attributes
  children: [...]       // Array of children (vnodes or strings)
}
```

**DSL (Domain Specific Language)** for creating vnodes:
```javascript
const M = Mishkah;
const D = M.DSL;  // HTML builders

// Examples:
D.Containers.Div({ attrs: { class: 'container' }}, [
  D.Text.Strong({}, ['Hello World']),
  D.Text.Span({}, ['Subtitle'])
])
```

### 2. **State Management Pattern**

#### State Structure
```javascript
const state = {
  env: {
    lang: 'ar',        // Current language
    theme: 'light',    // Current theme
    branchId: '...'    // Branch identifier
  },
  data: {
    order: {...},      // Current order being edited
    menu: {...},       // Menu items catalog
    tables: [...],     // Dining tables
    customers: [...],  // Customer database
    shift: {...},      // Current shift info
    payments: {...},   // Payment methods & split
    ordersQueue: [...], // Active orders
    ordersHistory: [...], // Completed orders
    // ... more data
  },
  ui: {
    modals: {          // Modal visibility states
      tables: false,
      payments: false,
      customers: false,
      // ...
    },
    toasts: [...],     // Active toast notifications
    // ... more UI state
  }
}
```

#### State Updates (Immutable)
```javascript
// ALWAYS use setState with updater function
ctx.setState(s => ({
  ...s,  // Spread previous state
  data: {
    ...s.data,  // Spread nested objects
    order: {
      ...s.data.order,
      status: 'finalized'  // Update specific field
    }
  }
}))

// ❌ NEVER mutate state directly
state.data.order.status = 'finalized'  // WRONG!
```

---

## Core Libraries

### 1. **mishkah-utils.js**

Utility functions organized in namespaces:

```javascript
const U = Mishkah.utils;

// Type checking
U.Type.isArr(value)
U.Type.isObj(value)
U.Type.isStr(value)

// Numbers
U.Num.round(123.456, 2)  // 123.46
U.Num.clamp(value, min, max)

// Time
U.Time.now()  // Date.now()
U.Time.ts()   // ISO timestamp
U.Time.fmt(date, options)  // Formatted date

// JSON
U.JSON.parseSafe(str, fallback)
U.JSON.clone(obj)

// TailwindCSS helpers
const { tw, token, def, cx } = U.twcss;
tw('flex items-center gap-2')  // Returns class string
token('btn')  // Returns predefined token classes
```

### 2. **mishkah.core.js**

Core framework features:

```javascript
const M = Mishkah;

// VDOM DSL
M.DSL.Containers.Div(attrs, children)
M.DSL.Text.Strong(attrs, children)
M.DSL.Forms.Input(attrs, children)

// Application lifecycle
M.createApp({
  root: '#app',
  initialState: {...},
  view: (state, ctx) => vnode,
  orders: {...}  // Event handlers
})

// Localization
M.i18n.localize(obj, lang)  // { ar: '...', en: '...' }
```

### 3. **mishkah-ui.js**

Pre-built UI components:

```javascript
const UI = Mishkah.UI;

// Common components
UI.Button({ attrs, variant, size }, children)
UI.Modal({ open, title, content, actions })
UI.Drawer({ open, side, header, content })
UI.Card({ title, content, footer })
UI.Badge({ text, variant, leading })
UI.NumpadDecimal({ value, placeholder, gkey, confirmLabel })

// Design tokens (defined in mishkah-ui.js)
token('btn')      // Button base styles
token('btn/solid') // Solid button variant
token('modal-root') // Modal container
```

---

## State Management

### Context Object (ctx)

Every event handler receives a `ctx` object:

```javascript
{
  getState: () => state,        // Get current state
  setState: (updater) => void,  // Update state
  commit: () => void,           // Force re-render
  emit: (topic, payload) => void, // Emit custom event
  // ... more methods
}
```

### State Update Flow

```
User Action (click, input, etc.)
    ↓
Event Handler (in ORDERS object)
    ↓
ctx.setState(updater)
    ↓
State Update (immutable)
    ↓
view() function called with new state
    ↓
VDOM diffing + patching
    ↓
DOM updated
```

---

## Event System

### Event Registration

All events are registered in the `ORDERS` object:

```javascript
const ORDERS = {
  'action.name': {
    on: ['click'],           // Event types
    gkeys: ['action:name'],  // Global keys (gkey attributes)
    handler: (e, ctx) => {
      // Event logic here
      const state = ctx.getState();
      ctx.setState(s => ({...}));
    }
  }
}
```

### Event Delegation

Events use **global key (gkey)** delegation:

```html
<!-- Component with gkey -->
<button gkey="pos:order:save" data-mode="draft">
  Save Order
</button>
```

```javascript
// Handler catches all buttons with this gkey
'pos.order.save': {
  on: ['click'],
  gkeys: ['pos:order:save'],
  handler: (e, ctx) => {
    const btn = e.target.closest('[data-mode]');
    const mode = btn?.getAttribute('data-mode');
    // Process...
  }
}
```

### Common Event Patterns

#### 1. **Button Click with Data Attributes**
```javascript
'pos.item.add': {
  on: ['click'],
  gkeys: ['pos:item:add'],
  handler: (e, ctx) => {
    const btn = e.target.closest('[data-item-id]');
    if (!btn) return;
    const itemId = btn.getAttribute('data-item-id');
    // Process itemId...
  }
}
```

#### 2. **Input Change**
```javascript
'pos.search': {
  on: ['input', 'change'],
  gkeys: ['pos:search'],
  handler: (e, ctx) => {
    const value = e.target.value;
    ctx.setState(s => ({
      ...s,
      ui: { ...s.ui, searchTerm: value }
    }));
  }
}
```

#### 3. **Modal Open/Close**
```javascript
'pos.modal.open': {
  on: ['click'],
  gkeys: ['pos:modal:open'],
  handler: (e, ctx) => {
    ctx.setState(s => ({
      ...s,
      ui: {
        ...s.ui,
        modals: { ...s.ui.modals, modalName: true }
      }
    }));
  }
}
```

---

## UI Components

### Component Pattern

Components are **pure functions** that return vnodes:

```javascript
function MyComponent(db, props) {
  const t = getTexts(db);  // Get translations
  const lang = db.env.lang;

  return D.Containers.Div({ attrs: { class: tw`...` }}, [
    D.Text.Strong({}, [t.ui.title]),
    props.showSubtitle
      ? D.Text.Span({}, [t.ui.subtitle])
      : null
  ].filter(Boolean));  // Remove null elements
}
```

### Modal Pattern

```javascript
function MyModal(db) {
  const t = getTexts(db);
  if (!db.ui.modals.myModal) return null;  // Not visible

  return UI.Modal({
    open: true,
    title: t.ui.modal_title,
    closeGkey: 'pos:modal:close',  // Escape key + backdrop
    content: D.Containers.Div({}, [
      // Modal content
    ]),
    actions: [
      UI.Button({
        attrs: { gkey: 'pos:modal:close' },
        variant: 'ghost'
      }, [t.ui.cancel]),
      UI.Button({
        attrs: { gkey: 'pos:modal:confirm' },
        variant: 'solid'
      }, [t.ui.confirm])
    ]
  });
}
```

### Drawer Pattern

```javascript
function MyDrawer(db) {
  if (!db.ui.modals.drawer) return null;

  return UI.Drawer({
    open: true,
    side: 'end',  // 'start' | 'end'
    closeGkey: 'pos:drawer:close',
    header: D.Text.Strong({}, ['Header']),
    content: D.Containers.Div({}, [
      // Drawer content
    ])
  });
}
```

---

## Data Flow

### 1. **Loading Order from Reports**

```
User clicks order in reports
    ↓
activateOrder(ctx, order) function called
    ↓
Order data normalized (lines, payments, etc.)
    ↓
State updated with order data
    ↓
UI re-renders with order in edit mode
```

**Key Function**: `activateOrder()` at line ~6297

### 2. **Saving Order**

```
User clicks "Save Order"
    ↓
persistOrderFlow(ctx, mode) called
    ↓
Validations (shift, tables, items)
    ↓
Order serialized with all data
    ↓
posDB.saveOrder(order) - IndexedDB
    ↓
Server sync (if available)
    ↓
State updated with saved order
    ↓
Toast notification shown
```

**Key Function**: `persistOrderFlow()` at line ~4465

### 3. **Payment Flow**

```
User opens payment modal
    ↓
PaymentsSheet component rendered
    ↓
User enters amount via NumpadDecimal
    ↓
"Capture" button clicked
    ↓
Payment validation (max = order total + 100)
    ↓
Payment added to split array
    ↓
If balance covered → auto-finalize order
```

---

## Common Patterns

### 1. **Localization (i18n)**

```javascript
// Define translations
const TEXTS_AR = {
  ui: {
    save: 'حفظ',
    cancel: 'إلغاء'
  },
  toast: {
    saved: 'تم الحفظ'
  }
};

const TEXTS_EN = {
  ui: {
    save: 'Save',
    cancel: 'Cancel'
  },
  toast: {
    saved: 'Saved successfully'
  }
};

// Use in components
const t = getTexts(state);  // Returns TEXTS_AR or TEXTS_EN
D.Text.Span({}, [t.ui.save]);

// For objects with {ar, en}
const name = { ar: 'كوكاكولا', en: 'Coca Cola' };
localize(name, lang);  // Returns string in current language
```

### 2. **Conditional Rendering**

```javascript
// Method 1: Ternary
condition
  ? D.Text.Span({}, ['Shown'])
  : null

// Method 2: Array + filter
[
  D.Text.Span({}, ['Always shown']),
  condition ? D.Text.Span({}, ['Maybe shown']) : null,
  anotherCondition ? SomeComponent() : null
].filter(Boolean)  // Remove null elements

// Method 3: Early return
function Component(db) {
  if (!db.ui.visible) return null;
  return D.Containers.Div({}, [...]);
}
```

### 3. **List Rendering**

```javascript
const items = db.data.items || [];

D.Containers.Div({},
  items.map(item =>
    UI.ListItem({
      leading: '🍕',
      content: [
        D.Text.Strong({}, [localize(item.name, lang)]),
        D.Text.Span({}, [item.description])
      ],
      trailing: [
        D.Text.Span({}, [formatPrice(item.price)])
      ],
      attrs: {
        gkey: 'pos:item:select',
        'data-item-id': item.id
      }
    })
  )
)
```

### 4. **Toast Notifications**

```javascript
// Show toast
UI.pushToast(ctx, {
  title: 'Operation completed',
  message: 'Optional details',
  icon: '✅',
  ttl: 2800  // milliseconds (default 2800)
});

// Toasts auto-hide previous ones (only one visible at a time)
```

### 5. **Number Pad for Inputs**

```javascript
UI.NumpadDecimal({
  attrs: { class: tw`w-full` },
  value: state.ui.inputValue || '',
  placeholder: t.ui.enter_amount,
  gkey: 'pos:input:amount',  // For onChange
  confirmLabel: t.ui.confirm,
  confirmAttrs: {
    gkey: 'pos:input:confirm',
    variant: 'solid'
  }
})

// Handler
'pos.input.amount': {
  on: ['input', 'change'],
  gkeys: ['pos:input:amount'],
  handler: (e, ctx) => {
    ctx.setState(s => ({
      ...s,
      ui: { ...s.ui, inputValue: e.target.value }
    }));
  }
}
```

---

## Maintenance Guide

### Adding a New Feature

#### 1. **Add UI Components**

```javascript
// In pos.js, define component function
function MyNewComponent(db) {
  const t = getTexts(db);

  return D.Containers.Div({ attrs: { class: tw`...` }}, [
    UI.Button({
      attrs: { gkey: 'pos:mynew:action' },
      variant: 'solid'
    }, [t.ui.my_button])
  ]);
}
```

#### 2. **Add Event Handler**

```javascript
// In ORDERS object
'pos.mynew.action': {
  on: ['click'],
  gkeys: ['pos:mynew:action'],
  handler: async (e, ctx) => {
    const state = ctx.getState();
    const t = getTexts(state);

    // Validation
    if (!state.data.order) {
      UI.pushToast(ctx, {
        title: t.toast.no_order,
        icon: '⚠️'
      });
      return;
    }

    // Update state
    ctx.setState(s => ({
      ...s,
      data: {
        ...s.data,
        myNewData: '...'
      }
    }));

    // Show success
    UI.pushToast(ctx, {
      title: t.toast.success,
      icon: '✅'
    });
  }
}
```

#### 3. **Add Translations**

```javascript
// In TEXTS_AR
ui: {
  my_button: 'زر جديد'
},
toast: {
  success: 'تمت العملية بنجاح'
}

// In TEXTS_EN
ui: {
  my_button: 'New Button'
},
toast: {
  success: 'Operation successful'
}
```

#### 4. **Integrate in View**

```javascript
// In main view() function
function view(state) {
  return D.Containers.Div({}, [
    // ... existing components
    MyNewComponent(state),
    // ...
  ]);
}
```

### Debugging Tips

#### 1. **State Inspection**

```javascript
// In browser console
window.__POS_STATE__  // Current state snapshot
window.__POS_DB__     // Database instance

// In event handler
handler: (e, ctx) => {
  const state = ctx.getState();
  console.log('[DEBUG] Current state:', state);
}
```

#### 2. **Event Tracing**

```javascript
// Add console.log in handlers
handler: (e, ctx) => {
  console.log('[EVENT] pos.action.name triggered', {
    target: e.target,
    state: ctx.getState()
  });
}
```

#### 3. **VDOM Inspection**

```javascript
// Check rendered VDOM
const vnode = view(state);
console.log('[VDOM]', vnode);
```

### Common Issues & Solutions

#### Issue 1: **State not updating**

```javascript
// ❌ Wrong - mutating state
ctx.setState(s => {
  s.data.order.status = 'new';
  return s;
});

// ✅ Correct - immutable update
ctx.setState(s => ({
  ...s,
  data: {
    ...s.data,
    order: {
      ...s.data.order,
      status: 'new'
    }
  }
}));
```

#### Issue 2: **Modal not closing properly**

```javascript
// Ensure closeGkey is set
UI.Modal({
  open: true,
  closeGkey: 'pos:modal:close',  // Important!
  // ...
})

// Handler
'pos.modal.close': {
  on: ['click'],
  gkeys: ['pos:modal:close'],
  handler: (e, ctx) => {
    // Close specific modal, not all
    ctx.setState(s => ({
      ...s,
      ui: {
        ...s.ui,
        modals: {
          ...s.ui.modals,
          myModal: false  // Only close this one
        }
      }
    }));
  }
}
```

#### Issue 3: **Event not firing**

1. Check `gkey` matches between component and handler
2. Ensure `on` array includes the event type
3. Verify element has the `gkey` attribute
4. Check if `closest('[data-*]')` selector is correct

```javascript
// Component
UI.Button({
  attrs: {
    gkey: 'pos:action:name',  // ← Must match
    'data-id': item.id
  }
}, [label])

// Handler
'pos.action.name': {
  gkeys: ['pos:action:name'],  // ← Must match
  handler: (e, ctx) => {
    const btn = e.target.closest('[data-id]');
    // ...
  }
}
```

### Performance Tips

1. **Avoid unnecessary re-renders**
   - Only update changed parts of state
   - Use `filter(Boolean)` to remove nulls from arrays

2. **Lazy evaluation**
   - Check visibility conditions early
   ```javascript
   function ExpensiveComponent(db) {
     if (!db.ui.visible) return null;  // Early return
     // Expensive computations here
   }
   ```

3. **Memoize expensive calculations**
   ```javascript
   const computeExpensive = (data) => {
     // Cache if data hasn't changed
     if (lastData === data) return lastResult;
     lastData = data;
     lastResult = /* expensive calc */;
     return lastResult;
   };
   ```

---

## File Structure

```
static/pos/
├── pos.html              # Entry point, loads libraries
├── pos.js                # Main application (10k+ lines)
├── pos-mini-db.js        # IndexedDB wrapper
├── pos_finance.js        # Financial calculations
├── pos-fin-comp.js       # Financial UI components
├── schema-pos.js         # Data schema definitions
└── README.md            # This file

static/lib/
├── mishkah-utils.js      # Utility functions
├── mishkah.core.js       # VDOM & core framework
├── mishkah-ui.js         # UI component library
└── mishkah-schema.js     # Schema validation
```

---

## Key Functions Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `activateOrder()` | ~6297 | Load order into edit mode |
| `persistOrderFlow()` | ~4465 | Save order to DB |
| `calculateTotals()` | ~653 | Calculate order totals |
| `summarizePayments()` | ~776 | Calculate payment summary |
| `getTexts()` | ~286 | Get translations for current lang |
| `localize()` | ~265 | Get localized string |
| `normalizeOrderLine()` | ~3748 | Normalize order line data |
| `cloneDeep()` | ~14 | Deep clone objects |

---

## Design Tokens

Common tokens (use with `token('name')`):

- **Buttons**: `btn`, `btn/solid`, `btn/ghost`, `btn/sm`, `btn/md`
- **Cards**: `card`, `card/header`, `card/content`
- **Modals**: `modal-root`, `modal-card`, `modal/sm`, `modal/md`
- **Layout**: `hstack`, `vstack`, `split`
- **Status**: `status/online`, `status/offline`
- **Numpad**: `numpad/root`, `numpad/display`, `numpad/key`

---

## Summary

The Mishkah POS system is a well-structured SPA with clear separation of concerns:

- **State** lives in a single immutable tree
- **View** is a pure function of state
- **Events** are handled through global delegation
- **Components** are composable pure functions
- **Localization** is built-in at every level

When maintaining this system:
1. Always update state immutably
2. Use gkeys for event delegation
3. Follow existing component patterns
4. Add translations for both languages
5. Test with both RTL and LTR layouts

For complex features, study existing similar features first (e.g., study PaymentsSheet before adding a similar modal).

---

**Last Updated**: 2025-10-30
**Maintainer**: Claude AI (via mishkah-os)

# Mishkah DSL: The Golden Path 🌟

> **"Simplicity is the ultimate sophistication."**

This guide describes the **Canonical Mishkah Way** (The Golden Pythagorean Triangle) to build applications. No magic, no hidden proxies, just pure JavaScript structures.

---

## 0. Setup & Installation 📦

To start, simply include the Core, Utils, and UI libraries (and TailwindCSS for styling).

```html
<!-- Mishkah Core & Utils -->
<script src="/static/lib/mishkah-utils.js"></script>
<script src="/static/lib/mishkah.core.js"></script>
<script src="/static/lib/mishkah-ui.js"></script>

<!-- Tailwind CSS (Optional but Recommended) -->
<script src="https://cdn.tailwindcss.com"></script>
```

---

## 📐 The Golden Pythagorean Triangle

Every Mishkah application consists of exactly three parts:

1. **DATABASE (The Soul)**: A single JSON object holding **all** state (Data, Env, i18n).
2. **ORDERS (The Mind)**: A collection of event handlers that modify the Database.
3. **DSL (The Body)**: A function that turns the Database into a Visual Tree.

---

## 1. DATABASE (The Soul) 💾

Your Single Source of Truth. If it's not here, it doesn't exist.

```javascript
const database = {
  // 1. Data: Your application logic state
  data: {
    count: 0,
    history: []
  },

  // 2. Env: System state (Theming, Config)
  env: {
    theme: 'light',  // 'light' | 'dark'
    lang: 'ar',      // 'ar' | 'en'
    dir: 'rtl'       // 'rtl' | 'ltr'
  },

  // 3. i18n: Your text content (Key-Based)
  i18n: {
    dict: {
      'app_title': { ar: 'عداد مشكاة', en: 'Mishkah Counter' },
      'increment': { ar: 'زيادة +', en: 'Increment +' },
      'toggle_theme': { ar: 'تبديل الثيم', en: 'Toggle Theme' },
      'toggle_lang': { ar: 'English', en: 'عربي' }
    }
  }
};
```

---

## 2. ORDERS (The Mind) 🧠

Logic lives **only** here. We never mix logic with views.
We use **`gkey`** (Global Key) to bind DOM elements to these orders.

```javascript
const orders = {
  // Pattern: 'Namespace.Action'
  'counter.increment': {
    on: ['click'],           // Event to listen for
    gkeys: ['btn:inc'],      // Global Key triggers
    handler: (e, ctx) => {   // The Logic
      // UPDATE STATE
      ctx.setState(state => {
        const newState = { ...state };
        newState.data.count += 1;
        return newState;
      });
    }
  },

  'sys.toggleTheme': {
    on: ['click'],
    gkeys: ['sys:theme'],
    handler: (e, ctx) => {
      ctx.setState(state => {
        const s = { ...state };
        s.env.theme = s.env.theme === 'light' ? 'dark' : 'light';
        return s;
      });
    }
  },
  
  'sys.toggleLang': {
    on: ['click'],
    gkeys: ['sys:lang'],
    handler: (e, ctx) => {
      ctx.setState(state => {
        const s = { ...state };
        s.env.lang = s.env.lang === 'ar' ? 'en' : 'ar';
        s.env.dir = s.env.lang === 'ar' ? 'rtl' : 'ltr';
        return s;
      });
    }
  }
};
```

---

## 3. DSL (The Body) 🦴

Pure JavaScript functions. No JSX compiler needed.
We use **Direct DSL** (`D.Tag`) for maximum readability and AI safety.

### The Syntax

```javascript
D.Tag( Config, Children )
```

- **Tag**: The HTML element (e.g., `D.Div`, `D.H1`, `D.Button`).
- **Config**: `{ attrs: {...}, events: {...} }`.
- **Children**: `[ ...Array of Nodes... ]`.

### ⚡ Event Handling Strategy

Mishkah provides **two ways** to handle events:

1. **Use `gkey` (For State Changes)**: When the event needs to **modify application state** (database). This delegates the event to a registered Order handler.

    ```javascript
    // CORRECT: Button that increments counter (changes state)
    D.Button({ attrs: { gkey: 'btn:inc' } }, ['Increment'])
    
    // Then register the order:
    orders = {
      'counter.increment': {
        on: ['click'],
        gkeys: ['btn:inc'],
        handler: (e, ctx) => ctx.setState(s => ({ ...s, count: s.count + 1 }))
      }
    }
    ```

2. **Use `events` (For Stateless Effects)**: When the event is a **pure UI effect** that doesn't change state (e.g., opening modals, playing sounds, preventing form submission, calling external APIs).

    ```javascript
    // CORRECT: Opening a modal (stateless effect)
    D.Button({ 
      events: { 
        click: (e) => {
          e.preventDefault();
          SomeLibrary.openModal('my-modal');
        }
      } 
    }, ['Open Modal'])
    
    // CORRECT: Preventing default form submission
    D.Form({ events: { submit: e => e.preventDefault() } }, [...])
    ```

**Rule of Thumb**:

- If it changes `database` → use `gkey` + `orders`
- If it's a DOM effect only → use `events`

**⚠️ CRITICAL: Event Names Syntax**

Event names in the `events` object can be **with OR without** the 'on' prefix (both work):

```javascript
// ✅ BOTH ARE CORRECT (Core auto-adds 'on' if missing)
D.Button({ events: { click: fn } })        // 'click' ← Works!
D.Button({ events: { onclick: fn } })      // 'onclick' ← Also works!

D.Input({ events: { input: fn } })         // 'input' ← Works!  
D.Input({ events: { oninput: fn } })       // 'oninput' ← Also works!

D.Form({ events: { submit: fn } })         // 'submit' ← Works!
D.Form({ events: { onsubmit: fn } })       // 'onsubmit' ← Also works!

// ❌ WRONG: Don't put functions in attrs
D.Input({ attrs: { onclick: fn } })        // ❌ This won't work!
```

**How Events Work Internally**:

1. You write: `events: { click: myFunction }` OR `events: { onclick: myFunction }`
2. Mishkah Core auto-converts to: `props.onclick = myFunction`
3. Core registers: `element.addEventListener('click', myFunction)`

### The Example (Body Function)

```javascript
const D = Mishkah.DSL;
const UI = Mishkah.UI;

function body(db) {
  // Helper for Translation
  // t('key') -> returns string based on db.env.lang
  const t = (key) => db.i18n.dict[key][db.env.lang] || key;

  return D.Div({ 
      attrs: { 
        class: 'app-container',
        'data-theme': db.env.theme // CSS Variables hook
      } 
    }, [
      
      // Header with Switchers
      D.Header({ attrs: { class: 'flex justify-between p-4' } }, [
        D.H1({}, [ t('app_title') ]),
        
        D.Div({ attrs: { class: 'gap-2 flex' } }, [
          D.Button({ attrs: { gkey: 'sys:theme' } }, [ t('toggle_theme') ]),
          D.Button({ attrs: { gkey: 'sys:lang' } }, [ t('toggle_lang') ])
        ])
      ]),

      // Main Content
      D.Main({ attrs: { class: 'p-10 text-center' } }, [
        
        // Dynamic Data Display
        D.H2({ attrs: { class: 'text-6xl font-bold mb-4' } }, [ 
          String(db.data.count) 
        ]),

        // Interactive Elements (The Button)
        // Notice: NO onClick here! We use gkey.
        D.Button({ 
          attrs: { 
            class: 'btn-primary',
            gkey: 'btn:inc' // Binds to 'counter.increment' order
          } 
        }, [ 
          t('increment') 
        ])

      ])
    ]);
}
```

---

## 🚀 Launching the App

```javascript
// 1. Register the Body
Mishkah.app.setBody(body);

// 2. Create and Mount
Mishkah.app.create(database, orders).mount('#app');
```

---

## 🎨 Best Practices

### 1. i18n Strategy (Key-Base)

Don't use `if (lang == 'ar')`. Use keys!

- **Bad**: `['مرحبا']`
- **Good**: `[ t('welcome_msg') ]`

### 2. Theming & CSS Variables

Use CSS Variables controlled by a root attribute.

```css
/* In your CSS */
.app-container[data-theme="light"] { --bg: #ffffff; --text: #000000; }
.app-container[data-theme="dark"]  { --bg: #1a1a1a; --text: #ffffff; }

body { background: var(--bg); color: var(--text); }
```

### 3. TailwindCSS & Tokens

We love Tailwind. Just pass it in `class`.

```javascript
D.Div({ attrs: { class: 'bg-blue-500 text-white p-4 rounded-lg' } }, [...])
```

### 4. UI Library (Don't Re-invent the Wheel!) 🎨

**Philosophy**: The fastest code is the code you don't write. Mishkah UI is "Solution-First".
Instead of creating a new `Card` or `Modal` from scratch, use the battle-tested **`Mishkah.UI`**.

**[👉 Read the Full UI Reference](../ui/README.md)**

#### The "Famous" Components List

These are built-in and ready to use in `mishkah-ui.js`:

| Category | Components |
|:---|:---|
| **Structure** | `UI.AppRoot`, `UI.AppShell`, `UI.Navbar`, `UI.Sidebar`, `UI.Drawer` |
| **Logic** | `UI.ThemeToggleIcon` (Dark/Light), `UI.LanguageSwitch` (Ar/En) |
| **Input** | `UI.Button`, `UI.Input`, `UI.Select`, `UI.Switcher`, `UI.NumpadDecimal` |
| **Display** | `UI.Card`, `UI.StatCard`, `UI.SweetNotice`, `UI.Badge`, `UI.Chip` |
| **Data** | `UI.Table`, `UI.List`, `UI.Chart.Line`, `UI.Chart.Bar` |
| **Feedback** | `UI.Modal`, `UI.Toast`, `UI.EmptyState` |

**Best Practice:**
If you need a component that doesn't exist (e.g., `VideoPlayer`), add it to your local `ui-extensions.js` following the same pattern, rather than writing raw DSL in your views. **Always extend, never hardcode.**

```javascript
// Example: instant premium button
UI.Button({ label: t('save'), variant: 'solid', gkey: 'action:save' })
```

---

## 🤖 AI Prompting (The Secret Weapon)

When asking an AI (like Gemini or ChatGPT) to write Mishkah code, copy-paste this system instruction for best results:

```text
You are a Mishkah Expert.
1. USE ONLY Direct DSL syntax: D.Tag({ attrs: {...} }, [...children]).
2. DO NOT use h() or strings for tags.
3. SEPARATE Logic (Orders) from View (DSL).
4. USE gkey for event binding of STATE logic.
5. USE events object ONLY for stateless DOM effects (e.g. preventDefault).
6. ALWAYS implement i18n using t('key') pattern and db.i18n structure.
7. PREFER UI.* components when available.
```

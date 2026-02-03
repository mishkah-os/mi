# mishkah.js - Auto-Loader & Bootstrap

## 📄 File Info
- **Size**: 46KB (1330 lines)
- **Role**: Auto-loader, dependency manager, bootstrap orchestrator
- **Dependencies**: Loads all other Mishkah modules sequentially

---

## 🎯 Core Responsibilities

### 1. **Auto-Loading System**
Loads Mishkah dependencies in correct order:
1. `mishkah-utils.js` → Utilities
2. `mishkah.core.js` → App engine  
3. `mishkah-ui.js` → UI components
4. `acorn` + `acorn-walk` → JS parsing (for HTMLx)
5. `mishkah-htmlx.js` → Template engine

### 2. **CSS Management**
- Detects `css: 'mi'` or `css: 'tw'` from config
- Loads Mishkah CSS or Tailwind accordingly
- Sets global `__MISHKAH_DEFAULT_CSS__`

### 3. **Component Registration**
- Registers Web Components:
  - `<lang-switcher>`
  - `<lang-select>`
  - `<theme-switcher>`
  - `<theme-select>`

### 4. **App Lifecycle Hooks**
- Patches `Mishkah.app.make()` to inject auto-config
- Manages state broadcasting
- Handles PWA installation prompts

---

## ⚙️ Configuration

### `window.MishkahAutoConfig`

```javascript
window.MishkahAutoConfig = {
  // CSS Library: 'mi' (Mishkah) or 'tw' (Tailwind)
  css: 'mi',
  
  // Auto-enable features (default: true)
  auto: true,
  
  // Load Tailwind (default: true if css='tw')
  tailwind: true,
  
  // Enable stores (default: false)
  stores: false,
  
  // Enable devtools (default: false)
  devtools: false,
  
  // Module paths (relative to mishkah.js)
  paths: {
    utils: 'mishkah-utils.js',
    core: 'mishkah.core.js',
    ui: 'mishkah-ui.js',
    htmlx: 'mishkah-htmlx.js',
    css: 'mishkah-css.css',
    acorn: 'https://cdn.jsdelivr.net/npm/acorn@8.15.0/dist/acorn.min.js',
    acornWalk: 'https://cdn.jsdelivr.net/npm/acorn-walk@8.3.4/dist/walk.min.js'
  },
  
  // Default languages
  defaultLangs: ['ar', 'en'],
  
  // Default themes
  defaultThemes: ['light', 'dark'],
  
  // Custom labels
  langLabels: { ar: 'العربية', en: 'English' },
  themeLabels: { light: 'نهاري', dark: 'ليلي' }
};
```

### `data-*` Attributes on `<script>` Tag

```html
<script src="/lib/mishkah.js" 
        data-auto="true"
        data-css="mi"
        data-tailwind="true"
        data-htmlx
        data-stores="false"
        data-devtools="false">
</script>
```

---

## 🔄 Auto-Loading Process

### Sequential Loading
```
1. mishkah.js loads
   ↓
2. Reads config (MishkahAutoConfig + data-* attrs)
   ↓
3. Determines CSS library (mi/tw)
   ↓
4. Loads dependencies sequentially:
   - mishkah-utils.js
   - mishkah.core.js
   - mishkah-ui.js
   - acorn + acorn-walk
   - mishkah-htmlx.js
   ↓
5. Loads CSS (if css='mi')
   ↓
6. Patches Mishkah.app.make()
   ↓
7. Fires 'mishkah:auto-ready' event
   ↓
8. MishkahAuto.ready() callbacks execute
```

### Critical Point: **`data-htmlx` Attribute**
- **Required** to load `mishkah-htmlx.js`
- Without it: **No template parsing** → **White screen**

```html
<!-- ✅ Correct -->
<script src="/lib/mishkah.js" data-htmlx></script>

<!-- ❌ Wrong (no HTMLx) -->
<script src="/lib/mishkah.js"></script>
```

---

## 🌐 Global API: `MishkahAuto`

### Properties
- `__version`: Version string
- `config`: Configuration object
- `whenReady`: Promise that resolves when Mishkah is loaded

### Methods

#### `ready(callback)`
```javascript
MishkahAuto.ready(function(Mishkah) {
  console.log('Mishkah loaded!', Mishkah);
  
  // Now you can use Mishkah.app.make()
});
```

#### `setLang(lang)`
```javascript
MishkahAuto.setLang('en');  // Switches to English
```

#### `setTheme(theme)`
```javascript
MishkahAuto.setTheme('dark');  // Switches to dark mode
```

#### `onState(listener)`
```javascript
const unsubscribe = MishkahAuto.onState(state => {
  console.log('State changed:', state);
});
```

#### `app.create(database, body, orders, mount)`
DSL-style app creation (advanced).

---

## 🧩 Component System

### Built-in Components

#### `<lang-switcher langs="ar,en">`
Renders language toggle buttons.

**Attributes:**
- `langs`: Comma-separated language codes (default: `ar,en`)

**Example:**
```html
<lang-switcher langs="ar,en,fr"></lang-switcher>
```

#### `<theme-switcher themes="light,dark">`
Renders theme toggle buttons.

**Attributes:**
- `themes`: Comma-separated theme names

**Example:**
```html
<theme-switcher themes="light,dark,dawn"></theme-switcher>
```

#### `<lang-select>` & `<theme-select>`
Dropdown versions of switchers.

---

## 🚨 Debugging White Screens

### Common Causes

#### 1. **Missing `data-htmlx` Attribute**
**Symptom:** Blank screen, no errors.
**Fix:**
```html
<!-- Add data-htmlx -->
<script src="/lib/mishkah.js" data-htmlx></script>
```

#### 2. **Template Not Found**
**Symptom:** Console warning: `Template #xyz not found`.
**Fix:** Verify template ID matches:
```javascript
M.app.make({}, { templateId: 'my-app' });
```
```html
<template id="my-app">...</template>
```

#### 3. **CSS Not Loading**
**Symptom:** Unstyled content.
**Fix:** Check `css` config:
```javascript
window.MishkahAutoConfig = { css: 'mi' };  // or 'tw'
```

#### 4. **Module Load Failure**
**Symptom:** Console error: `Failed to load script mishkah-utils.js`.
**Fix:** Verify `paths` config points to correct files.

---

## 🔍 Diagnostic Logging

### Enable Verbose Logging
Mishkah is **silent by default**. To debug:

```javascript
// Option 1: Enable devtools
window.MishkahAutoConfig = { devtools: true };

// Option 2: Listen to ready event
document.addEventListener('mishkah:auto-ready', e => {
  console.log('Mishkah ready:', e.detail.Mishkah);
});

// Option 3: Monitor loading
MishkahAuto.whenReady
  .then(M => console.log('✅ Loaded', M))
  .catch(err => console.error('❌ Failed', err));
```

### Check Loading Status
```javascript
console.log('Config:', MishkahAuto.config);
console.log('CSS Library:', __MISHKAH_DEFAULT_CSS__);
console.log('Mishkah:', window.Mishkah);
console.log('HTMLx:', window.Mishkah?.HTMLx);
```

---

## 📚 Related Files
- [mishkah.core.js](./mishkah-core-js.md) - App engine
- [mishkah-htmlx.js](./mishkah-htmlx-js.md) - Template parser
- [mishkah-utils.js](./mishkah-utils-js.md) - Utilities & twcss

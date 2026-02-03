# Mishkah UI Components 🎨

> **"Don't reinvent the wheel. Use the engine."**

Mishkah UI is a powerful, integrated component library designed to work seamlessly with the Core DSL. It provides beautiful, accessible, and themable components out of the box.

## 📦 Setup

Ensure `mishkah-ui.js` is loaded after `mishkah.core.js`.

```html
<script src="/static/lib/mishkah.core.js"></script>
<script src="/static/lib/mishkah-ui.js"></script>
```

Then access it via `Mishkah.DSL.UI` or just `UI` if aliased.

```javascript
const { D, UI } = Mishkah.DSL;
```

---

## 🛠️ Components Reference

### 1. Structure & Layout

#### `UI.AppRoot`
The main shell of your application.
```javascript
UI.AppRoot({
  shell: D.Div({...}, [...]), // Your main layout
  overlays: [] // Modals, toasts, etc.
})
```

#### `UI.HStack` & `UI.VStack`
Flexbox wrappers for horizontal and vertical stacking.
```javascript
UI.HStack({ attrs: { class: 'gap-4' } }, [ 
  D.Button({},['A']), 
  D.Button({},['B']) 
])
```

#### `UI.Divider`
A semantic visual divider.
```javascript
UI.Divider()
```

---

### 2. Cards & Panels

#### `UI.Card`
A versatile card component with optional header, content, and footer.
```javascript
UI.Card({
  title: 'User Profile',
  description: 'Manage your settings',
  content: [
    D.P({}, ['Some content here...'])
  ],
  footer: [
    UI.Button({ label: 'Save' })
  ],
  variant: 'card' // or 'card/soft-1', 'card/soft-2'
})
```

---

### 3. Buttons & Actions

#### `UI.Button`
The workhorse button component.
```javascript
UI.Button({
  variant: 'solid', // solid, soft, ghost, link, destructive
  size: 'md',       // sm, md, lg
  attrs: {
    gkey: 'action:save',
    onClick: (e) => console.log('Clicked!')
  }
}, ['Click Me'])
```

#### `UI.Switcher`
A segmented control for picking one option.
```javascript
UI.Switcher({
  value: 'daily',
  options: [
    { value: 'daily', label: 'Day' },
    { value: 'weekly', label: 'Week', gkey: 'view:week' }
  ]
})
```

---

### 4. Application Logic (Built-in)

Mishkah UI comes with "Smart Components" that handle logic for you.

#### `UI.ThemeToggleIcon`
Instantly adds a Dark/Light mode toggle button.
```javascript
UI.ThemeToggleIcon({ theme: db.env.theme })
```

#### `UI.LanguageSwitch`
Instantly adds an AR/EN language switcher.
```javascript
UI.LanguageSwitch({ lang: db.env.lang })
```

---

### 5. Data Visualization (Charts) 📊

Built-in wrapper for Chart.js.

```javascript
UI.Chart.Line({
  data: {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{ label: 'Sales', data: [10, 20, 30] }]
  },
  options: { responsive: true },
  height: 300
})
```
*Note: Requires Chart.js to be loaded (Mishkah will try to auto-load it).*

---

## 🎨 Theming (Design Tokens)

Mishkah UI is built on a "Token System" powered by `tw` (Tailwind wrapper).
You can customize these tokens in your CSS variables.

| Token | Description |
|-------|-------------|
| `--primary` | Main brand color |
| `--surface` | Background color |
| `--radius` | Border radius |

To see all tokens, check `mishkah-ui.js` source code (`def({...})` section).

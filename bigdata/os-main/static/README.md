# Mishkah JS 
### The No-Build VDOM Framework for the Modern Web

> **Zero Build Step. Surgical VDOM. Reactive HTML.**  
> Bring order to chaos without the complexity of modern toolchains.

Mishkah is a **pure JavaScript framework** designed to bring the power of Virtual DOM and reactive state management directly to the browser. No `npm install`, no Webpack, no build steps required. Just include the script and start building.

---

## 🚀 Quick Start

Copy this into an `index.html` file and open it in your browser.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Mishkah App</title>
    <!-- Load Mishkah -->
    <script src="lib/mishkah.js" data-htmlx data-ui></script>
</head>
<body>
    <div id="app"></div>

    <!-- Define your App Template -->
    <template id="main">
        <!-- 1. State -->
        <script type="application/json" data-m-path="data">
            { "count": 0 }
        </script>

        <!-- 2. UI -->
        <div class="container">
            <h1>Hello, Mishkah!</h1>
            <p>Count: <strong>{state.data.count}</strong></p>
            
            <button onclick="increment(event, ctx)">Increment</button>
        </div>

        <!-- 3. Logic -->
        <script>
            function increment(e, ctx) {
                ctx.setState(s => {
                    s.data.count++;
                    return s;
                });
            }
        </script>
    </template>
</body>
</html>
```

---

## ⚡ Key Features

### 1. Zero Build Step
Stop fighting with configurations. Mishkah runs natively in the browser using modern ES6+.
- No Node.js required for development.
- No transpilation.
- Instant feedback loop.

### 2. HTMLx: The Reactive Template System
Write your logic where it belongs: inside your HTML.
- **Locality of Behavior**: Keep State, UI, and Logic together.
- **Declarative Bindings**: Use `{state.value}` to bind data.
- **Event Handling**: Standard `onclick` attributes that just work.

### 3. Surgical VDOM Engine
A lightweight, high-performance Virtual DOM implementation that updates only what changed.
- **Smart Diffing**: Efficiently compares trees to minimize DOM operations.
- **List Reconciliation**: Optimized algorithms for handling large lists.
- **Stable**: Built on proven VDOM principles without the bloat.

### 4. Built-in Design System (`mishkah-ui`)
Don't start from scratch. Mishkah comes with a token-based design system.
- **Ready-to-use Components**: Buttons, Cards, Modals, Toolbars.
- **Theming**: Built-in Dark/Light mode support.
- **i18n**: First-class support for RTL and multi-language apps.

---

## 📦 Architecture

Mishkah is modular by design. You only load what you need.

| Module | Description |
|--------|-------------|
| **`mishkah.core.js`** | The heart. VDOM engine, State Management, and Event Delegation. |
| **`mishkah-htmlx.js`** | The compiler. Parses `<template>` tags and hydrates them into VDOM. |
| **`mishkah-ui.js`** | The look. A comprehensive UI kit with tokens and components. |

---

## 🛠️ Why Mishkah?

Modern web development has become over-complicated. We spend more time configuring tools than building features. Mishkah returns to the roots of the web—**Simplicity**—without sacrificing **Power**.

- **For Teams**: Reduce onboarding time. If you know HTML and JS, you know Mishkah.
- **For Prototypes**: Go from idea to interactive app in seconds.
- **For Production**: Fast, stable, and easy to debug.

---

## 🔗 Resources

- [**Playground**](./playground/): Try examples live.
- [**Documentation**](./docs/): Deep dive into the API.
- [**Philosophy**](./docs/README-dreams.md): Read about the "7 Pillars of Mishkah".

---

**Mishkah** (مشكاة) — *A niche for light.*  
Built with ❤️ for the builders.

# Mishkah Documentation

## 📚 Two Ways to Build with Mishkah

Mishkah supports two complementary approaches:

### 1. **[HTMLx - Template-Based](./htmlx/)** 🎨
For designers and rapid development. Uses `<template>` tags with declarative syntax.

**Good for:**
- Rapid prototyping
- Designer-developer collaboration
- Simple applications
- Quick iterations

**Start here:** [htmlx/README.md](./htmlx/README.md)

---

### 2. **[DSL - Code-Based](./dsl/)** ⚙️
For type-safe, composable component architecture. Pure JavaScript.

**Good for:**
- Type safety & IDE support
- Complex business logic
- Large team projects
- Performance-critical apps

**Start here:** [dsl/README.md](./dsl/README.md)

---

## 🎯 Quick Decision Guide

**Use HTMLx if:**
- You prefer HTML-like syntax
- Working with designers
- Building content-heavy sites
- Need quick prototypes

**Use DSL if:**
- You want TypeScript support
- Building complex UIs
- Need maximum composability  
- Prefer full IDE autocomplete

---

## 📖 Core Documentation

### Essential Files
- **[mishkah.js](./mishkah-js.md)** - Auto-loader & bootstrap
- **[README-dreams.md](./README-dreams.md)** - Philosophy & 7 Pillars

### Library Reference
All 18 files documented in respective folders.

---

## 🚀 Installation

```html
<!DOCTYPE html>
<html>
<head>
  <script>
  window.MishkahAutoConfig = {
    css: 'mi',  // or 'tw' for Tailwind
    auto: true
  };
  </script>
  <script src="/lib/mishkah.js" data-htmlx data-css="mi"></script>
</head>
<body>
  <div id="app"></div>
</body>
</html>
```

---

## 💡 Philosophy

From [README-dreams.md](./README-dreams.md):

> **Mishkah asks a radical question: Why manage chaos when you can prevent it from ever taking root?**

### The 7 Architectural Pillars:

1. **State Centralization** - Single source of truth
2. **Constrained DSL** - Secure contract between structure & behavior  
3. **Functional Atoms** - Intelligent building blocks
4. **Component Library** - Reusable UI components
5. **Global Environment** - Built-in i18n & theming
6. **Standard Utilities** - Unified toolbox
7. **Conscious Reconstruction** - Surgical DOM updates

---

## 🤝 Comparison

| Feature | HTMLx | DSL |
|---------|-------|-----|
| **Syntax** | HTML-like | JavaScript |
| **Type Safety** | ❌ | ✅ |
| **Learning Curve** | Low | Medium |
| **IDE Support** | Basic | Full |
| **Performance** | Good | Excellent |
| **Flexibility** | High | Very High |

---

## 📚 Next Steps

- **New to Mishkah?** Start with [HTMLx Guide](./htmlx/htmlx-guide.md)
- **Coming from React?** Read [DSL Guide](./dsl/README.md)
- **Understanding the Vision?** Read [README-dreams.md](./README-dreams.md)

---

**Built with Mishkah - The Framework of Light and Order** ✨

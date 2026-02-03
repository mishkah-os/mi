# Mishkah Head API

## Overview

`Mishkah.Head` provides a **safe and declarative way** to manage `<head>` elements like scripts, meta tags, stylesheets, and inline styles.

**Location:** `mishkah.core.js` (lines 257-283)

---

## API Reference

### Mishkah.Head.batch(spec)

The primary way to add head elements via the `database.head` property.

```javascript
const database = {
  head: {
    title: "My App",
    metas: [{ name: "description", content: "..." }],
    links: [{ rel: "stylesheet", href: "/style.css" }],
    styles: [{ content: ".foo { color: red; }" }],
    scripts: [{ src: "https://cdn.example.com/lib.js", async: true }]
  },
  // ... rest of database
};
```

---

## Properties

### 1. `title` (string)

Sets `document.title`.

```javascript
head: {
  title: "Coach Sally Rady | Life \u0026 Relationship Coach"
}
```

---

### 2. `metas` (array of objects)

Adds `<meta>` tags. Each object can have:

- `name`, `content`, `property`, `http-equiv`, `charset`, etc.
- Automatically generates unique ID from name/property

```javascript
head: {
  metas: [
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "description", content: "Professional coaching services" },
    { property: "og:title", content: "Sally Rady Coach" },
    { charset: "UTF-8" }
  ]
}
```

---

### 3. `links` (array of objects)

Adds `<link>` tags (stylesheets, icons, canonical, etc.).

```javascript
head: {
  links: [
    { rel: "stylesheet", href: "/styles.css" },
    {  rel: "icon", href: "/favicon.ico" },
    { rel: "canonical", href: "https://sallyrady.com" }
  ]
}
```

---

### 4. `styles` (array of objects)

Adds inline `<style>` tags.

```javascript
head: {
  styles: [
    {
      id: "custom-theme",  // optional
      content: ":root { --primary: #8ab4ff; }"
    },
    {
      key: "animations",  // generates ID from key
      text: "@keyframes fade { ... }"  // 'text' alias for 'content'
    }
  ]
}
```

---

### 5. `scripts` (array of objects)

Adds `<script>` tags (external or inline).

**External scripts:**

```javascript
head: {
  scripts: [
    {
      src: "https://www.tiktok.com/embed.js",
      async: true
    },
    {
      src: "https://cdn.tailwindcss.com"
    }
  ]
}
```

**Inline scripts:**

```javascript
head: {
  scripts: [
    {
      id: "config",
      inline: "window.APP_CONFIG = { api: '/api' };"
    }
  ]
}
```

---

## Important Notes

### ✅ Automatic Deduplication

Mishkah uses `data-mishkah-id` attribute to prevent duplicates:

- If an element with the same ID exists, it **updates** instead of creating a new one
- IDs are auto-generated from: `id`, `name`, `property`, `src`, or `rel + href`

### ✅ Idempotent Updates

Safe to call `Head.batch()` multiple times - only changes are applied.

### ❌ **D.Script() is NOT supported**

The DSL does NOT have a `Script` element. Use `database.head` instead:

**❌ Wrong:**

```javascript
D.Script({ attrs: { src: "https://example.com/lib.js" } })
```

**✅ Correct:**

```javascript
const database = {
  head: {
    scripts: [{ src: "https://example.com/lib.js" }]
  }
};
```

---

## Real Example: TikTok Embeds

From `coash-life.html`:

```html
<script>
const database = {
  head: {
    title: "الكوتش سالي راضي",
    scripts: [
      { src: "https://www.tiktok.com/embed.js", async: true }
    ],
    metas: [
      { name: "viewport", content: "width=device-width,initial-scale=1" },
      { name: "description", content: "Life Coach \u0026 Relationship Coach" }
    ]
  },
  // ... rest of database
};

Mishkah.app.create(database);
</script>
```

Then in the component:

```javascript
const Videos = () => D.Section({ ... }, [
  D.Div({}, (db.content.videos || []).map(video =>
    D.Blockquote({
      attrs: {
        class: "tiktok-embed",
        cite: video.url,
        "data-video-id": video.id
      }
    }, [D.Section({}, [])])
  ))
]);
```

The TikTok script in `head` will automatically load and render the embeds.

---

## Advanced Usage

### Direct API Calls

You can also call methods directly (not recommended - use `database.head` instead):

```javascript
Mishkah.Head.meta({ name: "author", content: "Sally Rady" });
Mishkah.Head.link({ rel: "stylesheet", href: "/theme.css" });
Mishkah.Head.script({ src: "https://example.com/lib.js", defer: true });
```

### Dynamic Updates

Update head elements during app lifecycle:

```javascript
// In an order handler
"update.theme": {
  handler: (e, ctx) => {
    Mishkah.Head.meta({
      name: "theme-color",
      content: ctx.getState().env.theme === "dark" ? "#040b1a" : "#f8fafc"
    });
  }
}
```

---

## Summary

**Best Practice:**

- ✅ Use `database.head` for initial setup
- ✅ Use `Mishkah.Head` methods for dynamic updates
- ❌ Never use `D.Script()` or `D.Meta()` (they don't exist)

**File Location:** `lib/mishkah.core.js:257-283`

**Exports:** `Mishkah.Head`

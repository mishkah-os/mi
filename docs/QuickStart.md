# README.md
# Mishkah — Pure UI Core + Realtime Store (UMD / No-Build)

مشكاة إطار واجهات "No Build / No Compile":
تكتب JavaScript مباشرة، وتُشغّل التطبيق كملفات static.

---

## 1) Quick Start (Static HTML)

### أ) ضم الملفات (UMD)
ضع الملفات بجانب الصفحة ثم حمّلها بالترتيب:

- mishkah.core.js
- mishkah.store.js (اختياري حسب حاجتك للّحظي)
- mishkah.simple-store.js (اختياري: DSL فوق store)
- (اختياري) mishkah-rest.js / mishkah-schema.js / mishkah-jsx.js

### ب) أقل تطبيق ممكن
```html
<div id="app"></div>
<script src="./mishkah.core.js"></script>

<script>
  const { app, DSL } = Mishkah;

  const db = {
    env: { lang: "ar", theme: "light" },
    i18n: {
      dict: {
        "hello": { ar: "أهلًا", en: "Hello" }
      }
    },
    counter: 0
  };

  app.setBody((db) => {
    const D = DSL;
    return D.div({ class: "p-4" }, [
      D.h1({ class: "text-xl" }, [db.i18nText ? db.i18nText("hello") : "أهلًا"]),
      D.div({ class: "mt-2" }, ["Counter: ", String(db.counter)]),
      D.button({ "data-m-key": "counter:inc", class: "mt-3" }, ["+"])
    ]);
  });

  const orders = {
    "counter:inc": (ctx) => ctx.setState((db) => ({ ...db, counter: (db.counter || 0) + 1 }))
  };

  app.createApp(db, orders).mount("#app");
</script>

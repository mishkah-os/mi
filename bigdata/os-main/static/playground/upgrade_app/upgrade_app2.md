# Upgrade App - Part 2 (Wiki & UI Fixes)

Follow these steps to fix the Wiki tabs, Example Info, and Color Themes.

## Step 1: Add Theme Variables (CSS)

We need to define the CSS variables for Light and Dark modes.
Add this code to a new file `upgrade_app/theme.css` or paste it into your `index.html` style section.

```css
:root {
    /* Light Theme */
    --background: #ffffff;
    --foreground: #0f172a;
    --card: #ffffff;
    --card-foreground: #0f172a;
    --popover: #ffffff;
    --popover-foreground: #0f172a;
    --primary: #0f172a;
    --primary-foreground: #f8fafc;
    --secondary: #f1f5f9;
    --secondary-foreground: #0f172a;
    --muted: #f1f5f9;
    --muted-foreground: #64748b;
    --accent: #f1f5f9;
    --accent-foreground: #0f172a;
    --destructive: #ef4444;
    --destructive-foreground: #f8fafc;
    --border: #e2e8f0;
    --input: #e2e8f0;
    --ring: #0f172a;
    --radius: 0.5rem;
}

[data-theme="dark"] {
    /* Dark Theme */
    --background: #020817;
    --foreground: #f8fafc;
    --card: #020817;
    --card-foreground: #f8fafc;
    --popover: #020817;
    --popover-foreground: #f8fafc;
    --primary: #f8fafc;
    --primary-foreground: #020817;
    --secondary: #1e293b;
    --secondary-foreground: #f8fafc;
    --muted: #1e293b;
    --muted-foreground: #94a3b8;
    --accent: #1e293b;
    --accent-foreground: #f8fafc;
    --destructive: #7f1d1d;
    --destructive-foreground: #f8fafc;
    --border: #1e293b;
    --input: #1e293b;
    --ring: #cbd5e1;
}

body {
    background-color: var(--background);
    color: var(--foreground);
}
```

## Step 2: Implement Wiki UI Components

Update `wiki-ui.js` with the following code. This implements the missing `WikiMini` and `WikiViewer` components.

```javascript
(function () {
    'use strict';

    // Ensure M.UI exists
    window.M = window.M || {};
    window.M.UI = window.M.UI || {};

    const D = window.Mishkah.DSL;

    // Helper: Render Markdown
    function renderMarkdown(content) {
        if (!content) return '';
        if (window.marked && window.marked.parse) {
            return window.marked.parse(content);
        }
        return '<pre>' + content + '</pre>';
    }

    // ============================================================
    // 1. WikiMini Component (For "Info" and "Code" tabs)
    // ============================================================
    window.M.UI.WikiMini = function (props) {
        const { wikiId, lang } = props;
        
        // Find article in global wiki db
        const article = window.codewikidb.find(a => a.id === wikiId);

        if (!article) {
            return D.Containers.Div({
                attrs: { class: 'p-8 text-center text-muted-foreground' }
            }, [
                lang === 'ar' 
                    ? 'لم يتم العثور على المقال: ' + wikiId 
                    : 'Article not found: ' + wikiId
            ]);
        }

        const content = article.content[lang] || article.content['en'] || '';

        return D.Containers.Div({
            attrs: { 
                class: 'p-6 prose prose-sm max-w-none dark:prose-invert',
                style: 'direction: ' + (lang === 'ar' ? 'rtl' : 'ltr')
            }
        }, [
            D.Raw.Html(renderMarkdown(content))
        ]);
    };

    // ============================================================
    // 2. WikiViewer Component (For "Wiki" tab)
    // ============================================================
    window.M.UI.WikiViewer = function (props) {
        const { db, wikiId, onNavigate } = props;
        const lang = db.env.lang;
        
        // Get all articles
        const articles = window.codewikidb || [];
        
        // Find current article
        const currentArticle = articles.find(a => a.id === wikiId) || articles[0];
        const content = currentArticle 
            ? (currentArticle.content[lang] || currentArticle.content['en'] || '')
            : '';

        // Sidebar Item Component
        const SidebarItem = (article) => {
            const isActive = currentArticle && currentArticle.id === article.id;
            return D.Forms.Button({
                attrs: {
                    class: `w-full text-left px-3 py-2 rounded mb-1 text-sm transition-colors ${isActive ? 'bg-secondary font-bold' : 'hover:bg-muted'}`,
                    onclick: () => onNavigate && onNavigate(article.id)
                }
            }, [article.title[lang] || article.title['en']]);
        };

        return D.Containers.Div({
            attrs: { class: 'flex h-full' }
        }, [
            // Sidebar
            D.Containers.Div({
                attrs: { 
                    class: 'w-64 flex-shrink-0 border-r overflow-auto p-4 bg-card',
                    style: 'border-color: var(--border);'
                }
            }, [
                D.Text.H3({ attrs: { class: 'font-bold mb-4' } }, [
                    lang === 'ar' ? 'المقالات' : 'Articles'
                ]),
                ...articles.map(SidebarItem)
            ]),

            // Main Content
            D.Containers.Div({
                attrs: { class: 'flex-1 overflow-auto p-8 bg-background' }
            }, [
                currentArticle ? D.Containers.Div({
                    attrs: { 
                        class: 'prose prose-slate max-w-3xl mx-auto dark:prose-invert',
                        style: 'direction: ' + (lang === 'ar' ? 'rtl' : 'ltr')
                    }
                }, [
                    D.Raw.Html(renderMarkdown(content))
                ]) : D.Text.P({}, ['No article selected'])
            ])
        ]);
    };

    console.log('✅ Wiki UI components loaded');
})();
```

## Step 3: Verify `app.js`

Ensure your `app.js` calls these components correctly.
In `PreviewPane` function:

```javascript
// ...
} : db.activePreviewTab === 'code-wiki' && codeWikiId && M.UI.WikiMini ? [
    // Code Wiki (WikiMini)
    M.UI.WikiMini({
        wikiId: codeWikiId,
        lang: db.env.lang
    })
] : db.activePreviewTab === 'example-info' && exampleWikiId && M.UI.WikiMini ? [
    // Example Info (WikiMini)
    M.UI.WikiMini({
        wikiId: exampleWikiId,
        lang: db.env.lang
    })
] : db.activePreviewTab === 'full-wiki' && M.UI.WikiViewer ? [
    // Full Wiki (WikiViewer)
    M.UI.WikiViewer({
        db: db,
        wikiId: db.activeWikiId || exampleWikiId, // Fallback to example wiki if no active wiki
        onNavigate: (id) => {
             // We need to update state to change the active wiki article
             // This requires access to the app instance or a way to dispatch
             if (window.MishkahApp) {
                 window.MishkahApp.setState(s => ({ ...s, activeWikiId: id }));
             }
        }
    })
]
// ...
```

**Note:** I added a fallback `|| exampleWikiId` for the Full Wiki tab so it opens something relevant initially, and implemented the `onNavigate` handler to update the state.

## Step 4: Add CSS to `index.html`

Inject the CSS from Step 1 into your `index.html` header, or link the new css file.

```html
<link rel="stylesheet" href="upgrade_app/theme.css">
<!-- OR -->
<style>
/* Paste CSS here */
</style>
```

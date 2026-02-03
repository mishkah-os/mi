# خطة إعادة تنظيم Mishkah Lab UI

## 🎯 الهدف
إعادة تنظيم الأزرار والـUI بشكل منطقي مع إضافة ميزات جديدة (History, Save, Preview Tabs, Reset).

---

## ⚠️ قبل البدء
1. **عمل Backup:** ✅ تم (app.js.backup-{timestamp})
2. **التأكد من Mishkah UI:** هل يوجد `M.UI.Tabs` component؟

---

## 📋 ملخص التغييرات

### 1. توزيع الأزرار:
- **Sidebar Footer:** Add Example, Edit Example, Download JSON, Import JSON, Theme, Lang, Reset App
- **Code Area (تحت Framework tabs):** Reset Code, Save as Standard, Code History
- **Preview Area (Tabs):** Execute Result, Code Wiki, Example Info, Full Wiki

### 2. State الجديد:
- `activePreviewTab`: للتحكم في tabs العرض
- `codeHistory`: array لحفظ تاريخ التعديلات
- `showHistoryModal`: لعرض modal التاريخ

### 3. Handlers جديدة (7):
- `preview.tab.switch`
- `code.save_as_standard`
- `code.history.show`
- `code.history.restore`
- `code.history.close`
- `app.reset`

---

## 🔧 التنفيذ خطوة بخطوة

---

### **المرحلة 1: تحديث State**

**ابحث عن:** `const database = {`  
**بعد:** `showReadme: false,`

**أضف:**
```javascript
activePreviewTab: 'execute', // 'execute' | 'code-wiki' | 'example-info' | 'full-wiki'
showHistoryModal: false,
codeHistory: [], // Array of { timestamp, code, framework, example }
```

---

### **المرحلة 2: Event Handlers (7 handlers)**

**ابحث عن:** `const orders = {`  
**في آخر الobject، بعد آخر handler:**

**أضف كل الhandlers التالية:**

```javascript
'preview.tab.switch': {
    on: ['click'],
    gkeys: ['preview-tab-btn'],
    handler: (e, ctx) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tab = btn.dataset.tab;
        ctx.setState(s => ({ ...s, activePreviewTab: tab }));
    }
},

'code.save_as_standard': {
    on: ['click'],
    gkeys: ['save-standard-btn'],
    handler: async (e, ctx) => {
        const state = ctx.getState();
        const confirmMsg = state.env.lang === 'ar' 
            ? 'هل تريد حفظ الكود الحالي كـ Standard؟ سيتم استبدال الكود الأصلي.'
            : 'Save current code as Standard? This will replace the original code.';
        
        if (!confirm(confirmMsg)) return;

        const saved = await dbAdapter.load('examples');
        const list = Array.isArray(saved?.data) ? saved.data : [];
        const example = list.find(ex => ex.id === state.activeExample);

        if (example) {
            if (example.implementations) {
                const impl = example.implementations.find(i => i.framework === state.activeFramework);
                if (impl) impl.code = state.code;
            } else if (example.code) {
                example.code[state.activeFramework] = state.code;
            }
            
            if (example.userCode) {
                delete example.userCode[state.activeFramework];
            }
            
            await dbAdapter.save('examples', list);
            ctx.setState(s => ({ ...s, hasUserCode: false }));
            alert(state.env.lang === 'ar' ? 'تم الحفظ!' : 'Saved!');
        }
    }
},

'code.history.show': {
    on: ['click'],
    gkeys: ['history-btn'],
    handler: (e, ctx) => {
        ctx.setState(s => ({ ...s, showHistoryModal: true }));
    }
},

'code.history.restore': {
    on: ['click'],
    gkeys: ['history-restore-btn'],
    handler: (e, ctx) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const index = parseInt(btn.dataset.index, 10);
        const state = ctx.getState();
        const historyItem = state.codeHistory[index];
        
        if (historyItem) {
            ctx.setState(s => ({
                ...s,
                code: historyItem.code,
                showHistoryModal: false,
                previewSrc: generatePreview(state.activeFramework, historyItem.code)
            }));
            
            if (M.UI.CodeMirror.setValue) {
                M.UI.CodeMirror.setValue('editor', historyItem.code);
            }
        }
    }
},

'code.history.close': {
    on: ['click'],
    gkeys: ['history-close-btn'],
    handler: (e, ctx) => {
        ctx.setState(s => ({ ...s, showHistoryModal: false }));
    }
},

'app.reset': {
    on: ['click'],
    gkeys: ['app-reset-btn'],
    handler: async (e, ctx) => {
        const confirmMsg = ctx.getState().env.lang === 'ar'
            ? 'هل تريد مسح كل البيانات وإعادة التشغيل؟'
            : 'Clear all data and restart?';
        
        if (!confirm(confirmMsg)) return;
        
        await dbAdapter.clear();
        localStorage.clear();
        window.location.reload();
    }
}
```

---

### **المرحلة 3: تحديث autoSave**

**ابحث عن:** `const autoSave = debounce(async (exampleId, framework, code, ctx) => {`

**في نهاية الfunction، قبل `}, 1000);`:**

**أضف:**
```javascript
// Save to history
const state = ctx.getState();
const newHistory = [...state.codeHistory, {
    timestamp: Date.now(),
    code: code,
    framework: framework,
    example: exampleId
}];
const trimmedHistory = newHistory.slice(-20);
ctx.setState(s => ({ ...s, codeHistory: trimmedHistory }));
```

---

### **المرحلة 4: تعديل Sidebar Footer**

**ابحث عن:** `function Sidebar(db) {`

**احذف:** آخر `D.Containers.Div` في Sidebar (اللي فيه Theme و Lang buttons)

**استبدلها بـ:**
```javascript
// Footer
D.Containers.Div({
    attrs: { 
        class: 'mt-auto p-4 border-t',
        style: 'border-color: var(--border);'
    }
}, [
    D.Containers.Div({ attrs: { class: 'mb-3' } }, [
        M.UI.Button({ variant: 'outline', size: 'sm', attrs: { 'gkey': 'add-example-btn', class: 'w-full mb-1' } }, ['➕ ', t('add_example', db)]),
        M.UI.Button({ variant: 'outline', size: 'sm', attrs: { 'gkey': 'edit-example-btn', class: 'w-full mb-1' } }, ['✏️ ', t('edit_example', db)]),
    ]),
    D.Containers.Div({ attrs: { class: 'mb-3 flex gap-1' } }, [
        M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'download-json-btn', class: 'flex-1' } }, ['⬇️']),
        M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'import-json-btn', class: 'flex-1' } }, ['⬆️']),
    ]),
    D.Containers.Div({ attrs: { class: 'mb-2 flex gap-1' } }, [
        D.Forms.Button({ attrs: { 'gkey': 'theme-btn', class: 'flex-1 px-2 py-1 rounded text-sm', style: 'background: var(--muted); color: var(--foreground);' } }, [db.env.theme === 'dark' ? '☀️' : '🌙']),
        D.Forms.Button({ attrs: { 'gkey': 'lang-btn', class: 'flex-1 px-2 py-1 rounded text-sm', style: 'background: var(--muted); color: var(--foreground);' } }, [db.env.lang === 'ar' ? 'EN' : 'عر'])
    ]),
    M.UI.Button({ variant: 'destructive', size: 'sm', attrs: { 'gkey': 'app-reset-btn', class: 'w-full' } }, ['🔄 Reset'])
])
```

---

### **المرحلة 5: تعديل Toolbar**

**ابحث عن:** `function Toolbar(db) {`

#### **5.1: إضافة أزرار الكود بعد Framework tabs**

**بعد:** `...Object.keys(FRAMEWORKS).map(...` و `])`

**أضف:**
```javascript
D.Containers.Div({ attrs: { class: 'flex items-center gap-1 ml-4' } }, [
    db.hasUserCode ? M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'reset-btn', title: t('reset', db) } }, ['↩️']) : null,
    M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'save-standard-btn', title: 'Save Standard' } }, ['💾']),
    M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'history-btn', title: 'History' } }, ['📜'])
])
```

#### **5.2: حذف الأزرار القديمة**

**ابحث عن:** `// Right: Actions`

**احذف كل الأزرار ما عدا Run button**

**استبدلها بـ:**
```javascript
// Right: Run only
D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
    D.Forms.Button({ attrs: { 'gkey': 'run-btn', class: 'px-6 py-2 rounded font-bold text-white transition-all', style: 'background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);' } }, ['▶ ' + t('run', db)])
])
```

---

### **المرحلة 6: استبدال PreviewPane**

**ابحث عن:** `function PreviewPane(db) {`

**احذف الfunction كاملة**

**استبدلها بـ:**
```javascript
function PreviewPane(db) {
    const example = db.examples.find(ex => ex.id === db.activeExample);
    const implementation = example?.implementations?.find(impl => impl.framework === db.activeFramework);
    const codeWikiId = implementation?.wikiId || null;
    const exampleWikiId = example?.wikiId || null;
    
    return D.Containers.Div({
        attrs: { class: 'flex-1 flex flex-col overflow-hidden', style: 'height: calc(100vh - 3.5rem); border-left: 1px solid var(--border);' }
    }, [
        D.Containers.Div({
            attrs: { class: 'flex items-center gap-1 px-3 py-2 border-b', style: 'background: var(--card); border-color: var(--border);' }
        }, [
            M.UI.Button({ variant: db.activePreviewTab === 'execute' ? 'default' : 'ghost', size: 'sm', attrs: { gkey: 'preview-tab-btn', 'data-tab': 'execute' } }, ['▶️ ', db.env.lang === 'ar' ? 'تشغيل' : 'Execute']),
            codeWikiId ? M.UI.Button({ variant: db.activePreviewTab === 'code-wiki' ? 'default' : 'ghost', size: 'sm', attrs: { gkey: 'preview-tab-btn', 'data-tab': 'code-wiki' } }, ['📖 ', db.env.lang === 'ar' ? 'شرح الكود' : 'Code']) : null,
            exampleWikiId ? M.UI.Button({ variant: db.activePreviewTab === 'example-info' ? 'default' : 'ghost', size: 'sm', attrs: { gkey: 'preview-tab-btn', 'data-tab': 'example-info' } }, ['ℹ️ ', db.env.lang === 'ar' ? 'المثال' : 'Info']) : null,
            M.UI.Button({ variant: db.activePreviewTab === 'full-wiki' ? 'default' : 'ghost', size: 'sm', attrs: { gkey: 'preview-tab-btn', 'data-tab': 'full-wiki' } }, ['📚 ', db.env.lang === 'ar' ? 'مكتبة' : 'Wiki'])
        ]),
        D.Containers.Div({
            attrs: { class: 'flex-1 overflow-auto', style: 'background: white;' }
        }, db.activePreviewTab === 'execute' ? [
            D.Media.Iframe({ attrs: { srcdoc: db.previewSrc, class: 'w-full border-none', style: 'min-height: 100%; height: 100%;', sandbox: 'allow-scripts allow-modals allow-same-origin' } })
        ] : db.activePreviewTab === 'code-wiki' && codeWikiId && M.UI.WikiMini ? [
            M.UI.WikiMini({ wikiId: codeWikiId, lang: db.env.lang })
        ] : db.activePreviewTab === 'example-info' && exampleWikiId && M.UI.WikiMini ? [
            M.UI.WikiMini({ wikiId: exampleWikiId, lang: db.env.lang })
        ] : db.activePreviewTab === 'full-wiki' && M.UI.WikiViewer ? [
            M.UI.WikiViewer({ db: db, wikiId: exampleWikiId || codeWikiId })
        ] : [
            D.Text.P({ attrs: { class: 'p-8 text-center' } }, [db.env.lang === 'ar' ? 'لا يوجد محتوى' : 'No content'])
        ])
    ]);
}
```

---

### **المرحلة 7: إضافة HistoryModal**

**قبل:** `function ExampleModal(db) {`

**أضف:**
```javascript
function HistoryModal(db) {
    if (!db.showHistoryModal) return null;
    
    const formattedHistory = db.codeHistory.slice().reverse().map((item, index) => ({
        ...item,
        originalIndex: db.codeHistory.length - 1 - index,
        timeStr: new Date(item.timestamp).toLocaleString(db.env.lang === 'ar' ? 'ar-EG' : 'en-US')
    }));
    
    const content = D.Containers.Div({ attrs: { class: 'space-y-2' } },
        formattedHistory.length === 0 ? [
            D.Text.P({ attrs: { class: 'text-center py-8' } }, [db.env.lang === 'ar' ? 'لا يوجد سجل' : 'No history'])
        ] : formattedHistory.map(item => 
            D.Containers.Div({ attrs: { class: 'p-3 border rounded flex items-center justify-between', style: 'border-color: var(--border);' } }, [
                D.Containers.Div({}, [
                    D.Text.P({ attrs: { class: 'font-medium' } }, [item.example + ' - ' + item.framework]),
                    D.Text.P({ attrs: { class: 'text-sm opacity-70' } }, [item.timeStr])
                ]),
                M.UI.Button({ variant: 'outline', size: 'sm', attrs: { gkey: 'history-restore-btn', 'data-index': item.originalIndex } }, [db.env.lang === 'ar' ? 'استرجاع' : 'Restore'])
            ])
        )
    );
    
    return M.UI.Modal({
        open: true,
        title: db.env.lang === 'ar' ? 'سجل التعديلات' : 'Code History',
        size: 'md',
        content: content,
        actions: [M.UI.Button({ attrs: { gkey: 'history-close-btn' }, variant: 'ghost' }, [db.env.lang === 'ar' ? 'إغلاق' : 'Close'])]
    });
}
```

**ثم ابحث عن:** `function MainLayout(db) {`

**بعد:** [ExampleModal(db)](file:///e:/git/front/playground/app.js#898-946)

**أضف:**
```javascript
HistoryModal(db)
```

---

## ✅ Checklist

- [ ] Backup ✅
- [ ] State (3 fields)
- [ ] Handlers (6)
- [ ] autoSave History
- [ ] Sidebar Footer
- [ ] Toolbar Code Buttons
- [ ] Remove old Toolbar buttons
- [ ] PreviewPane Tabs
- [ ] HistoryModal
- [ ] Test all features

---

## 🎨 UI Structure

```
Sidebar      Toolbar           Editor         Preview
             Frameworks        CodeMirror     [Tabs]
Examples     [↩️💾📜]                         ▶️ Execute
Counter                                      📖 Code
Form                                         ℹ️ Info  
...                                          📚 Wiki

[Footer]
➕ Add
✏️ Edit
⬇️⬆️
☀️ EN
🔄 Reset
```

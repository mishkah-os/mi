/**
 * المرحلة 4: تحديث Sidebar Footer
 * 
 * التعليمات:
 * 1. افتح app.js
 * 2. ابحث عن: function Sidebar(db) {
 * 3. ابحث عن آخر D.Containers.Div في الfunction (اللي فيه Theme و Lang buttons)
 * 4. احذف هذا الـDiv كاملاً (من D.Containers.Div لحد إغلاقه ])
 * 5. استبدله بالكود التالي:
 */

// Footer with all action buttons
D.Containers.Div({
    attrs: {
        class: 'mt-auto p-4 border-t',
        style: 'border-color: var(--border);'
    }
}, [
    // Example actions
    D.Containers.Div({ attrs: { class: 'mb-3' } }, [
        M.UI.Button({
            variant: 'outline',
            size: 'sm',
            attrs: { 'gkey': 'add-example-btn', class: 'w-full mb-1' }
        }, ['➕ ', t('add_example', db)]),
        M.UI.Button({
            variant: 'outline',
            size: 'sm',
            attrs: { 'gkey': 'edit-example-btn', class: 'w-full mb-1' }
        }, ['✏️ ', t('edit_example', db)]),
    ]),

    // Import/Export
    D.Containers.Div({ attrs: { class: 'mb-3 flex gap-1' } }, [
        M.UI.Button({
            variant: 'ghost',
            size: 'sm',
            attrs: { 'gkey': 'download-json-btn', class: 'flex-1' }
        }, ['⬇️']),
        M.UI.Button({
            variant: 'ghost',
            size: 'sm',
            attrs: { 'gkey': 'import-json-btn', class: 'flex-1' }
        }, ['⬆️']),
    ]),

    // Theme & Lang
    D.Containers.Div({ attrs: { class: 'mb-2 flex gap-1' } }, [
        D.Forms.Button({
            attrs: {
                'gkey': 'theme-btn',
                class: 'flex-1 px-2 py-1 rounded text-sm',
                style: 'background: var(--muted); color: var(--foreground);'
            }
        }, [db.env.theme === 'dark' ? '☀️' : '🌙']),
        D.Forms.Button({
            attrs: {
                'gkey': 'lang-btn',
                class: 'flex-1 px-2 py-1 rounded text-sm',
                style: 'background: var(--muted); color: var(--foreground);'
            }
        }, [db.env.lang === 'ar' ? 'EN' : 'عر'])
    ]),

    // Reset App
    M.UI.Button({
        variant: 'destructive',
        size: 'sm',
        attrs: { 'gkey': 'app-reset-btn', class: 'w-full' }
    }, ['🔄 Reset All'])
])

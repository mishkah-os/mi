/**
 * المرحلة 5: تحديث Toolbar
 * 
 * التعليمات - جزء 1 (إضافة أزرار الكود):
 * ========================================
 * 1. افتح app.js
 * 2. ابحث عن: function Toolbar(db) {
 * 3. ابحث عن: ...Object.keys(FRAMEWORKS).map(
 * 4. بعد إغلاق الـmap (بعد })
 * 5. قبل السطر: // Wiki Toggle أو ])
 * 6. أضف الكود التالي:
 */

// Code Actions (small icon buttons)
D.Containers.Div({ attrs: { class: 'flex items-center gap-1 ml-4' } }, [
    db.hasUserCode ? M.UI.Button({
        variant: 'ghost',
        size: 'sm',
        attrs: {
            'gkey': 'reset-btn',
            title: t('reset', db)
        }
    }, ['↩️']) : null,

    M.UI.Button({
        variant: 'ghost',
        size: 'sm',
        attrs: {
            'gkey': 'save-standard-btn',
            title: db.env.lang === 'ar' ? 'حفظ كـ Standard' : 'Save as Standard'
        }
    }, ['💾']),

    M.UI.Button({
        variant: 'ghost',
        size: 'sm',
        attrs: {
            'gkey': 'history-btn',
            title: db.env.lang === 'ar' ? 'السجل' : 'History'
        }
    }, ['📜'])
])

/**
 * التعليمات - جزء 2 (حذف الأزرار القديمة):
 * ==========================================
 * 1. في نفس الfunction Toolbar
 * 2. ابحث عن: // Right: Actions
 * 3. احذف كل الأزرار في هذا القسم ما عدا Run button
 * 4. يعني احذف: reset-btn, add-example-btn, edit-example-btn, download-json-btn, import-json-btn
 * 5. واستبدل القسم كله بـ:
 */

// Right: Run button only
D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
    D.Forms.Button({
        attrs: {
            'gkey': 'run-btn',
            class: 'px-6 py-2 rounded font-bold text-white transition-all',
            style: 'background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);'
        }
    }, ['▶ ' + t('run', db)])
])

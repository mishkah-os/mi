/**
 * المرحلة 3: تحديث autoSave لحفظ History
 * 
 * التعليمات:
 * 1. افتح app.js
 * 2. ابحث عن: const autoSave = debounce(async (exampleId, framework, code, ctx) => {
 * 3. اذهب لنهاية الfunction
 * 4. قبل السطر: }, 1000);
 * 5. أضف الكود التالي:
 */

// Save to history
const state = ctx.getState();
const newHistory = [...state.codeHistory, {
    timestamp: Date.now(),
    code: code,
    framework: framework,
    example: exampleId
}];
const trimmedHistory = newHistory.slice(-20); // Keep only last 20
ctx.setState(s => ({ ...s, codeHistory: trimmedHistory }));

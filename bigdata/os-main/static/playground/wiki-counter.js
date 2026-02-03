// Wiki Articles for Counter Example
(function () {
    'use strict';

    // Extend existing wiki database
    window.codewikidb = window.codewikidb || [];

    // Counter Example Wiki Articles
    const counterWikiArticles = [
        {
            id: 'counter-basics',
            title: { en: 'Counter Example Basics', ar: 'أساسيات مثال العداد' },
            parent: null,
            category: 'examples',
            content: {
                en: `# Counter Example - Overview

The **Counter** is a fundamental pattern in web development that demonstrates state management and reactivity.

## What is a Counter?

A counter is a simple application that:
- Displays a numeric value (starting at 0)
- Has a button to increment the value
- Updates the UI when the value changes

## Why Learn Counters?

Counters teach these core concepts:

### 1. State Management
Managing data that changes over time.

### 2. Event Handling
Responding to user interactions (clicks).

### 3. UI Updates
Reflecting state changes in the DOM.

### 4. Framework Comparison
Perfect for comparing [vanilla-counter](Vanilla JS), [jquery-counter](jQuery), [vue-counter](Vue.js), [react-counter](React), and [mishkah-dsl-counter](Mishkah DSL) approaches.

## Related Topics
- [State Management](#state-management)
- [Event Delegation](#event-delegation)
- [Reactivity](#reactivity)`,
                ar: `# مثال العداد - نظرة عامة

**العداد** هو نمط أساسي في تطوير الويب يوضح إدارة الحالة والتفاعلية.

## ما هو العداد؟

العداد تطبيق بسيط:
- يعرض قيمة رقمية (تبدأ من 0)
- يحتوي على زر لزيادة القيمة
- يحدث واجهة المستخدم عند تغيير القيمة

## لماذا نتعلم العدادات؟

تعلم العدادات مفاهيم أساسية:

### 1. إدارة الحالة
إدارة البيانات التي تتغير مع الوقت.

### 2. معالجة الأحداث
الاستجابة لتفاعلات المستخدم (النقرات).

### 3. تحديثات الواجهة
عكس تغييرات الحالة في DOM.

### 4. مقارنة الأطر
مثالي لمقارنة [vanilla-counter](Vanilla JS) و [jquery-counter](jQuery) و [vue-counter](Vue.js) و [react-counter](React) و [mishkah-dsl-counter](Mishkah DSL).

## مواضيع ذات صلة
- [إدارة الحالة](#state-management)
- [تفويض الأحداث](#event-delegation)
- [التفاعلية](#reactivity)`
            }
        },
        {
            id: 'vanilla-counter',
            title: { en: 'Vanilla JS Counter', ar: 'عداد JavaScript النقي' },
            parent: 'counter-basics',
            category: 'examples',
            content: {
                en: `# Vanilla JS Counter

Pure JavaScript implementation without any framework.

## Key Concepts

### 1. DOM Manipulation
\`\`\`javascript
const display = document.getElementById('count');
display.textContent = count;
\`\`\`

### 2. Event Listeners
\`\`\`javascript
document.getElementById('btn').addEventListener('click', () => {
  count++;
  display.textContent = count;
});
\`\`\`

### 3. State Management
State is stored in a simple variable:
\`\`\`javascript
let count = 0;
\`\`\`

## Advantages
- ✅ No dependencies
- ✅ Small bundle size
- ✅ Full control

## Disadvantages
- ❌ Manual DOM updates
- ❌ No reactivity
- ❌ More boilerplate`,
                ar: `# عداد JavaScript النقي

تطبيق JavaScript نقي بدون أي إطار عمل.

## المفاهيم الأساسية

### 1. معالجة DOM
\`\`\`javascript
const display = document.getElementById('count');
display.textContent = count;
\`\`\`

### 2. مستمعي الأحداث
\`\`\`javascript
document.getElementById('btn').addEventListener('click', () => {
  count++;
  display.textContent = count;
});
\`\`\`

### 3. إدارة الحالة
الحالة محفوظة في متغير بسيط:
\`\`\`javascript
let count = 0;
\`\`\`

## المميزات
- ✅ بدون اعتماديات
- ✅ حجم صغير
- ✅ تحكم كامل

## العيوب
- ❌ تحديثات DOM يدوية
- ❌ بدون تفاعلية
- ❌ كود أكثر`
            }
        },
        {
            id: 'vue-counter',
            title: { en: 'Vue.js Counter', ar: 'عداد Vue.js' },
            parent: 'counter-basics',
            category: 'examples',
            content: {
                en: `# Vue.js Counter

Reactive counter using Vue 3 Composition API.

## Key Concepts

### 1. Reactivity with ref()
\`\`\`javascript
const count = ref(0);
\`\`\`

The \`ref\` creates a reactive reference that automatically updates the UI.

### 2. Template Binding
\`\`\`html
<div>{{ count }}</div>
<button @click="count++">Increment</button>
\`\`\`

### 3. Automatic Updates
Vue tracks dependencies and updates DOM automatically.

## Advantages
- ✅ Automatic reactivity
- ✅ Clean syntax
- ✅ Less boilerplate

## Related
- [Reactivity System](#reactivity)
- [Composition API](#composition-api)`,
                ar: `# عداد Vue.js

عداد تفاعلي باستخدام Vue 3 Composition API.

## المفاهيم الأساسية

### 1. التفاعلية مع ref()
\`\`\`javascript
const count = ref(0);
\`\`\`

\`ref\` ينشئ مرجع تفاعلي يحدث الواجهة تلقائياً.

### 2. ربط القالب
\`\`\`html
<div>{{ count }}</div>
<button @click="count++">Increment</button>
\`\`\`

### 3. التحديثات التلقائية
Vue يتتبع التبعيات ويحدث DOM تلقائياً.

## المميزات
- ✅ تفاعلية تلقائية
- ✅ صيغة نظيفة
- ✅ كود أقل

## مواضيع ذات صلة
- [نظام التفاعلية](#reactivity)
- [Composition API](#composition-api)`
            }
        }
    ];

    // Add to existing wiki database
    window.codewikidb.push(...counterWikiArticles);

    console.log('✅ Counter wiki articles loaded:', counterWikiArticles.length);
})();

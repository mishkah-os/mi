// Wiki Articles for CPS Challenge Example
(function () {
    'use strict';

    // Extend existing wiki database
    window.codewikidb = window.codewikidb || [];

    // CPS Challenge Wiki Articles
    const cpsWikiArticles = [
        {
            id: 'cps-challenge-basics',
            title: { en: 'CPS Challenge - Game Mechanics', ar: 'تحدي CPS - آليات اللعبة' },
            parent: null,
            category: 'examples',
            content: {
                en: `# CPS Challenge - Clicks Per Second

A fun interactive game to measure your clicking speed!

## What is CPS?

**CPS** (Clicks Per Second) measures how many times you can click in one second.

## Game Mechanics

### 1. Timer System
- User sets duration (default: 10 seconds)
- Countdown starts when clicking "Start"
- Timer decrements every second

### 2. Click Counter
- Counts valid clicks only when timer is running
- Button disabled when not active (anti-cheat)

### 3. Score Calculation
\`\`\`javascript
const cps = totalClicks / duration;
\`\`\`

## Learning Outcomes

This example teaches:
- **Interval Management**: \`setInterval\` and \`clearInterval\`
- **State Control**: Enabling/disabling UI based on state
- **Timer Logic**: Countdown implementation
- **Anti-Cheat**: Preventing invalid clicks

## Framework Implementations
- [mishkah-dsl-cps-challenge](Mishkah DSL)
- [vanilla-cps-challenge](Vanilla JS)
- [vue-cps-challenge](Vue.js)
- [react-cps-challenge](React)`,
                ar: `# تحدي CPS - النقرات في الثانية

لعبة تفاعلية ممتعة لقياس سرعة النقر!

## ما هو CPS؟

**CPS** (النقرات في الثانية) يقيس عدد النقرات في ثانية واحدة.

## آليات اللعبة

### 1. نظام المؤقت
- المستخدم يحدد المدة (افتراضي: 10 ثواني)
- العد التنازلي يبدأ عند الضغط على "ابدأ"
- المؤقت ينقص كل ثانية

### 2. عداد النقرات
- يعد النقرات الصالحة فقط عند تشغيل المؤقت
- الزر معطل عند عدم النشاط (منع الغش)

### 3. حساب النتيجة
\`\`\`javascript
const cps = totalClicks / duration;
\`\`\`

## نواتج التعلم

هذا المثال يعلم:
- **إدارة الفواصل**: \`setInterval\` و \`clearInterval\`
- **التحكم بالحالة**: تفعيل/تعطيل الواجهة حسب الحالة
- **منطق المؤقت**: تطبيق العد التنازلي
- **منع الغش**: منع النقرات غير الصالحة

## تطبيقات الأطر
- [mishkah-dsl-cps-challenge](Mishkah DSL)
- [vanilla-cps-challenge](Vanilla JS)
- [vue-cps-challenge](Vue.js)
- [react-cps-challenge](React)`
            }
        },
        {
            id: 'mishkah-dsl-cps-challenge',
            title: { en: 'Mishkah DSL CPS', ar: 'CPS بـ Mishkah DSL' },
            parent: 'cps-challenge-basics',
            category: 'examples',
            content: {
                en: `# CPS Challenge - Mishkah DSL

Implementation using Mishkah's reactive DSL.

## Architecture

### 1. State (Database)
\`\`\`javascript
const database = {
  countdown: 0,
  clicks: 0,
  isRunning: false,
  cps: null,
  totalTime: 0
};
\`\`\`

### 2. Commands (Orders)
Event handlers that modify state:

\`\`\`javascript
'start.challenge': {
  on: ['click'],
  gkeys: ['start-btn'],
  handler: (e, ctx) => {
    ctx.setState(s => ({
      ...s,
      countdown: val,
      clicks: 0,
      isRunning: true
    }));
  }
}
\`\`\`

### 3. UI Function
Pure function that renders based on state:

\`\`\`javascript
function App(db) {
  const D = Mishkah.DSL;
  return D.Containers.Div({}, [
    D.Text.H2({}, [String(db.clicks)])
  ]);
}
\`\`\`

## Key Features

- **Declarative UI**: No manual DOM manipulation
- **Event Delegation**: Global key system (\`gkeys\`)
- **Immutable Updates**: State changes via \`setState\`

## Related
- [Mishkah DSL](#mishkah-dsl)
- [State Management](#state-management)`,
                ar: `# تحدي CPS - Mishkah DSL

التطبيق باستخدام Mishkah DSL التفاعلي.

## المعمارية

### 1. الحالة (قاعدة البيانات)
\`\`\`javascript
const database = {
  countdown: 0,
  clicks: 0,
  isRunning: false,
  cps: null,
  totalTime: 0
};
\`\`\`

### 2. الأوامر (Orders)
معالجات الأحداث التي تعدل الحالة:

\`\`\`javascript
'start.challenge': {
  on: ['click'],
  gkeys: ['start-btn'],
  handler: (e, ctx) => {
    ctx.setState(s => ({
      ...s,
      countdown: val,
      clicks: 0,
      isRunning: true
    }));
  }
}
\`\`\`

### 3. دالة الواجهة
دالة نقية تعرض حسب الحالة:

\`\`\`javascript
function App(db) {
  const D = Mishkah.DSL;
  return D.Containers.Div({}, [
    D.Text.H2({}, [String(db.clicks)])
  ]);
}
\`\`\`

## المميزات الأساسية

- **واجهة تصريحية**: بدون معالجة DOM يدوية
- **تفويض الأحداث**: نظام المفاتيح العام (\`gkeys\`)
- **تحديثات ثابتة**: تغييرات الحالة عبر \`setState\`

## مواضيع ذات صلة
- [Mishkah DSL](#mishkah-dsl)
- [إدارة الحالة](#state-management)`
            }
        }
    ];

    // Add to existing wiki database
    window.codewikidb.push(...cpsWikiArticles);

    console.log('✅ CPS wiki articles loaded:', cpsWikiArticles.length);
})();

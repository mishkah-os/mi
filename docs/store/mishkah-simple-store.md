## Mishkah Simple Store DSL

هذه المكتبة تضيف طبقة تجريد خفيفة فوق `static/sdk/mishkah.store.js` بحيث يمكن للتطبيقات الأمامية الاشتراك وبث السجلات عبر بضعة أسطر فقط.

#### الاستيراد

import:

```js
import { createDB, createDBAuto } from '../sdk/mishkah.simple-store.js';
```

#### التهيئة الأساسية

```js
const db = createDB({
  branchId: 'lab:test-pad',
  moduleId: 'scratchpad',
  objects: {
    notes: {
      table: 'scratchpad_entry'
    }
  }
});
```

#### التهيئة السريعة من مخطط جاهز

```js
const branchId = 'lab:test-pad';
const moduleId = 'pos';
const schemaPayload = await fetch(`/api/schema?branch=${encodeURIComponent(branchId)}&module=${moduleId}`)
  .then((r) => r.json());
const schema = schemaPayload.modules?.[moduleId]?.schema;
const db = createDBAuto(schema, ['order_header', 'order_line'], {
  branchId,
  moduleId
});
```

- يتم استنتاج الجداول تلقائياً من الاستجابة؛ نفس المخطط المستخدم في الخادم.
- يمكن تمرير عناصر بصيغة `{ name: 'orders', table: 'order_header' }` عند الحاجة لتسميات مختلفة.

- `branchId`, `moduleId`: هوية القناة في WS2.
- `objects`: خريطة كائنات منطقية تظهر في الواجهة، لكل كائن اسم (`notes`) وجدول فعلي (`scratchpad_entry`).

#### الكتابة والبث

```js
await db.insert('notes', { note: 'Hello', source: 'ui' });
await db.update('notes', { id: 'note-123', note: 'Updated' });
await db.delete('notes', { id: 'note-123' });
```

- `insert` ينفذ `module:insert`.
- `update` و `delete` يمرران القيم إلى `mishkah.store` عبر `merge` و `remove`.

#### القراءة ومراقبة التغيرات

```js
const unsubscribe = db.watch('notes', (list) => {
  // list: نسخة جاهزة للاستهلاك (results of fromRecord)
});

const cached = db.list('notes'); // آخر نسخة معروفة دون انتظار بث جديد

db.status((status) => {
  // idle | connecting | open | closed
});
```

- عند استقبال `server:snapshot` أو `server:event` يتم تحديث الـ watchers تلقائياً.
- يمكن عدم تمرير `objects` مسبقاً؛ أول استدعاء لـ `watch` أو `insert` سيقوم بتسجيل الكائن بالافتراضات القياسية.

#### تخصيص التحويلات

كل تعريف كائن يقبل الدوال التالية (اختيارية):

```js
objects: {
  notes: {
    table: 'scratchpad_entry',
    toRecord(value, ctx) {
      // يحوّل الإدخال الخام إلى سجل WS2
      return ctx.ensure({
        id: ctx.uuid('note'),
        note: value.note,
        payload: { note: value.note },
        createdAt: ctx.now(),
        serverAt: ctx.now()
      });
    },
    fromRecord(record) {
      // يحوّل سجل الخادم إلى بنية جاهزة للعرض
      return {
        id: record.id,
        note: record.note,
        serverAt: record.serverAt
      };
    },
    defaults: { branchId: 'lab:test-pad' }
  }
}
```

- `ctx.ensure(record)` يضمن `branchId` والمعرفات الافتراضية.
- `ctx.uuid(prefix)` يولّد معرفاً متوافقاً مع WS2.
- `ctx.now()` يرجع `ISO timestamp`.

#### استخدام عملي

راجع المثال الجاهز في `static/g/ws2-scratchpad-min.html` حيث يتم:

1. إنشاء التطبيق Mishkah UI.
2. إنشاء `db` عبر `createDB`.
3. الاشتراك في `db.watch('notes', ...)`.
4. استخدام `db.insert('notes', { note, source })` عند إرسال النموذج.

هذه الطبقة مصممة لتعميم الربط على بقيّة الصفحات دون الحاجة إلى فهم تفاصيل بروتوكول WS2 في كل واجهة.*** End Patch

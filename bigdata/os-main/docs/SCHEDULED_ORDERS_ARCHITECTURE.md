# معمارية نظام الطلبات المجدولة (Scheduled Orders Architecture)

## تقرير المراجعة المعمارية - Critical Assessment

**التاريخ**: 2026-01-08  
**الحالة**: 🔴 **CRITICAL - النظام غير مكتمل تماماً**  
**المراجع**: مهندس معماري برمجيات

---

## 🚨 الاكتشاف الحرج (Critical Discovery)

بعد المراجعة العميقة للكود، اكتشفت ما يلي:

### ❌ ما هو المفقود تماماً

1. **لا يوجد handler للحفظ**: `pos.schedule.save` **غير موجود في الكود أصلاً**
2. **لا توجد references لجداول الحفظ**: كلمة `order_schedule` **لا تظهر في الكود نهائياً**
3. **لا توجد منطق الحجوزات**: كلمة `reservation` **لا تظهر في الكود نهائياً**
4. **التعديلات السابقة خاطئة**: الـ guard clauses التي أضفتها تشير إلى handlers **غير موجودة أصلاً**

### ✅ ما هو موجود فعلاً

1. **UI Selector**: تم إضافة الـ select dropdown لاختيار "Immediate" أو "Scheduled"
2. **State Management**: يتم تخزين `db.ui.reservation.enabled` في الـ state
3. **Guard Clauses**: تم إضافتها في `persistOrderFlow` و `pos.payments.capture`
4. **UI Button**: تم تغيير زر "Pay" إلى "Reserve" عندما يكون الوضع scheduled

---

## 🏗️ المعمارية المفترضة (Intended Architecture)

### 1. مسار البيانات الصحيح (Correct Data Flow)

#### أ) الطلبات الفورية (Immediate Orders)

```
┌─────────────────┐
│  User Interface │
│  (Add Items)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Order State (Memory)    │
│ db.data.order           │
│ db.ui.reservation.      │
│   enabled = FALSE       │
└────────┬────────────────┘
         │
         ▼ [User clicks "Finish/Pay"]
┌─────────────────────────┐
│  pos.order.save         │
│  handler                │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  persistOrderFlow()     │
│  (Core Save Logic)      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Backend API            │
│  POST /api/orders       │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Database Tables:                │
│  ✅ order_header                 │
│  ✅ order_line                   │
│  ✅ order_payment                │
│  ✅ job_order_header (Kitchen)   │
│  ✅ job_order_detail (Kitchen)   │
└──────────────────────────────────┘
```

#### ب) الطلبات المجدولة (Scheduled Orders) - **المفترض**

```
┌─────────────────┐
│  User Interface │
│  (Add Items)    │
│  + Select       │
│  "Scheduled"    │
│  + Pick Date    │
│  + Pick Customer│
│  + Pick Tables  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Order State (Memory)    │
│ db.data.order           │
│ db.ui.reservation.      │
│   enabled = TRUE        │
│   scheduledAt = DATE    │
│   customerId = ID       │
└────────┬────────────────┘
         │
         ▼ [User clicks "Reserve/Schedule"]
┌─────────────────────────┐
│  pos.schedule.save      │
│  handler                │
│  ❌ NOT IMPLEMENTED     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  saveToSchedule()       │
│  (Dedicated Logic)      │
│  ❌ NOT IMPLEMENTED     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Backend API            │
│  POST /api/schedule     │
│  ❌ ENDPOINT MISSING?   │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Database Tables:                │
│  ❌ order_schedule               │
│  ❌ order_schedule_tables        │
│  ❌ order_schedule_payment       │
│  ⚠️  NO job_order (not yet)     │
└──────────────────────────────────┘
```

---

## 📊 جداول قاعدة البيانات المطلوبة (Required Database Tables)

### 1. `order_schedule` (الطلبات المجدولة)

```sql
CREATE TABLE order_schedule (
  id TEXT PRIMARY KEY,              -- مثل: "SCH-DAR-001001"
  customer_id TEXT NOT NULL,        -- ✅ MANDATORY
  customer_name TEXT,
  customer_phone TEXT,
  scheduled_at TIMESTAMP NOT NULL,  -- ✅ MANDATORY (وقت الحجز)
  party_size INTEGER,               -- عدد الأشخاص
  order_type TEXT,                  -- dine_in, delivery, takeaway
  status TEXT,                      -- pending, confirmed, cancelled, converted
  notes TEXT,
  lines TEXT,                       -- JSON array of order lines
  totals TEXT,                      -- JSON object with subtotal, tax, etc.
  discount TEXT,                    -- JSON object
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  converted_order_id TEXT,          -- ID of order_header after conversion
  converted_at TIMESTAMP
);
```

### 2. `order_schedule_tables` (جداول الحجوزات)

```sql
CREATE TABLE order_schedule_tables (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,        -- FK to order_schedule.id
  table_id TEXT NOT NULL,           -- FK to dining_tables.id
  created_at TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES order_schedule(id),
  FOREIGN KEY (table_id) REFERENCES dining_tables(id)
);
```

### 3. `order_schedule_payment` (مدفوعات الحجوزات)

```sql
CREATE TABLE order_schedule_payment (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,        -- FK to order_schedule.id
  payment_method_id TEXT,           -- cash, card, etc.
  amount REAL,
  captured_at TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (schedule_id) REFERENCES order_schedule(id)
);
```

---

## 🔧 المكونات المفقودة التي يجب تطويرها (Missing Components)

### 1. Frontend Handler: `pos.schedule.save`

**الموقع المفترض**: `d:\git\os\static\pos\posv3.js` (حوالي سطر 15400+)

```javascript
'pos.schedule.save': {
  on: ['click'],
  gkeys: ['pos:schedule:save'],
  handler: async (e, ctx) => {
    const state = ctx.getState();
    const t = getTexts(state);
    const reservation = state.ui?.reservation || {};
    const order = state.data?.order || {};
    
    // 1. Validation
    const scheduledAt = reservation.scheduledAt;
    if (!scheduledAt || scheduledAt <= Date.now()) {
      UI.pushToast(ctx, { 
        title: t.toast.invalid_schedule_time || 'وقت الحجز غير صحيح', 
        icon: '⚠️' 
      });
      return;
    }
    
    // ... (full implementation in document)
  }
}
```

### 2. Backend Endpoint: `POST /api/schedule`

### 3. Reservations Dashboard Modal

### 4. Confirm Reservation Handler

### 5. Backend Confirm Endpoint

---

## 🔍 خطة التحقق (Verification Plan)

### 1. Database Schema Check

```sql
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'order_schedule%';
```

### 2. Full Flow Test

```
1. Open POS
2. Select "Scheduled Order" from dropdown
3. Add items to cart
4. Select customer, date/time, tables
5. Click "Reserve" button
6. Verify data in order_schedule table
7. Open Reservations modal
8. Confirm reservation
9. Verify order_header created
10. Verify KDS displays order
```

---

## 📝 الخلاصة والتوصيات (Summary & Recommendations)

### المشكلة الرئيسية

النظام الحالي **لا يحتوي على أي كود فعلي** لحفظ الطلبات المجدولة. الـ UI موجود، لكن Backend والـ handlers **مفقودة بالكامل**.

### التوصيات

1. ✅ **إنشاء جداول قاعدة البيانات** أولاً
2. ✅ **تطوير Backend API**  
3. ✅ **تطوير Frontend Handlers**
4. ✅ **إنشاء Reservations Dashboard**
5. ✅ **اختبار المسار الكامل**

### الأولوية

**عاجل جداً** - النظام غير قابل للاستخدام حالياً للطلبات المجدولة.

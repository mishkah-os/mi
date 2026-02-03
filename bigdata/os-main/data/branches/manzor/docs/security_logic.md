# منطق نظام الأمن والصلاحيات

## الهيكل الهرمي للحماية

### 1️⃣ **المستوى الأول: الشاشة (Screen Override)**

```
IF screen.is_sensitive = true:
  → يحتاج صلاحية صريحة (READ/WRITE)
```

### 2️⃣ **المستوى الثاني: الجدول (Table Default)**

```
IF screen.is_sensitive = false AND table.is_sensitive = true:
  → يحتاج صلاحية صريحة
```

### 3️⃣ **المستوى الثالث: الوضع الافتراضي**

```
IF screen.is_sensitive = false AND table.is_sensitive = false:
  → READ: مسموح للمستخدمين المصادقين
  → WRITE: يحتاج صلاحية
```

---

## منطق الفحص (Pseudocode)

```python
def check_access(user, screen, table, action):
    # SuperAdmin = كل شيء
    if user.is_superadmin:
        return True
    
    # فحص صلاحية الفرع أولاً
    if not user.has_branch_access(current_branch):
        return False
    
    # تحديد مستوى الحساسية (الشاشة تحكم)
    is_sensitive_context = screen.is_sensitive if screen.is_sensitive is not None else table.is_sensitive
    
    # جداول/شاشات حساسة
    if is_sensitive_context:
        return has_explicit_permission(user, screen, action)
    
    # جداول/شاشات عادية
    if action == 'VIEW':
        return True  # مسموح للجميع
    else:  # INSERT/UPDATE/DELETE
        return has_explicit_permission(user, screen, action)

def has_explicit_permission(user, screen, action):
    # البحث في صلاحيات المجموعات
    for group in user.groups:
        perm = get_permission(group, screen)
        if perm and perm[f"can_{action.lower()}"]:
            return True
    return False
```

---

## أمثلة عملية

### مثال 1: جدول عادي، شاشة عادية

```
Table: fin_chart_of_accounts (is_sensitive=false)
Screen: chart_of_accounts_screen (is_sensitive=false)

النتيجة:
  - READ: مسموح للجميع ✅
  - WRITE: يحتاج صلاحية ⚠️
```

### مثال 2: جدول عادي، شاشة حساسة

```
Table: fin_journal_headers (is_sensitive=false)
Screen: salary_journals_screen (is_sensitive=true)

النتيجة:
  - READ: يحتاج صلاحية ⚠️ (الشاشة تحكم)
  - WRITE: يحتاج صلاحية ⚠️
```

### مثال 3: جدول حساس، شاشة عادية (مستقبلي)

```
Table: fin_salaries (is_sensitive=true)
Screen: report_viewer (is_sensitive=false)

النتيجة:
  - READ: يحتاج صلاحية ⚠️ (الجدول حساس)
  - WRITE: يحتاج صلاحية ⚠️
```

---

## التوصيات

1. **افتراضياً**: كل الجداول `is_sensitive = false`
2. **الشاشات الحساسة**: ضبط `is_sensitive = true` يدوياً (مثل: شاشات الرواتب، الحسابات البنكية)
3. **Audit Trail**: تسجيل كل عملية WRITE في `user_insert`

# Screen: Finance

## Goal
Provide invoices list, petty cash entry, and a simple cashflow dashboard.

## Primary Tables
- `clinic_invoices_header`
- `clinic_invoices_lines`
- `clinic_payments`
- `clinic_patient_ledger`
- Petty cash table (new): `clinic_cash_expenses`

## UI Composition
- KPIs: total collected, expenses, cash on hand.
- Invoices table: status, patient, total, paid.
- Expense form: amount, category, paid_to, method.
- Transactions table: ledger entries and payments.

## API Usage (REST CRUD)
- Invoices: CRUD on `clinic_invoices_header` and `clinic_invoices_lines`
- Payments: CRUD on `clinic_payments`
- Ledger: list `clinic_patient_ledger`
- Expenses: CRUD on `clinic_cash_expenses`

## Save Flow (Front-end Orchestration)
- Expense: create expense row and update cashflow KPIs.
- Cashflow: computed in frontend from invoices + expenses.

## Print
- Invoice print via shared print helper.

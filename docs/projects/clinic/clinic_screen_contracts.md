# Screen: Contracts

## Goal
Operate contracts with full financial details, sessions, approvals, and print.
This replaces CRUD for contracts, lines, tickets, payments in daily operations.

## Primary Tables
- `clinic_contracts_header`
- `clinic_contracts_lines`
- `clinic_session_tickets`
- `clinic_visit_tickets`
- `clinic_visit_ticket_session_links`
- `clinic_bookings` (optional initial booking plan)
- `clinic_invoices_header` / `clinic_payments` (approval & settlement)

## UI Composition
- Header: patient info, contract status, total, paid, remaining.
- Contracts table: recent contracts (paged).
- Contract editor: header form + line items + discount/notes.
- Sessions plan: view/auto-generate session tickets.
- Booking plan: schedule initial bookings (slots).
- Actions: approve, print, create invoice.

## API Usage (REST CRUD)
- List: `POST /api/v1/crud/clinic_contracts_header/search`
- Detail: `GET /api/v1/crud/clinic_contracts_header/:id`
- Lines: `POST /api/v1/crud/clinic_contracts_lines/search` then filter by contract id
- Sessions: CRUD on `clinic_session_tickets` (generate based on lines)
- Visit tickets: CRUD on `clinic_visit_tickets` per contract
- Approve: update contract status + create invoice header + payments if needed

## Save Flow (Front-end Orchestration)
1) Create/update contract header.
2) Upsert line items (service + sessions + price).
3) If approval is clicked:
   - Create invoice header with contract scope.
   - Create payment rows as entered.
   - Update contract status to approved.

## Print
- Contract print uses the shared print helper.
- Print output: company header + patient + contract + lines + totals + footer.

## State Shape (Front-end)
```
state.data.screens.contracts = {
  loading: false,
  page: 1,
  limit: 20,
  search: '',
  list: [],
  total: 0,
  selected: null,
  lines: [],
  payments: []
}
```

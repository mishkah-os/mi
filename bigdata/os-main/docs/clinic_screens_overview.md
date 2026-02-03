# Clinic Screens Overview (Operational UI)

This document defines the four operational screens that sit on top of the REST CRUD layer.
CRUD is reserved for settings/catalog tables. Operational screens orchestrate multiple tables.

## Screen Set

1) Profiles (Patients) + quick contract entry
2) Contracts (full financial + sessions + approvals + print)
3) Bookings (timeline + reschedule + check-in)
4) Progress & Execution (visit progress + steps + consumables)
5) Finance (invoices + petty cash + cashflow dashboard)

## Architecture Rules

- Use Mishkah DSL for all UI views.
- Each screen lives in a standalone file under `static/projects/clinic/screens/`.
- Each screen exports two functions to `window.ClinicScreens`:
  - `load(app)` for data loading
  - `render(appState)` for view
- The dashboard hosts the screens in tabs; screens are not routes.
- REST CRUD endpoints remain the source of truth.
- Complex save flows are handled in screen-specific services (front-end only).

## Print Layer

- Printing uses a separate helper (`static/projects/clinic/print.js`).
- Print view is isolated and minimal (logo + company info + header + body + footer).
- Print views are data-driven and read-only.

## Shared Contracts

- Screen-level state is stored under `state.data.screens`.
- Column metadata from the backend (`columnsMeta`) is respected for table columns and labels.
- Search uses `is_searchable` from `columnsMeta` when present.

## Next Steps

- Implement Profiles + Contracts screens first.
- Add Booking/Progress/Finance screens after the operational data flows stabilize.

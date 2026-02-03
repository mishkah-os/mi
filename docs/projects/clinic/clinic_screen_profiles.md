# Screen: Profiles (Clients)

## Goal
Deliver a flagship “Profiles” workspace that feels bespoke—structured like a dedicated dashboard rather than a CRUD table. The page must let reception and ops teams:
- discover clients via name/phone search,
- inspect the latest applications on a high-density grid,
- raise a client modal (for create/edit/print),
- jump to contracts or bookings without losing context,
- and surface attachments, medical history, and navigation actions cleanly per row.

## Layout & UX Sections
1. **Header strip**  
   - Left: `UI.Segmented` or tags for `Clients | Contracts | Bookings` view shortcuts.  
   - Center: search field (placeholder: “Name or phone”) with instant filtering and optional quick filters (“Active”, “With Attachments”).  
   - Right: action buttons: `New Profile` (opens modal), `Print Selected`, `Show Attachments`.

2. **Stats row**  
   - `UI.StatCard` tiles for “Active clients”, “Pending contracts”, “Latest booked visit”, “Attachments waiting”.  
   - Live chip showing “Selected client: Display Name” once a row is focused.

3. **Main body (two-column)**  
   - **Left column (Client grid)**  
     * `UC.Table` listing clients with columns: display name, phone, status, loyalty, recent booking.  
     * Each row carries an inline context menu (`UI.Button` group or `Menu`) offering: `Edit profile`, `View contracts`, `View bookings`, `Open attachments`, `Print`.  
     * Rows highlight on hover and show a `⇒` icon that triggers the context panel on the right.
   - **Right column (detail panel)**  
     * Stack of sections:  
       a. **Summary card** (display name, phone, primary contract, loyalty badge).  
       b. **Key dates grid** (joined/last visit/next booking).  
       c. **Attachments preview** (list with icons + upload button).  
       d. **History timeline** (recent visits, notes, progress steps).  
     * Buttons to “Go to Contracts screen” or “Go to Bookings screen”, passing the client record for contextual filters.

4. **Full-screen modal (Profiles)**  
   - Triggered by `New Profile`, row context “Edit”, or header actions.  
   - Tabs (UI.Tabs) for `Profile Info`, `Medical`, `Attachments`, `Logs`.  
   - Form groups with structured sections (Personal, Contact, Medical Flags, Consent).  
   - Lookup pickers use `UI.Select` populated via cached CRUD lookups.  
   - Save button posts to CRUD, closes modal, refreshes table, pre-selects the updated record.
   - Print button launches `print.js` shadow component with selected template.

## Navigation & Context
- Row-level context buttons synthesize navigation actions by dispatching `crud:switch-screen` with `data-screen=contracts`/`bookings` and a payload (via `data-context-client-id`/`data-display-name`) for those screens to auto-filter.
- Contracts and Bookings screens must accept optional context (client ID) and re-query accordingly.
- `UI.Modal` should expose `onClose` to drop selection and optionally re-open after form errors.

## API Flow
1. **Search + paging**: reuse existing `clinic_patients` search endpoint; pass `q` plus `phone` filter for name/number search.  
2. **Detail + edit**: fetch `/crud/clinic_patients/:id` + translations. Populate modal.  
3. **Attachments**: new helper endpoint or re-use `clinic_patient_files`.  
4. **Contracts/Bookings context**: front-end passes `client_id` query to those screens via `calcParams` before calling their loaders.  
5. **Print**: data from detail fetch + attachments to compose profile summary for `print.js`.

## State shape
```
state.data.screens.profiles = {
  loading: false,
  search: '',
  filters: { status: 'active' },
  list: [],
  total: 0,
  selectedClientId: null,
  selectedClient: null,
  modal: { open: false, mode: 'view', loading: false, error: null },
  context: { contractsFilter: null, bookingsFilter: null },
  lookups: { genders: [], areas: [], specialties: [] }
}
```

## Implementation Notes
- Build helper `profiles:search`, `profiles:select-row`, `profiles:open-modal`, `profiles:navigate-contracts`, `profiles:navigate-bookings`.  
- Use shared `print.js` component for printing; open via `profiles:print`.  
- Provide `profiles:new` gkey for the “New” button and reuse `modal` for create/edit.  
- Attachments grid should be capable of showing existing files and hooking to the upload widget in `print.js`.  
- Document new APIs and gkeys so future screens can integrate the same context pattern.

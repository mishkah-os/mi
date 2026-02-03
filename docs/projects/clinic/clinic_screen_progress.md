# Screen: Progress (Visit Execution)

## Goal
Track live visit execution, steps, devices, and consumables.

## Primary Tables
- `clinic_visit_progress_header`
- `clinic_visit_progress_steps`
- `clinic_visit_consumables`
- `clinic_protocol_templates` / `clinic_protocol_template_steps`

## UI Composition
- Active visit header (patient, booking, start/end).
- Step timeline with device usage and durations.
- Consumables list and usage form.
- Operator actions: start step, end step, complete visit.

## API Usage (REST CRUD)
- Progress header: CRUD on `clinic_visit_progress_header`
- Steps: CRUD on `clinic_visit_progress_steps`
- Consumables: CRUD on `clinic_visit_consumables`
- Protocol template: read for default step list

## Save Flow (Front-end Orchestration)
- Start visit: create progress header.
- Add steps: create step rows based on protocol.
- End step: update end_time + duration.
- Complete visit: update progress header end_time.

## Print
- Optional visit summary print.

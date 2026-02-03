# Screen: Bookings

## Goal
Provide a timeline booking dashboard that handles new bookings, rescheduling,
and check-in workflows.

## Primary Tables
- `clinic_slots_inventory`
- `clinic_bookings`
- `clinic_checkins`
- `clinic_visit_tickets`

## UI Composition
- Timeline grid (doctor/station + time blocks).
- Filters: date, doctor, room, status.
- Booking drawer: patient, service, visit ticket, slot.
- Actions: reschedule, cancel, check-in.

## API Usage (REST CRUD)
- Slots: `POST /api/v1/crud/clinic_slots_inventory/search` (date range)
- Bookings: CRUD on `clinic_bookings`
- Check-in: CRUD on `clinic_checkins`

## Save Flow (Front-end Orchestration)
- Booking: create booking + update slot_status to Booked.
- Reschedule: move booking to new slot + update old slot status.
- Check-in: create check-in + update booking status.

## Print
- Optional visit ticket print (basic).

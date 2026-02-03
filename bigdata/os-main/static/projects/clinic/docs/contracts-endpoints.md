# Contracts & Bookings Endpoints

This document details the backend endpoints responsible for managing Contracts and Bookings in the Clinic System. The system primarily uses **RPC (Remote Procedure Call)** endpoints for complex business logic, delegating handling to the `ClinicBookingService`.

## 1. Confirm Contract (`clinic-confirm-contract`)

This is the primary endpoint for saving and activating a contract. It handles the creation of the contract header, lines, session generation, financial transactions (invoices/ledger), and immediate bookings.

- **URL**: `/api/rpc/clinic-confirm-contract`
- **Method**: `POST`
- **Handler**: `ClinicBookingService.confirmContract(payload)`

### Payload Structure

```json
{
  "form": {
    "patient": "UUID_OR_ID",
    "company_id": "UUID",
    "branch_id": "UUID",
    "executing_doctor": "UUID",
    "contract_date": "ISO_DATE",
    "total_amount": 1000,
    ...
  },
  "lines": [
    {
      "service": "UUID",
      "sessions_count": 5,
      "price_total": 500,
      ...
    }
  ],
  "schedule": [], // Optional schedule preferences
  "selectedSlots": [], // Array of slots for immediate booking (Simple mode)
  "lineBookings": { // Map for detailed bookings (Advanced mode)
    "LINE_UUID": [
      { "slot": { "id": "SLOT_UUID", ... } }
    ]
  },
  "totalAmount": 1000,
  "paidAmount": 500,
  "payments": [
    {
      "method": "Cash",
      "amount": 500,
      "payment_date": "ISO_DATE"
    }
  ],
  "user": { "id": "USER_ID" } // Context
}
```

### Business Logic

1. **Contract Creation**: Creates/Updates `clinic_contracts_header` and `clinic_contracts_lines`.
2. **Session Generation**: Automatically generates `clinic_session_tickets` based on the `sessions_count` for each line.
3. **Booking Execution**:
    - Validates and locks selected slots in `clinic_slots_inventory`.
    - Creates `clinic_bookings` linked to the slots.
    - Groups bookings into `clinic_visit_tickets` (Visits) based on Date + Doctor + Station.
    - Links Visits to Sessions via `clinic_visit_ticket_session_links`.
4. **Financials**:
    - Generates `clinic_invoices_header` and `clinic_invoices_lines`.
    - Records `clinic_payments`.
    - Updates `clinic_patient_ledger` (Debit for Contract, Credit for Payment).

---

## 2. Get Booking Calendar (`clinic-get-booking-calendar`)

This endpoint provides a consolidated view of a doctor's schedule, combining generated slots with their current status (Available, Booked, Blocked) and accounting for leaves.

- **URL**: `/api/rpc/clinic-get-booking-calendar`
- **Method**: `POST`
- **Handler**: `ClinicBookingService.getBookingCalendar(payload)`

### Payload Structure

```json
{
  "doctorId": "UUID",
  "startDate": "YYYY-MM-DD",
  "daysCount": 10 // Optional, default 10
}
```

### Response Structure

```json
{
  "success": true,
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "dayName": "الأحد",
      "hasSlots": true,
      "reason": null, // 'doctor_leave' or 'no_schedule' if applicable
      "slots": [
        {
          "id": "SLOT_UUID",
          "time": "10:00",
          "status": "available", // 'available' | 'booked' | 'blocked'
          "duration": 15
        }
      ]
    }
  ]
}
```

### Key Features

- **Leave Awareness**: Automatically flags days where the doctor is on approved leave (`clinic_doctor_leaves`).
- **Slot Aggregation**: Groups slots by date and sorts them by time.
- **Status Resolution**: Simplifies slot status for the UI (Available vs Booked/Blocked).

---

## 3. Other Related Endpoints

### Generate Slots (`clinic-generate-slots`)

- **Action**: Generates inventory slots for a doctor based on their schedule template.
- **Payload**: `{ "doctorId": "...", "startDate": "...", "endDate": "..." }`

### Analyze Schedule (`clinic-analyze-schedule`)

- **Action**: "Smart Wizard" analysis to propose a schedule based on preferred days/times and `sessions_count`.
- **Payload**: `{ "doctorId": "...", "startDate": "...", "sessionsCount": 5, "daysOfWeek": [0, 2], "preferredTime": "10:00" }`

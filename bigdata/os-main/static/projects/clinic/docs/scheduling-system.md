# Clinic Scheduling System

This document details the scheduling architecture of the Clinic System, strictly separating the "Availability Grid" (Smart Wizard) and the "Booking Calendar" (Viewer).

## Core Philosophy: Supply vs. Demand

The system assumes two distinct modes of operation regarding time:

1. **Inventory (Supply)**: Deterministic, pre-generated slots stored in `clinic_slots_inventory`. This is "what is available to buy".
2. **Scheduling (Demand)**: Dynamic, rule-based request generation. This is "what the patient wants".

The **Availability Grid** bridges this gap by finding the intersection of *User Preferences* (Demand) and *Slot Inventory* (Supply).

---

## 1. Booking Calendar (Viewer)

The Booking Calendar is a high-level view of a doctor's schedule, primarily used for quick availability checks and manual slot selection.

### Endpoint

`POST /api/rpc/clinic-get-booking-calendar`

**Payload:**

```json
{
  "doctorId": "UUID",
  "startDate": "YYYY-MM-DD",
  "daysCount": 14,
  "branchId": "code"
}
```

**Response:**

```json
{
  "success": true,
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "dayName": "Monday",
      "hasSlots": true,
      "reason": null,
      "slots": [
        {
          "id": "UUID",
          "time": "HH:MM",
          "status": "Available | Booked | Blocked",
          "date": "YYYY-MM-DD"
        }
      ]
    }
  ]
}
```

### UI Philosophy

- **Read-Only Default**: Designed as a viewer first.
- **State Management**: Uses `gkey` handles (`calendar:navigate`, `calendar:toggle-slot`) to manage local selection state before committing to the editor.
- **Visual Feedback**:
  - Gray/Strikethrough: Booked/Blocked slots.
  - Red Text: Doctor Leave or Holiday.
  - Blue Highlight: Selected slots.

---

## 2. Smart Scheduling Wizard (Availability Grid)

This is the primary interface for creating contracts. Unlike the Calendar, it doesn't just show "what is open", but actively **proposes** a schedule based on a treatment plan (e.g., "3 Sessions, Mondays & Thursdays, 10:00 AM").

### Endpoints

#### Analysis (The Brain)

`POST /api/rpc/clinic-analyze-schedule`

**Purpose**: Takes high-level preferences and attempts to lock them onto the physical inventory.

**Payload:**

```json
{
  "doctorId": "UUID",
  "startDate": "YYYY-MM-DD",
  "sessionsCount": 12,
  "daysOfWeek": [1, 4], // Mon, Thu
  "preferredTime": "10:00"
}
```

**Logic**:

1. **Pattern Matching**: Iterates forward from `startDate`.
2. **Inventory Check**: Queries `clinic_slots_inventory` for exact matches.
3. **Conflict Resolution**: If a preferred slot is taken, it marks the status as `Conflict` (red in UI) or `Unavailable`.

#### Slot Generation (The Picker)

`POST /api/rpc/clinic-generate-slots`

**Purpose**: Used when the user manually opens a specific day in the wizard (`contracts:wiz:open-picker`) to interactively choose a different slot for that specific session.

**Payload:**

```json
{
  "doctorId": "UUID",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "sessionDuration": 30
}
```

### Frontend Implementation (`screen-contracts.js`)

The `renderBookingWizard` component orchestrates this complexity:

- **`contracts:wiz:analyze`**: triggers the specific analysis RPC.
- **`contracts:wiz:open-picker`**: loads raw slots for manual overrides.
- **`contracts:wiz:confirm`**: normalizes the "Proposed Schedule" into "Selected Blocks" compatible with the contract editor.

## Slot Generation Logic

The backend (`ClinicBookingService.js`) uses a deterministic generation strategy:

1. **Templates**: Reads `clinic_doctor_schedule_template` to know "Working Hours".
2. **Leaves**: Excludes dates in `clinic_doctor_leaves`.
3. **Inventory**: Checks existing `clinic_slots_inventory` to prevent over-generation (idempotency).

This ensures that `clinic-generate-slots` is safe to call repeatedly; it will return existing slots if they exist, or virtual ones if they represent potential availability.

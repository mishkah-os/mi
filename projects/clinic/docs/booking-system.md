# Booking System Architecture

The Clinic Booking System uses a **Supply & Demand** architecture rather than simple table-based appointments. This allows for complex scenarios like multi-resource scheduling, recurring patterns, and "Smart Wizard" auto-booking.

## Core Concepts

### 1. Supply (The Inventory)

* **Table**: `clinic_slots_inventory`
* **Source**: Generated from `clinic_doctor_schedule_templates`.
* **Granularity**: Atomic slots (e.g., 20 mins) per Doctor per Station.
* **Status**: `Available`, `Booked`, `Blocked`.

### 2. Demand (The Requirement)

* **Table**: `clinic_booking_requests`
* **Source**: Created when a Contract Line is confirmed.
* **Details**: Specifies "I need 6 sessions of Laser Hair Removal".
* **Patterns**: `clinic_booking_patterns` define preferences (e.g., "Mondays at 10:00").

### 3. Matching (The Booking)

* **Table**: `clinic_bookings`
* **Function**: Links a specific **Supply Slot** to a specific **Demand Item**.
* **Constraint**: Unique constraint on the Slot (cannot suffer double booking).

### 4. Grouping (The Visit)

* **Table**: `clinic_visit_tickets`
* **Purpose**: Groups multiple bookings for the same patient/day into a single "Visit".
* **Example**: A patient booking "Consultation" and "X-Ray" one after another will have 2 Bookings but 1 Visit Ticket.

### 5. Execution (The Ticket)

* **Table**: `clinic_session_tickets`
* **Purpose**: Tracks the delivery of the service.
* **Lifecycle**: `Planned` -> `Scheduled` -> `Completed`.

## Data Flow

1. **Template Definition**: Doctors define their availability patterns (e.g., "Sunday to Thursday, 8am - 4pm").
2. **Slot Generation**: The system pre-generates `clinic_slots_inventory` for the next 30 days (`clinic-generate-slots`).
3. **Contract Confirmation**: A contract is signed, creating `clinic_booking_requests` for the purchased services.
4. **Auto-Matching**: The system attempts to match Requests to Inventory based on Patterns (`clinic-confirm-contract` or `autoFillRequest`).
5. **Manual Adjustment**: Receptionists can drag-and-drop bookings on the Calendar, which updates the `clinic_bookings` link.

## Smart Features

* **Idempotency**: Slot generation handles re-runs gracefully without duplicating slots.
* **Concurrency**: Uses atomic SQL updates (`is_booked = 1`) to prevent race conditions during booking.
* **Optimization**: The "Batch Dataset" strategy (`api-router.js`) allows fetching the entire calendar grid in one go.

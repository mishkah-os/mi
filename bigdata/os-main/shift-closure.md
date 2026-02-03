# Shift Closure Handling Documentation (إغلاق الوردية)

This document details the technical implementation of the Shift Closure process in the Mishkah OS POS system, covering both Frontend (Client) and Backend (Server) logic.

## 1. Overview

The shift closure process is a critical financial operation that converts a running "Open Shift" (volatile state) into a "Closed Shift" (immutable record).

**Key Goals:**

- Aggregate all sales totals types (Cash, Knet, Visa, etc.).
- reconcile expected cash with actual cash (Closing Float).
- Persist the final record to the backend.
- Reset the local terminal for the next shift.

---

## 2. Frontend Implementation (`posv3.js`)

The core logic resides in the `finalizeShiftClose` function.

### Trigger Flow

1. **User Action**: User clicks "Close Shift" in the Shift Menu or Toolbar.
2. **Event**: Triggers `pos:shift:close:confirm`.
3. **Execution**: Calls `finalizeShiftClose(ctx)`.

### Logic Steps (`finalizeShiftClose`)

1. **State Gathering**:
   - Retrieves the `currentShift` from the UI State.
   - Retrieves `ordersHistory` and `ordersQueue` (all orders belonging to this shift).

2. **Sanitization**:

    ```javascript
    const sanitizedCurrent = SHIFT_TABLE.createRecord({ ...currentShift, ... });
    ```

    - Ensures the shift object matches the schema structure.

3. **Aggregation (The "Truth" Calculation)**:

    ```javascript
    const summary = summarizeShiftOrders(allOrders, sanitizedCurrent);
    ```

    The frontend recalculates the totals from *individual orders* rather than relying on the running total. This ensures that any voided/cancelled orders or math glitches during the shift are corrected.
    - **Totals**: Subtotal, Tax, Service, Delivery.
    - **Payments**: Sums payments by method (Cash, Knet, etc.).
    - **Counts**: Number of orders, guests.

4. **Closing Cash Calculation**:

    ```javascript
    const closingCash = currentShift.closingCash != null 
       ? round(currentShift.closingCash) 
       : round((sanitizedCurrent.openingFloat || 0) + (paymentsByMethod.cash || 0));
    ```

    *If the user didn't manually enter a closing cash amount, the system assumes the "System Calculated" cash is the closing amount.*

5. **Payload Construction**:
    Creates the `baseClosed` object with `status: 'closed'` and `isClosed: true`.

6. **Remote Synchronization**:

    ```javascript
    const remoteClosed = await updateShiftRemote(baseClosed);
    ```

    - Sends the full object to the backend.
    - Uses the generic `applyModuleMutation` or a specific persistence helper to `INSERT OR REPLACE` into the `pos_shift` table on the server.

7. **Local Cleanup**:
    - **Delete from IndexedDB**: Removes the *open* shift record to prevent it from re-loading as active on restart.
    - **Update History**: Moves the closed shift snapshot to the local history list for viewing/printing.

---

## 3. Backend Implementation (`api-router.js` & `sqlite-ops.js`)

The backend receives the shift data and ensures durability.

### Routes

There are two main paths for handling shifts:

1. **Generic Persistence (Primary)**:
   - **Path**: `/api/branches/:id/modules/pos/table/pos_shift` (handled via `handleDeepCrudApi`) or `module:save` RPC.
   - **Mechanism**: The backend treats the shift record as a standard data entity.
   - **Storage**: Uses `src/database/sqlite-ops.js` -> `persistRecord`.
   - **Logic**: Performs an `INSERT OR REPLACE INTO pos_shift ...`. This saves all the granular details (totals, counts, arrays).

2. **Dedicated Status Update (Secondary/Status Check)**:
   - **Path**: `POST /api/branches/:id/modules/:id/shift/:shiftId/close`
   - **Handler**: `handleShiftCloseApi` (in `src/server/api-router.js`).
   - **Function**: Explicitly marks a shift as closed efficiently.
   - **Query**:

     ```sql
     UPDATE pos_shift SET closed_at = ?, is_closed = 1 WHERE id = ?
     ```

   *Note: The frontend primarily uses the full persistence method to ensure all aggregated stats are saved, not just the status bit.*

### Database Schema (`pos_shift` table)

The backend SQLite table stores:

- `id`: Unique Shift ID (e.g., `SID-1234`).
- `status`: 'open' or 'closed'.
- `opened_at` / `closed_at`: Timestamps.
- `opening_float`: Starting cash.
- `closing_cash`: Declared closing cash.
- `totals_by_type`: JSON blob of sales breakdown.
- `payments_by_method`: JSON blob of payment totals.
- `orders`: (Optional) List of order IDs or summary data.

---

## 4. How to Handle "Shift Closure" (Technical Best Practice)

To correctly implement or debug Shift Handling:

### Frontend

- **Always Recompute**: Never trust the running total displayed in the corner. Always iterate through `orders` to sum up the final totals (as `finalizeShiftClose` does).
- **Offline Safety**: If the backend is unreachable (`catch` block in step 6), the frontend falls back to saving locally or keeping the data in memory/IndexedDB until connection is restored. The user is notified, but the local UI treats the shift as closed.

### Backend

- **Idempotency**: The backend should accept the Closed Shift payload multiple times without side effects (using `INSERT OR REPLACE` or checking `is_closed`).
- **Validation**: Ensure `closed_at` is set and `closing_cash` is a valid number.

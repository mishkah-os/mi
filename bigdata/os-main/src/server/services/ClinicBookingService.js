import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

export class ClinicBookingService {
    constructor(store, db) {
        this.store = store;
        this.db = db;
    }

    async updateRecord(tableName, id, patch, context) {
        if (this.store && typeof this.store.update === 'function') {
            return this.store.update(tableName, id, patch, context);
        }
        const payload = Object.assign({ id }, patch);
        if (this.store && typeof this.store.merge === 'function') {
            return this.store.merge(tableName, payload, context);
        }
        if (this.store && typeof this.store.save === 'function') {
            const result = this.store.save(tableName, payload, context);
            return result && result.record ? result.record : result;
        }
        throw new Error('Store does not support update/merge/save');
    }

    getSlotById(slotId) {
        if (!slotId) return null;
        try {
            const slots = this.store.listTable('clinic_slots_inventory') || [];
            return slots.find(s => String(s.id) === String(slotId)) || null;
        } catch (_e) {
            return null;
        }
    }

    async reserveSlot(slotId, context) {
        const slot = this.getSlotById(slotId);
        if (!slot) throw new Error('slot-not-found');
        const capacity = Math.max(1, Number(slot.capacity || 1));
        let bookedCount = (slot.booked_count === undefined || slot.booked_count === null)
            ? null
            : Number(slot.booked_count || 0);
        if (bookedCount === null) {
            const bookings = this.store.listTable('clinic_bookings') || [];
            bookedCount = bookings.filter(b => {
                const bid = (b.slot && typeof b.slot === 'object') ? b.slot.id : b.slot;
                return String(bid) === String(slot.id);
            }).length;
        }
        const isBlocked = slot.slot_status === 'Blocked' || slot.is_active === 0;
        if (isBlocked) throw new Error('slot-blocked');
        if (capacity <= 1) {
            if (slot.is_booked == 1 || slot.is_booked === true) throw new Error('slot-full');
            return this.updateRecord('clinic_slots_inventory', slot.id, {
                is_booked: 1,
                booked_count: 1,
                slot_status: 'Booked'
            }, context);
        }
        if (bookedCount >= capacity) throw new Error('slot-full');
        const nextCount = bookedCount + 1;
        return this.updateRecord('clinic_slots_inventory', slot.id, {
            booked_count: nextCount,
            slot_status: nextCount >= capacity ? 'Booked' : 'Partial',
            is_booked: nextCount >= capacity ? 1 : 0
        }, context);
    }

    async releaseSlot(slotId, context) {
        const slot = this.getSlotById(slotId);
        if (!slot) return null;
        const capacity = Math.max(1, Number(slot.capacity || 1));
        let bookedCount = (slot.booked_count === undefined || slot.booked_count === null)
            ? null
            : Number(slot.booked_count || 0);
        if (bookedCount === null) {
            const bookings = this.store.listTable('clinic_bookings') || [];
            bookedCount = bookings.filter(b => {
                const bid = (b.slot && typeof b.slot === 'object') ? b.slot.id : b.slot;
                return String(bid) === String(slot.id);
            }).length;
        }
        const isBlocked = slot.slot_status === 'Blocked' || slot.is_active === 0;
        if (isBlocked) return null;
        if (capacity <= 1) {
            return this.updateRecord('clinic_slots_inventory', slot.id, {
                is_booked: 0,
                booked_count: 0,
                slot_status: 'Available'
            }, context);
        }
        const nextCount = Math.max(0, bookedCount - 1);
        return this.updateRecord('clinic_slots_inventory', slot.id, {
            booked_count: nextCount,
            slot_status: nextCount <= 0 ? 'Available' : 'Partial',
            is_booked: 0
        }, context);
    }

    async moveBooking(payload) {
        const { bookingId, targetSlotId } = payload || {};
        if (!bookingId || !targetSlotId) {
            throw new Error('missing-params');
        }
        const getRecordId = (val) => {
            if (!val) return val;
            if (typeof val === 'object') return val.id || val.Id || val.uuid || val.uid || val;
            return val;
        };
        const bookings = this.store.listTable('clinic_bookings') || [];
        const booking = bookings.find(b => String(b.id) === String(bookingId));
        if (!booking) throw new Error('booking-not-found');
        const currentSlotId = getRecordId(booking.slot);
        if (String(currentSlotId) === String(targetSlotId)) {
            return { success: true, bookingId, slotId: currentSlotId, unchanged: true };
        }
        const context = { user: { id: 'system' } };
        await this.reserveSlot(targetSlotId, context);
        await this.updateRecord('clinic_bookings', booking.id, { slot: targetSlotId }, context);
        await this.releaseSlot(currentSlotId, context);
        return { success: true, bookingId, slotId: targetSlotId };
    }

    // ==========================================
    // 1. SUPPLY ENGINE: Slot Generator
    // ==========================================
    async generateSlotsForDoctor(doctorId, startDate, daysAhead = 30) {
        const context = { user: { id: 'system' } }; // System context

        // 1. Fetch Configuration & Constraints
        const start = moment(startDate);
        const end = moment(startDate).add(daysAhead, 'days');

        // Helpers for safe store access (HybridStore safe)
        const list = (table) => {
            try { return this.store.listTable(table) || []; }
            catch (e) { console.warn(`Missing table ${table}`); return []; }
        };

        // Fetch all required data
        const doctors = list('clinic_doctors');
        const templates = list('clinic_doctor_schedule_templates');
        const leavesList = list('clinic_doctor_leaves');
        const holidaysList = list('clinic_holidays');
        const weekDays = list('ref_week_days');
        const existingSlots = list('clinic_slots_inventory'); // Fetch all to check duplicates

        const doctor = doctors.find(d => d.id === doctorId || d.Id === doctorId || d.uuid === doctorId);
        if (!doctor) throw new Error('Doctor not found');

        const scheduleTemplates = templates.filter(t =>
            (t.doctor === doctorId || t.doctor?.id === doctorId) &&
            (t.is_active == 1 || t.is_active === true)
        );

        const leaves = leavesList.filter(l =>
            (l.doctor === doctorId || l.doctor?.id === doctorId) &&
            (l.is_active == 1 || l.is_active === true)
        );

        const holidays = holidaysList.filter(h => h.is_active == 1 || h.is_active === true);

        // Optimize: Get default template if any
        const template = scheduleTemplates.find(t => t.is_default) || scheduleTemplates[0];
        if (!template) throw new Error('No schedule template found for doctor');

        // Fix: Use listTable to find templates
        const allTemplateLines = list('clinic_doctor_schedule_template_lines');
        const templateLines = allTemplateLines.filter(row => row.template === template.id || row.template?.id === template.id);

        const generatedSlots = [];

        // 2. Iterate Days
        for (let i = 0; i < daysAhead; i++) {
            const currentDate = moment(start).add(i, 'days');
            const dateStr = currentDate.format('YYYY-MM-DD');
            const dayOfWeek = currentDate.day(); // 0=Sun, 6=Sat (Standard JS)

            // 2.0 IDEMPOTENCY CHECK
            // Check if slots already exist for this doctor on this day
            const dayAlreadyGenerated = existingSlots.some(s =>
                s.slot_date === dateStr &&
                (s.doctor === doctorId || s.doctor?.id === doctorId)
            );

            if (dayAlreadyGenerated) {
                // console.log(`[ClinicBookingService] Slots already exist for ${dateStr}, skipping.`);
                continue;
            }

            // 2.1 Constraint Check: Holiday
            const isHoliday = holidays.find(h => h.holiday_date === dateStr);
            if (isHoliday) continue;

            // 2.2 Constraint Check: Doctor Leave
            const isLeave = leaves.find(l => l.leave_date === dateStr); // simplified check (full day)
            if (isLeave) continue;

            // 2.3 Find Template Line for this Weekday
            // Map JS day (0=Sun, 6=Sat) to ref_week_days (1=Sat, 2=Sun, ... 7=Fri)
            let dbDay = dayOfWeek + 2;
            if (dbDay > 7) dbDay -= 7;

            const line = templateLines.find(l => l.day === dbDay);
            if (!line) continue;

            // 2.4 Generate Slots (Atomic or Duration based?)
            // User Logic: "Consult 20m, Plan 30m". 
            // We stick to template line override OR standard 20m default.
            const slotDuration = line.slot_minutes_override || 20;

            let cursor = moment(`${dateStr}T${line.shift_start}`);
            const shiftEnd = moment(`${dateStr}T${line.shift_end}`);

            while (cursor.clone().add(slotDuration, 'minutes').isSameOrBefore(shiftEnd)) {
                const slotStart = cursor.format('HH:mm:ss');
                const slotEndMoment = cursor.clone().add(slotDuration, 'minutes');
                const slotEnd = slotEndMoment.format('HH:mm:ss');

                generatedSlots.push({
                    id: uuidv4(),
                    company_id: doctor.company_id,
                    branch_id: 'default', // Should be dynamic
                    doctor: doctorId,
                    station: line.room, // Room is station context here
                    slot_date: dateStr,
                    slot_time_start: slotStart,
                    slot_time_end: slotEnd,
                    slot_start_datetime: cursor.toISOString(),
                    slot_end_datetime: slotEndMoment.toISOString(),
                    slot_status: 'available',
                    is_booked: 0,
                    is_active: 1,
                    begin_date: new Date().toISOString()
                });

                cursor.add(slotDuration, 'minutes');
            }
        }

        // 3. Bulk Insert
        if (generatedSlots.length > 0) {
            // We use sqlite-ops `insert` in loop or if `bulkInsert` exists.
            // For safety/compatibility, we loop parallel.
            await Promise.all(generatedSlots.map(s => this.store.insert('clinic_slots_inventory', s, context)));
            console.log(`[ClinicBookingService] Generated ${generatedSlots.length} new slots.`);
        }

        return generatedSlots.length;
    }


    // ==========================================
    // 1.5 Smart Wizard: Analyze & Propose Schedule
    // ==========================================
    async analyzeSchedule(doctorId, startDate, sessionsCount, daysOfWeek, preferredTime) {
        // daysOfWeek: [0, 1, ...] (0=Sun)
        // preferredTime: "10:00"

        // Helpers for safe store access
        const list = (table) => {
            try { return this.store.listTable(table) || []; }
            catch (e) { console.warn(`Missing table ${table}`); return []; }
        };

        const slots = list('clinic_slots_inventory');
        const holidays = list('clinic_holidays').filter(h => h.is_active == 1 || h.is_active === true);
        const leaves = list('clinic_doctor_leaves').filter(l =>
            (l.doctor === doctorId || l.doctor?.id === doctorId) &&
            (l.is_active == 1 || l.is_active === true)
        );

        let proposed = [];
        let count = 0;
        let cursor = moment(startDate);
        let safety = 0;

        // Ensure daysOfWeek is array of integers
        const targetDays = (daysOfWeek || []).map(d => Number(d));
        if (!targetDays.length) targetDays.push(cursor.day()); // Default to start day if empty

        while (count < sessionsCount && safety < 365) {
            // Check if current day matches pattern
            if (targetDays.includes(cursor.day())) {
                const dateStr = cursor.format('YYYY-MM-DD');

                // Check Global Constraints
                const isHoliday = holidays.some(h => h.holiday_date === dateStr);
                const isLeave = leaves.some(l => l.leave_date === dateStr);

                let status = 'Available';
                let conflictReason = null;

                if (isHoliday) {
                    status = 'Conflict';
                    conflictReason = 'Holiday';
                } else if (isLeave) {
                    status = 'Conflict';
                    conflictReason = 'Doctor Leave';
                } else if (!preferredTime) {
                    // No time selected yet -> Pending
                    status = 'Pending';
                    conflictReason = 'Select Time';
                } else {
                    // Check specific slot availability
                    // We look for a slot starting at preferredTime
                    // or overlapping it? Let's check exact start or containment.
                    // Simplified: Check if any available slot starts at preferredTime
                    const daySlots = slots.filter(s =>
                        s.slot_date === dateStr &&
                        (s.doctor === doctorId || s.doctor?.id === doctorId)
                    );

                    // Find slot matching preferred time
                    // preferredTime is HH:mm. Slot might be HH:mm:ss
                    exactMatch = daySlots.find(s => s.slot_time_start.startsWith(preferredTime));

                    if (exactMatch) {
                        if (exactMatch.is_booked || exactMatch.slot_status !== 'available') {
                            status = 'Conflict';
                            conflictReason = 'Slot Booked';
                        } else {
                            // Exact match and available
                            // bind the ID
                            slotId = exactMatch.id;
                        }
                    } else {
                        // Slot doesn't exist (maybe outside shift or not generated yet)
                        // In "Smart" mode, if slot doesn't exist, we might flag it as "Not Generated" or "Closed"
                        // But for now, Conflict is safe.
                        status = 'Conflict';
                        conflictReason = 'No Slot Found (Off-Shift/Full)';

                        // Try to find *nearest* available in that day?
                        // Optional enhancement: suggest alternatives.
                    }
                }

                proposed.push({
                    seq: count + 1,
                    date: dateStr,
                    dayInfo: cursor.format('dddd'), // e.g., Sunday
                    time: preferredTime || null,
                    status: status,
                    reason: conflictReason,
                    slotId: slotId,
                    slot: exactMatch || null // Return full object for frontend usage
                });

                count++;
            }
            cursor.add(1, 'days');
            safety++;
        }

        return { success: true, schedule: proposed };
    }

    // ==========================================
    // 1.6 Get Availability Grid (10-day preview)
    // ==========================================
    async getAvailabilityGrid(doctorId, startDate, daysCount) {
        const list = (table) => {
            try { return this.store.listTable(table) || []; }
            catch (e) { console.warn(`Missing table ${table}`); return []; }
        };

        // Always attempt to generate slots for the requested range
        // This makes the system "self-healing" if new templates/days are added
        await this.generateSlotsForDoctor(doctorId, startDate, daysCount);

        let slots = list('clinic_slots_inventory');
        const holidays = list('clinic_holidays').filter(h => h.is_active == 1 || h.is_active === true);
        const leaves = list('clinic_doctor_leaves').filter(l =>
            (l.doctor === doctorId || l.doctor?.id === doctorId) &&
            (l.is_active == 1 || l.is_active === true)
        );

        let gridDays = [];
        let cursor = moment(startDate);

        for (let i = 0; i < daysCount; i++) {
            const dateStr = cursor.format('YYYY-MM-DD');
            const dayName = cursor.format('dddd');
            const dayNum = cursor.day();

            // Check if holiday or leave
            const isHoliday = holidays.some(h => h.holiday_date === dateStr);
            const isLeave = leaves.some(l => l.leave_date === dateStr);

            let daySlots = [];

            if (!isHoliday && !isLeave) {
                // Get all slots for this day and GROUP BY TIME for capacity calculation
                const rawSlots = slots.filter(s =>
                    s.slot_date === dateStr &&
                    (s.doctor === doctorId || s.doctor?.id === doctorId)
                );

                // Group slots by time (multiple stations = multiple slots at same time)
                const slotsByTime = {};
                rawSlots.forEach(s => {
                    const timeKey = s.slot_time_start.slice(0, 5);
                    if (!slotsByTime[timeKey]) {
                        slotsByTime[timeKey] = {
                            time: timeKey,
                            timeEnd: s.slot_time_end.slice(0, 5),
                            totalCapacity: 0,
                            bookedCount: 0,
                            availableCount: 0,
                            stations: []
                        };
                    }

                    // Strict Status Check
                    const isBooked = (s.is_booked == 1 || s.is_booked === true) ||
                        (s.slot_status && s.slot_status.toLowerCase() !== 'available');

                    slotsByTime[timeKey].totalCapacity++;

                    if (isBooked) {
                        slotsByTime[timeKey].bookedCount++;
                    } else {
                        slotsByTime[timeKey].availableCount++;
                    }

                    slotsByTime[timeKey].stations.push({
                        slotId: s.id,
                        stationId: s.station,
                        status: isBooked ? 'booked' : 'available',
                        slot: s
                    });
                });

                // Calculate Composite Status
                daySlots = Object.values(slotsByTime).map(group => {
                    let status = 'available';
                    if (group.availableCount === 0) {
                        status = 'full';
                    } else if (group.bookedCount > 0) {
                        status = 'partial';
                    }

                    // Assign status back to the FIRST slot of the group (representative)
                    // We return the group structure properly later, but for now we map to a "Slot-Like" object for the frontend grid
                    // The frontend expects an array of slots.

                    // Best Strategy: Return ALL individual slots, but with corrected statuses?
                    // No, the grid expects per-slot render. 
                    // Let's return the simplified group representative if needed, OR all stations.
                    // The Frontend `buildBlocksForDay` handles grouping if raw slots are passed. 

                    // Let's return the raw stations as flat list, but ensuring status is correct.
                    return group.stations.map(st => {
                        return Object.assign({}, st.slot, {
                            slot_status: st.status, // explicit override
                            capacity_status: status, // meta info
                            capacity_info: `${group.availableCount}/${group.totalCapacity}`
                        });
                    });
                }).flat().sort((a, b) => a.slot_time_start.localeCompare(b.slot_time_start));
            }

            gridDays.push({
                date: dateStr,
                dayName: dayName,
                dayNum: dayNum,
                isHoliday: isHoliday,
                isLeave: isLeave,
                slots: daySlots,
                status: (isHoliday || isLeave) ? 'closed' : (daySlots.length > 0 ? 'available' : 'no-slots')
            });

            cursor.add(1, 'days');
        }

        return { success: true, days: gridDays };
    }

    // ==========================================
    async createBookingRequest(contractLineId, patternsData) {
        // patternsData = [{ week_day: 1, time_start: '20:30', duration: 45 }]
        const context = { user: { id: 'system' } };

        // 1. Fetch Contract Line Info
        // Helper
        const list = (table) => {
            try { return this.store.listTable(table) || []; }
            catch (e) { console.warn(`Missing table ${table}`); return []; }
        };
        const lines = list('clinic_contracts_lines');
        const line = lines.find(l => l.id === contractLineId || l.Id === contractLineId || l.uuid === contractLineId);
        if (!line) throw new Error('Contract Line not found');

        const totalSessions = line.sessions_count || 1;

        // 2. Create Header
        const requestId = uuidv4();
        const request = {
            id: requestId,
            company_id: line.company_id,
            contract_line: contractLineId,
            service: line.service,
            total_sessions: totalSessions,
            booked_sessions: 0,
            status: 'pending',
            begin_date: new Date().toISOString()
        };
        await this.store.insert('clinic_booking_requests', request, context);

        // 3. Create Patterns
        const patterns = [];
        for (const p of patternsData) {
            const pattern = {
                id: uuidv4(),
                request: requestId,
                week_day: p.week_day,
                time_start: p.time_start,
                duration_minutes: p.duration,
                priority: 1,
                begin_date: new Date().toISOString()
            };
            await this.store.insert('clinic_booking_patterns', pattern, context);
            patterns.push(pattern);
        }

        // 4. Generate Items (The "Ghost" Sessions)
        // Logic: Round robin through patterns until totalSessions is reached.
        const items = [];
        let currentDate = moment(); // Start from today? Or Contract Start Date?
        let count = 0;

        // Safety: Max loop
        let attempts = 0;

        while (count < totalSessions && attempts < 1000) {
            currentDate.add(1, 'days');
            const dayOfWeek = currentDate.day();

            // Find matching pattern for this day
            const matchedPattern = patterns.find(p => p.week_day === dayOfWeek);

            if (matchedPattern) {
                // Found a hit!
                await this.store.insert('clinic_booking_items', {
                    id: uuidv4(),
                    request: requestId,
                    pattern: matchedPattern.id,
                    sequence: count + 1,
                    suggested_date: currentDate.format('YYYY-MM-DD'),
                    status: 'pending',
                    begin_date: new Date().toISOString()
                }, context);
                count++;
            }
            attempts++;
        }

        return requestId;
    }

    // ==========================================
    // 3. MATCHER ENGINE: Auto-Fill
    // ==========================================
    async autoFillRequest(requestId) {
        const context = { user: { id: 'system' } };

        // 1. Get Pending Items
        const items = await this.store.list('clinic_booking_items', { request: requestId, status: 'pending' });
        const request = await this.store.get('clinic_booking_requests', requestId);
        const patterns = await this.store.list('clinic_booking_patterns', { request: requestId });

        let bookedCount = 0;

        for (const item of items) {
            const pattern = patterns.find(p => p.id === item.pattern);
            if (!pattern) continue;

            // 2. Find Available Slot
            // Needs logic to find "Approximate" time match? Or Exact?
            // Let's say +/- 30 mins tolerance? For now Exact >= Start Time.

            /* 
               Query Logic (Simulated):
               SELECT * FROM slots 
               WHERE date = item.suggested_date 
               AND time_start >= pattern.time_start 
               AND status = 'available' 
               LIMIT 1
            */

            // Using store list (filter in memory if API limited, or use raw DB query)
            // For prototype, we fetch daily slots.
            const slots = await this.store.list('clinic_slots_inventory', {
                slot_date: item.suggested_date,
                is_booked: 0,
                slot_status: 'available'
            });

            // Find best match
            const bestSlot = slots.find(s => s.slot_time_start === pattern.time_start) || slots[0]; // Fallback to any slot that day? 

            if (bestSlot) {
                // 3. EXECUTE BOOKING
                await this.bookingTransaction(item, bestSlot, request, context);
                bookedCount++;
            }
        }

        return bookedCount;
    }

    async bookingTransaction(item, slot, request, context) {
        // A. Lock Slot with capacity check
        await this.reserveSlot(slot.id, context);

        // B. Create Booking Record
        const bookingId = uuidv4();
        await this.store.insert('clinic_bookings', {
            id: bookingId,
            company_id: request.company_id,
            branch_id: 'default',
            slot: slot.id,
            booking_status: 'confirmed',
            visit_ticket: null, // Linked later?
            booked_at: new Date().toISOString(),
            begin_date: new Date().toISOString()
        }, context);

        // C. Update Item
        await this.updateRecord('clinic_booking_items', item.id, {
            slot: slot.id,
            status: 'scheduled'
        }, context);
    }

    // ==========================================
    // 4. TRANSACTION: Confirm Contract
    // ==========================================
    async confirmContract(payload) {
        // payload: { form, lines, schedule, selectedSlots, lineBookings, totalAmount, paidAmount, payments, user }
        const { form, lines, schedule, selectedSlots, lineBookings, totalAmount, paidAmount, payments, user } = payload;
        const context = { user: user || { id: 'system' } };
        const nowIso = new Date().toISOString();
        const isUpdate = !!(form && form.id);

        console.log('[ClinicBookingService] Confirming contract...', {
            patient: form.patient,
            lines: lines.length,
            slots: selectedSlots ? selectedSlots.length : 0,
            update: isUpdate
        });

        // Helpers
        const getRecordId = (val) => {
            if (!val) return val;
            if (typeof val === 'object') return val.id || val.Id || val.uuid || val.uid || val;
            return val;
        };
        const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || ''));
        const list = (table) => {
            try { return this.store.listTable(table) || []; }
            catch (e) { console.warn(`[ClinicBookingService] Missing table ${table}`); return []; }
        };
        const normalizeSlot = (slot, fallback) => {
            if (!slot) return null;
            const base = slot.slot ? slot.slot : slot;
            const fallbackSlot = fallback || {};
            return {
                id: base.id || fallbackSlot.id,
                company_id: base.company_id || fallbackSlot.company_id || form.company_id,
                branch_id: base.branch_id || fallbackSlot.branch_id || form.branch_id,
                slot_date: base.slot_date || fallbackSlot.slot_date,
                slot_time_start: base.slot_time_start || base.time || fallbackSlot.slot_time_start || fallbackSlot.time || '',
                slot_time_end: base.slot_time_end || base.timeEnd || fallbackSlot.slot_time_end || '',
                slot_status: base.slot_status || base.status || fallbackSlot.slot_status || 'available',
                station: base.station || fallbackSlot.station || null,
                doctor: base.doctor || fallbackSlot.doctor || null
            };
        };
        const getBlockDate = (block) => {
            const slot = block && block.slots && block.slots[0] ? block.slots[0] : null;
            return (block && block.slot_date) || (slot && slot.slot_date) || '';
        };
        const getBlockStart = (block) => {
            const slot = block && block.slots && block.slots[0] ? block.slots[0] : null;
            return (block && block.slot_time_start) || (slot && slot.slot_time_start) || '';
        };

        // 1. Create/Update Contract Header
        const contractId = isUpdate ? form.id : uuidv4();
        const contract = Object.assign({}, form, {
            id: contractId,
            contract_date: form.contract_date || nowIso,
            contract_status: form.contract_status || form.status || 'confirmed',
            begin_date: form.begin_date || nowIso
        });

        // Auto-create referral doctor if string name provided
        if (form.referral_doctor && typeof form.referral_doctor === 'string') {
            const isUUID = isUuid(form.referral_doctor);
            if (!isUUID) {
                try {
                    const doctorName = form.referral_doctor;
                    const doctorId = uuidv4();

                    const newDoctor = {
                        id: doctorId,
                        company_id: form.company_id,
                        is_active: 1,
                        begin_date: nowIso
                    };

                    await this.store.insert('clinic_referral_doctors', newDoctor, context);

                    await this.store.insert('clinic_referral_doctors_lang', {
                        id: uuidv4(),
                        clinic_referral_doctors_id: doctorId,
                        lang: 'ar',
                        name: doctorName
                    }, context);

                    const isEnglish = /^[a-zA-Z\s.]+$/.test(doctorName);
                    if (isEnglish) {
                        await this.store.insert('clinic_referral_doctors_lang', {
                            id: uuidv4(),
                            clinic_referral_doctors_id: doctorId,
                            lang: 'en',
                            name: doctorName
                        }, context);
                    }

                    contract.referral_doctor = doctorId;
                    console.log('[ClinicBookingService] Auto-created referral doctor:', doctorId, doctorName);
                } catch (e) {
                    console.warn('[ClinicBookingService] Failed to auto-create referral doctor', e);
                }
            }
        }

        if (isUpdate) {
            await this.updateRecord('clinic_contracts_header', contractId, contract, context);
        } else {
            await this.store.insert('clinic_contracts_header', contract, context);
        }

        // 2. Create/Update Contract Lines
        const createdLines = [];
        for (const lineDraft of lines) {
            const draftId = lineDraft.id;
            const isExisting = isUpdate && isUuid(draftId);
            const lineId = isExisting ? draftId : uuidv4();
            const line = Object.assign({}, lineDraft, {
                id: lineId,
                contract: contractId,
                company_id: form.company_id,
                begin_date: lineDraft.begin_date || nowIso
            });
            if (isExisting) {
                await this.updateRecord('clinic_contracts_lines', lineId, line, context);
            } else {
                await this.store.insert('clinic_contracts_lines', line, context);
            }
            createdLines.push(Object.assign({}, line, { draftId }));
        }

        // 3. Create Schedule Preferences (new contract only to avoid duplicate rows)
        if (!isUpdate && schedule && schedule.length) {
            for (const pref of schedule) {
                const resolvedLine = createdLines.find(l => String(getRecordId(l.draftId)) === String(getRecordId(pref.contract_line))) || createdLines.find(l => l.service === pref.service);
                await this.store.insert('clinic_contract_schedule_preferences', Object.assign({}, pref, {
                    id: uuidv4(),
                    contract: contractId,
                    contract_line: resolvedLine ? resolvedLine.id : pref.contract_line,
                    executing_doctor: pref.executing_doctor || form.executing_doctor,
                    company_id: form.company_id,
                    branch_id: form.branch_id,
                    begin_date: nowIso
                }), context);
            }
        }

        // 4. Generate Sessions
        const serviceRef = list('clinic_services');
        const slotsRepo = list('clinic_slots_inventory');
        const ensureSlotExists = async (slot) => {
            if (!slot || !slot.id) return null;
            const exists = slotsRepo.find(s => String(s.id) === String(slot.id));
            if (exists) return exists;
            const payload = {
                id: slot.id,
                company_id: slot.company_id || form.company_id,
                branch_id: slot.branch_id || form.branch_id,
                doctor: slot.doctor || form.executing_doctor || form.supervising_doctor,
                station: slot.station || null,
                slot_date: slot.slot_date,
                slot_time_start: slot.slot_time_start,
                slot_time_end: slot.slot_time_end || slot.slot_time_start,
                slot_start_datetime: slot.slot_start_datetime || (slot.slot_date && slot.slot_time_start ? `${slot.slot_date}T${slot.slot_time_start}` : null),
                slot_end_datetime: slot.slot_end_datetime || (slot.slot_date && (slot.slot_time_end || slot.slot_time_start) ? `${slot.slot_date}T${slot.slot_time_end || slot.slot_time_start}` : null),
                slot_status: slot.slot_status || 'available',
                is_booked: slot.is_booked || 0,
                is_active: slot.is_active || 1,
                begin_date: slot.begin_date || nowIso
            };
            await this.store.insert('clinic_slots_inventory', payload, context);
            slotsRepo.push(payload);
            return payload;
        };
        const existingSessions = list('clinic_session_tickets');
        const sessionByLine = {};
        for (const line of createdLines) {
            const sessionsCount = Math.max(0, Number(line.sessions_count || 0));
            if (!sessionsCount) continue;
            const serviceRow = serviceRef.find(s => s.id === line.service) || {};
            const plannedDuration = Number(serviceRow.base_duration_minutes || serviceRow.standard_duration_minutes || 30);
            const currentSessions = existingSessions.filter(s => String(getRecordId(s.contract_line)) === String(line.id));
            const maxSeq = currentSessions.reduce((max, row) => Math.max(max, Number(row.session_sequence || 0)), 0);
            if (!currentSessions.length || currentSessions.length < sessionsCount) {
                const needed = sessionsCount - currentSessions.length;
                for (let k = 0; k < needed; k++) {
                    const sessionSeq = maxSeq + k + 1;
                    const sessionId = uuidv4();
                    const ticket = {
                        id: sessionId,
                        company_id: form.company_id,
                        contract_line: line.id,
                        session_sequence: sessionSeq,
                        status: 'Planned',
                        planned_duration_minutes: plannedDuration,
                        begin_date: nowIso
                    };
                    await this.store.insert('clinic_session_tickets', ticket, context);
                    currentSessions.push(ticket);
                }
            }
            sessionByLine[line.id] = currentSessions.slice().sort((a, b) => Number(a.session_sequence || 0) - Number(b.session_sequence || 0));
        }

        // 5. Visits + Bookings (new contract only; updates use separate endpoint)
        if (!isUpdate) {
            const bookingsByLine = (lineBookings && Object.keys(lineBookings).length) ? lineBookings : null;
            const bookingEntries = [];
            if (bookingsByLine) {
                Object.keys(bookingsByLine).forEach((lineId) => {
                    const blocks = bookingsByLine[lineId] || [];
                    blocks.forEach((block) => bookingEntries.push({ lineId, block }));
                });
            } else if (Array.isArray(selectedSlots) && selectedSlots.length) {
                const fallbackLineId = createdLines[0] && createdLines[0].id;
                selectedSlots.forEach((block) => bookingEntries.push({ lineId: fallbackLineId, block }));
            }

            const normalizedBookings = bookingEntries.map((entry) => {
                const rawBlock = entry.block || {};
                const slotsRaw = rawBlock.slots && rawBlock.slots.length ? rawBlock.slots : (rawBlock.slot ? [rawBlock.slot] : [rawBlock]);
                const slots = slotsRaw.map((slot) => {
                    const normalized = normalizeSlot(slot);
                    if (!normalized || !normalized.id) return normalized;
                    const dbSlot = slotsRepo.find(s => String(s.id) === String(normalized.id));
                    return dbSlot ? normalizeSlot(normalized, dbSlot) : normalized;
                }).filter(Boolean);
                return Object.assign({}, entry, { block: Object.assign({}, rawBlock, { slots }) });
            }).filter((entry) => entry.block && entry.block.slots && entry.block.slots.length);

            const assigned = [];
            const sessionCursorByLine = {};
            normalizedBookings.forEach((entry) => {
                const line = createdLines.find(l => String(l.draftId) === String(entry.lineId)) || createdLines.find(l => String(l.id) === String(entry.lineId));
                if (!line) return;
                const sessions = sessionByLine[line.id] || [];
                const cursor = sessionCursorByLine[line.id] || 0;
                const session = sessions[cursor];
                if (!session) return;
                sessionCursorByLine[line.id] = cursor + 1;
                assigned.push({
                    lineId: line.id,
                    session,
                    plannedDuration: Number(session.planned_duration_minutes || 0),
                    block: entry.block
                });
            });

            const grouped = {};
            assigned.forEach((item) => {
                const slot = item.block.slots[0];
                const dateKey = slot.slot_date || getBlockDate(item.block) || '';
                const doctorKey = getRecordId(slot.doctor) || 'none';
                const stationKey = getRecordId(slot.station) || 'none';
                const key = `${dateKey}|${doctorKey}|${stationKey}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(item);
            });

            let visitSequence = 1;
            for (const key of Object.keys(grouped)) {
                const items = grouped[key];
                const totalMinutes = items.reduce((sum, row) => sum + Number(row.plannedDuration || 0), 0);
                const visitId = uuidv4();
                await this.store.insert('clinic_visit_tickets', {
                    id: visitId,
                    company_id: form.company_id,
                    contract: contractId,
                    patient: getRecordId(form.patient),
                    visit_sequence: visitSequence,
                    planned_duration_minutes: totalMinutes || Number(items[0].plannedDuration || 0) || 30,
                    status: 'Planned',
                    begin_date: nowIso
                }, context);

                for (const item of items) {
                    await this.store.insert('clinic_visit_ticket_session_links', {
                        id: uuidv4(),
                        company_id: form.company_id,
                        visit_ticket: visitId,
                        session_ticket: item.session.id,
                        begin_date: nowIso
                    }, context);
                    await this.updateRecord('clinic_session_tickets', item.session.id, { status: 'Scheduled' }, context);
                }

                const ordered = items.slice().sort((a, b) => {
                    return String(getBlockStart(a.block) || '').localeCompare(String(getBlockStart(b.block) || ''));
                });
                const primary = ordered[0];
                let bookedPrimary = false;
                for (const item of ordered) {
                    const slotsToBook = item.block.slots || [];
                    for (let i = 0; i < slotsToBook.length; i++) {
                        const slot = slotsToBook[i];
                        if (!bookedPrimary) {
                            await ensureSlotExists(slot);
                            await this.store.insert('clinic_bookings', {
                                id: uuidv4(),
                                company_id: form.company_id,
                                branch_id: form.branch_id,
                                slot: slot.id,
                                visit_ticket: visitId,
                                user_insert: form.user_insert,
                                booked_at: nowIso,
                                booking_status: 'Booked',
                                begin_date: nowIso
                            }, context);
                            await this.reserveSlot(slot.id, context);
                            bookedPrimary = true;
                            continue;
                        }
                        await ensureSlotExists(slot);
                        await this.updateRecord('clinic_slots_inventory', slot.id, { slot_status: 'Blocked', blocked_reason: 'Visit Group' }, context);
                    }
                }

                visitSequence += 1;
            }
        }

        // 5. Invoicing
        const invoices = list('clinic_invoices_header');
        const existingInvoice = invoices.find(row => String(getRecordId(row.contract)) === String(contractId));
        const invoiceId = existingInvoice ? existingInvoice.id : uuidv4();
        const invoicePayload = {
            id: invoiceId,
            company_id: form.company_id,
            branch_id: form.branch_id,
            contract: contractId,
            invoice_scope: 'contract',
            invoice_date: nowIso,
            invoice_no: (existingInvoice && existingInvoice.invoice_no) ? existingInvoice.invoice_no : ('INV-' + Date.now()),
            user_insert: form.user_insert,
            amount_total: Number(totalAmount || 0),
            amount_paid: Number(paidAmount || 0),
            payment_status: Number(paidAmount) >= Number(totalAmount) ? 'Paid' : 'Partial',
            begin_date: existingInvoice && existingInvoice.begin_date ? existingInvoice.begin_date : nowIso
        };

        if (existingInvoice) {
            await this.updateRecord('clinic_invoices_header', invoiceId, invoicePayload, context);
            const existingLines = list('clinic_invoices_lines').filter(row => String(getRecordId(row.invoice)) === String(invoiceId));
            for (const row of existingLines) {
                await this.store.remove('clinic_invoices_lines', { id: row.id }, context);
            }
        } else {
            await this.store.insert('clinic_invoices_header', invoicePayload, context);
        }

        for (const line of createdLines) {
            await this.store.insert('clinic_invoices_lines', {
                id: uuidv4(),
                company_id: form.company_id,
                invoice: invoiceId,
                service: line.service,
                qty: 1,
                unit_price: Number(line.price_total || 0),
                line_total: Number(line.price_total || 0),
                begin_date: nowIso
            }, context);
        }

        // 6. Payments
        const paymentRows = Array.isArray(payments) ? payments : [];
        for (const pay of paymentRows) {
            const payload = {
                id: isUuid(pay.id) ? pay.id : uuidv4(),
                company_id: form.company_id,
                branch_id: form.branch_id,
                invoice: invoiceId,
                payment_date: pay.payment_date || nowIso,
                method: pay.method || 'Cash',
                amount: Number(pay.amount || 0),
                begin_date: pay.begin_date || nowIso
            };
            if (isUpdate && isUuid(pay.id)) {
                await this.updateRecord('clinic_payments', payload.id, payload, context);
            } else {
                await this.store.insert('clinic_payments', payload, context);
            }
        }

        // 7. Ledger
        if (isUpdate) {
            const existingLedger = list('clinic_patient_ledger').filter(row => String(getRecordId(row.contract)) === String(contractId));
            for (const row of existingLedger) {
                await this.store.remove('clinic_patient_ledger', { id: row.id }, context);
            }
        }

        await this.store.insert('clinic_patient_ledger', {
            id: uuidv4(),
            company_id: form.company_id,
            branch_id: form.branch_id,
            patient: getRecordId(form.patient),
            txn_date: nowIso,
            txn_type: 'ContractDebit',
            contract: contractId,
            invoice: invoiceId,
            amount_debit: Number(totalAmount || 0),
            amount_credit: 0,
            begin_date: nowIso
        }, context);

        for (const pay of paymentRows) {
            await this.store.insert('clinic_patient_ledger', {
                id: uuidv4(),
                company_id: form.company_id,
                branch_id: form.branch_id,
                patient: getRecordId(form.patient),
                txn_date: pay.payment_date || nowIso,
                txn_type: 'PaymentCredit',
                contract: contractId,
                invoice: invoiceId,
                amount_debit: 0,
                amount_credit: Number(pay.amount || 0),
                begin_date: nowIso
            }, context);
        }

        return { success: true, contractId, invoiceId };
    }

    // ==========================================
    // 5. CALENDAR: Get Booking Calendar Grid
    // ==========================================
    async getBookingCalendar(payload) {
        const { doctorId, startDate, daysCount = 10 } = payload;

        console.log('[ClinicBookingService] Getting booking calendar...', { doctorId, startDate, daysCount });

        // Helper: Get day names
        const getDayNames = (dateStr) => {
            const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const date = new Date(dateStr);
            return { ar: daysAr[date.getDay()], en: daysEn[date.getDay()] };
        };

        // Helper: Format date as YYYY-MM-DD
        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        // Helper for safe table access
        const list = (table) => {
            try { return this.store.listTable(table) || []; }
            catch (e) { console.warn(`[Calendar] Missing table ${table}`); return []; }
        };

        // 1. Generate date range
        const start = new Date(startDate);
        const calendar = [];

        for (let i = 0; i < daysCount; i++) {
            const current = new Date(start);
            current.setDate(start.getDate() + i);
            const dateStr = formatDate(current);
            const names = getDayNames(dateStr);

            calendar.push({
                date: dateStr,
                dayName: names.ar,
                dayNameEn: names.en,
                slots: [],
                hasSlots: false,
                reason: null
            });
        }

        // 2. Check doctor leaves
        const leaves = list('clinic_doctor_leaves');
        const doctorLeaves = leaves.filter(l =>
            (l.doctor === doctorId) &&
            (l.status === 'approved' || l.is_active == 1)
        );

        // 3. Query slots for this doctor + date range
        const allSlots = list('clinic_slots_inventory');
        const allBookings = list('clinic_bookings');
        const bookingCountBySlot = {};
        allBookings.forEach(b => {
            const slotId = typeof b.slot === 'object' ? b.slot.id : b.slot;
            if (!slotId) return;
            bookingCountBySlot[slotId] = (bookingCountBySlot[slotId] || 0) + 1;
        });
        const endDate = formatDate(new Date(start.getTime() + daysCount * 24 * 60 * 60 * 1000));

        const doctorSlots = allSlots.filter(slot => {
            if (slot.doctor !== doctorId) return false;
            if (!slot.slot_date) return false;
            if (slot.slot_date < startDate) return false;
            if (slot.slot_date >= endDate) return false;
            return true;
        });

        // 4. Group slots by date
        const slotsByDate = {};
        doctorSlots.forEach(slot => {
            if (!slotsByDate[slot.slot_date]) {
                slotsByDate[slot.slot_date] = [];
            }
            slotsByDate[slot.slot_date].push(slot);
        });

        // 5. Populate calendar with slots
        calendar.forEach(day => {
            // Check if doctor on leave
            const onLeave = doctorLeaves.some(leave => {
                const startLeave = leave.leave_start_date || leave.leave_date;
                const endLeave = leave.leave_end_date || leave.leave_date;
                return day.date >= startLeave && day.date <= endLeave;
            });

            if (onLeave) {
                day.hasSlots = false;
                day.reason = 'doctor_leave';
                return;
            }

            // Get slots for this day
            const daySlots = slotsByDate[day.date] || [];

            if (daySlots.length === 0) {
                day.hasSlots = false;
                day.reason = 'no_schedule';
                return;
            }

            // Sort slots by time
            daySlots.sort((a, b) => {
                const tA = a.slot_time_start || '00:00';
                const tB = b.slot_time_start || '00:00';
                return tA.localeCompare(tB);
            });

            // Map slots to calendar format
            // Map slots to calendar format
            day.slots = daySlots.map(slot => {
                const capacity = Number(slot.capacity || 1);
                const bookedCount = (slot.booked_count === undefined || slot.booked_count === null)
                    ? Number(bookingCountBySlot[slot.id] || 0)
                    : Number(slot.booked_count || 0);

                let status = 'available';
                // Check explicit block/cancel first
                if (slot.slot_status === 'Blocked' || slot.is_active === 0) {
                    status = 'blocked';
                } else if (bookedCount >= capacity) {
                    status = 'booked'; // Full
                } else if (bookedCount > 0) {
                    status = 'partial'; // Partially booked but available
                } else {
                    status = 'available'; // Empty
                }

                return {
                    id: slot.id,
                    time: slot.slot_time_start ? slot.slot_time_start.substring(0, 5) : 'N/A',
                    status: status,
                    capacity: capacity,
                    bookedCount: bookedCount,
                    remaining: Math.max(0, capacity - bookedCount),
                    date: slot.slot_date,
                    duration: slot.duration_minutes || 15
                };
            });

            day.hasSlots = day.slots.length > 0;
        });

        return {
            success: true,
            doctorId,
            startDate,
            daysCount,
            calendar
        };
    }
}

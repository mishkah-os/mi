const { v4: uuidv4 } = require('uuid');

class ClinicBookingService {
    constructor(store, db) {
        this.store = store;
        this.db = db;
    }

    // ... existing methods ...

    // ==========================================
    // 5. CALENDAR: Get Booking Calendar Grid
    // ==========================================
    async getBookingCalendar(payload) {
        const { doctorId, startDate, daysCount = 10, sessionsNeeded } = payload;

        console.log('[ClinicBookingService] Getting booking calendar...', { doctorId, startDate, daysCount });

        // Helper: Get day name in Arabic
        const getDayNameAr = (dateStr) => {
            const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const date = new Date(dateStr);
            const dayIndex = date.getDay();
            return { ar: days[dayIndex], en: daysEn[dayIndex] };
        };

        // Helper: Format date as YYYY-MM-DD
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // 1. Generate date range
        const start = new Date(startDate);
        const calendar = [];

        for (let i = 0; i < daysCount; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            const dateStr = formatDate(currentDate);
            const dayNames = getDayNameAr(dateStr);

            calendar.push({
                date: dateStr,
                dayName: dayNames.ar,
                dayNameEn: dayNames.en,
                slots: [],
                hasSlots: false,
                reason: null
            });
        }

        // 2. Check doctor leaves
        const leaves = this.store.listTable('clinic_doctor_leaves') || [];
        const doctorLeaves = leaves.filter(l => l.doctor === doctorId && l.status === 'approved');

        // 3. Query slots for this doctor + date range
        const allSlots = this.store.listTable('clinic_slots_inventory') || [];
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
                return day.date >= leave.leave_start_date && day.date <= leave.leave_end_date;
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
                const timeA = a.slot_time_start || '00:00';
                const timeB = b.slot_time_start || '00:00';
                return timeA.localeCompare(timeB);
            });

            // Map slots to calendar format
            day.slots = daySlots.map(slot => ({
                id: slot.id,
                time: slot.slot_time_start ? slot.slot_time_start.substring(0, 5) : 'N/A',
                status: slot.slot_status === 'Available' ? 'available' :
                    slot.slot_status === 'Booked' ? 'booked' : 'blocked',
                date: slot.slot_date,
                duration: slot.duration_minutes || 15
            }));

            day.hasSlots = day.slots.length > 0;
        });

        return {
            success: true,
            doctorId,
            startDate,
            daysCount,
            sessionsNeeded,
            calendar
        };
    }
}

module.exports = ClinicBookingService;

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import SchemaEngine from '../src/schema/engine.js';
import ModuleStore from '../src/database/module-store.js';
import { ClinicBookingService } from '../src/server/services/ClinicBookingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TestStore extends ModuleStore {
  update(tableName, idOrPatch = {}, patchOrContext = {}, maybeContext = {}) {
    if (idOrPatch && typeof idOrPatch === 'object' && !Array.isArray(idOrPatch)) {
      return this.merge(tableName, idOrPatch, patchOrContext);
    }
    const patch = Object.assign({ id: idOrPatch }, patchOrContext || {});
    return this.merge(tableName, patch, maybeContext);
  }
}

async function createClinicStore() {
  const engine = new SchemaEngine();
  const schemaPath = path.join(__dirname, '..', 'data', 'schemas', 'clinic_schema.json');
  await engine.loadFromFile(schemaPath);
  const tables = [
    'clinic_contracts_header',
    'clinic_contracts_lines',
    'clinic_contract_schedule_preferences',
    'clinic_session_tickets',
    'clinic_visit_tickets',
    'clinic_visit_ticket_session_links',
    'clinic_slots_inventory',
    'clinic_bookings',
    'clinic_invoices_header',
    'clinic_invoices_lines',
    'clinic_payments',
    'clinic_patient_ledger',
    'clinic_referral_doctors',
    'clinic_referral_doctors_lang',
    'clinic_services',
    'clinic_types'
  ];
  return new TestStore(engine, 'pt', 'clinic', { tables }, { tables: {} });
}

test('confirmContract creates visits only for selected slots and groups by date/doctor/station', async () => {
  const store = await createClinicStore();
  const service = new ClinicBookingService(store, null);

  const companyId = 'c-1';
  const branchId = 'pt';
  const doctorId = 'd-1';
  const stationId = 's-1';

  store.insert('clinic_types', { id: 'ct-1', company_id: companyId, base_slot_minutes: 30 });
  store.insert('clinic_services', { id: 'svc-1', company_id: companyId, clinic_type: 'ct-1', base_duration_minutes: 60 });

  const slots = [
    { id: 'slot-1', slot_time_start: '10:00:00', slot_time_end: '10:30:00' },
    { id: 'slot-2', slot_time_start: '10:30:00', slot_time_end: '11:00:00' },
    { id: 'slot-3', slot_time_start: '11:00:00', slot_time_end: '11:30:00' },
    { id: 'slot-4', slot_time_start: '11:30:00', slot_time_end: '12:00:00' }
  ].map((slot) => ({
    ...slot,
    company_id: companyId,
    branch_id: branchId,
    doctor: doctorId,
    station: stationId,
    slot_date: '2026-01-17',
    slot_status: 'available',
    is_booked: 0,
    is_active: 1,
    begin_date: new Date().toISOString()
  }));

  slots.forEach((slot) => store.insert('clinic_slots_inventory', slot));

  const lineId = 'line-temp-1';
  const payload = {
    form: {
      company_id: companyId,
      branch_id: branchId,
      patient: 'p-1',
      supervising_doctor: doctorId,
      executing_doctor: doctorId,
      clinic_type: 'ct-1',
      contract_date: '2026-01-16',
      start_date: '2026-01-17',
      contract_status: 'confirmed',
      user_insert: 'u-1'
    },
    lines: [
      {
        id: lineId,
        service: 'svc-1',
        sessions_count: 2,
        price_total: 500
      }
    ],
    payments: [],
    schedule: [],
    selectedSlots: [],
    lineBookings: {
      [lineId]: [
        { slots: [slots[0], slots[1]], slot_date: slots[0].slot_date, slot_time_start: slots[0].slot_time_start },
        { slots: [slots[2], slots[3]], slot_date: slots[2].slot_date, slot_time_start: slots[2].slot_time_start }
      ]
    },
    totalAmount: 500,
    paidAmount: 0,
    user: { id: 'u-1' }
  };

  const result = await service.confirmContract(payload);
  assert.equal(result.success, true);

  const sessions = store.listTable('clinic_session_tickets');
  assert.equal(sessions.length, 2);

  const visits = store.listTable('clinic_visit_tickets');
  assert.equal(visits.length, 1);
  assert.equal(visits[0].planned_duration_minutes, 120);

  const links = store.listTable('clinic_visit_ticket_session_links');
  assert.equal(links.length, 2);

  const bookings = store.listTable('clinic_bookings');
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].slot, 'slot-1');

  const updatedSlots = store.listTable('clinic_slots_inventory');
  const statusById = new Map(updatedSlots.map((slot) => [slot.id, slot.slot_status]));
  assert.equal(statusById.get('slot-1'), 'Booked');
  assert.equal(statusById.get('slot-2'), 'Blocked');
  assert.equal(statusById.get('slot-3'), 'Blocked');
  assert.equal(statusById.get('slot-4'), 'Blocked');
});

test('confirmContract creates sessions without visits when no slots are selected', async () => {
  const store = await createClinicStore();
  const service = new ClinicBookingService(store, null);

  store.insert('clinic_types', { id: 'ct-1', company_id: 'c-1', base_slot_minutes: 30 });
  store.insert('clinic_services', { id: 'svc-1', company_id: 'c-1', clinic_type: 'ct-1', base_duration_minutes: 60 });

  const payload = {
    form: {
      company_id: 'c-1',
      branch_id: 'pt',
      patient: 'p-1',
      supervising_doctor: 'd-1',
      executing_doctor: 'd-1',
      clinic_type: 'ct-1',
      contract_date: '2026-01-16',
      start_date: '2026-01-17',
      contract_status: 'confirmed',
      user_insert: 'u-1'
    },
    lines: [
      {
        id: 'line-temp-2',
        service: 'svc-1',
        sessions_count: 3,
        price_total: 900
      }
    ],
    payments: [],
    schedule: [],
    selectedSlots: [],
    lineBookings: {},
    totalAmount: 900,
    paidAmount: 0,
    user: { id: 'u-1' }
  };

  const result = await service.confirmContract(payload);
  assert.equal(result.success, true);

  assert.equal(store.listTable('clinic_session_tickets').length, 3);
  assert.equal(store.listTable('clinic_visit_tickets').length, 0);
  assert.equal(store.listTable('clinic_bookings').length, 0);
});

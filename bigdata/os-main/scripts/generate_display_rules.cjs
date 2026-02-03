const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'data', 'schemas', 'clinic_schema.json');
const raw = fs.readFileSync(schemaPath, 'utf8');
const schema = JSON.parse(raw);

const tables = Array.isArray(schema.schema?.tables) ? schema.schema.tables : [];
const tableMap = new Map();
for (const table of tables) {
  if (table && table.name) {
    tableMap.set(table.name.toLowerCase(), table);
  }
}

const humanize = (name) => String(name || '')
  .replace(/_/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

const customRules = {
  clinic_patients: [
    { type: 'text', value: { ar: 'العميل ', en: 'Client ' } },
    { type: 'lang', name: 'name' },
    { type: 'text', value: { ar: ' - ', en: ' - ' } },
    { type: 'direct', name: 'patient_code' }
  ],
  clinic_contracts_header: [
    { type: 'text', value: { ar: 'عقد ', en: 'Contract ' } },
    { type: 'fk', name: 'patient' },
    { type: 'text', value: { ar: ' بتاريخ ', en: ' on ' } },
    { type: 'field', name: 'contract_date' }
  ],
  clinic_contracts_lines: [
    { type: 'text', value: { ar: 'خدمة ', en: 'Service ' } },
    { type: 'fk', name: 'service' },
    { type: 'text', value: { ar: ' - ', en: ' - ' } },
    { type: 'field', name: 'sessions_count' },
    { type: 'text', value: { ar: ' جلسة', en: ' sessions' } }
  ],
  clinic_session_tickets: [
    { type: 'text', value: { ar: 'جلسة ', en: 'Session ' } },
    { type: 'field', name: 'session_sequence' },
    { type: 'text', value: { ar: ' من ', en: ' of ' } },
    { type: 'fk', name: 'contract_line' }
  ],
  clinic_visit_tickets: [
    { type: 'text', value: { ar: 'زيارة ', en: 'Visit ' } },
    { type: 'fk', name: 'patient' },
    { type: 'text', value: { ar: ' رقم ', en: ' #' } },
    { type: 'field', name: 'visit_sequence' }
  ],
  clinic_bookings: [
    { type: 'text', value: { ar: 'حجز ', en: 'Booking ' } },
    { type: 'fk', name: 'visit_ticket' },
    { type: 'text', value: { ar: ' / ', en: ' / ' } },
    { type: 'fk', name: 'slot' }
  ],
  clinic_slots_inventory: [
    { type: 'text', value: { ar: 'موعد ', en: 'Slot ' } },
    { type: 'fk', name: 'doctor' },
    { type: 'text', value: { ar: ' يوم ', en: ' on ' } },
    { type: 'field', name: 'slot_date' },
    { type: 'text', value: { ar: ' من ', en: ' from ' } },
    { type: 'field', name: 'slot_time_start' },
    { type: 'text', value: { ar: ' إلى ', en: ' to ' } },
    { type: 'field', name: 'slot_time_end' }
  ],
  clinic_visit_progress_header: [
    { type: 'text', value: { ar: 'تنفيذ ', en: 'Execution ' } },
    { type: 'fk', name: 'booking' },
    { type: 'text', value: { ar: ' بدءًا ', en: ' started ' } },
    { type: 'field', name: 'started_at' }
  ],
  clinic_visit_progress_steps: [
    { type: 'text', value: { ar: 'خطوة ', en: 'Step ' } },
    { type: 'field', name: 'order_seq' },
    { type: 'text', value: { ar: ' - ', en: ' - ' } },
    { type: 'field', name: 'step_type' },
    { type: 'text', value: { ar: ' / ', en: ' / ' } },
    { type: 'fk', name: 'device' }
  ],
  clinic_invoices_header: [
    { type: 'text', value: { ar: 'فاتورة ', en: 'Invoice ' } },
    { type: 'field', name: 'invoice_no' },
    { type: 'text', value: { ar: ' / ', en: ' / ' } },
    { type: 'fk', name: 'contract' }
  ],
  clinic_payments: [
    { type: 'text', value: { ar: 'دفعة ', en: 'Payment ' } },
    { type: 'field', name: 'amount' },
    { type: 'text', value: { ar: ' - ', en: ' - ' } },
    { type: 'field', name: 'method' }
  ],
  clinic_invoices_lines: [
    { type: 'text', value: { ar: 'بند ', en: 'Line ' } },
    { type: 'fk', name: 'service' },
    { type: 'text', value: { ar: ' x ', en: ' x ' } },
    { type: 'field', name: 'quantity' }
  ]
};

const bestTranslationField = (table) => {
  const base = String(table.name || '').toLowerCase();
  const langTable = tableMap.get(`${base}_lang`);
  if (!langTable || !Array.isArray(langTable.fields)) return null;
  const candidates = ['name', 'title', 'label', 'description', 'full_name'];
  const fields = langTable.fields.map((f) => f.columnName || f.name).filter(Boolean);
  for (const c of candidates) {
    if (fields.includes(c)) return c;
  }
  return fields.find((f) => !['id', 'lang', `${base}_id`, 'created_date', 'modified_date'].includes(String(f).toLowerCase())) || null;
};

const bestDirectField = (table) => {
  if (!Array.isArray(table.fields)) return null;
  const candidates = ['name', 'title', 'label', 'code', 'number', 'status', 'notes', 'begin_date'];
  const fields = table.fields.map((f) => f.columnName || f.name).filter(Boolean);
  for (const c of candidates) {
    if (fields.includes(c)) return c;
  }
  return fields.find((f) => !String(f).toLowerCase().endsWith('_id')) || null;
};

const bestFkField = (table) => {
  if (!Array.isArray(table.fields)) return null;
  const fk = table.fields.find((f) => f.references && f.references.table);
  return fk ? (fk.columnName || fk.name) : null;
};

let updated = 0;
for (const table of tables) {
  if (!table || !table.name) continue;
  const name = table.name.toLowerCase();
  if (name.endsWith('_lang')) continue;
  table.smart_features = table.smart_features || {};

  if (customRules[name]) {
    table.smart_features.display_rule = { parts: customRules[name] };
    updated += 1;
    continue;
  }

  const labelAr = table.label || table.name;
  const labelEn = table.label_en || humanize(table.name || '');
  const transField = bestTranslationField(table);
  const directField = bestDirectField(table);
  const fkField = bestFkField(table);

  const parts = [{ type: 'text', value: { ar: String(labelAr) + ' - ', en: String(labelEn) + ' - ' } }];
  if (transField) {
    parts.push({ type: 'lang', name: transField });
  } else if (directField) {
    parts.push({ type: 'field', name: directField });
  } else if (fkField) {
    parts.push({ type: 'fk', name: fkField });
  }

  table.smart_features.display_rule = { parts: parts };
  updated += 1;
}

fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
console.log(`Updated display rules for ${updated} tables.`);

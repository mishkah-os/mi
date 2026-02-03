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

const priority = [
  'display_name', 'name', 'title', 'label', 'full_name', 'code', 'number',
  'sequence', 'visit_sequence', 'status', 'type', 'category', 'kind',
  'service', 'room', 'clinic', 'department', 'specialty',
  'patient', 'doctor', 'device', 'station', 'package', 'contract',
  'booking', 'slot', 'visit_ticket', 'invoice', 'payment',
  'amount', 'price', 'qty', 'quantity', 'notes', 'begin_date',
  'created_date', 'modified_date'
];

const humanize = (name) => String(name || '')
  .replace(/_/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

const isLangFieldIgnored = (fieldName, baseName) => {
  const lower = String(fieldName || '').toLowerCase();
  if (!lower) return true;
  if (['id', 'lang', 'created_date', 'modified_date'].includes(lower)) return true;
  if (lower === `${baseName}_id`) return true;
  if (lower.endsWith('_id')) return true;
  return false;
};

const rank = (name) => {
  const idx = priority.indexOf(String(name));
  return idx === -1 ? 999 : idx;
};

const buildColumns = (table) => {
  const baseName = String(table.name || '').toLowerCase();
  const langTable = tableMap.get(`${baseName}_lang`);
  const langFields = Array.isArray(langTable?.fields) ? langTable.fields : [];
  const translationFields = langFields
    .map((field) => field.columnName || field.name)
    .filter((name) => name && !isLangFieldIgnored(name, baseName));

  const baseFields = Array.isArray(table.fields)
    ? table.fields.map((field) => ({
      name: field.columnName || field.name,
      isFk: !!(field.references && field.references.table),
      label: field.label || field.columnName || field.name,
      label_ar: field.label_ar,
      label_en: field.label_en
    })).filter((field) => field.name)
    : [];

  const byName = new Map();
  const addMeta = (name, source, labelMeta = {}) => {
    if (!name || byName.has(name)) return;
    const fallback = humanize(name);
    byName.set(name, {
      name,
      source,
      labels: {
        ar: labelMeta.label_ar || labelMeta.label || fallback,
        en: labelMeta.label_en || labelMeta.label || fallback
      },
      sort: null,
      is_table_show: true,
      is_edit_show: true,
      is_searchable: true,
      component: null,
      default_value: null,
      default_expr: null,
      events: null
    });
  };

  addMeta('display_name', 'direct', { label: 'Display Name' });

  translationFields.forEach((field) => addMeta(field, 'lang', { label: field }));
  baseFields.filter((field) => field.isFk).forEach((field) => addMeta(field.name, 'fk', field));
  baseFields.filter((field) => !field.isFk).forEach((field) => addMeta(field.name, 'direct', field));

  const groupRank = { display_name: 0, lang: 1, fk: 2, direct: 3 };
  const entries = Array.from(byName.values());
  entries.sort((a, b) => {
    const ga = groupRank[a.source] ?? 9;
    const gb = groupRank[b.source] ?? 9;
    if (ga !== gb) return ga - gb;
    const pa = rank(a.name);
    const pb = rank(b.name);
    if (pa !== pb) return pa - pb;
    return String(a.name).localeCompare(String(b.name));
  });

  let sort = 10;
  for (const entry of entries) {
    entry.sort = sort;
    sort += 10;
  }
  return entries;
};

let updated = 0;
for (const table of tables) {
  if (!table || !table.name) continue;
  const name = table.name.toLowerCase();
  if (name.endsWith('_lang')) continue;
  table.smart_features = table.smart_features || {};
  table.smart_features.columns = buildColumns(table);
  updated += 1;
}

fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
console.log(`Updated columns metadata for ${updated} tables.`);

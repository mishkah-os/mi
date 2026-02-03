import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SEED_PATH = path.join(ROOT, 'data', 'seeds', 'brocker-mock-data.json');

function normalizeLang(lang) {
  if (!lang || typeof lang !== 'string') return 'ar';
  const normalized = lang.trim().toLowerCase();
  return normalized || 'ar';
}

function detectReferenceId(record, baseName) {
  if (!record || typeof record !== 'object') return null;
  const directKey = `${baseName}_id`;
  if (record[directKey]) return record[directKey];
  const camelKey = `${baseName}Id`;
  if (record[camelKey]) return record[camelKey];
  if (record.id) return record.id;
  if (record.slug) return record.slug;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase().endsWith('_id') && record[key]) {
      return record[key];
    }
  }
  return null;
}

function buildLocalizedRecord(baseRecord, baseName) {
  const referenceId = detectReferenceId(baseRecord, baseName);
  if (!referenceId) return null;
  const localized = {
    id: `${baseName}-${referenceId}-en`,
    [`${baseName}_id`]: referenceId,
    lang: 'en'
  };
  for (const [key, value] of Object.entries(baseRecord || {})) {
    if (key === 'id' || key === 'lang' || value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim()) {
      localized[key] = value;
    }
  }
  return localized;
}

async function syncSeedTranslations(seedPath = DEFAULT_SEED_PATH) {
  const buffer = await readFile(seedPath, 'utf8');
  const seed = JSON.parse(buffer);
  const tables = seed.tables || {};
  const translationTables = Object.keys(tables).filter((name) => name.endsWith('_lang'));
  const summary = [];

  for (const tableName of translationTables) {
    const baseName = tableName.replace(/_lang$/, '');
    const baseRows = Array.isArray(tables[baseName]) ? tables[baseName] : [];
    const translations = Array.isArray(tables[tableName]) ? tables[tableName] : [];
    const existing = new Set(
      translations
        .filter((row) => normalizeLang(row.lang) === 'en')
        .map((row) => `${detectReferenceId(row, baseName)}::en`)
    );

    let added = 0;
    for (const record of baseRows) {
      const refId = detectReferenceId(record, baseName);
      if (!refId) continue;
      const cacheKey = `${refId}::en`;
      if (existing.has(cacheKey)) continue;
      const localized = buildLocalizedRecord(record, baseName);
      if (!localized) continue;
      translations.push(localized);
      existing.add(cacheKey);
      added += 1;
    }

    tables[tableName] = translations;
    summary.push({ table: tableName, added });
  }

  seed.tables = tables;
  await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  return summary;
}

async function main() {
  const summary = await syncSeedTranslations();
  console.log('[i18n sync] Completed. Added translations:', summary);
}

main().catch((error) => {
  console.error('[i18n sync] Failed:', error);
  process.exitCode = 1;
});

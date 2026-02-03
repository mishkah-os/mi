import { deepClone } from '../utils.js';

export function normalizeLang(lang, fallback = 'ar') {
  if (!lang || typeof lang !== 'string') return fallback;
  const normalized = lang.trim().toLowerCase();
  return normalized || fallback;
}

export function extractReferenceId(record, baseName) {
  if (!record || typeof record !== 'object') return null;
  const directKey = `${baseName}_id`;
  if (record[directKey]) return record[directKey];
  const camelKey = `${baseName}Id`;
  if (record[camelKey]) return record[camelKey];
  for (const key of Object.keys(record)) {
    if (key === 'id') continue;
    if (key.toLowerCase().endsWith('_id') && record[key]) {
      return record[key];
    }
  }
  return record.id || null;
}

export function isIgnoredField(key, baseName) {
  const normalized = key.toLowerCase();
  return (
    normalized === 'id' ||
    normalized === 'lang' ||
    normalized === `${baseName.toLowerCase()}_id` ||
    normalized === 'created_date' ||
    normalized === 'modified_date'
  );
}

function flattenTranslationsMap(map) {
  const output = {};
  for (const [table, records] of map.entries()) {
    const tableObj = {};
    for (const [recordId, fields] of records.entries()) {
      tableObj[recordId] = deepClone(fields);
    }
    output[table] = tableObj;
  }
  return output;
}

function mergeWithFallback(primary, fallback) {
  const merged = new Map();
  const tables = new Set([...(fallback?.keys?.() ? fallback.keys() : []), ...(primary?.keys?.() ? primary.keys() : [])]);
  for (const table of tables) {
    const primaryRecords = primary?.get(table) || new Map();
    const fallbackRecords = fallback?.get(table) || new Map();
    const recordIds = new Set([...(fallbackRecords.keys ? fallbackRecords.keys() : []), ...(primaryRecords.keys ? primaryRecords.keys() : [])]);
    const recordMap = new Map();
    for (const recordId of recordIds) {
      const fallbackFields = fallbackRecords.get(recordId) || {};
      const primaryFields = primaryRecords.get(recordId) || {};
      recordMap.set(recordId, { ...fallbackFields, ...primaryFields });
    }
    merged.set(table, recordMap);
  }
  return merged;
}

function hasTranslationTable(store, tableName) {
  if (!store || !Array.isArray(store.tables)) return false;
  const target = `${tableName}_lang`.toLowerCase();
  return store.tables.some((name) => typeof name === 'string' && name.toLowerCase() === target);
}

function buildFallbackFromRecord(record, baseName) {
  const fallback = {};
  if (!record || typeof record !== 'object') return fallback;
  for (const [key, value] of Object.entries(record)) {
    if (isIgnoredField(key, baseName)) continue;
    if (value === null || value === undefined) continue;
    fallback[key] = value;
  }
  return fallback;
}

export function attachTranslationsToRows(store, tableName, rows, { lang = 'ar', fallbackLang = 'ar' } = {}) {
  if (!Array.isArray(rows) || !store || !tableName) return rows;
  if (!hasTranslationTable(store, tableName)) return rows;

  const normalizedLang = normalizeLang(lang, fallbackLang);
  const normalizedFallback = normalizeLang(fallbackLang);
  const { translations } = loadTranslationsPayload(store, { lang: normalizedLang, fallbackLang: normalizedFallback });

  const tableTranslations = translations?.[tableName] || translations?.[tableName.toLowerCase()] || null;
  return rows.map((row) => {
    const directId = row && (row.id || row.Id || row.uuid || row.uid);
    const refId = directId || extractReferenceId(row, tableName);
    const translationFields = refId && tableTranslations ? tableTranslations[refId] || tableTranslations[String(refId)] : null;
    const baseFallback = buildFallbackFromRecord(row, tableName);
    const fallbackFields = translationFields && Object.keys(translationFields).length
      ? { ...baseFallback, ...translationFields }
      : baseFallback;

    if (!fallbackFields || !Object.keys(fallbackFields).length) return row;

    const clone = deepClone(row);
    const i18nContainer =
      clone.i18n && typeof clone.i18n === 'object' && !Array.isArray(clone.i18n) ? deepClone(clone.i18n) : {};
    const langContainer =
      i18nContainer.lang && typeof i18nContainer.lang === 'object' && !Array.isArray(i18nContainer.lang)
        ? { ...i18nContainer.lang }
        : {};

    langContainer[normalizedLang] = { ...fallbackFields };
    i18nContainer.lang = langContainer;
    clone.i18n = i18nContainer;
    return clone;
  });
}

export function loadTranslationsPayload(store, { lang = 'ar', fallbackLang = 'ar' } = {}) {
  const normalizedLang = normalizeLang(lang);
  const normalizedFallback = normalizeLang(fallbackLang);
  const translationsByLang = new Map();
  const translationTables = (store?.tables || []).filter((name) => typeof name === 'string' && name.endsWith('_lang'));

  for (const tableName of translationTables) {
    const baseName = tableName.replace(/_lang$/i, '');
    const records = store.listTable(tableName) || [];
    for (const record of records) {
      const language = normalizeLang(record?.lang, normalizedFallback);
      const refId = extractReferenceId(record, baseName);
      if (!refId) continue;
      if (!translationsByLang.has(language)) {
        translationsByLang.set(language, new Map());
      }
      const tableMap = translationsByLang.get(language);
      if (!tableMap.has(baseName)) {
        tableMap.set(baseName, new Map());
      }
      const recordMap = tableMap.get(baseName);
      if (!recordMap.has(refId)) {
        recordMap.set(refId, {});
      }
      const fieldMap = recordMap.get(refId);
      for (const [key, value] of Object.entries(record || {})) {
        if (isIgnoredField(key, baseName)) continue;
        if (value === null || value === undefined) continue;
        fieldMap[key] = value;
      }
      recordMap.set(refId, fieldMap);
      tableMap.set(baseName, recordMap);
      translationsByLang.set(language, tableMap);
    }
  }

  const fallbackMap = translationsByLang.get(normalizedFallback) || new Map();
  const primaryMap = translationsByLang.get(normalizedLang) || new Map();
  const merged = mergeWithFallback(primaryMap, fallbackMap);

  return {
    lang: normalizedLang,
    fallbackLang: normalizedFallback,
    translations: flattenTranslationsMap(merged),
    availableLanguages: Array.from(translationsByLang.keys())
  };
}

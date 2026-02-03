import { test } from 'node:test';
import assert from 'node:assert/strict';

import { attachTranslationsToRows } from '../src/backend/i18nLoader.js';

const orderRows = [
  { id: 'ord-1', status: 'تم التوصيل', note: 'اترك الطلب عند الباب', total: 125.5 }
];

const orderTranslations = [
  { id: 'ord-1-en', orders_id: 'ord-1', lang: 'en', status: 'Delivered', note: 'Leave at door' }
];

const unitRows = [
  { id: 'unit-1', view: 'واجهة مفتوحة', finishing_status: 'تشطيب فندقي', price: 1000000 }
];

const unitTranslations = [
  { id: 'unit-1-en', units_id: 'unit-1', lang: 'en', view: 'Open frontage' },
  { id: 'unit-1-ar', units_id: 'unit-1', lang: 'ar', view: 'واجهة مفتوحة', finishing_status: 'تشطيب فندقي' }
];

const store = {
  tables: ['orders', 'orders_lang', 'units', 'units_lang'],
  listTable(name) {
    const normalized = name.toLowerCase();
    if (normalized === 'orders') return orderRows;
    if (normalized === 'orders_lang') return orderTranslations;
    if (normalized === 'units') return unitRows;
    if (normalized === 'units_lang') return unitTranslations;
    return [];
  }
};

test('attaches translations using language tables without mutating base fields', () => {
  const localized = attachTranslationsToRows(store, 'orders', orderRows, { lang: 'en', fallbackLang: 'ar' });
  const [order] = localized;

  assert.equal(order.status, 'تم التوصيل');
  assert.equal(order.note, 'اترك الطلب عند الباب');
  assert.deepEqual(order.i18n.lang.en, {
    status: 'Delivered',
    note: 'Leave at door',
    total: 125.5
  });
  assert.ok(!order.i18n.lang.ar, 'fallback language should not override when primary is available');
});

test('falls back to arabic content when locale translations are missing', () => {
  const localized = attachTranslationsToRows(store, 'orders', orderRows, { lang: 'fr', fallbackLang: 'ar' });
  const [order] = localized;

  assert.deepEqual(order.i18n.lang.fr, {
    status: 'تم التوصيل',
    note: 'اترك الطلب عند الباب',
    total: 125.5
  });
});

test('merges fallback translations for partially translated units', () => {
  const localized = attachTranslationsToRows(store, 'units', unitRows, { lang: 'en', fallbackLang: 'ar' });
  const [unit] = localized;

  assert.equal(unit.view, 'واجهة مفتوحة');
  assert.equal(unit.finishing_status, 'تشطيب فندقي');
  assert.deepEqual(unit.i18n.lang.en, {
    view: 'Open frontage',
    finishing_status: 'تشطيب فندقي',
    price: 1000000
  });
});

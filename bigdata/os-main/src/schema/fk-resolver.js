/**
 * Dynamic Foreign Key Resolver
 *
 * يوفر معالجة ذكية للـ Foreign Keys:
 * 1. عند الحفظ: يستخرج الـ id من objects مثل {id, name}
 * 2. عند القراءة: يملأ الـ FK بـ {id, name} من الجدول المرجعي
 *
 * مثال:
 * - حفظ: {itemId: {id: '123', name: 'Pizza'}} → يحفظ itemId = '123'
 * - قراءة: itemId = '123' → يعيد {id: '123', name: 'Pizza'}
 */

import { deepClone } from '../utils.js';

/**
 * يتحقق إذا كانت القيمة FK object
 */
function isFkObject(value) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && ('id' in value || 'name' in value);
}

/**
 * يستخرج الـ id من FK object أو يعيد القيمة كما هي
 */
function extractFkValue(value) {
  if (!isFkObject(value)) {
    return value;
  }

  // إذا كان object بـ id، نستخرج الـ id فقط
  if (value.id !== undefined && value.id !== null) {
    return value.id;
  }

  // إذا لم يكن هناك id، نعيد القيمة كما هي
  return value;
}

/**
 * يحول FK value إلى object {id, name} إذا كان بسيط
 */
function expandFkValue(value, referencedRecord = null) {
  // إذا كانت القيمة null أو undefined
  if (value === null || value === undefined) {
    return value;
  }

  // إذا كانت القيمة بالفعل object
  if (isFkObject(value)) {
    return value;
  }

  // إذا كان لدينا referenced record، نستخدمه
  if (referencedRecord && typeof referencedRecord === 'object') {
    return {
      id: value,
      name: referencedRecord.name || referencedRecord.label || referencedRecord.title || String(value)
    };
  }

  // إذا لم يكن لدينا referenced record، نعيد object بسيط
  return {
    id: value,
    name: String(value)
  };
}

/**
 * يحصل على معلومات الـ FK من الـ schema
 */
function getFkInfo(schemaEngine, tableName, fieldName) {
  try {
    const table = schemaEngine.getTable(tableName);
    if (!table || !Array.isArray(table.fields)) {
      return null;
    }

    const field = table.fields.find(f =>
      f.name === fieldName || f.columnName === fieldName
    );

    if (!field || !field.references) {
      return null;
    }

    return {
      field,
      targetTable: field.references.table,
      targetColumn: field.references.column
    };
  } catch (error) {
    return null;
  }
}

/**
 * ينظف record قبل الحفظ - يستخرج الـ id من FK objects
 *
 * @param {Object} schemaEngine - Schema engine
 * @param {string} tableName - اسم الجدول
 * @param {Object} record - الـ record للتنظيف
 * @returns {Object} - record منظف جاهز للحفظ
 */
export function normalizeRecordForSave(schemaEngine, tableName, record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const normalized = deepClone(record);

  try {
    const table = schemaEngine.getTable(tableName);
    if (!table || !Array.isArray(table.fields)) {
      return normalized;
    }

    // لكل field في الـ schema
    for (const field of table.fields) {
      // إذا كان الحقل له references (FK)
      if (!field.references) {
        continue;
      }

      // نتحقق من القيمة في الـ record (camelCase و snake_case)
      const fieldName = field.name;
      const columnName = field.columnName || field.name;

      // نتحقق من كلا الاسمين
      for (const key of [fieldName, columnName]) {
        if (!(key in normalized)) {
          continue;
        }

        const value = normalized[key];

        // نستخرج الـ id إذا كان object
        const extractedValue = extractFkValue(value);

        // نحدث القيمة في كلا المكانين
        normalized[fieldName] = extractedValue;
        if (columnName !== fieldName) {
          normalized[columnName] = extractedValue;
        }
      }
    }
  } catch (error) {
    console.error('[FK-Resolver] Error normalizing record for save:', error);
  }

  return normalized;
}

/**
 * يملأ FK fields بـ objects {id, name} بعد القراءة
 *
 * @param {Object} schemaEngine - Schema engine
 * @param {Object} store - Module store للبحث عن الـ referenced records
 * @param {string} tableName - اسم الجدول
 * @param {Object} record - الـ record لملئه
 * @param {Object} options - خيارات
 * @returns {Object} - record ممتلئ
 */
export function populateRecordFks(schemaEngine, store, tableName, record, options = {}) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const populate = options.populate !== false; // default: true
  if (!populate) {
    return record;
  }

  const populated = deepClone(record);

  try {
    const table = schemaEngine.getTable(tableName);
    if (!table || !Array.isArray(table.fields)) {
      return populated;
    }

    // لكل field في الـ schema
    for (const field of table.fields) {
      // إذا كان الحقل له references (FK)
      if (!field.references) {
        continue;
      }

      const fieldName = field.name;
      const columnName = field.columnName || field.name;
      const targetTable = field.references.table;

      // نحصل على القيمة الحالية
      let fkValue = populated[fieldName] !== undefined
        ? populated[fieldName]
        : populated[columnName];

      // إذا كانت القيمة null أو undefined أو بالفعل object
      if (fkValue === null || fkValue === undefined || isFkObject(fkValue)) {
        continue;
      }

      // نبحث عن الـ referenced record
      try {
        const referencedRecord = store.getRecord(targetTable, fkValue);

        // نملأ القيمة بـ object
        const expandedValue = expandFkValue(fkValue, referencedRecord);

        // نحدث القيمة في كلا المكانين
        populated[fieldName] = expandedValue;
        if (columnName !== fieldName) {
          populated[columnName] = expandedValue;
        }
      } catch (error) {
        // إذا لم نجد الـ referenced record، نستخدم القيمة البسيطة
        const expandedValue = expandFkValue(fkValue, null);
        populated[fieldName] = expandedValue;
        if (columnName !== fieldName) {
          populated[columnName] = expandedValue;
        }
      }
    }
  } catch (error) {
    console.error('[FK-Resolver] Error populating record FKs:', error);
  }

  return populated;
}

/**
 * يملأ FK fields لمجموعة من الـ records
 */
export function populateRecordsFks(schemaEngine, store, tableName, records, options = {}) {
  if (!Array.isArray(records)) {
    return records;
  }

  return records.map(record =>
    populateRecordFks(schemaEngine, store, tableName, record, options)
  );
}

/**
 * Helper: يحصل على display name من record
 */
export function getRecordDisplayName(record) {
  if (!record || typeof record !== 'object') {
    return String(record || '');
  }

  // نبحث عن الحقول الشائعة للعرض
  const displayFields = ['name', 'label', 'title', 'description', 'code', 'id'];

  for (const field of displayFields) {
    if (record[field] !== undefined && record[field] !== null) {
      return String(record[field]);
    }
  }

  return String(record.id || '');
}

export default {
  isFkObject,
  extractFkValue,
  expandFkValue,
  getFkInfo,
  normalizeRecordForSave,
  populateRecordFks,
  populateRecordsFks,
  getRecordDisplayName
};

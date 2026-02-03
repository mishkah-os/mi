import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { deepClone, mergeDeep } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const DEFAULT_SCHEMA_DIR = path.join(ROOT_DIR, 'data', 'schemas');

const TYPE_ALIASES = new Map([
  ['array', 'array'],
  ['list', 'array'],
  ['object', 'object'],
  ['map', 'object'],
  ['record', 'object'],
  ['string', 'string'],
  ['number', 'number'],
  ['boolean', 'boolean']
]);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function detectType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function normalizeExpectation(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const rawPath = typeof entry.path === 'string' ? entry.path.trim() : '';
  if (!rawPath) return null;
  const aliasKey = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : 'object';
  const normalizedType = TYPE_ALIASES.get(aliasKey) || aliasKey || 'object';
  return {
    path: rawPath,
    type: normalizedType,
    required: entry.required === true,
    description: typeof entry.description === 'string' ? entry.description : null,
    source: entry.source || null
  };
}

function getAtPath(source, dottedPath) {
  if (!dottedPath) return source;
  const parts = dottedPath.split('.');
  let cursor = source;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function collectExpectations(node, prefix = '') {
  const results = [];
  if (Array.isArray(node)) {
    if (prefix) {
      results.push({ path: prefix, type: 'array', required: false, source: 'auto' });
    }
    return results;
  }
  if (isPlainObject(node)) {
    if (prefix) {
      results.push({ path: prefix, type: 'object', required: false, source: 'auto' });
    }
    for (const key of Object.keys(node)) {
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      results.push(...collectExpectations(node[key], childPrefix));
    }
  }
  return results;
}

export class SchemaRegistry {
  constructor(options = {}) {
    this.schemaDir = options.schemaDir || DEFAULT_SCHEMA_DIR;
    this.logger = options.logger || null;
    this.schemas = new Map();
    this.loaded = false;
  }

  async initialize() {
    const entries = await readdir(this.schemaDir, { withFileTypes: true }).catch(() => []);
    const nextSchemas = new Map();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.json')) continue;
      const filePath = path.join(this.schemaDir, entry.name);
      try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const schema = this.#normalizeSchema(parsed, filePath);
        nextSchemas.set(schema.id, schema);
        this.#log('debug', `Loaded schema "${schema.id}"`, { filePath });
      } catch (error) {
        this.#log('warn', `Failed to load schema file "${entry.name}"`, { error: error?.message, filePath });
      }
    }

    this.schemas = nextSchemas;
    this.loaded = true;
    return this.schemas;
  }

  listSchemas() {
    return Array.from(this.schemas.values()).map((schema) => ({
      id: schema.id,
      label: schema.label || schema.id,
      version: schema.version || null,
      description: schema.description || null,
      filePath: schema.filePath
    }));
  }

  hasSchema(schemaId) {
    return this.schemas.has(schemaId);
  }

  getSchema(schemaId) {
    return this.schemas.get(schemaId) || null;
  }

  createSkeleton(schemaId, overrides = null) {
    const schema = this.getSchema(schemaId);
    if (!schema) {
      throw new Error(`Schema "${schemaId}" not found in registry`);
    }
    const base = deepClone(schema.datasetShape);
    if (!overrides || typeof overrides !== 'object') {
      return base;
    }
    return mergeDeep(base, overrides);
  }

  validate(schemaId, dataset) {
    const schema = this.getSchema(schemaId);
    if (!schema) {
      return {
        valid: false,
        errors: [
          {
            path: null,
            code: 'schema:not-found',
            message: `Schema "${schemaId}" is not loaded`
          }
        ],
        warnings: []
      };
    }
    const errors = [];
    const warnings = [];
    const data = dataset || {};

    for (const expectation of schema.expectations) {
      const { path: expectationPath, type, required } = expectation;
      const value = getAtPath(data, expectationPath);
      const isOptional = schema.optionalPaths.has(expectationPath);

      if (value === undefined) {
        if (required) {
          errors.push({
            path: expectationPath,
            code: 'schema:missing',
            message: `Expected ${type} at "${expectationPath}" but it was missing`
          });
        } else if (!isOptional) {
          warnings.push({
            path: expectationPath,
            code: 'schema:missing',
            message: `Missing optional ${type} at "${expectationPath}"`
          });
        }
        continue;
      }

      const actualType = detectType(value);
      if (type === 'array') {
        if (actualType !== 'array') {
          errors.push({
            path: expectationPath,
            code: 'schema:type',
            message: `Expected array at "${expectationPath}" but found ${actualType}`
          });
        }
        continue;
      }
      if (type === 'object') {
        if (actualType !== 'object') {
          errors.push({
            path: expectationPath,
            code: 'schema:type',
            message: `Expected object at "${expectationPath}" but found ${actualType}`
          });
        }
        continue;
      }
      if (type === 'string' || type === 'number' || type === 'boolean') {
        if (actualType !== type) {
          errors.push({
            path: expectationPath,
            code: 'schema:type',
            message: `Expected ${type} at "${expectationPath}" but found ${actualType}`
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  #normalizeSchema(rawSchema, filePath) {
    if (!isPlainObject(rawSchema)) {
      throw new Error('Schema file must export a JSON object');
    }
    if (!rawSchema.id || typeof rawSchema.id !== 'string') {
      throw new Error('Schema must contain an "id" field');
    }

    const datasetShape = isPlainObject(rawSchema.datasetShape) ? rawSchema.datasetShape : {};
    const optionalPaths = new Set(Array.isArray(rawSchema.optionalPaths) ? rawSchema.optionalPaths : []);
    const explicit = Array.isArray(rawSchema.shapeExpectations)
      ? rawSchema.shapeExpectations
      : [];

    const expectations = new Map();
    const autoExpectations = collectExpectations(datasetShape);

    for (const entry of [...autoExpectations, ...explicit]) {
      const normalized = normalizeExpectation(entry);
      if (!normalized) continue;
      const current = expectations.get(normalized.path);
      if (current && current.source === 'explicit' && normalized.source !== 'explicit') {
        continue;
      }
      if (entry.required === true) {
        normalized.required = true;
      }
      if (entry.source) {
        normalized.source = entry.source;
      } else if (explicit.includes(entry)) {
        normalized.source = 'explicit';
      }
      expectations.set(normalized.path, normalized);
    }

    const schema = {
      ...rawSchema,
      id: rawSchema.id,
      filePath,
      datasetShape,
      optionalPaths,
      expectations: Array.from(expectations.values())
    };

    return schema;
  }

  #log(level, message, meta = {}) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level]({ schemaDir: this.schemaDir, ...meta }, message);
      return;
    }
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[SchemaRegistry] ${message}`, meta);
  }
}

export async function createSchemaRegistry(options = {}) {
  const registry = new SchemaRegistry(options);
  await registry.initialize();
  return registry;
}

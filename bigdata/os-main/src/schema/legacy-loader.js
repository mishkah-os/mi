import { readFile } from 'fs/promises';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_SOURCES = {
  pos: {
    file: path.join(REPO_ROOT, 'mishkah-schema.js'),
    globalName: 'MishkahPOSSchema'
  },
  kds: {
    file: path.join(REPO_ROOT, 'mishkah-schema.js'),
    globalName: 'MishkahKDSSchema'
  }
};

function toSerializable(input) {
  return JSON.parse(JSON.stringify(input));
}

async function loadLegacySchema(source) {
  if (!source || !source.file) {
    throw new Error('Legacy schema source requires a "file" path.');
  }
  const { file, globalName } = source;
  const scriptSource = await readFile(file, 'utf8');
  const context = {
    console,
    Promise,
    structuredClone(value){
      if(value === undefined || value === null) return value;
      return JSON.parse(JSON.stringify(value));
    }
  };
  context.global = context;
  context.window = context;
  context.self = context;
  context.Mishkah = context.Mishkah || {};
  const script = new vm.Script(scriptSource, { filename: path.basename(file) });
  script.runInNewContext(context);
  const schema = context[globalName];
  if (!schema || typeof schema !== 'object') {
    throw new Error(`Schema "${globalName}" was not exposed by ${file}`);
  }
  return toSerializable(schema);
}

export async function loadLegacySchemas(overrides = {}) {
  const result = {};
  const sources = { ...DEFAULT_SOURCES, ...overrides };
  for (const [key, source] of Object.entries(sources)) {
    result[key] = await loadLegacySchema(source);
  }
  return result;
}

export function buildSchemaManifest(schemas, options = {}) {
  if (!schemas || typeof schemas !== 'object') {
    throw new Error('Cannot build schema manifest without schema objects.');
  }
  const manifest = {
    version: options.version || '1.0.0',
    generatedAt: new Date().toISOString(),
    schemas: {}
  };

  for (const [key, schema] of Object.entries(schemas)) {
    if (!schema) continue;
    const tables = Array.isArray(schema.tables) ? schema.tables : [];
    const tableNames = tables
      .map((table) => (table && typeof table.name === 'string' ? table.name : null))
      .filter(Boolean);
    manifest.schemas[key] = {
      name: schema.name || key,
      version: schema.version ?? null,
      tableCount: tableNames.length,
      tables: tableNames
    };
  }

  return manifest;
}

export async function loadLegacyManifest(options = {}) {
  const schemas = await loadLegacySchemas(options.sources || {});
  return buildSchemaManifest(schemas, { version: options.version });
}

export { DEFAULT_SOURCES as LEGACY_SCHEMA_SOURCES, REPO_ROOT as LEGACY_SCHEMA_ROOT };

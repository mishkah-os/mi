import { mkdirSync, existsSync, appendFileSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * Advanced logging system for SQLite DDL and DML operations
 * Separated by branch, module, and operation type
 */

const LOG_TYPES = {
  DDL: 'ddl', // Data Definition Language (CREATE, ALTER, etc.)
  DML: 'dml', // Data Manipulation Language (INSERT, UPDATE, DELETE)
  MIGRATION: 'migration' // Schema migration operations
};

function getLogDirectory(branchId, moduleId) {
  const rootDir = process.cwd();
  const logsDir = path.join(rootDir, 'data', 'branches', branchId, 'modules', moduleId, 'logs');

  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  return logsDir;
}

function getLogFilePath(branchId, moduleId, logType) {
  const logsDir = getLogDirectory(branchId, moduleId);
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(logsDir, `${logType}-${date}.log`);
}

function formatLogEntry(level, category, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : '';

  return `[${timestamp}] [${level.toUpperCase()}] [${category}]\n${message}\n${metaStr ? `Metadata: ${metaStr}\n` : ''}\n${'='.repeat(80)}\n`;
}

/**
 * Log DDL operations (CREATE, ALTER, DROP, etc.)
 */
export function logDDL(branchId, moduleId, operation, sql, status, metadata = {}) {
  if (!branchId || !moduleId) {
    console.warn('Cannot log DDL: missing branchId or moduleId');
    return;
  }

  const logFile = getLogFilePath(branchId, moduleId, LOG_TYPES.DDL);
  const level = status === 'success' ? 'info' : 'error';
  const message = `DDL Operation: ${operation}\nSQL: ${sql}\nStatus: ${status}`;

  const entry = formatLogEntry(level, 'DDL', message, {
    operation,
    status,
    sql,
    ...metadata
  });

  try {
    appendFileSync(logFile, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write DDL log:', error.message);
  }
}

/**
 * Log DML operations (INSERT, UPDATE, DELETE) - especially failures
 */
export function logDML(branchId, moduleId, operation, tableName, status, metadata = {}) {
  if (!branchId || !moduleId) {
    console.warn('Cannot log DML: missing branchId or moduleId');
    return;
  }

  const logFile = getLogFilePath(branchId, moduleId, LOG_TYPES.DML);
  const level = status === 'success' ? 'info' : 'error';
  const message = `DML Operation: ${operation}\nTable: ${tableName}\nStatus: ${status}`;

  const entry = formatLogEntry(level, 'DML', message, {
    operation,
    tableName,
    status,
    ...metadata
  });

  try {
    appendFileSync(logFile, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write DML log:', error.message);
  }
}

/**
 * Log schema migration operations with detailed information
 */
export function logMigration(branchId, moduleId, action, details, status, metadata = {}) {
  if (!branchId || !moduleId) {
    console.warn('Cannot log migration: missing branchId or moduleId');
    return;
  }

  const logFile = getLogFilePath(branchId, moduleId, LOG_TYPES.MIGRATION);
  const level = status === 'success' ? 'info' : 'error';
  const message = `Migration Action: ${action}\nDetails: ${details}\nStatus: ${status}`;

  const entry = formatLogEntry(level, 'MIGRATION', message, {
    action,
    status,
    ...metadata
  });

  try {
    appendFileSync(logFile, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write migration log:', error.message);
  }
}

/**
 * Log schema validation results
 */
export function logSchemaValidation(branchId, moduleId, tableName, differences, metadata = {}) {
  if (!branchId || !moduleId) {
    console.warn('Cannot log schema validation: missing branchId or moduleId');
    return;
  }

  const logFile = getLogFilePath(branchId, moduleId, LOG_TYPES.MIGRATION);
  const hasDifferences = differences && differences.length > 0;
  const level = hasDifferences ? 'warn' : 'info';
  const message = `Schema Validation: ${tableName}\nDifferences Found: ${hasDifferences ? 'YES' : 'NO'}`;

  const entry = formatLogEntry(level, 'VALIDATION', message, {
    tableName,
    differences,
    ...metadata
  });

  try {
    appendFileSync(logFile, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write validation log:', error.message);
  }
}

/**
 * Create a consolidated migration report
 */
export function createMigrationReport(branchId, moduleId, migrations) {
  if (!branchId || !moduleId || !migrations || migrations.length === 0) {
    return;
  }

  const logsDir = getLogDirectory(branchId, moduleId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(logsDir, `migration-report-${timestamp}.json`);

  const report = {
    generatedAt: new Date().toISOString(),
    branchId,
    moduleId,
    totalMigrations: migrations.length,
    successful: migrations.filter(m => m.status === 'success').length,
    failed: migrations.filter(m => m.status === 'failed').length,
    migrations
  };

  try {
    // const fs = require('fs');
    writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Migration report created: ${reportFile}`);
  } catch (error) {
    console.error('Failed to create migration report:', error.message);
  }
}

export default {
  logDDL,
  logDML,
  logMigration,
  logSchemaValidation,
  createMigrationReport
};

import test from 'node:test';
import assert from 'node:assert/strict';

import SchemaEngine from '../src/schema/engine.js';
import ModuleStore, { VersionConflictError } from '../src/moduleStore.js';

function createTestStore() {
  const engine = new SchemaEngine();
  engine.registerSchema({
    schema: {
      tables: [
        {
          name: 'order_header',
          fields: [
            { name: 'id', type: 'string', primaryKey: true },
            { name: 'status', type: 'string' },
            { name: 'updatedAt', type: 'timestamp' }
          ]
        },
        {
          name: 'order_line',
          fields: [
            { name: 'id', type: 'string', primaryKey: true },
            { name: 'orderId', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'updatedAt', type: 'timestamp' }
          ]
        }
      ]
    }
  });
  const definition = { tables: ['order_header', 'order_line'] };
  const store = new ModuleStore(engine, 'branch-1', 'pos', definition);
  return store;
}

test('order header optimistic concurrency between cashier and waiter', () => {
  const store = createTestStore();
  const created = store.insert('order_header', { id: 'ord-1', status: 'open' });
  assert.equal(created.version, 1);

  const cashierView = store.listTable('order_header')[0];
  const waiterView = { ...cashierView };

  cashierView.status = 'paid';
  const cashierResult = store.save('order_header', cashierView).record;
  assert.equal(cashierResult.version, 2);

  waiterView.status = 'closed';
  assert.throws(
    () => store.save('order_header', waiterView),
    (error) =>
      error instanceof VersionConflictError &&
      error.expectedVersion === 1 &&
      error.currentVersion === 2 &&
      error.table === 'order_header'
  );
});

test('order line updates require a matching version', () => {
  const store = createTestStore();
  store.insert('order_header', { id: 'ord-2', status: 'open' });
  const line = store.insert('order_line', { id: 'ln-1', orderId: 'ord-2', status: 'pending' });
  assert.equal(line.version, 1);

  const cashierLine = store.listTable('order_line')[0];
  const waiterLine = { ...cashierLine };

  cashierLine.status = 'ready';
  const updated = store.save('order_line', cashierLine).record;
  assert.equal(updated.version, 2);

  waiterLine.status = 'served';
  assert.throws(
    () => store.save('order_line', waiterLine),
    (error) =>
      error instanceof VersionConflictError &&
      error.expectedVersion === 1 &&
      error.currentVersion === 2 &&
      error.table === 'order_line'
  );
});

test('missing version is treated as a concurrency violation', () => {
  const store = createTestStore();
  const header = store.insert('order_header', { id: 'ord-3', status: 'open' });
  assert.equal(header.version, 1);

  const stale = { ...store.listTable('order_header')[0] };
  delete stale.version;
  stale.status = 'void';

  assert.throws(
    () => store.save('order_header', stale),
    (error) => error instanceof VersionConflictError && error.reason === 'missing-version'
  );
});


const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('./flow');
const store = require('./store');

test('Flow attachment order must be completely verifiable', async () => {
  const pageWith = (sources) => ({ evaluate: async () => sources });

  await assert.doesNotReject(() => flow._test.verifyComposerOrder(pageWith(['one', 'two']), ['one', 'two']));
  await assert.rejects(() => flow._test.verifyComposerOrder(pageWith(['two', 'one']), ['one', 'two']));
  await assert.rejects(() => flow._test.verifyComposerOrder(pageWith(['one']), ['one', 'two']));
  await assert.rejects(() => flow._test.verifyComposerOrder(pageWith([]), ['one']));
});

test('legacy projects with normalized duplicate names get separate output folders', () => {
  const older = { id: 'older', name: 'Lookbook', createdAt: 1 };
  const newer = { id: 'newer', name: 'lookbook', createdAt: 2 };
  const projects = [older, newer];

  assert.equal(store._test.legacyOutputFolder(older, projects), 'Lookbook');
  assert.equal(store._test.legacyOutputFolder(newer, projects), 'lookbook (newer)');
});

test('legacy project does not claim a folder reserved by a newer project', () => {
  const legacy = { id: 'legacy', name: 'Lookbook', createdAt: 1 };
  const reserved = { id: 'reserved', name: 'Different name', outputFolder: 'Lookbook', createdAt: 2 };

  assert.equal(store._test.legacyOutputFolder(legacy, [legacy, reserved]), 'Lookbook (legacy)');
});

test('long output folder names retain unique suffixes within the length limit', () => {
  const base = 'x'.repeat(80);
  const first = store._test.suffixedFolder(base, 'first');
  const second = store._test.suffixedFolder(base, 'second');

  assert.ok(first.length <= 80);
  assert.ok(second.length <= 80);
  assert.notEqual(first, second);
  assert.ok(first.endsWith('(first)'));
  assert.ok(second.endsWith('(second)'));
});

test('projects with generation or 2K work cannot be treated as idle', () => {
  assert.equal(store.hasActiveWork({ s1: { runs: [{ status: 'queued' }] }, s2: {}, s3: { scenes: [] } }), true);
  assert.equal(store.hasActiveWork({ s1: { runs: [{ status: 'done', upgrading: true }] }, s2: {}, s3: { scenes: [] } }), true);
  assert.equal(store.hasActiveWork({ s1: {}, s2: {}, s3: { scenes: [{ chosen: { status: 'saving' }, runs: [] }] } }), true);
  assert.equal(store.hasActiveWork({ s1: { runs: [{ status: 'done' }] }, s2: {}, s3: { scenes: [] } }), false);
  // Ảnh 2K lỗi vẫn còn trong danh sách chờ nhưng không còn tác vụ nào chạy → không được khóa xóa/dọn.
  assert.equal(store.hasActiveWork({ s1: { runs: [{ status: 'done', preview2kPending: ['ref'] }] }, s2: {}, s3: { scenes: [] } }), false);
  // Bước 4 đang chờ/chạy cũng là việc_active: không được xóa dự án hay dọn dẹp.
  assert.equal(store.hasActiveWork({ s1: {}, s2: {}, s3: { scenes: [{ runs: [], logoRemoval: { status: 'waiting_ok' } }] } }), true);
  assert.equal(store.hasActiveWork({ s1: {}, s2: {}, s3: { scenes: [{ runs: [], logoRemoval: { status: 'approved' } }] } }), false);
  assert.equal(store.hasActiveWork({ s1: {}, s2: {}, s3: { scenes: [{ runs: [], logoRemoval: { status: 'error' } }] } }), false);
});

test('safeName avoids Windows reserved names and trailing dots/spaces', () => {
  assert.equal(store.safeName('CON'), '_CON');
  assert.equal(store.safeName('con.txt'), '_con.txt');
  assert.equal(store.safeName('LPT1'), '_LPT1');
  assert.equal(store.safeName('  Áo thun.  '), 'Áo thun');
  assert.equal(store.safeName('a/b:c*d?'), 'a b c d');
  assert.equal(store.safeName(''), 'du-an');
});

test('normalizeProject fills missing arrays and assigns stable scene order', () => {
  const p = store.normalizeProject({
    id: 'p1',
    s1: { inputs: null, runs: null },
    s3: { scenes: [{ id: 'a' }, null, { id: 'b', order: 7 }] },
  });

  assert.deepEqual(p.s1.inputs, []);
  assert.deepEqual(p.s1.runs, []);
  assert.deepEqual(p.s2.extras, []);
  assert.equal(p.s3.scenes.length, 2);
  assert.equal(p.s3.scenes[0].order, 1);
  assert.equal(p.s3.scenes[1].order, 7);
  assert.equal(p.s3.nextOrder, 8);
  assert.equal(store.sceneOrder(p, 'a'), 1);
  assert.equal(store.sceneOrder(p, 'b'), 7);
});

test('normalizeProject keeps old data usable when optional fields are missing', () => {
  const p = store.normalizeProject({ id: 'old', name: 'Old', createdAt: 1 });
  assert.deepEqual(p.s1.inputs, []);
  assert.deepEqual(p.s2.runs, []);
  assert.deepEqual(p.s3.scenes, []);
  assert.equal(p.stage, 1);
  assert.equal(p.maxStage, 1);
});

test('next scene number never goes backwards after deleting the last scene', () => {
  const p = store.normalizeProject({ id: 'p', s3: { scenes: [{ id: 'a', order: 1 }], nextOrder: 5 } });
  assert.equal(p.s3.nextOrder, 5);

  const q = store.normalizeProject({ id: 'q', s3: { scenes: [{ id: 'a', order: 3 }], nextOrder: 2 } });
  assert.equal(q.s3.nextOrder, 4);
});

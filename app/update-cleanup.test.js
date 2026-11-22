const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compareVersion, runCleanup } = require('./update-cleanup');

test('compareVersion so sánh đúng số phiên bản', () => {
  assert.equal(compareVersion('1.1.10', '1.1.9') > 0, true);
  assert.equal(compareVersion('1.1.5', '1.1.5'), 0);
  assert.equal(compareVersion('1.1.4', '2.0.0') < 0, true);
});

test('dọn installer vừa tải + bản cũ trong dist, giữ lại bản hiện tại', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cleanup-'));
  const dist = path.join(base, 'dist');
  fs.mkdirSync(dist);
  const oldOnes = ['Flow Lookbook Setup 1.0.0.exe', 'Flow Lookbook Setup 1.1.4.exe'];
  const currentOne = 'Flow Lookbook Setup 1.1.5.exe';
  const unrelated = 'other-file.exe';
  for (const name of [...oldOnes, currentOne, unrelated]) fs.writeFileSync(path.join(dist, name), 'x');

  const downloaded = path.join(base, 'Downloads', 'Flow Lookbook Setup.exe');
  fs.mkdirSync(path.dirname(downloaded), { recursive: true });
  fs.writeFileSync(downloaded, 'x');

  const logs = [];
  const res = runCleanup({ fromVersion: '1.1.4', installer: downloaded, sourceRoot: base }, '1.1.5', (m) => logs.push(m));

  assert.equal(res.deleted.length, 3, '2 bản cũ trong dist + 1 file vừa tải');
  assert.equal(fs.existsSync(downloaded), false);
  for (const name of oldOnes) assert.equal(fs.existsSync(path.join(dist, name)), false);
  assert.equal(fs.existsSync(path.join(dist, currentOne)), true, 'phải giữ installer bản hiện tại');
  assert.equal(fs.existsSync(path.join(dist, unrelated)), true, 'không xóa file lạ');
  assert.ok(logs.some((l) => l.includes('cleanup done')));
  fs.rmSync(base, { recursive: true, force: true });
});

test('không dọn nếu phiên bản không tăng hoặc người dùng đã tắt', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cleanup-skip-'));
  const installer = path.join(base, 'Flow Lookbook Setup.exe');
  fs.writeFileSync(installer, 'x');
  const job = { fromVersion: '1.1.5', installer, sourceRoot: '' };

  assert.equal(runCleanup(job, '1.1.5').deleted.length, 0);
  assert.equal(runCleanup(job, '1.1.4').deleted.length, 0);
  assert.equal(runCleanup({ ...job, fromVersion: '1.1.4' }, '1.1.5', () => {}, { enabled: false }).deleted.length, 0);
  assert.equal(fs.existsSync(installer), true);
  fs.rmSync(base, { recursive: true, force: true });
});

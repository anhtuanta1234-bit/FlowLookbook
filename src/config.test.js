const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configFile = path.join(__dirname, 'config.js');

// Chạy trong tiến trình riêng vì config chốt đường dẫn lúc require.
function readConfig(env, action = '') {
  const script = `
    const cfg = require(${JSON.stringify(configFile)});
    ${action}
    process.stdout.write(JSON.stringify({
      outputRoot: cfg.get().outputRoot,
      fixedOutputRoot: cfg.fixedOutputRoot,
      hasSavedOutputRoot: cfg.hasSavedOutputRoot(),
      removeLogoEnabled: cfg.get().removeLogoEnabled,
      logoRemoveMask: cfg.get().logoRemoveMask,
    }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, ...env }, encoding: 'utf8',
  }));
}

test('máy có đường dẫn cố định: ảnh luôn vào FLOW_OUTPUT_ROOT và không đổi được', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-config-fixed-'));
  const out = path.join(base, 'output');
  const other = path.join(base, 'khac');
  const env = { FLOW_DATA_DIR: path.join(base, 'data'), FLOW_OUTPUT_ROOT: out };
  try {
    const first = readConfig(env);
    assert.equal(first.fixedOutputRoot, out);
    assert.equal(first.outputRoot, out);
    assert.equal(first.hasSavedOutputRoot, true);

    const afterSave = readConfig(env, `cfg.set({ outputRoot: ${JSON.stringify(other)} });`);
    assert.equal(afterSave.outputRoot, out, 'set() phải bỏ qua thư mục khác trên máy này');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('xóa logo tắt mặc định và vùng mask được giới hạn trong khung ảnh', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-config-logo-'));
  const env = { FLOW_DATA_DIR: path.join(base, 'data'), FLOW_DISABLE_FIXED_OUTPUT: '1' };
  try {
    const fresh = readConfig(env);
    assert.equal(fresh.removeLogoEnabled, false);
    assert.deepEqual(fresh.logoRemoveMask, { xPct: 84.375, yPct: 91.352, wPct: 6.12, hPct: 3.343 });

    const action = `cfg.set({ removeLogoEnabled: true, logoRemoveMask: { xPct: 120, yPct: -5, wPct: 50, hPct: 30 } });`;
    const saved = readConfig(env, action);
    assert.equal(saved.removeLogoEnabled, true);
    assert.equal(saved.logoRemoveMask.xPct, 99);
    assert.equal(saved.logoRemoveMask.yPct, 0);
    assert.ok(saved.logoRemoveMask.wPct <= 100 - saved.logoRemoveMask.xPct);
    assert.ok(saved.logoRemoveMask.hPct <= 100 - saved.logoRemoveMask.yPct);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('máy khác chưa chọn thư mục thì báo là chưa chọn; sau khi lưu thì không báo nữa', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-config-other-'));
  const data = path.join(base, 'data');
  const env = { FLOW_DATA_DIR: data, FLOW_OUTPUT_ROOT: '', FLOW_DISABLE_FIXED_OUTPUT: '1' };
  try {
    const fresh = readConfig(env);
    assert.equal(fresh.fixedOutputRoot, '');
    assert.equal(fresh.hasSavedOutputRoot, false);

    const chosen = path.join(base, 'anh-cua-toi');
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({ outputRoot: chosen }));

    const saved = readConfig(env);
    assert.equal(saved.hasSavedOutputRoot, true);
    assert.equal(saved.outputRoot, chosen);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

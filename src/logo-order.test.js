const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sceneNo, sceneFileBase, logoSceneDone, nextLogoScene } = require('./logo-order');

function projectWithCleanFirstThree(dir) {
  const clean = (n) => {
    const f = path.join(dir, `${n}-sach.png`);
    fs.writeFileSync(f, 'x');
    return f;
  };
  const c1 = clean(1), c2 = clean(2), c3 = clean(3);
  // Cố tình đảo thứ tự mảng để chứng minh tool đi theo số order, không theo mảng.
  return {
    name: 'Do an A',
    s3: {
      scenes: [
        { id: 's4', order: 4, chosen: { status: 'saved', target: 'goc4.png' }, logoRemoval: { status: 'quota_blocked', cleanFile: '' } },
        { id: 's2', order: 2, chosen: { status: 'saved', target: 'goc2.png' }, logoRemoval: { status: 'approved', cleanFile: c2 } },
        { id: 's1', order: 1, chosen: { status: 'saved', target: 'goc1.png' }, logoRemoval: { status: 'approved', cleanFile: c1 } },
        { id: 's3', order: 3, chosen: { status: 'saved', target: 'goc3.png' }, logoRemoval: { status: 'waiting_ok', cleanFile: c3 } },
      ],
    },
  };
}

test('Bước 3 và ảnh sạch Bước 4 dùng chung tên có số 01, 02, 03, 04', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flb-order-'));
  try {
    const p = projectWithCleanFirstThree(dir);
    assert.equal(sceneNo(p, 's1'), 1);
    assert.equal(sceneNo(p, 's4'), 4);
    assert.equal(sceneFileBase(p, 's1'), '01-Do an A');
    assert.equal(sceneFileBase(p, 's4'), '04-Do an A');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('có ảnh sạch trên đĩa là coi như ảnh đó đã xong, kể cả trạng thái cũ còn sót', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flb-order-done-'));
  try {
    const p = projectWithCleanFirstThree(dir);
    assert.equal(logoSceneDone(p, p.s3.scenes.find((s) => s.id === 's1')), true);
    assert.equal(logoSceneDone(p, p.s3.scenes.find((s) => s.id === 's2')), true);
    // Ảnh 3 đang waiting_ok nhưng đã có file sạch → vẫn coi là xong, không làm lại.
    assert.equal(logoSceneDone(p, p.s3.scenes.find((s) => s.id === 's3')), true);
    assert.equal(logoSceneDone(p, p.s3.scenes.find((s) => s.id === 's4')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('4 ảnh, đã xong 1-2-3 thì đổi Gmail chỉ lấy đúng ảnh 4, không làm lại ảnh cũ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flb-order-next-'));
  try {
    const p = projectWithCleanFirstThree(dir);
    assert.equal(nextLogoScene(p)?.id, 's4');
    assert.equal(nextLogoScene(p, true)?.id, 's4');

    // Giả sử ảnh 4 cũng đã xong: hết ảnh cần làm.
    p.s3.scenes.find((s) => s.id === 's4').logoRemoval.status = 'approved';
    assert.equal(nextLogoScene(p), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('đổi Gmail lúc ảnh 3 còn chờ Ổn: bỏ qua ảnh đó, vẫn lấy ảnh 4', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flb-order-active-'));
  try {
    const p = projectWithCleanFirstThree(dir);
    // Ảnh 3 mất file sạch và còn chờ bấm Ổn: không được tạo lại, ảnh 4 vẫn là ảnh kế.
    const s3 = p.s3.scenes.find((s) => s.id === 's3');
    s3.logoRemoval.cleanFile = '';
    s3.logoRemoval.status = 'waiting_ok';
    assert.equal(nextLogoScene(p, true)?.id, 's4');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

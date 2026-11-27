const test = require('node:test');
const assert = require('node:assert/strict');
const { bump } = require('./version');

test('phiên bản tiếp theo sau 1.1.48 là 1.2.1, không phải 1.1.49', () => {
  assert.equal(bump('1.1.48'), '1.2.1');
});

test('mỗi nhánh chỉ có 10 phiên bản: .1 đến .10 rồi sang minor kế tiếp, patch về .1', () => {
  assert.equal(bump('1.2.1'), '1.2.2');
  assert.equal(bump('1.2.8'), '1.2.9');
  assert.equal(bump('1.2.9'), '1.2.10');
  assert.equal(bump('1.2.10'), '1.3.1');
  assert.equal(bump('1.9.10'), '1.10.1');
  assert.equal(bump('1.10.10'), '1.11.1');
});

test('không bao giờ tạo ra patch lớn hơn 10', () => {
  let prev = '1.2.1';
  for (let i = 0; i < 30; i++) {
    prev = bump(prev);
    const patch = Number(prev.split('.')[2]);
    assert.ok(patch >= 1 && patch <= 10, `patch phải nằm trong 1..10, nhận ${prev}`);
  }
});

test('bump tay --minor / --major cũng giữ quy ước patch bắt đầu từ 1', () => {
  assert.equal(bump('1.2.5', 'minor'), '1.3.1');
  assert.equal(bump('1.2.10', 'minor'), '1.3.1');
  assert.equal(bump('1.2.5', 'major'), '2.1.1');
  assert.throws(() => bump('1.2'), /Version không hợp lệ/);
});

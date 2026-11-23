const test = require('node:test');
const assert = require('node:assert/strict');
const { templates } = require('./store');

// Câu phong cách chụp 35mm/film grain và danh sách "Tránh: da nhựa..." đã bị bỏ
// ở v1.1.18 nhưng chỉ ở bước 1 → user vẫn thấy ở bước 2, 3. Khoá lại ở đây cho mọi bước.
const REMOVED = [
  'Phong cách ảnh chụp đời thực',
  'shot on 35mm',
  'slight film grain',
  'Tránh: da nhựa',
  'da nhựa, CGI',
];

test('mẫu prompt mặc định của mọi bước không chứa đoạn phong cách 35mm / Tránh da nhựa', () => {
  const all = templates();
  const steps = Object.keys(all);
  assert.ok(steps.length >= 3, 'phải có đủ các bước 1, 2, 3');

  for (const step of steps) {
    const prompt = String(all[step]?.vi ?? '');
    for (const phrase of REMOVED) {
      assert.ok(!prompt.toLowerCase().includes(phrase.toLowerCase()),
        `${step}.vi không được chứa "${phrase}"`);
    }
  }
});

test('máy cài mới có ô prompt trống; prompt riêng nằm ở data/templates.json', () => {
  const all = templates();
  for (const step of Object.keys(all)) assert.equal(all[step].vi, '', `${step}.vi phải trống`);
});

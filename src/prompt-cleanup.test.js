const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { cleanPrompt, cleanPromptsIn } = require('./prompt-cleanup');

const GONE = /shot on 35mm|slight film grain|phong cách ảnh chụp đời thực|real-life photo style|da nhựa|plastic skin|render 3d/i;

test('dọn sạch đoạn 35mm trong prompt tiếng Việt của dự án cũ, giữ phần yêu cầu', () => {
  const old = 'Yêu cầu: tách toàn bộ da thịt ra khỏi trang phục, trang phục đặt trên nền trắng.\n\n'
    + 'Phong cách ảnh chụp đời thực: shot on 35mm lens, f/2.8, ánh sáng tự nhiên từ cửa sổ, slight film grain, không HDR. Giữ nguyên texture vải và chi tiết.\n\n'
    + 'Tránh: da nhựa, CGI, render 3D, hiệu ứng AI, mờ nhòe, biến dạng trang phục.';
  const out = cleanPrompt(old);
  assert.ok(!GONE.test(out), 'không được còn đoạn phong cách/Tránh: ' + out);
  assert.match(out, /Yêu cầu: tách toàn bộ da thịt/);
  assert.equal(out.trim(), 'Yêu cầu: tách toàn bộ da thịt ra khỏi trang phục, trang phục đặt trên nền trắng.');
});

test('dọn cả câu 35mm nối cuối đoạn giữ khuôn mặt (bước 2/3)', () => {
  const old = 'Yêu cầu giữ nguyên 100% khuôn mặt nhân vật ảnh 1: không thay đổi khuôn mặt. '
    + 'Ánh sáng: match lighting của ảnh tham chiếu. Shot on 35mm lens, f/2.8, slight film grain.';
  const out = cleanPrompt(old);
  assert.ok(!GONE.test(out), out);
  assert.match(out, /giữ nguyên 100% khuôn mặt/);
  assert.match(out, /match lighting/);
});

test('dọn bản tiếng Anh (Real-life photo style / Avoid: plastic skin)', () => {
  const old = 'Requirements: keep 100% the same face.\n\nReal-life photo style: shot on 35mm lens, f/2.8, natural light, slight film grain.\n\nAvoid: plastic skin, CGI, render 3D.';
  const out = cleanPrompt(old);
  assert.ok(!GONE.test(out), out);
  assert.match(out, /keep 100% the same face/);
});

test('không đụng vào prompt sạch', () => {
  const clean = 'Yêu cầu: giữ nguyên 100% khuôn mặt. Ánh sáng: match lighting.';
  assert.equal(cleanPrompt(clean), clean);
});

const NEW_STYLE_VI = 'yêu cầu, nhân vật ảnh 1 mặc trang phục ảnh 2(cam kết giữ nguyên 100%  toàn bộ chi tiết trang phục ảnh 2), chụp toàn thân,\n\n'
  + 'Phong cách ảnh chụp đời thực cực kỳ tự nhiên như một KOL/KOC ngoài đời đang được chụp ngẫu hứng máy ảnh thật.Ảnh tông màu sáng, da người giữ nguyên texture tự nhiên, không làm mịn quá mức, không bóng da nhựa, không nét giả AI. Giữ tổng thể mềm mại và chân thật.';

test('giữ nguyên đoạn phong cách KOL/KOC mới (không nhầm với bản 35mm cũ)', () => {
  assert.equal(cleanPrompt(NEW_STYLE_VI), NEW_STYLE_VI);
});

test('giữ cả bản dịch tiếng Anh của phong cách KOL/KOC', () => {
  const en = 'Requirements: image 1 character wears image 2 outfit, full body shot,\n\n'
    + 'The real-life photo style is extremely natural like a real-life KOL/KOC being spontaneously photographed with a real camera. Skin keeps its natural texture, no plastic skin shine, no fake AI sharpness.';
  assert.equal(cleanPrompt(en), en);
});

test('cleanPromptsIn đi qua mọi trường của project, kể cả runs và scenes', () => {
  const proj = {
    name: 'Dự án A',
    s1: { promptVi: 'Yêu cầu A. Shot on 35mm lens, slight film grain.', promptEn: 'Keep face. Real-life photo style: shot on 35mm.', runs: [{ promptEn: 'Avoid: plastic skin, CGI.' }] },
    s2: { promptVi: 'Yêu cầu B.' },
    s3: { scenes: [{ promptVi: 'Yêu cầu C.\n\nTránh: da nhựa, CGI.' }] },
  };
  const out = cleanPromptsIn(proj);
  assert.equal(out.name, 'Dự án A');
  assert.ok(!GONE.test(JSON.stringify(out)), JSON.stringify(out));
  assert.match(out.s1.promptVi, /Yêu cầu A/);
  assert.match(out.s3.scenes[0].promptVi, /Yêu cầu C/);
});

test('migrateProjects ghi đè project.json cũ và chạy lại thì không đổi gì', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-migrate-'));
  const data = path.join(dir, 'data');
  const old = 'Yêu cầu giữ khuôn mặt.\n\nPhong cách ảnh chụp đời thực: shot on 35mm, slight film grain.\n\nTránh: da nhựa, CGI.';
  const id = 'oldproj';
  fs.mkdirSync(path.join(data, 'projects', id), { recursive: true });
  const file = path.join(data, 'projects', id, 'project.json');
  fs.writeFileSync(file, JSON.stringify({ id, name: 'Cũ', s1: { promptVi: old }, s2: {}, s3: {} }, null, 2));

  // store.js đọc dataDir lúc require — set env trước khi require trong process test này.
  process.env.FLOW_DATA_DIR = data;
  const { migrateProjects } = require('./store');
  const n = migrateProjects();
  assert.equal(n, 1, 'phải migrate đúng 1 dự án');
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(!GONE.test(after.s1.promptVi), after.s1.promptVi);
  assert.match(after.s1.promptVi, /Yêu cầu giữ khuôn mặt/);
  assert.equal(after.name, 'Cũ', 'không được mất dữ liệu khác');
  assert.equal(migrateProjects(), 0, 'chạy lần 2 phải không đổi gì');

  fs.rmSync(dir, { recursive: true, force: true });
});

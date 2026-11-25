const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

test('xóa dự án cũng xóa luôn thư mục ảnh trong output (bulk và đơn lẻ)', () => {
  assert.match(src, /function removeProjectOutput\(p\)[\s\S]*?fs\.rmSync\(dir, \{ recursive: true, force: true \}\)/);
  const bulk = slice("app.post('/api/projects/bulk-delete'", "app.get('/api/projects/delete-capabilities'");
  assert.match(bulk, /removeProjectOutput\(p\)/, 'bulk-delete phải xóa thư mục kết quả trước khi remove()');
  const single = slice("app.delete('/api/projects/:id'", '// tải ảnh lên dự án');
  assert.match(single, /removeProjectOutput\(p\)/, 'xóa 1 dự án cũng phải xóa thư mục kết quả');
  assert.match(src, /logoRemoveQueue\[i\]\.projectId === projectId/, 'xóa dự án phải dọn cả hàng đợi xóa logo');
});

test('chọn từng ảnh 2K không tự động sang Bước 4', () => {
  const save2k = slice('async function save2k(', "app.post('/api/projects/:id/retry-save'");
  assert.ok(!/ensureLogoRemovalState/.test(save2k), 'save2k không được tạo trạng thái xóa logo');
  assert.ok(!/queueLogoRemoval/.test(save2k), 'save2k không được đưa vào hàng đợi xóa logo');
});

test('tải hết ảnh về & dọn dẹp xong mới đánh dấu Bước 3 xong và khởi động Bước 4', () => {
  const cleanAll = slice("app.post('/api/projects/clean-all'", 'function projectHasActiveWork');
  assert.match(cleanAll, /fs\.rmSync\(tam, \{ recursive: true, force: true \}\)/);
  assert.match(cleanAll, /p\.cleaned = Date\.now\(\)/);
  assert.match(cleanAll, /ensureLogoRemovalState\(p\)/);
  assert.match(cleanAll, /queueLogoRemoval\(id\)/, 'phải đưa vào hàng đợi sau khi đã dọn xong');

  const finish = slice("app.post('/api/projects/:id/finish'", '// xem ảnh 2K đã lưu');
  assert.match(finish, /p\.cleaned = Date\.now\(\)/);
  assert.match(finish, /ensureLogoRemovalState\(p\)/);
});

test('Bước 4 bị khóa khi chưa tải hết ảnh, kể cả bấm làm lại / tiếp tục', () => {
  assert.match(src, /function shouldStartLogoRemoval\(p\)[\s\S]*?step3ReadyForLogo\(p\)/);
  assert.match(src, /if \(!p \|\| !shouldStartLogoRemoval\(p\)\) return null;/, 'prepare phải dùng chung cổng kiểm tra');
  const retry = slice("app.post('/api/projects/:id/logo-remove/retry'", "app.post('/api/projects/:id/logo-remove/skip'");
  assert.match(retry, /if \(!shouldStartLogoRemoval\(p\)\)/);
  assert.match(retry, /Hãy hoàn tất Bước 3/);
  const resume = slice("app.post('/api/projects/:id/logo-remove/resume'", 'app.post(\'/api/projects/:id/open-logo-output\'');
  assert.match(resume, /if \(!shouldStartLogoRemoval\(p\)\) return false;/);
});

test('hết lượt Firefly rồi đổi Gmail: tiếp tục từ ảnh bị chặn, không làm lại ảnh đã xong', () => {
  const prepare = slice('async function prepareLogoRemoval(', 'async function downloadLogoRemoval(');
  assert.match(prepare, /sc\.logoRemoval\.generated = false/, 'mỗi lần tạo mới phải reset mốc ảnh đã tạo');
  assert.match(prepare, /sc\.logoRemoval\.generated = true/, 'tạo xong thì đánh dấu có ảnh trên Firefly');

  const download = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(download, /keepTabOnQuota: true/, 'tải bị hết lượt thì giữ tab để tải lại');
  assert.match(download, /if \(quota\) sc\.logoRemoval\.generated = true/, 'ảnh đã tạo thì vẫn giữ mốc');

  const resume = slice("app.post('/api/projects/:id/logo-remove/resume'", 'app.post(\'/api/projects/:id/open-logo-output\'');
  assert.match(resume, /if \(lr\?\.status !== 'quota_blocked'\) continue/, 'không đụng ảnh đã xong / đang chờ Ổn');
  assert.match(resume, /logoResumeStatus\(lr, firefly\.hasSceneTab\(req\.params\.id, sc\.id\)\)/, 'quyết định tải lại hay tạo tiếp theo tab còn/mất');
  assert.match(resume, /lr\.status = next/);
});

test('đổi hoặc bỏ chọn ảnh Bước 3 thì khóa lại Bước 4', () => {
  assert.match(src, /Đổi ảnh Bước 3[\s\S]{0,160}delete p\.cleaned;/, 'đổi ảnh Bước 3 phải xóa mốc đã tải');
  assert.match(src, /delete p\.cleaned; \/\/ bỏ chọn ảnh Bước 3/);
  assert.match(src, /delete p\.cleaned; \/\/ ảnh 2K sắp đổi/);
});

test('Bước 4 là bước thật: chỉ mở sau dọn xong, tự chuyển giao diện và ghi nhật ký', () => {
  const patch = slice("app.patch('/api/projects/:id',", 'const pick =');
  assert.match(patch, /if \(b\.stage === 4\)/, 'PATCH phải nhận bước 4');
  assert.match(patch, /if \(!step3ReadyForLogo\(p\)\) return \{ code: 400/, 'chưa dọn xong thì không mở Bước 4');
  assert.match(patch, /p\.stage = 4/);

  for (const from of ["app.post('/api/projects/clean-all'", "app.post('/api/projects/:id/finish'"]) {
    const to = from.includes('clean-all') ? 'function projectHasActiveWork' : '// xem ảnh 2K đã lưu';
    const block = slice(from, to);
    assert.match(block, /p\.stage = 4/, 'dọn xong phải chuyển hẳn sang Bước 4');
    assert.match(block, /p\.autoGo = \{ to: 4/, 'phát tín hiệu để giao diện tự sang Bước 4');
  }

  assert.match(src, /appendLogoPhase\(sc\.logoRemoval, note\)/, 'mỗi phase Firefly phải lưu lại cho giao diện Bước 4');
  assert.match(src, /appendLogoPhase\(sc\.logoRemoval, sc\.logoRemoval\.note\)/, 'mốc chuyển trạng thái cũng phải hiện trong nhật ký');
});

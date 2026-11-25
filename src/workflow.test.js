const test = require('node:test');
const assert = require('node:assert/strict');
const { completeHqStage, finishHqBatch, dropQueuedRuns, MAX_FLOW_REOPEN, shouldReopenFlow, flowReopenDelayMs, flowBlockedMessage, normalizeLogoRemoval, appendLogoPhase, step3ReadyForLogo, logoResumeStatus, allLogoRemovalDone, logoCleanupTargets } = require('./workflow');

test('nhật ký Bước 4 ghi từng thao tác Firefly và bỏ trùng liên tiếp', () => {
  const lr = { status: 'preparing' };
  appendLogoPhase(lr, 'Đang bấm công cụ Chấm sửa và xóa…');
  appendLogoPhase(lr, 'Đang bấm công cụ Chấm sửa và xóa…');
  appendLogoPhase(lr, 'Đang chỉnh cỡ cọ đủ phủ logo và tô vùng logo…');
  assert.equal(lr.phases.length, 2);
  assert.equal(lr.phases[0].note, 'Đang bấm công cụ Chấm sửa và xóa…');
  assert.ok(lr.phases[0].at > 0);
  assert.equal(normalizeLogoRemoval(lr).phases.length, 2);
});

test('automatic HQ completion persists the next stage and event together', () => {
  const project = { stage: 2, maxStage: 2 };

  assert.equal(completeHqStage(project, 2, true, 1234), true);
  assert.deepEqual(project, { stage: 3, maxStage: 3, autoGo: { to: 3, at: 1234 } });
});

test('manual HQ completion unlocks the next stage without advancing it', () => {
  const project = { stage: 2, maxStage: 2 };

  assert.equal(completeHqStage(project, 2, false, 1234), false);
  assert.deepEqual(project, { stage: 2, maxStage: 3 });
});

test('completing an older stage never moves the project backwards', () => {
  const project = { stage: 3, maxStage: 3 };

  assert.equal(completeHqStage(project, 1, true, 1234), false);
  assert.deepEqual(project, { stage: 3, maxStage: 3 });
});

test('reselecting an image on the previous step still points the UI forward', () => {
  const project = { stage: 2, maxStage: 2 };

  assert.equal(completeHqStage(project, 1, true, 1234), true);
  assert.deepEqual(project, { stage: 2, maxStage: 2, autoGo: { to: 2, at: 1234 } });
});

test('a pause after every 2K download succeeds clears any stale error', () => {
  const run = {
    upgrading: true,
    upgradeError: 'Đang tạm hoãn việc lấy 2K.',
    upgradeProgress: { done: 4, total: 4 },
    preview2kPending: ['old-ref'],
  };

  assert.equal(finishHqBatch(run, { paused: true, at: 5678 }), null);
  assert.equal(run.upgrading, false);
  assert.deepEqual(run.preview2kPending, []);
  assert.equal(run.upgradeError, undefined);
  assert.equal(run.upgradeProgress, undefined);
  assert.equal(run.preview2kDoneAt, 5678);
});

test('a pause keeps only failed 2K references pending for resume', () => {
  const run = {};

  assert.equal(finishHqBatch(run, { failedRefs: ['a', 'a', 'b'], paused: true }), null);
  assert.deepEqual(run.preview2kPending, ['a', 'b']);
  assert.equal(run.upgrading, false);
  assert.match(run.upgradeError, /tạm hoãn/);
});

test('failed 2K references are retried and capped after two retries', () => {
  const run = {};

  assert.deepEqual(finishHqBatch(run, { failedRefs: ['a'], retryRound: 0 }), { refs: ['a'], round: 1 });
  assert.equal(run.upgrading, true);
  assert.equal(run.sharpRetryRound, 1);

  const exhausted = {};
  assert.equal(finishHqBatch(exhausted, { failedRefs: ['a'], retryRound: 2 }), null);
  assert.equal(exhausted.upgrading, false);
  assert.match(exhausted.upgradeError, /sau 3 đợt tự thử/);
});

test('Bước 4 chỉ sẵn sàng sau khi đã tải hết ảnh Bước 3, không phải vừa chọn ảnh', () => {
  const saved = { s3: { scenes: [{ chosen: { status: 'saved', target: '01.png' } }] } };

  assert.equal(step3ReadyForLogo(saved), false, 'chưa bấm tải hết thì chưa được xóa logo');
  assert.equal(step3ReadyForLogo({ ...saved, cleaned: Date.now() }), true);
  assert.equal(step3ReadyForLogo({ cleaned: Date.now(), s3: { scenes: [] } }), false);
  assert.equal(step3ReadyForLogo({ cleaned: Date.now(), s3: { scenes: [{ chosen: { status: 'saving', target: '01.png' } }] } }), false);
  assert.equal(step3ReadyForLogo({ cleaned: Date.now(), s3: { scenes: [{ chosen: { status: 'saved' } }] } }), false);
});

test('đổi Gmail xong chỉ tiếp tục ảnh bị chặn, không làm lại ảnh đã xong', () => {
  assert.equal(logoResumeStatus({ status: 'approved', generated: true }, true), null, 'ảnh đã xong không bao giờ vào lại hàng đợi');
  assert.equal(logoResumeStatus({ status: 'queued' }, true), null, 'ảnh đang chạy không bị đẩy lại');
  assert.equal(logoResumeStatus({ status: 'quota_blocked' }, true), 'queued', 'chưa tạo được thì tạo tiếp');
  assert.equal(logoResumeStatus({ status: 'quota_blocked', generated: true }, false), 'queued', 'mất tab thì phải tạo lại');
  assert.equal(logoResumeStatus({ status: 'quota_blocked', generated: true }, true), 'waiting_ok', 'đã tạo xong thì chỉ tải lại');
});

test('disconnect drops empty queued runs and keeps finished, failed, and in-flight runs', () => {
  const kept = dropQueuedRuns([
    { id: 'done', status: 'done', images: [{ file: 'a.jpg' }] },
    { id: 'error-with-image', status: 'error', images: [{ file: 'b.jpg' }] },
    { id: 'error-empty', status: 'error', images: [] },
    { id: 'queued', status: 'queued', images: [] },
    { id: 'running', status: 'running', images: [] },
  ]).map((run) => run.id);

  assert.deepEqual(kept, ['done', 'error-with-image', 'error-empty', 'running']);
});

test('an image without its Flow reference is reported instead of counted as complete', () => {
  const run = {};

  assert.equal(finishHqBatch(run, { failedWithoutRef: 1 }), null);
  assert.equal(run.preview2kDoneAt, undefined);
  assert.match(run.upgradeError, /thiếu liên kết Flow/);
});

test('Flow báo bất thường ở bước 3 thì mở lại Flow, tối đa 5 lần', () => {
  assert.equal(MAX_FLOW_REOPEN, 5);
  const blocked = (reopens) => shouldReopenFlow({ code: 'FLOW_BLOCKED', stage: 3, sceneId: 'sc1', reopens });
  assert.equal(blocked(0), true);
  assert.equal(blocked(4), true);
  assert.equal(blocked(5), false, 'hết 5 lần thì không mở lại nữa');
  assert.equal(shouldReopenFlow({ code: 'FLOW_BLOCKED', stage: 2, reopens: 0 }), false, 'bước 1/2 vẫn dừng toàn tool');
  assert.equal(shouldReopenFlow({ code: 'FLOW_BLOCKED', stage: 3, reopens: 0 }), false, 'không có cảnh thì không mở lại');
  assert.equal(shouldReopenFlow({ code: 'OTHER', stage: 3, sceneId: 'sc1', reopens: 0 }), false);
});

test('thông báo hết 5 lần đúng nội dung yêu cầu', () => {
  assert.equal(flowBlockedMessage(2), 'Cảnh 2 hiện không thực hiện được do lỗi Flow, hãy kiểm tra lại');
});

test('mở lại Flow bị chặn lặp thì giãn nhẹ chờ, lần đầu giữ nhanh', () => {
  assert.equal(flowReopenDelayMs(1), 2500);
  assert.equal(flowReopenDelayMs(2), 2500);
  assert.equal(flowReopenDelayMs(3), 4000);
  assert.equal(flowReopenDelayMs(4), 5500);
  assert.equal(flowReopenDelayMs(5), 7000);
});

test('logo removal normalize giữ trạng thái cũ an toàn', () => {
  assert.equal(normalizeLogoRemoval(null), null);
  assert.equal(normalizeLogoRemoval({ status: 'lạ', error: 5 }).status, 'queued');
  assert.equal(normalizeLogoRemoval({ status: 'approved', error: 5 }).error, '');
  assert.equal(normalizeLogoRemoval({ status: 'error', error: 'lỗi', note: 3, cleanFile: null, sourceTarget: 4 }).note, '');
});

test('xóa ảnh gốc chỉ khi mọi cảnh đã xong Bước 4', () => {
  const project = { s3: { scenes: [{ logoRemoval: { status: 'approved', cleanFile: 'a.png' } }, { logoRemoval: { status: 'waiting_ok' } }] } };
  assert.equal(allLogoRemovalDone(project), false);
  assert.deepEqual(logoCleanupTargets(project), []);

  project.s3.scenes[1].logoRemoval = { status: 'error' };
  assert.deepEqual(logoCleanupTargets(project), [], 'cảnh lỗi/quota thì giữ nguyên ảnh gốc');

  project.s3.scenes[1].logoRemoval = { status: 'skipped' };
  assert.equal(allLogoRemovalDone(project), true);
  assert.equal(logoCleanupTargets(project).length, 1);

  project.s3.scenes[1].logoRemoval = { status: 'approved', cleanFile: 'b.png' };
  assert.equal(logoCleanupTargets(project).length, 2);
});

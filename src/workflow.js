function completeHqStage(project, stage, autoOn, at = Date.now()) {
  const nextStage = stage + 1;
  const currentStage = project.stage || 1;
  project.maxStage = Math.max(project.maxStage || currentStage, nextStage);
  if (!autoOn) return false;
  // Bước đang hoàn tất đã nằm sau lưng bước hiện tại: không kéo giao diện lùi.
  if (nextStage < currentStage) return false;
  // Nếu project.stage đã đứng sẵn ở bước kế (người dùng quay lại bước cũ rồi chọn ảnh khác),
  // vẫn phát autoGo để giao diện đi tới, nhưng không ghi lùi project.stage.
  if (nextStage > currentStage) project.stage = nextStage;
  project.autoGo = { to: nextStage, at };
  return true;
}

function dropQueuedRuns(runs) {
  return (runs || []).filter((run) => !(run.status === 'queued' && !(run.images || []).length));
}

function finishHqBatch(run, { failedRefs = [], failedWithoutRef = 0, paused = false, retryRound = 0, at = Date.now() } = {}) {
  const refs = [...new Set(failedRefs.filter(Boolean))];
  run.preview2kPending = refs;

  if (refs.length && paused) {
    run.upgrading = false;
    run.upgradeError = 'Đang tạm hoãn việc lấy 2K vì Flow đã tạm dừng. Sẽ tự tiếp tục sau khi bạn bấm “Tiếp tục chạy”.';
    return null;
  }

  if (refs.length && retryRound < 2) {
    run.upgrading = true;
    run.sharpRetryRound = retryRound + 1;
    run.upgradeError = `Còn ${refs.length + failedWithoutRef} ảnh chưa lấy được bản 2K; tool sẽ tự thử lại.`;
    return { refs, round: retryRound + 1 };
  }

  run.upgrading = false;
  if (refs.length || failedWithoutRef) {
    run.upgradeError = failedWithoutRef && !refs.length
      ? `${failedWithoutRef} ảnh thiếu liên kết Flow nên không thể tự lấy bản 2K.`
      : `Một số ảnh chưa lấy được bản 2K sau ${retryRound + 1} đợt tự thử. Ảnh gốc vẫn được giữ nguyên.`;
    return null;
  }

  delete run.upgradeError;
  delete run.upgradeProgress;
  run.preview2kDoneAt = at;
  return null;
}

// Flow báo "hoạt động bất thường" ở bước 3: đóng tab cũ, mở Flow + dự án mới, tối đa 5 lần.
// Chỉ áp dụng cho từng cảnh; bước 1/2 vẫn dừng toàn tool như cũ để bảo vệ tài khoản.
const MAX_FLOW_REOPEN = 5;

function shouldReopenFlow({ code, stage, sceneId, reopens = 0 }) {
  return code === 'FLOW_BLOCKED' && stage === 3 && !!sceneId && reopens < MAX_FLOW_REOPEN;
}

// Giãn nhẹ khi bị chặn lặp lại nhiều lần; lần đầu vẫn nhanh để không chậm luồng bình thường.
function flowReopenDelayMs(reopens = 1) {
  if (reopens <= 2) return 2500;
  return 2500 + (reopens - 2) * 1500;
}

function flowBlockedMessage(sceneOrder) {
  return `Cảnh ${sceneOrder} hiện không thực hiện được do lỗi Flow, hãy kiểm tra lại`;
}

const LOGO_PENDING_STATUSES = ['queued', 'preparing', 'waiting_ok', 'downloading'];
const LOGO_DONE_STATUSES = ['approved', 'skipped'];
const LOGO_STATUSES = [...LOGO_PENDING_STATUSES, ...LOGO_DONE_STATUSES, 'error', 'quota_blocked'];

const LOGO_PHASE_LIMIT = 24;

// Nhật ký từng thao tác Firefly để giao diện Bước 4 nhìn thấy công đoạn đang chạy.
function appendLogoPhase(lr, note) {
  if (!lr || !note) return;
  if (!Array.isArray(lr.phases)) lr.phases = [];
  const text = String(note).replace(/\s+/g, ' ').trim();
  const last = lr.phases[lr.phases.length - 1];
  if (last && last.note === text) return;
  lr.phases.push({ note: text, at: Date.now() });
  if (lr.phases.length > LOGO_PHASE_LIMIT) lr.phases.splice(0, lr.phases.length - LOGO_PHASE_LIMIT);
}

function normalizeLogoRemoval(lr) {
  if (!lr || typeof lr !== 'object') return null;
  const known = LOGO_STATUSES.includes(lr.status);
  const status = known ? lr.status : 'queued';
  const str = (v) => (typeof v === 'string' ? v : '');
  const out = { ...lr, status, code: str(lr.code), error: str(lr.error), note: str(lr.note), cleanFile: str(lr.cleanFile), sourceTarget: str(lr.sourceTarget) };
  out.phases = Array.isArray(lr.phases) ? lr.phases.slice(-LOGO_PHASE_LIMIT) : [];
  // Trạng thái lạ (dữ liệu cũ/sửa tay) không được giữ cleanFile của ảnh khác.
  if (!known) out.cleanFile = '';
  return out;
}

function logoRemovalPending(scene) { return LOGO_PENDING_STATUSES.includes(scene?.logoRemoval?.status); }
function allLogoRemovalDone(project) {
  const scenes = project?.s3?.scenes || [];
  return scenes.some((s) => !!s.logoRemoval)
    && scenes.every((s) => !s.logoRemoval || LOGO_DONE_STATUSES.includes(s.logoRemoval.status));
}
function logoCleanupTargets(project) {
  const scenes = project?.s3?.scenes || [];
  if (!scenes.length || !allLogoRemovalDone(project)) return [];
  if (scenes.some((s) => s.logoRemoval?.status === 'error' || s.logoRemoval?.status === 'quota_blocked')) return [];
  return scenes.filter((s) => s.logoRemoval?.status === 'approved' && s.logoRemoval?.cleanFile);
}

// Bước 4 chỉ được bắt đầu sau khi Bước 3 hoàn tất HÀNH ĐỘNG CUỐI:
// toàn bộ ảnh đã chọn phải lưu xong 2K VÀ người dùng đã bấm “Tải hết ảnh về & Dọn dẹp”
// (p.cleaned là mốc đánh dấu đã tải/dọn xong; mỗi lần đổi ảnh Bước 3 đều xóa mốc này).
function step3ReadyForLogo(project) {
  const scenes = project?.s3?.scenes || [];
  return scenes.length > 0 && !!project?.cleaned
    && scenes.every((s) => s.chosen?.status === 'saved' && s.chosen?.target);
}

// Sau khi hết lượt Firefly và đổi Gmail: ảnh ĐÃ tạo xong (generated + còn tab) chỉ cần bấm Ổn
// để tải lại — không được tạo lại. Ảnh chưa tạo thì xếp hàng tạo tiếp. Cảnh đã xong
// (approved/skipped) trả null để không bao giờ đưa lại vào hàng đợi.
function logoResumeStatus(lr, hasSceneTab = false) {
  if (lr?.status !== 'quota_blocked') return null;
  return lr.generated && hasSceneTab ? 'waiting_ok' : 'queued';
}

module.exports = { completeHqStage, finishHqBatch, dropQueuedRuns, MAX_FLOW_REOPEN, shouldReopenFlow, flowReopenDelayMs, flowBlockedMessage, LOGO_PENDING_STATUSES, LOGO_DONE_STATUSES, LOGO_STATUSES, LOGO_PHASE_LIMIT, normalizeLogoRemoval, appendLogoPhase, logoRemovalPending, step3ReadyForLogo, logoResumeStatus, allLogoRemovalDone, logoCleanupTargets };

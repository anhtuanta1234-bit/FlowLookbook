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

module.exports = { completeHqStage, finishHqBatch, dropQueuedRuns };

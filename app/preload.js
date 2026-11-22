// Cầu nối an toàn giữa giao diện web và vỏ app Electron.
// Chỉ mở các hàm cần thiết: chọn thư mục và tải/cập nhật app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowBridge', {
  // Trả về đường dẫn thư mục người dùng chọn, hoặc null nếu bấm Hủy.
  pickFolder: (current) => ipcRenderer.invoke('flow:pick-folder', current),
  // Tải installer phiên bản mới về máy. tiến độ gửi qua onUpdateProgress.
  downloadUpdate: (url) => ipcRenderer.invoke('flow:download-update', url),
  // Khởi cài installer đã tải. Gọi ngay sau khi tải xong từ nút "Tải về và cập nhật".
  installUpdate: (file, version) => ipcRenderer.invoke('flow:install-update', file, version),
  onUpdateProgress: (cb) => ipcRenderer.on('flow:update-progress', (_e, percent) => cb(percent)),
  // App mới đọc marker này lúc khởi động để báo cập nhật thành công đúng tên phiên bản.
  consumeUpdateSuccess: () => ipcRenderer.invoke('flow:consume-update-success'),
  // Lỗi installer thật (exit≠0 / UAC) được helper ghi lại, báo ở lần mở app tiếp theo.
  consumeUpdateError: () => ipcRenderer.invoke('flow:consume-update-error'),
  // Gọi sau khi giao diện đếm ngược 3 giây để người dùng kịp đọc thông báo.
  quitForUpdate: () => ipcRenderer.invoke('flow:quit-for-update'),
});

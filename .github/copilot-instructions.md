# Flow Lookbook — hướng dẫn cho Copilot / AI agent

Sau khi sửa code:

1. Ghi nội dung thay đổi vào mục `## Unreleased` của `CHANGELOG.md` (sẽ thành thông báo bản mới trên app).
2. Chạy `node --check` + `node --test` (phải pass).
3. Hỏi người dùng: **“Đưa phiên bản mới này lên Git/GitHub nhé?”**
4. Nếu đồng ý, chạy duy nhất:
   ```powershell
   & "C:\Program Files\nodejs\npm.cmd" run release -- --yes
   ```
   Script tự tăng version, cập nhật `version.json`, build, commit/push, tạo Release và upload installer.
   Không sửa `version.json` bằng tay, không làm Release trên web bằng tay.
5. Token GitHub đã lưu mã hoá sẵn; không cần hỏi lại.

App tự báo bản mới kèm ghi chú, tự tải/cài/tự mở lại; shortcut giữ nguyên. Không đụng vào dữ liệu người dùng trong `data/`.

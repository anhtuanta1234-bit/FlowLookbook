# CLAUDE.md — Flow Lookbook

> Bản sao của `AGENTS.md`. Nếu sửa nội dung này, hãy giữ hai file đồng bộ.

Sau khi sửa code, luôn:

1. Thêm ghi chú vào mục `## Unreleased` trong `CHANGELOG.md`.
2. Chạy `node --check` cho các file chính + `node --test` (phải pass).
3. Hỏi người dùng: **“Đưa phiên bản mới này lên Git/GitHub nhé?”**
4. Nếu đồng ý, chạy duy nhất:
   ```powershell
   & "C:\Program Files\nodejs\npm.cmd" run release -- --yes
   ```
   Không vào GitHub làm tay, không sửa `version.json` bằng tay.
5. Token GitHub đã lưu mã hoá sẵn; không cần hỏi lại.

App tự cập nhật: tự báo bản mới kèm `notes`, tự tải, tự cài im lặng, tự mở lại, shortcut không cần làm lại. Dữ liệu người dùng trong `data/` không được đụng vào.

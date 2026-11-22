# AGENTS.md — Flow Lookbook

File này dành cho **bất kỳ AI / agent nào mở thư mục này**. Hãy đọc và làm theo.

## Quy tắc bắt buộc sau khi sửa code

1. **Ghi nội dung thay đổi** vào mục `## Unreleased` của `CHANGELOG.md`.
   - Mỗi dòng là một câu ngắn: sửa lỗi gì / thêm tính năng gì.
   - Ví dụ:
     ```md
     ## Unreleased
     - Sửa lỗi không bấm được nút Cài đặt.
     - Thêm chặn trùng tên sản phẩm.
     ```
   - Đây chính là nội dung sẽ hiện trong hộp thoại thông báo bản mới trên app.

2. **Chạy kiểm tra:**
   ```powershell
   node --check server.js
   node --check public\app.js
   node --check app\main.js
   node --test
   ```
   Phải `pass` hết (hiện tại 26/26).

3. **Hỏi người dùng đúng câu này:**
   > Đưa phiên bản mới này lên Git/GitHub nhé?

4. **Nếu người dùng đồng ý**, chạy **duy nhất 1 lệnh**:
   ```powershell
   & "C:\Program Files\nodejs\npm.cmd" run release -- --yes
   ```
   Lệnh này tự động làm toàn bộ: tăng version → đọc `CHANGELOG.md` → cập nhật `version.json` → build installer → commit + push source → tạo GitHub Release → upload file cài đặt → xong.

   **KHÔNG** làm các việc sau bằng tay:
   - Không sửa `version.json` bằng tay.
   - Không vào GitHub tạo Release / kéo thả file.
   - Không tự đặt tag, không tự viết release notes trên web.

5. **Nếu người dùng từ chối**, chỉ cần giữ nguyên các dòng trong `## Unreleased`, chờ lần sau.

## Token GitHub

Token đã được lưu mã hoá tại:
```
%APPDATA%\Flow Lookbook\github-token.dat
```
(DPAPI — chỉ user hiện tại đọc được, nằm ngoài repo, đã nằm trong `.gitignore`.)

Agent **không cần** hỏi lại token. Nếu file này mất, bảo người dùng chạy 1 lần:
```powershell
& "C:\Program Files\nodejs\npm.cmd" run auth:github
```

## Cơ chế tự cập nhật (đã có sẵn, đừng sửa khi không cần)

- `server.js` → `UPDATE_MANIFEST_URL` trỏ tới
  `https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json`
- App tự kiểm tra lúc mở, hiện `version` + `notes`, nút **“Tải về và cập nhật”**.
- Electron tải installer → đóng app → cài im lặng `/S` → **tự mở lại**. Shortcut Desktop/Start Menu giữ nguyên.
- Dữ liệu người dùng nằm ở `%APPDATA%\Flow Lookbook\data` — **không xoá/sửa** khi release.

## Các quy tắc an toàn khác

- Không chạy lượt tạo ảnh Flow tính phí khi chưa được yêu cầu.
- Không tự đóng/mở app của người dùng trong lúc kiểm tra — hãy báo để họ tự làm.
- Sau khi release xong, báo người dùng link Release + nhắc app trên mọi máy sẽ tự hiện thông báo.

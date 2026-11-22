# Flow Lookbook — hướng dẫn nhanh

Tool chạy trên máy bạn (localhost), kết nối với Google Flow và **chạy ngầm** (cửa sổ Chrome thu nhỏ ở nền) — bạn xem kết quả trực tiếp ngay trong tool. Miễn phí, không cần máy chủ.

## Cài lần đầu
1. Cần có **Node.js** (bản 20 trở lên) và **Google Chrome**.
2. Bấm đúp `start.bat`. Lần đầu tool tự cài thư viện (`npm install`), sau đó mở trang `http://localhost:4177`.
3. Bấm **Đăng nhập Flow** (góc trên bên phải). Một cửa sổ Chrome hiện ra → đăng nhập tài khoản Google dùng cho Flow (chỉ cần làm 1 lần, tool nhớ đăng nhập). Khi chấm trạng thái chuyển sang **“Flow: đã kết nối · chạy nền”**, cửa sổ tự thu nhỏ và từ đó tool chạy ngầm. Cần xem cửa sổ Flow thì bấm **Xem cửa sổ Flow**; lượt chạy sau cửa sổ tự ẩn lại.
4. Prompt tiếng Việt tự dịch sang tiếng Anh bằng Google Dịch (không cần khóa, không cần cài gì). Bạn sửa tay ô tiếng Anh được.
5. **Thư viện KOC** → thêm ảnh mặt KOC dùng xuyên suốt.

## Quy trình mỗi sản phẩm
1. Tạo sản phẩm (tên này cũng là tên thư mục ảnh kết quả).
2. **Bước 1 – Tách trang phục**: dán/kéo ảnh sản phẩm (có khung **cắt sát**), kiểm tra prompt, bấm chạy → ra 4 ảnh → **Chọn ảnh này**.
3. **Bước 2 – Ghép KOC**: chọn KOC, (tùy chọn) thêm ảnh túi/giày, chỉnh prompt, chạy → chọn ảnh → **Cắt sát** nếu cần.
4. **Bước 3 – Ghép cảnh thật**: thêm nhiều ảnh cảnh người thật cùng lúc, một prompt chung, **Chạy tất cả cảnh**. Mỗi cảnh ra 4 ảnh; bấm chọn ảnh đẹp (hoặc “Làm lại cảnh này”). Ảnh **2K** tự lưu vào `output\<tên sản phẩm>\`.

**Ảnh xem trước nét:** sau khi Flow tạo ảnh, tool tự tải bản 2K về và thay ảnh xem trước ở nền; không cần bấm nút lấy nét. Với ảnh dọc 9:16, bản 2K thường là **1536×2752 px**. Nếu Flow tạm thời chưa trả được bản 2K, tool tự thử lại tối đa hai đợt nữa; ảnh hiện có vẫn được giữ nguyên trong lúc chờ. Bấm ảnh rồi chọn **1:1** để xem từng điểm ảnh thật.

**Ảnh nét (2K):** khi bạn chọn một ảnh ở bước 1 hoặc 2, tool tự lấy **bản 2K nét** của ảnh đó ở nền (khoảng 15–20 giây, phần lớn là thời gian Flow nâng ảnh lên 2K). Bạn cứ sang bước tiếp và bấm chạy, lượt chạy sẽ tự đợi bản 2K rồi mới gửi đi, để ảnh đầu vào không bị mờ dần. Trong lúc bản 2K đang lấy, nút **Cắt** của ảnh đã chọn tạm khóa (để bạn cắt trên ảnh nét). Nếu không lấy được 2K, tool báo rõ lý do và nút đi tiếp ghi **“Vẫn sang bước … (ảnh 1K)”** để bạn biết bước sau dùng ảnh 1K. Nút **Nhỏ / Vừa / Lớn** ở khu kết quả đổi cỡ ảnh; bấm vào ảnh rồi bấm **1:1** để xem từng điểm ảnh thật; ở bước 3 có nút **Xem ảnh 2K** để xem ảnh đã lưu ngay trong tool. Tắt tính năng 2K nét ở **Cài đặt** nếu không cần.

Thứ tự ảnh trong prompt: ảnh 1 = ảnh đầu tiên được gửi (bước 2: KOC; bước 3: ảnh KOC đã mặc đồ), ảnh 2 = ảnh tiếp theo, v.v. Giao diện đánh số sẵn.

## Lưu ý
- Mỗi lượt luôn tạo **4 ảnh, tỉ lệ 9:16** (model Nano Banana 2.1). Khi đang tạo, tool hiện 4 ô kèm phần trăm từng ô và ảnh nào xong thì hiện ngay.
- **Đừng tắt** cửa sổ Chrome đang chạy ngầm của tool khi đang chạy (nó nằm thu nhỏ trên thanh taskbar).
- Tool **không** dùng tính năng “Tác nhân” của Flow.
- Chạy nhiều lượt cùng lúc phụ thuộc hạn mức của tài khoản Flow. Chỉnh “Số lượt Flow chạy cùng lúc” trong Cài đặt nếu thấy lỗi.
- Dữ liệu (dự án, KOC, đăng nhập Chrome) nằm trong thư mục `data\`. **Không gửi thư mục này cho người khác.**

## Gửi cho người khác dùng
Gửi cả thư mục tool **trừ** `data\`, `output\` và `node_modules\`. Mỗi người tự đăng nhập Google và dùng hạn mức Flow của họ.

## Khi Flow đổi giao diện
Mọi chỗ phụ thuộc giao diện Flow nằm trong `src\flow.js` (các `L.*` và `SEL`). Sửa ở đó.

# Debug Session: flow-stall-delay
- **Status**: [MONITORING]
- **progress_status**: monitoring (đã có log nền, chờ lượt chạy thật để đối chiếu)
- **Issue**: Người dùng thấy tool bị delay/đứng im khi gửi thao tác sang Google Flow; mong muốn chức năng đang chạy không bị treo hoặc dừng.
- **Expected vs actual**: Thao tác phải có tiến độ hoặc kết thúc với lỗi rõ ràng; hiện có lúc chờ lâu/không thấy hoạt động.
- **Environment**: Windows, Node.js/Express, Electron, Playwright qua Chrome CDP, Google Flow, local port 4177.
- **Reproduction**: Chưa có bước cụ thể cho một lần đang treo; sẽ quan sát các lượt chạy sẵn có và chờ sự kiện vận hành tiếp theo nếu cần.
- **Evidence Source**: No usable runtime evidence transport
- **Evidence Directory**: `C:\Users\TA ANH TUAN\AppData\Local\Temp\flowlookbook-debug-flow-stall-delay`
- **Debug Server**: `http://127.0.0.1:7777/event`
- **Log File**: `C:\Users\TA ANH TUAN\AppData\Local\Temp\flowlookbook-debug-flow-stall-delay\trae-debug-log-flow-stall-delay.ndjson`

## Reproduction Steps
1. Kiểm tra trạng thái app, Flow/CDP, hàng đợi và các lượt đang chạy trước khi tái hiện.
2. Thu thập thời gian chờ/thực thi qua các điểm hàng đợi, mở tab, gửi lệnh Flow, đọc ảnh và nâng cấp 2K.
3. Nếu không có lượt chạy đang chờ, không tự gửi lệnh tạo ảnh tính phí; chờ lượt vận hành tiếp theo của người dùng để lấy bằng chứng.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Expected Signal | Evidence |
|----|------------|------------|--------|-----------------|----------|
| A | Flow UI hoặc dịch vụ Flow chậm, khiến Playwright đợi selector/menu/kết quả lâu | High | Medium | Span tại thao tác Flow chiếm phần lớn thời gian; timeout hoặc phản hồi muộn | INCONCLUSIVE: không có log runtime |
| B | Lock tạo tab, lock theo dự án hoặc hàng đợi tải 2K gây chờ chéo giữa các tác vụ | Medium | Medium | Thời gian chờ lock tăng trong khi thời gian xử lý bên trong ngắn | INCONCLUSIVE: không có log runtime |
| C | Đồng bộ file/JSON hoặc xử lý dữ liệu lớn chặn event loop | Medium | Medium | Độ trễ event loop tăng đồng thời với ghi project/asset; callback khác bị trễ | INCONCLUSIVE: không có log runtime |
| D | CDP/Chrome mất kết nối hoặc tạo tab nền chậm/kẹt | Medium | Medium | Lỗi kết nối, thời gian chờ tạo page tăng, hoặc thao tác không có span kết thúc | INCONCLUSIVE: không có log runtime |
| E | Nâng cấp ảnh 2K tuần tự kéo dài hoặc tương tác với lượt kế tiếp | Medium | Medium | Download 2K chiếm thời gian; lượt sau chờ trạng thái HQ/lock thay vì Flow | INCONCLUSIVE: không có log runtime |

## Log Evidence
Probe HTTP tới Debug Server quá thời hạn; không có env/log file được tạo. Dự án không có structured local log sink: chỉ có console.log khởi động và console.warn fallback kéo-thả, không đủ trường session/run/hypothesis.

## Verification Conclusion
**BLOCKED**: Không thể thu thập runtime evidence trong môi trường hiện tại nên không kết luận nguyên nhân treo.

Sau khi dừng quy trình debugger do thiếu evidence transport, đã thực hiện hardening tĩnh riêng:
- Giới hạn thời gian cho các fetch thumbnail/fingerprint/blob vốn có thể chờ promise không giới hạn.
- Hiển thị giai đoạn kết nối, chuẩn bị ảnh, gửi lệnh, chờ Flow và nhận ảnh.
- Kiểm tra cú pháp và khởi động lại app thành công; không chạy lượt tạo ảnh mới nên chưa có so sánh runtime pre/post.

## Final Evidence Gate
- **Evidence Sources**: Probe thất bại tới `http://127.0.0.1:7777/health` và `/event`; xác nhận không có local structured log sink. Kiểm tra sau hardening: app API HTTP 200, Flow logged in, not paused.
- **progress_status**: monitoring
- **Hypothesis Conclusions**: A=INCONCLUSIVE, B=INCONCLUSIVE, C=INCONCLUSIVE, D=INCONCLUSIVE, E=INCONCLUSIVE

## Cập nhật lần này (log nền + sửa các điểm chờ)

Đã bổ sung nguồn bằng chứng runtime ngay trong app, không cần debug server ngoài:

- `data/logs/app.log`: mỗi pha của một lượt Flow được ghi kèm thời gian, ví dụ
  `flow project=<id> stage=3:<scene> run=<id> phase="Flow đã nhận lệnh; đang chờ ảnh…" +1234ms total=5678ms`.
  Có luôn lỗi `flow error …`, `update lỗi …`, `unhandledRejection`, `uncaughtException`.
  File tự xoay vòng sang `app.1.log` khi vượt 2 MB.
- `POST /api/ping` trả định danh `flow-lookbook` để vỏ Electron không mở nhầm server khác.
- Các chỗ chờ Flow đều có timeout: mở dự án 30 s, gửi lệnh 30 s, chờ ảnh tối đa 6 phút,
  tải 2K 3 phút/lần × tối đa 3 lần, đọc blob 20 s, thumbnail 8 s.
- Semaphore tải 2K nhận giới hạn mới ngay (tăng `concurrent2k` thì các việc đang chờ được đánh thức).
- Ghi dữ liệu dự án đi qua một khoá tuần tự; tiến độ ghi tối đa 5 lần/giây/lượt;
  lỗi ghi ảnh giờ báo lỗi rõ thay vì bị bỏ qua.

Cách đọc khi gặp treo: mở `data/logs/app.log`, tìm dòng cuối của `run=<id>` đang treo;
`+Nms` là thời gian của pha cuối, `total` là tổng thời gian lượt. Nếu `total` vượt quá
các mốc timeout ở trên thì đó là lỗi mạng/Flow; nếu dừng ở `update lỗi` thì kiểm tra ổ đĩa/quyền ghi.

# CSA – Công cụ thiết kế khung bảng hiệu

## 1. Web app “Thiết kế khung bảng hiệu” (thư mục `docs/`)

Web app tĩnh (HTML + JavaScript, không cần máy chủ) dùng để:

- **Xuất bản vẽ khung bảng hiệu**: mặt đứng khung + lớp tôn, mặt cắt A-A (khung, tôn, hệ chống sau, cần đèn), mặt bằng bố trí hệ chống/pát, sơ đồ trải tôn, khung tên – khổ A3/A2/A1.
  - Tải **DXF** (AutoCAD, vẽ tỷ lệ 1:1, đơn vị mm), **SVG**, **PNG**, hoặc **In / Lưu PDF**.
- **Bóc tách khối lượng**: liệt kê **từng thanh cắt** (ký hiệu, quy cách, dài cắt chính xác theo mép thanh, số lượng, vị trí lắp), **sơ đồ pha cắt cây 6 m** (mạch cắt 3 mm, cắt vuông đầu cây 10 mm), tôn phẳng, và **danh sách vật tư cần mua** (số cây thép, m dài tôn, đinh rút/vít, bát, tắc kê, vít mái, keo, que hàn, đá cắt, sơn kẽm lạnh, đèn).
- Xuất **Excel (.xlsx)** 6 sheet (font Times New Roman, có công thức) hoặc **CSV**.

### Quy tắc vật liệu áp dụng

| Kích thước bảng | Vật liệu khung | Ghi chú |
|---|---|---|
| Dài ≤ 8 m **và** cao ≤ 2 m | Hộp mạ kẽm **20×20×1.2** cho toàn bộ khung, thanh chống, giằng | Thanh đứng chính chịu lực lớn được ốp lưng thêm 1 thanh 20×20×1.2 (C5) khi kiểm tra gió yêu cầu |
| Lớn hơn | Tự chọn quy cách hộp vuông/chữ nhật thông dụng | Thử bước chống 1–4 khoang × các quy cách, chọn phương án **đạt kiểm tra gió** có **chi phí so sánh thấp nhất** (thép theo số cây phải mua + mối hàn + chân chống/pát) |
| Mặt bảng | **Tôn phẳng 3 dem (0,30 mm), khổ 1 m** – cố định | Giáp mí trên tim thanh khung, bước ô mặc định 1000 mm |

Kiểm tra kết cấu là **sơ bộ** theo tải gió TCVN 2737 (khung phẳng 2D cho tuyến chống, dầm tải 2 phương cho ô lưới, ổn định thanh nén theo đường cong EC3-c). Không thay thế thiết kế kết cấu chính thức.

### Bật GitHub Pages để dùng online

1. Gộp (merge) nhánh chứa web app vào `main`.
2. Vào **Settings → Pages** của repo.
3. Mục **Build and deployment → Source** chọn **Deploy from a branch**; **Branch** chọn `main`, thư mục **`/docs`** → **Save**.
4. Sau 1–2 phút, app chạy tại `https://<tên-tài-khoản>.github.io/<tên-repo>/` (ví dụ `https://datnho0804-gif.github.io/CSA/`).

> Repo **private** chỉ bật được GitHub Pages khi tài khoản dùng gói GitHub Pro/Team/Enterprise. Với gói miễn phí: chuyển repo sang **public** (Settings → General → Danger Zone → Change visibility) hoặc tạo một repo public riêng chỉ chứa thư mục `docs/`.

### Dùng không cần mạng

Mở trực tiếp file `docs/index.html` bằng Chrome/Edge là chạy được (mọi tính toán chạy trong trình duyệt). Riêng nút **Xuất Excel** cần mạng để tải thư viện ExcelJS; khi không có mạng app tự xuất **CSV** thay thế.

### Cấu trúc mã nguồn

| File | Nội dung |
|---|---|
| `docs/index.html`, `docs/assets/style.css` | Giao diện |
| `docs/assets/js/core.js` | Danh mục thép hộp, tải gió TCVN 2737, giải khung 2D, hệ số ổn định |
| `docs/assets/js/design.js` | Lưới khung, kiểm tra, tối ưu vật liệu, bóc tách thanh cắt, tôn, vật tư |
| `docs/assets/js/cutting.js` | Bài toán pha cắt cây 6 m (knapsack + FFD) |
| `docs/assets/js/drawing.js` | Hình chiếu, bảng biểu, ghép tờ, xuất SVG/DXF R12 |
| `docs/assets/js/export.js`, `app.js` | Xuất Excel/CSV/PNG/PDF, điều khiển giao diện |
| `tests/engine.test.js` | Kiểm thử tự động: `node --test tests/engine.test.js` |

## 2. Script Python mẫu (thư mục `bang_hieu_6x2/`)

`khung_bang_hieu_6x2.py` – bản thiết kế mẫu khung 6 m × 2 m (ezdxf + openpyxl) xuất DXF, PNG và BOQ Excel.

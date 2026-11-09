#!/usr/bin/env python3
"""
Khung bảng hiệu 6000 x 2000 mm dựng trên mái tôn, chống xiên phía sau.
Vật liệu: thép hộp vuông 20x20x1.2 mm (mạ kẽm).

Xuất ra:
  - khung_bang_hieu_6x2.dxf  : mặt đứng khung, mặt cắt A-A bộ chống, mặt bằng hệ chống,
                               bảng thống kê vật tư, ghi chú kỹ thuật (đơn vị mm, tỷ lệ in 1:50 A3)
  - khung_bang_hieu_6x2.png  : ảnh xem nhanh bản vẽ
  - BOQ_khung_bang_hieu_6x2.xlsx : bảng bóc tách khối lượng + sơ đồ cắt cây 6 m

Khối lượng được sinh trực tiếp từ hình học bản vẽ, nên bản vẽ và BOQ luôn khớp nhau.
Chạy:  python khung_bang_hieu_6x2.py [--out THƯ_MỤC]
Yêu cầu: Python 3.11+, ezdxf >= 1.1, matplotlib, openpyxl
"""
from __future__ import annotations

import argparse
import math
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import ezdxf
from ezdxf.enums import TextEntityAlignment
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# ============================================================================
# 1. THÔNG SỐ THIẾT KẾ
# ============================================================================
L_SIGN = 6000.0          # chiều dài bảng (mm)
H_SIGN = 2000.0          # chiều cao bảng (mm)
B = 20.0                 # cạnh hộp vuông (mm)
T = 1.2                  # chiều dày thành hộp (mm)
RAIL_Y = (1000.0,)       # tim thanh ngang giữa (mm, tính từ đáy) -> 2 hàng ô
VERT_PITCH = 1000.0      # bước thanh đứng (mm) -> ô lưới 1000 x 1000 = 12 ô
STRUT_NODE_Y = 1500.0    # cao độ liên kết thanh chống xiên C1 trên thanh đứng (giữa ô trên)
BRACE_NODE_Y = 1000.0    # cao độ nút giằng K (C2) – trùng thanh ngang giữa
STIFFEN_MID = True       # ốp lưng C5 (hộp 20x20 hàn sau thanh đứng giữa -> tiết diện 20x40)
FOOT_D = 1500.0          # khoảng cách chân chống ra phía sau (tính từ tim thanh đứng)
STOCK = 6000.0           # chiều dài cây thép thương phẩm
KERF = 3.0               # hao hụt mạch cắt mỗi nhát (mm)
END_TRIM = 10.0          # cắt vuông đầu cây thương phẩm khi cây được chia nhiều đoạn (mm)
SPARE_BARS = 1           # cây dự phòng (cắt hỏng, chỉnh chiều dài chống theo hiện trường)
RHO = 7850.0             # khối lượng riêng thép (kg/m3)

# Tải gió kiểm tra sơ bộ (TCVN 2737, vùng II-A, địa hình B, z ~ 7 m)
W0, K_Z, C_AERO, GAMMA_W = 0.83, 0.93, 1.4, 1.2

AREA = B * B - (B - 2 * T) ** 2                  # mm2
MASS = AREA * 1e-6 * RHO                         # kg/m
SPEC = f"Hộp □{B:.0f}x{B:.0f}x{T}"

OUT_STEM = "khung_bang_hieu_6x2"


def ceil10(x: float) -> int:
    """Làm tròn lên bội số 10 mm (chiều dài cắt)."""
    return int(math.ceil(round(x, 3) / 10.0) * 10)


# ============================================================================
# 2. HÌNH HỌC & DANH MỤC CẤU KIỆN
# ============================================================================
@dataclass
class Item:
    mark: str
    name: str
    length: int
    qty: int
    group: str

    @property
    def total_m(self) -> float:
        return self.length * self.qty / 1000.0

    @property
    def kg(self) -> float:
        return self.total_m * MASS


@dataclass
class Geometry:
    vert_x: list[float] = field(default_factory=list)       # tim các thanh đứng (chạy suốt)
    seg_x: list[tuple[float, float]] = field(default_factory=list)  # đoạn thanh ngang giữa (mỗi hàng)
    strut_p1: tuple[float, float] = (0.0, 0.0)              # (u, y) mặt cắt
    strut_p2: tuple[float, float] = (0.0, 0.0)
    strut_mid: tuple[float, float] = (0.0, 0.0)
    brace_p1: tuple[float, float] = (0.0, 0.0)
    tie_center: tuple[float, float] = (0.0, 0.0)            # giằng dọc C3 trong mặt cắt
    foot_center: tuple[float, float] = (0.0, 0.0)           # chân dọc C4 trong mặt cắt


def build_geometry() -> Geometry:
    g = Geometry()
    n_bay = int(round(L_SIGN / VERT_PITCH))
    g.vert_x = [B / 2] + [VERT_PITCH * k for k in range(1, n_bay)] + [L_SIGN - B / 2]
    g.seg_x = [(a + B / 2, b - B / 2) for a, b in zip(g.vert_x[:-1], g.vert_x[1:])]
    # mặt cắt tại thanh đứng giữa: u = 0 là tim thanh đứng, u > 0 hướng ra sau bảng
    u0 = B if STIFFEN_MID else 0.0                    # C1, C2 hàn vào tim ốp lưng C5
    g.foot_center = (FOOT_D, B / 2)
    g.strut_p1 = (u0, STRUT_NODE_Y)
    g.strut_p2 = (FOOT_D, B)                          # tựa lên mặt trên chân dọc C4
    g.strut_mid = ((g.strut_p1[0] + g.strut_p2[0]) / 2, (g.strut_p1[1] + g.strut_p2[1]) / 2)
    g.brace_p1 = (u0, BRACE_NODE_Y)
    dx, dy = g.strut_p2[0] - g.strut_p1[0], g.strut_p2[1] - g.strut_p1[1]
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln                        # pháp tuyến hướng lên-trên
    if ny < 0:
        nx, ny = -nx, -ny
    g.tie_center = (g.strut_mid[0] + nx * B, g.strut_mid[1] + ny * B)
    return g


def build_items(g: Geometry) -> list[Item]:
    n_vert_mid = len(g.vert_x) - 2
    n_strut = len(g.vert_x)                           # chống tại MỌI thanh đứng
    items: list[Item] = [
        Item("K1", "Thanh ngang bao trên + dưới (dùng nguyên cây)", ceil10(L_SIGN), 2, "A"),
        Item("K2", f"Thanh đứng chạy suốt (2 đầu + {n_vert_mid} giữa)", ceil10(H_SIGN - 2 * B),
             len(g.vert_x), "A"),
    ]
    seg_count: "OrderedDict[int, int]" = OrderedDict()
    for x0, x1 in g.seg_x:
        seg_count[ceil10(x1 - x0)] = seg_count.get(ceil10(x1 - x0), 0) + len(RAIL_Y)
    marks = iter(("K3", "K4", "K5", "K6"))
    rails = "/".join(f"{y:.0f}" for y in RAIL_Y)
    for ln, q in sorted(seg_count.items()):
        items.append(Item(next(marks), f"Đoạn thanh ngang giữa y={rails} (hàn giữa 2 thanh đứng)", ln, q, "A"))

    # chiều dài C1, C2 lấy giá trị lớn hơn giữa thanh đứng có/không ốp lưng (thanh đứng 2 đầu không ốp)
    strut_len = max(math.dist((u, STRUT_NODE_Y), g.strut_p2) for u in (0.0, g.strut_p1[0]))
    brace_len = max(math.dist((u, BRACE_NODE_Y), ((u + g.strut_p2[0]) / 2, (STRUT_NODE_Y + g.strut_p2[1]) / 2))
                    for u in (0.0, g.strut_p1[0]))
    items += [
        Item("C1", f"Thanh chống xiên (thanh đứng y={STRUT_NODE_Y:.0f} -> chân dọc)", ceil10(strut_len),
             n_strut, "B"),
        Item("C2", f"Giằng K (nút y={BRACE_NODE_Y:.0f} -> giữa thanh chống)", ceil10(brace_len), n_strut, "B"),
        Item("C3", "Giằng dọc nối giữa các thanh chống", ceil10(L_SIGN), 1, "B"),
        Item("C4", "Thanh chân dọc trên mái (trùng tuyến xà gồ)", ceil10(L_SIGN), 1, "B"),
    ]
    if STIFFEN_MID:
        items.append(Item("C5", "Ốp lưng tăng cứng thanh đứng giữa (hàn sau K2 -> 20x40)",
                          ceil10(H_SIGN), n_vert_mid, "B"))
    return items


def _fits(lengths: tuple[int, ...], counts: tuple[int, ...]) -> bool:
    n = sum(counts)
    used = sum(l * c for l, c in zip(lengths, counts))
    return n == 1 and used <= STOCK or n > 1 and used + KERF * (n - 1) + END_TRIM <= STOCK


def _ffd_bins(lengths: tuple[int, ...], demand: tuple[int, ...]) -> list[tuple[int, ...]]:
    """First-Fit Decreasing – nghiệm khởi tạo (cận trên) cho bài toán cắt."""
    bins: list[list[int]] = []
    for i, ln in enumerate(lengths):
        for _ in range(demand[i]):
            for b in bins:
                trial = b.copy()
                trial[i] += 1
                if _fits(lengths, tuple(trial)):
                    b[i] += 1
                    break
            else:
                nb = [0] * len(lengths)
                nb[i] = 1
                bins.append(nb)
    return [tuple(b) for b in bins]


def cutting_plan(items: list[Item]) -> list[list[tuple[str, int]]]:
    """
    Sơ đồ cắt cây 6 m tối ưu (số cây ít nhất) – nhánh cận trên tập mẫu cắt, có trừ mạch cắt.
    Điều kiện 1 cây: 1 đoạn <= STOCK; nhiều đoạn: tổng dài + KERF x (số đoạn - 1) + END_TRIM <= STOCK.
    """
    for it in items:
        if it.length > STOCK:
            raise ValueError(f"{it.mark} dài {it.length} mm vượt chiều dài cây {STOCK:.0f} mm")
    lengths = tuple(sorted({it.length for it in items}, reverse=True))
    demand = tuple(sum(it.qty for it in items if it.length == ln) for ln in lengths)

    # liệt kê mọi mẫu cắt khả thi (vector số đoạn mỗi loại chiều dài)
    patterns: list[tuple[int, ...]] = []

    def gen(i: int, cur: list[int]):
        if i == len(lengths):
            if _fits(lengths, tuple(cur)):
                patterns.append(tuple(cur))
            return
        c = 0
        while c <= demand[i]:
            cur.append(c)
            if sum(cur) == 0 or _fits(lengths, tuple(cur) + (0,) * (len(lengths) - i - 1)):
                gen(i + 1, cur)
                cur.pop()
                c += 1
            else:
                cur.pop()
                break

    gen(0, [])
    best = _ffd_bins(lengths, demand)
    best_n = [len(best)]
    seen: dict[tuple[int, ...], int] = {}
    total = lambda d: sum(l * c for l, c in zip(lengths, d))  # noqa: E731

    def dfs(d: tuple[int, ...], chosen: list[tuple[int, ...]]):
        if not any(d):
            if len(chosen) < best_n[0]:
                best_n[0] = len(chosen)
                best[:] = list(chosen)
            return
        lb = math.ceil(total(d) / STOCK)
        if len(chosen) + lb >= best_n[0] or seen.get(d, 10 ** 9) <= len(chosen):
            return
        seen[d] = len(chosen)
        k = next(i for i, c in enumerate(d) if c)       # đoạn dài nhất còn lại phải nằm trong cây kế tiếp
        cands = {tuple(min(p, q) for p, q in zip(pat, d)) for pat in patterns if pat[k] and pat[k] <= d[k]}
        for p in sorted(cands, key=total, reverse=True):
            dfs(tuple(a - b for a, b in zip(d, p)), chosen + [p])

    dfs(demand, [])

    # gán ký hiệu cho từng đoạn
    queues = {ln: [it.mark for it in items if it.length == ln for _ in range(it.qty)] for ln in lengths}
    out: list[list[tuple[str, int]]] = []
    for pat in sorted(best, key=lambda p: [-c for c in p]):
        bar = []
        for ln, c in zip(lengths, pat):
            for _ in range(c):
                bar.append((queues[ln].pop(0), ln))
        out.append(bar)
    return out


def bar_waste(bar: list[tuple[str, int]]) -> float:
    """Phần dư còn dùng được của cây (đã trừ mạch cắt và cắt vuông đầu cây)."""
    if len(bar) == 1:
        return STOCK - bar[0][1]
    return STOCK - sum(ln for _, ln in bar) - KERF * (len(bar) - 1) - END_TRIM


# ============================================================================
# 3. BẢN VẼ DXF
# ============================================================================
TXT_STYLE = "TNR"
DIM_OVR = {
    "dimlfac": 1.0, "dimscale": 1.0,
    "dimtxt": 80, "dimasz": 60, "dimexe": 40, "dimexo": 30, "dimgap": 20,
    "dimtad": 1, "dimdec": 0, "dimtxsty": TXT_STYLE, "dimblk": "ARCHTICK",
    "dimclrd": 3, "dimclre": 3, "dimclrt": 7,
}
LAYERS = {
    "KHUNG": 5, "CHONG": 1, "GIANG": 6, "MAT_CAT": 4, "MAI": 8, "TIM": 2,
    "DIM": 3, "TEXT": 7, "BANG": 7, "KHUNG_TEN": 7, "HATCH": 8,
}


def setup_doc() -> ezdxf.document.Drawing:
    doc = ezdxf.new("R2018", setup=True)
    doc.units = ezdxf.units.MM
    doc.header["$MEASUREMENT"] = 1
    doc.header["$LTSCALE"] = 25
    doc.styles.new(TXT_STYLE, dxfattribs={"font": "times.ttf"})
    for name, color in LAYERS.items():
        lay = doc.layers.add(name, color=color)
        if name == "TIM":
            lay.dxf.linetype = "CENTER"
    return doc


def text(msp, s: str, pos, h: float = 100, layer: str = "TEXT",
         align: TextEntityAlignment = TextEntityAlignment.BOTTOM_LEFT, rot: float = 0, color=None):
    attrs = {"height": h, "style": TXT_STYLE, "layer": layer, "rotation": rot}
    if color is not None:
        attrs["color"] = color
    msp.add_text(s, dxfattribs=attrs).set_placement(pos, align=align)


def rect(msp, x0, y0, x1, y1, layer, color=None):
    attrs = {"layer": layer, "closed": True}
    if color is not None:
        attrs["color"] = color
    msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], dxfattribs=attrs)


def tube(msp, p1, p2, layer, w: float = B, axis: bool = True):
    """Thanh hộp vẽ theo tim p1->p2, bề rộng w."""
    (x1, y1), (x2, y2) = p1, p2
    ln = math.hypot(x2 - x1, y2 - y1)
    nx, ny = -(y2 - y1) / ln * w / 2, (x2 - x1) / ln * w / 2
    msp.add_lwpolyline([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)],
                       dxfattribs={"layer": layer, "closed": True})
    if axis:
        msp.add_line(p1, p2, dxfattribs={"layer": "TIM"})


def square_cut(msp, cx, cy, layer, w: float = B):
    """Tiết diện hộp bị cắt (2 nét + hatch)."""
    rect(msp, cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2, layer)
    rect(msp, cx - w / 2 + T * 2, cy - w / 2 + T * 2, cx + w / 2 - T * 2, cy + w / 2 - T * 2, layer)
    h = msp.add_hatch(color=LAYERS[layer], dxfattribs={"layer": layer})
    h.paths.add_polyline_path([(cx - w / 2, cy - w / 2), (cx + w / 2, cy - w / 2),
                               (cx + w / 2, cy + w / 2), (cx - w / 2, cy + w / 2)], is_closed=True)


def hdim(msp, x1, x2, y, base_y, text_override: str | None = None):
    d = msp.add_linear_dim(base=(x1, base_y), p1=(x1, y), p2=(x2, y), angle=0,
                           dxfattribs={"layer": "DIM"}, override=DIM_OVR, text=text_override or "<>")
    d.render()


def vdim(msp, y1, y2, x, base_x, text_override: str | None = None):
    d = msp.add_linear_dim(base=(base_x, y1), p1=(x, y1), p2=(x, y2), angle=90,
                           dxfattribs={"layer": "DIM"}, override=DIM_OVR, text=text_override or "<>")
    d.render()


def leader(msp, tip, label_pos, s: str, h: float = 90):
    msp.add_line(tip, label_pos, dxfattribs={"layer": "TEXT"})
    text(msp, s, (label_pos[0] + 20, label_pos[1]), h, align=TextEntityAlignment.MIDDLE_LEFT)


def draw_elevation(msp, g: Geometry, items: list[Item]):
    """MẶT ĐỨNG KHUNG – nhìn từ mặt trước bảng. Gốc (0, 0)."""
    rect(msp, 0, 0, L_SIGN, B, "KHUNG")                         # K1 dưới
    rect(msp, 0, H_SIGN - B, L_SIGN, H_SIGN, "KHUNG")           # K1 trên
    for x in g.vert_x:                                          # K2 chạy suốt
        rect(msp, x - B / 2, B, x + B / 2, H_SIGN - B, "KHUNG")
    for y in RAIL_Y:                                            # K3/K4 đoạn ngang giữa
        for x0, x1 in g.seg_x:
            rect(msp, x0, y - B / 2, x1, y + B / 2, "KHUNG")
    # số hiệu ô lưới
    n = 1
    ys_cell = [0.0] + list(RAIL_Y) + [H_SIGN]
    for y0, y1 in zip(ys_cell[1:][::-1], ys_cell[:-1][::-1]):
        for x0, x1 in zip([0.0] + g.vert_x[1:-1], g.vert_x[1:-1] + [L_SIGN]):
            text(msp, f"Ô{n}", ((x0 + x1) / 2, (y0 + y1) / 2), 70, "TEXT", TextEntityAlignment.MIDDLE_CENTER,
                 color=8)
            n += 1

    # kích thước
    xs = [0.0] + g.vert_x[1:-1] + [L_SIGN]
    for a, b_ in zip(xs[:-1], xs[1:]):
        hdim(msp, a, b_, 0, -250)
    hdim(msp, 0, L_SIGN, 0, -500)
    ys = [0.0] + list(RAIL_Y) + [H_SIGN]
    for a, b_ in zip(ys[:-1], ys[1:]):
        vdim(msp, a, b_, 0, -250)
    vdim(msp, 0, H_SIGN, 0, -500)

    # ký hiệu vị trí bộ chống (nằm phía sau, nhìn xuyên)
    for i, x in enumerate(g.vert_x, 1):
        msp.add_circle((x, -800), 70, dxfattribs={"layer": "CHONG"})
        text(msp, str(i), (x, -800), 70, "CHONG", TextEntityAlignment.MIDDLE_CENTER)
    note = f"Vị trí {len(g.vert_x)} bộ chống C (phía sau, tại mọi thanh đứng)"
    if STIFFEN_MID:
        note += f"; thanh đứng 2÷{len(g.vert_x) - 1} có ốp lưng C5"
    text(msp, note, (0, -1000), 90, "CHONG", TextEntityAlignment.TOP_LEFT)

    # vết cắt A-A tại thanh đứng x = 3000
    xa = min(g.vert_x, key=lambda v: abs(v - L_SIGN / 2))
    for y0, y1, ty in ((H_SIGN + 120, H_SIGN + 380, H_SIGN + 430), (-1200, -1450, -1700)):
        msp.add_line((xa, y0), (xa, y1), dxfattribs={"layer": "TEXT", "lineweight": 50})
        msp.add_line((xa, y1), (xa + 150, y1), dxfattribs={"layer": "TEXT", "lineweight": 50})
        text(msp, "A", (xa + 180, y1), 120, align=TextEntityAlignment.MIDDLE_LEFT)

    # ghi chú cấu kiện
    seg_marks = {ln: it.mark for it in items if it.group == "A" and it.mark not in ("K1", "K2")
                 for ln in [it.length]}
    leader(msp, (L_SIGN * 0.20, H_SIGN - B / 2), (L_SIGN * 0.20 + 250, H_SIGN + 250), "K1")
    leader(msp, (L_SIGN * 0.30, B / 2), (L_SIGN * 0.30 + 200, 250), "K1")
    leader(msp, (g.vert_x[2], H_SIGN * 0.75), (g.vert_x[2] + 200, H_SIGN * 0.75 + 150), "K2")
    for idx in (0, 2):
        x0, x1 = g.seg_x[idx]
        mk = seg_marks.get(ceil10(x1 - x0), "")
        leader(msp, ((x0 + x1) / 2 + 150, RAIL_Y[0]), ((x0 + x1) / 2 + 300, RAIL_Y[0] - 230), mk)

    n_cell = (len(RAIL_Y) + 1) * (len(g.vert_x) - 1)
    text(msp, "MẶT ĐỨNG KHUNG BẢNG HIỆU (nhìn từ mặt trước)", (L_SIGN / 2, H_SIGN + 700), 180,
         align=TextEntityAlignment.BOTTOM_CENTER)
    text(msp, f"Ô lưới {VERT_PITCH:.0f} x {H_SIGN / (len(RAIL_Y) + 1):.0f} ({n_cell} ô) – {SPEC} – "
              "thanh đứng chạy suốt, thanh ngang giữa cắt đoạn",
         (L_SIGN / 2, H_SIGN + 520), 100, align=TextEntityAlignment.BOTTOM_CENTER)


def draw_section(msp, g: Geometry, items: list[Item], ox: float, oy: float):
    """MẶT CẮT A-A – bộ chống điển hình. u>0 hướng ra phía sau bảng."""
    P = lambda u, y: (ox + u, oy + y)  # noqa: E731

    # mái tôn + xà gồ + tường chắn/sê nô
    msp.add_lwpolyline([P(-500, 0), P(FOOT_D + 700, 0)], dxfattribs={"layer": "MAI"})
    wave = [P(u, -15 * (1 - math.cos(2 * math.pi * (u - 200) / 250)) / 2)
            for u in range(200, int(FOOT_D + 700), 25)]
    msp.add_lwpolyline(wave, dxfattribs={"layer": "MAI"})
    cx = FOOT_D
    msp.add_lwpolyline([P(cx + 25, -15), P(cx - 25, -15), P(cx - 25, -115), P(cx + 25, -115)],
                       dxfattribs={"layer": "MAI"})
    rect(msp, *P(-200, -450), *P(150, 0), "MAI")
    h = msp.add_hatch(color=8, dxfattribs={"layer": "HATCH"})
    h.set_pattern_fill("AR-CONC", scale=1.0)
    h.paths.add_polyline_path([P(-200, -450), P(150, -450), P(150, 0), P(-200, 0)], is_closed=True)

    # mặt bảng (Alu 3 mm) + thanh đứng + các thanh ngang bị cắt
    rect(msp, *P(-B / 2 - 3, 0), *P(-B / 2, H_SIGN), "MAT_CAT")
    rect(msp, *P(-B / 2, 0), *P(B / 2, H_SIGN), "KHUNG")
    msp.add_line(P(0, -100), P(0, H_SIGN + 100), dxfattribs={"layer": "TIM"})
    for y in (B / 2, *RAIL_Y, H_SIGN - B / 2):
        square_cut(msp, *P(0, y), "KHUNG")
    back = B / 2
    if STIFFEN_MID:                                   # ốp lưng C5 suốt chiều cao 2000
        rect(msp, *P(B / 2, 0), *P(3 * B / 2, H_SIGN), "CHONG")
        back = 3 * B / 2

    # hệ chống
    tube(msp, P(*g.strut_p1), P(*g.strut_p2), "CHONG")
    tube(msp, P(*g.brace_p1), P(*g.strut_mid), "GIANG")
    square_cut(msp, *P(*g.tie_center), "GIANG")
    square_cut(msp, *P(*g.foot_center), "CHONG")
    # bát L chân bảng
    msp.add_lwpolyline([P(back, 0), P(back + 40, 0), P(back + 40, 4), P(back + 4, 4),
                        P(back + 4, 40), P(back, 40)], dxfattribs={"layer": "CHONG", "closed": True})

    # gió (mũi tên đặt lệch các đường gióng kích thước)
    for y in (300, 800, 1300, 1800):
        a0, a1 = P(-800, y), P(-120, y)
        msp.add_line(a0, a1, dxfattribs={"layer": "TEXT"})
        msp.add_lwpolyline([P(-200, y + 35), a1, P(-200, y - 35)], dxfattribs={"layer": "TEXT"})
    q = W0 * K_Z * C_AERO * GAMMA_W
    text(msp, f"Gió q_tt ≈ {q:.2f} kN/m²", P(-1700, H_SIGN + 150), 90)

    # kích thước: đứng bên trái, ngang bên dưới
    for y2, bx in ((BRACE_NODE_Y, -1100), (STRUT_NODE_Y, -1350), (H_SIGN, -1600)):
        vdim(msp, oy, oy + y2, ox, ox + bx)
    hdim(msp, ox, ox + g.strut_mid[0], oy, oy - 800)
    hdim(msp, ox, ox + FOOT_D, oy, oy - 1050)

    # ghi chú
    lens = {it.mark: it.length for it in items}
    lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)  # noqa: E731
    leader(msp, P(-B / 2 - 2, 1850), P(300, 2300), "Mặt Alu / tôn / bạt hiflex")
    if STIFFEN_MID:
        leader(msp, P(B, 1800), P(300, 2120), f"C5 – ốp lưng {SPEC[4:]} L={lens['C5']} (hàn đính 2 bên)")
    leader(msp, P(*lerp(g.strut_p1, g.strut_p2, 0.18)), P(1900, 1800), f"C1 – chống xiên, L≈{lens['C1']}")
    leader(msp, P(*lerp(g.brace_p1, g.strut_mid, 0.5)), P(1900, 1450), f"C2 – giằng K, L≈{lens['C2']}")
    leader(msp, P(*g.tie_center), P(1900, 1050), "C3 – giằng dọc 6000 (hàn mọi bộ chống)")
    leader(msp, P(*g.foot_center), P(1900, 350), "C4 – chân dọc 6000")
    leader(msp, P(cx, -65), P(1900, -250), "Xà gồ mái – vít bắn tôn 5.5x75 @≤600 + keo")
    leader(msp, P(back + 30, 20), P(-2700, -300), "Bát L40x4 + tắc kê M8 @600")
    leader(msp, P(-50, -300), P(-2700, -600), "Tường chắn / sê nô")

    text(msp, "MẶT CẮT A-A – BỘ CHỐNG ĐIỂN HÌNH", P(FOOT_D / 2, H_SIGN + 700), 180,
         align=TextEntityAlignment.BOTTOM_CENTER)
    text(msp, "Hàn kín 4 mặt tại mọi nút; nếu chân chống lệch cao độ h so với chân bảng:",
         P(-2000, -1400), 80)
    text(msp, "L_C1 = √((1500 ± h)² + 1500²) – đo lại tại hiện trường trước khi cắt.",
         P(-2000, -1530), 80)


def draw_plan(msp, g: Geometry, ox: float, oy: float):
    """MẶT BẰNG BỐ TRÍ HỆ CHỐNG – nhìn từ trên xuống. Mặt trước bảng ở phía trên."""
    rect(msp, ox, oy - B, ox + L_SIGN, oy, "KHUNG")
    rect(msp, ox - 0, oy + 3, ox + L_SIGN, oy, "MAT_CAT")
    for x in g.vert_x:
        rect(msp, ox + x - B / 2, oy - B - (FOOT_D - B / 2) + 0, ox + x + B / 2, oy - B, "CHONG")
    tc = g.tie_center[0]
    rect(msp, ox, oy - B / 2 - tc - B / 2, ox + L_SIGN, oy - B / 2 - tc + B / 2, "GIANG")
    rect(msp, ox, oy - B / 2 - FOOT_D - B / 2, ox + L_SIGN, oy - B / 2 - FOOT_D + B / 2, "CHONG")
    msp.add_line((ox - 300, oy - B / 2 - FOOT_D), (ox + L_SIGN + 300, oy - B / 2 - FOOT_D),
                 dxfattribs={"layer": "TIM"})
    text(msp, "Tim xà gồ mái", (ox + L_SIGN + 320, oy - B / 2 - FOOT_D), 80,
         align=TextEntityAlignment.MIDDLE_LEFT)

    xs = [0.0] + g.vert_x[1:-1] + [L_SIGN]
    for a, b_ in zip(xs[:-1], xs[1:]):
        hdim(msp, ox + a, ox + b_, oy, oy + 250)
    hdim(msp, ox, ox + L_SIGN, oy, oy + 500)
    vdim(msp, oy - B / 2 - tc, oy - B / 2, ox + L_SIGN, ox + L_SIGN + 300)
    vdim(msp, oy - B / 2 - FOOT_D, oy - B / 2, ox + L_SIGN, ox + L_SIGN + 600)

    leader(msp, (ox + g.vert_x[1], oy - 400), (ox + g.vert_x[1] + 200, oy - 300),
           f"C1 + C2 ({len(g.vert_x)} bộ)")
    leader(msp, (ox + 2700, oy - B / 2 - tc), (ox + 2900, oy - B / 2 - tc + 180), "C3")
    leader(msp, (ox + 3900, oy - B / 2 - FOOT_D), (ox + 4100, oy - B / 2 - FOOT_D + 180), "C4")
    text(msp, "MẶT BẰNG BỐ TRÍ HỆ CHỐNG", (ox + L_SIGN / 2, oy + 800), 180,
         align=TextEntityAlignment.BOTTOM_CENTER)


def draw_table(msp, x0: float, y0: float, headers: list[str], rows: list[list[str]],
               widths: list[float], h: float = 75, row_h: float = 160, bold_rows: set[int] | None = None):
    bold_rows = bold_rows or set()
    all_rows = [headers] + rows
    total_w = sum(widths)
    for r, row in enumerate(all_rows):
        y_top = y0 - r * row_h
        rect(msp, x0, y_top - row_h, x0 + total_w, y_top, "BANG")
        x = x0
        for c, (cell, w) in enumerate(zip(row, widths)):
            if c > 0:
                msp.add_line((x, y_top), (x, y_top - row_h), dxfattribs={"layer": "BANG"})
            centered = r == 0 or c != 1
            pos = (x + w / 2, y_top - row_h / 2) if centered else (x + 40, y_top - row_h / 2)
            al = TextEntityAlignment.MIDDLE_CENTER if centered else TextEntityAlignment.MIDDLE_LEFT
            color = 1 if r - 1 in bold_rows else None
            text(msp, cell, pos, h, "BANG", al, color=color)
            x += w
    return y0 - len(all_rows) * row_h


def draw_title_block(msp, x0, y0, w, h):
    rect(msp, x0, y0, x0 + w, y0 + h, "KHUNG_TEN")
    rows = [
        ("CÔNG TRÌNH", "KHUNG BẢNG HIỆU 6000 x 2000 – DỰNG TRÊN MÁI TÔN"),
        ("NỘI DUNG", f"MẶT ĐỨNG – MẶT CẮT A-A – MẶT BẰNG HỆ CHỐNG – BOQ"),
        ("NGƯỜI LẬP", "Nguyễn Thành Đạt – Kỹ sư Cơ điện"),
        ("TỶ LỆ / KHỔ", "1:50 / A3 – Đơn vị: mm"),
        ("NGÀY", date.today().strftime("%d/%m/%Y")),
    ]
    rh = h / len(rows)
    for i, (k, v) in enumerate(rows):
        yt = y0 + h - i * rh
        msp.add_line((x0, yt - rh), (x0 + w, yt - rh), dxfattribs={"layer": "KHUNG_TEN"})
        text(msp, k, (x0 + 60, yt - rh / 2), 80, "KHUNG_TEN", TextEntityAlignment.MIDDLE_LEFT)
        text(msp, v, (x0 + 1300, yt - rh / 2), 90, "KHUNG_TEN", TextEntityAlignment.MIDDLE_LEFT)
    msp.add_line((x0 + 1250, y0), (x0 + 1250, y0 + h), dxfattribs={"layer": "KHUNG_TEN"})


def build_dxf(g: Geometry, items: list[Item], bins, path: Path) -> ezdxf.document.Drawing:
    doc = setup_doc()
    msp = doc.modelspace()

    draw_elevation(msp, g, items)
    draw_section(msp, g, items, ox=9000, oy=0)
    draw_plan(msp, g, ox=0, oy=-2600)

    # Bảng thống kê vật tư
    rows, a_m, b_m = [], 0.0, 0.0
    for it in items:
        rows.append([it.mark, it.name, SPEC, f"{it.length}", f"{it.qty}", f"{it.total_m:.2f}", f"{it.kg:.1f}"])
        if it.group == "A":
            a_m += it.total_m
        else:
            b_m += it.total_m
    n_bars = len(bins)
    n_buy = n_bars + SPARE_BARS
    rows += [
        ["A", "Cộng khung mặt bảng (K)", "", "", "", f"{a_m:.2f}", f"{a_m * MASS:.1f}"],
        ["B", "Cộng hệ chống (C)", "", "", "", f"{b_m:.2f}", f"{b_m * MASS:.1f}"],
        ["Σ", "TỔNG CỘNG (A + B) – chiều dài tịnh", "", "", "", f"{a_m + b_m:.2f}", f"{(a_m + b_m) * MASS:.1f}"],
        ["", f"Số cây 6 m theo sơ đồ cắt tối ưu (mạch cắt {KERF:.0f} mm)", "", "", f"{n_bars}",
         f"{n_bars * STOCK / 1000:.2f}", f"{n_bars * STOCK / 1000 * MASS:.1f}"],
        ["", f"ĐỀ XUẤT MUA (+{SPARE_BARS} cây dự phòng)", "", "", f"{n_buy}",
         f"{n_buy * STOCK / 1000:.2f}", f"{n_buy * STOCK / 1000 * MASS:.1f}"],
    ]
    bold = {len(items) + 2, len(items) + 4}
    tx, ty = 10500, -2100
    widths = [300, 3500, 1000, 700, 300, 550, 550]
    text(msp, "BẢNG THỐNG KÊ VẬT TƯ – THÉP HỘP", (tx + sum(widths) / 2, ty + 120), 150,
         align=TextEntityAlignment.BOTTOM_CENTER)
    y_end = draw_table(msp, tx, ty, ["KH", "Tên cấu kiện", "Quy cách", "Dài cắt (mm)", "SL", "Tổng (m)", "KL (kg)"],
                       rows, widths, h=70, bold_rows=bold)

    q = W0 * K_Z * C_AERO * GAMMA_W
    notes = (
        "GHI CHÚ KỸ THUẬT\\P"
        f"1. Thép hộp vuông mạ kẽm {B:.0f}x{B:.0f}x{T} mm, m ≈ {MASS:.3f} kg/m (lý thuyết). Kích thước: mm.\\P"
        "2. Khung mặt: ô lưới 1000 x 1000 (12 ô); K1, K2 chạy suốt; K3/K4 cắt đoạn hàn giữa các thanh đứng.\\P"
        f"3. Hệ chống: {len(g.vert_x)} bộ tại MỌI thanh đứng (@1000), mỗi bộ C1 + C2; C3, C4 liên tục 6 m;\\P"
        f"    {len(g.vert_x) - 2} thanh đứng giữa ốp lưng C5 (hàn đính 2 bên, đường hàn 30 mm @150).\\P"
        f"4. Kiểm tra sơ bộ gió vùng II-A (q_tt ≈ {q:.2f} kN/m²): có ốp lưng C5 đạt ~76% khả năng chịu uốn;\\P"
        "    bỏ C5 (thanh đứng đơn 20x20x1.2) vượt ~150% – KHÔNG bỏ C5, KHÔNG giảm số bộ chống.\\P"
        "5. C4 đặt trùng tim xà gồ; bắt vít bắn tôn 5.5x75 (long đen cao su) vào xà gồ @≤600, bơm keo chống dột.\\P"
        "6. Chân bảng: bát L40x4 + tắc kê M8 @600 vào tường chắn/sê nô (hoặc vít vào xà gồ nếu đặt trên tôn).\\P"
        "7. Hàn kín 4 mặt tại nút (que J421 2.6 mm); mài, dặm kẽm lạnh/sơn chống rỉ 2 lớp tại mối hàn.\\P"
        "8. Ô 1x1 m: mặt Alu nên dùng ≥ 4 mm (3 mm dễ phồng/võng); mối nối đứng tại x = 2000, 4000, ngang y = 1000."
    )
    mt = msp.add_mtext(notes, dxfattribs={"style": TXT_STYLE, "char_height": 75, "layer": "TEXT",
                                          "width": sum(widths)})
    mt.set_location((tx, y_end - 200))

    draw_title_block(msp, tx, -7600, sum(widths), 900)
    doc.saveas(path)
    return doc


# ============================================================================
# 4. ẢNH XEM NHANH + EXCEL BOQ
# ============================================================================
def export_png(doc, path: Path):
    from ezdxf.addons.drawing import matplotlib as dm
    dm.qsave(doc.modelspace(), str(path), bg="#FFFFFF", dpi=110, size_inches=(23.4, 16.5))


def export_xlsx(items: list[Item], bins, path: Path):
    blue, red = "005BAC", "E60012"
    f_base = Font(name="Times New Roman", size=12)
    f_head = Font(name="Times New Roman", size=12, bold=True, color="FFFFFF")
    f_title = Font(name="Times New Roman", size=14, bold=True, color=blue)
    f_total = Font(name="Times New Roman", size=12, bold=True, color=red)
    fill_head = PatternFill("solid", fgColor=blue)
    thin = Side(style="thin", color="808080")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "BOQ"
    ws.merge_cells("A1:H1")
    ws["A1"] = "BẢNG BÓC TÁCH KHỐI LƯỢNG – KHUNG BẢNG HIỆU 6000 x 2000 + HỆ CHỐNG"
    ws["A1"].font = f_title
    ws["A1"].alignment = center
    ws.merge_cells("A2:H2")
    ws["A2"] = (f"Vật liệu: {SPEC} mạ kẽm – m = {MASS:.3f} kg/m – cây {STOCK / 1000:.0f} m – "
                f"Ngày lập: {date.today():%d/%m/%Y}")
    ws["A2"].font = Font(name="Times New Roman", size=11, italic=True)
    ws["A2"].alignment = center

    heads = ["STT", "Ký hiệu", "Tên cấu kiện", "Quy cách", "Dài cắt (mm)", "Số lượng (thanh)",
             "Tổng dài (m)", "Khối lượng (kg)"]
    hr = 4
    for c, hname in enumerate(heads, 1):
        cell = ws.cell(row=hr, column=c, value=hname)
        cell.font, cell.fill, cell.alignment, cell.border = f_head, fill_head, center, border

    r = hr + 1
    group_rows: dict[str, list[int]] = {"A": [], "B": []}
    group_title = {"A": "A. KHUNG MẶT BẢNG", "B": "B. HỆ CHỐNG BẢNG HIỆU"}
    stt = 1
    for grp in ("A", "B"):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
        ws.cell(row=r, column=1, value=group_title[grp]).font = Font(name="Times New Roman", size=12,
                                                                    bold=True, color=blue)
        r += 1
        for it in (i for i in items if i.group == grp):
            vals = [stt, it.mark, it.name, SPEC, it.length, it.qty, None, None]
            for c, v in enumerate(vals, 1):
                cell = ws.cell(row=r, column=c, value=v)
                cell.font, cell.border = f_base, border
                cell.alignment = left if c == 3 else center
            ws.cell(row=r, column=7, value=f"=E{r}*F{r}/1000").number_format = "0.00"
            ws.cell(row=r, column=8, value=f"=G{r}*$K$5").number_format = "0.0"
            group_rows[grp].append(r)
            stt += 1
            r += 1
        rows_ = group_rows[grp]
        ws.cell(row=r, column=3, value=f"Cộng {group_title[grp][3:].lower()}").font = Font(
            name="Times New Roman", size=12, bold=True)
        ws.cell(row=r, column=7, value=f"=SUM(G{rows_[0]}:G{rows_[-1]})").number_format = "0.00"
        ws.cell(row=r, column=8, value=f"=SUM(H{rows_[0]}:H{rows_[-1]})").number_format = "0.0"
        for c in range(1, 9):
            ws.cell(row=r, column=c).border = border
            ws.cell(row=r, column=c).font = Font(name="Times New Roman", size=12, bold=True)
        group_rows[grp + "_sum"] = [r]
        r += 1

    a_sum, b_sum = group_rows["A_sum"][0], group_rows["B_sum"][0]
    for label, g_f, h_f, n in (
        ("TỔNG CỘNG CHIỀU DÀI TỊNH (A + B)", f"=G{a_sum}+G{b_sum}", f"=H{a_sum}+H{b_sum}", None),
        (f"SỐ CÂY 6 m THEO SƠ ĐỒ CẮT TỐI ƯU (mạch cắt {KERF:.0f} mm)", None, None, len(bins)),
        (f"ĐỀ XUẤT MUA (+{SPARE_BARS} cây dự phòng)", None, None, len(bins) + SPARE_BARS),
    ):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
        ws.cell(row=r, column=1, value=label).font = f_total
        if g_f:
            ws.cell(row=r, column=7, value=g_f).number_format = "0.00"
            ws.cell(row=r, column=8, value=h_f).number_format = "0.0"
        else:
            ws.cell(row=r, column=6, value=n)
            ws.cell(row=r, column=7, value=f"=F{r}*$K$6").number_format = "0.00"
            ws.cell(row=r, column=8, value=f"=G{r}*$K$5").number_format = "0.0"
        for c in range(1, 9):
            cell = ws.cell(row=r, column=c)
            cell.border = border
            cell.font = f_total
            cell.alignment = left if c == 1 else center
        r += 1

    ws["J5"], ws["K5"] = "m (kg/m)", round(MASS, 4)
    ws["J6"], ws["K6"] = "Cây (m)", STOCK / 1000
    for cref in ("J5", "K5", "J6", "K6"):
        ws[cref].font = f_base
    widths = [6, 9, 52, 16, 13, 13, 13, 15, 2, 10, 9]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A5"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    ws2 = wb.create_sheet("So do cat")
    for c, hname in enumerate(["Cây số", "Các đoạn cắt (ký hiệu: dài mm)", "Tổng dùng (mm)", "Dư (mm)"], 1):
        cell = ws2.cell(row=1, column=c, value=hname)
        cell.font, cell.fill, cell.alignment, cell.border = f_head, fill_head, center, border
    for i, b in enumerate(bins, 1):
        waste = bar_waste(b)
        vals = [i, " + ".join(f"{m}:{ln}" for m, ln in b), round(STOCK - waste), round(waste)]
        for c, v in enumerate(vals, 1):
            cell = ws2.cell(row=i + 1, column=c, value=v)
            cell.font, cell.border = f_base, border
            cell.alignment = left if c == 2 else center
    for i, w in enumerate([9, 95, 15, 11], 1):
        ws2.column_dimensions[get_column_letter(i)].width = w
    wb.save(path)


# ============================================================================
# 5. MAIN
# ============================================================================
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent, help="Thư mục xuất file")
    ap.add_argument("--no-png", action="store_true", help="Không xuất ảnh PNG")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    g = build_geometry()
    items = build_items(g)
    bins = cutting_plan(items)

    print(f"{'KH':4}{'Tên cấu kiện':55}{'Dài':>7}{'SL':>5}{'Tổng m':>9}{'kg':>8}")
    for it in items:
        print(f"{it.mark:4}{it.name:55}{it.length:7d}{it.qty:5d}{it.total_m:9.2f}{it.kg:8.1f}")
    a = sum(i.total_m for i in items if i.group == "A")
    b = sum(i.total_m for i in items if i.group == "B")
    print(f"Khung mặt A = {a:.2f} m | Hệ chống B = {b:.2f} m | Tổng = {a + b:.2f} m = {(a + b) * MASS:.1f} kg")
    print(f"Số cây 6 m theo sơ đồ cắt tối ưu: {len(bins)} | đề xuất mua: {len(bins) + SPARE_BARS}")
    for i, bn in enumerate(bins, 1):
        print(f"  Cây {i:2d}: " + " + ".join(f"{m}:{ln}" for m, ln in bn) + f"  | dư {bar_waste(bn):.0f}")

    dxf_path = args.out / f"{OUT_STEM}.dxf"
    doc = build_dxf(g, items, bins, dxf_path)
    export_xlsx(items, bins, args.out / f"BOQ_{OUT_STEM}.xlsx")
    if not args.no_png:
        export_png(doc, args.out / f"{OUT_STEM}.png")
    print(f"Đã xuất: {dxf_path.name}, BOQ_{OUT_STEM}.xlsx" + ("" if args.no_png else f", {OUT_STEM}.png"))


if __name__ == "__main__":
    main()

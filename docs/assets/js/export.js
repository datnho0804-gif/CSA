/*!
 * Bảng hiệu – xuất file: Excel (.xlsx, ExcelJS), CSV, PNG, tải file, in PDF.
 */
(function (root) {
  'use strict';
  const SB = (root.SB = root.SB || {});
  const U = SB.util;
  const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => resolve(); s.onerror = () => reject(new Error('Không tải được thư viện: ' + src));
      document.head.appendChild(s);
    });
  }

  function fileBase(res) {
    const code = String(res.p.project.code || 'BH').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w-]+/g, '_');
    return `${code}_${res.p.L}x${res.p.H}`;
  }

  /** SVG -> PNG (Blob) */
  function svgToPng(svg, wmm, hmm, pxPerMm = 6) {
    return new Promise((resolve, reject) => {
      const w = Math.round(wmm * pxPerMm), h = Math.round(hmm * pxPerMm);
      const src = svg.replace(/width="[^"]*" height="[^"]*"/, `width="${w}" height="${h}"`);
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG'))), 'image/png');
      };
      img.onerror = () => reject(new Error('Không dựng được ảnh từ SVG'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    });
  }

  /* ------------------------------------------------------------------ */
  /* CSV (dấu ; và dấu thập phân phẩy cho Excel tiếng Việt)               */
  /* ------------------------------------------------------------------ */
  function csv(res) {
    const q = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(Math.round(v * 1000) / 1000).replace('.', ',');
      const s = String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    const row = (...a) => lines.push(a.map(q).join(';'));
    row(`BẢNG KÊ THANH CẮT – ${res.p.project.name} ${res.p.L}×${res.p.H} mm`);
    row('TT', 'KH', 'Tên cấu kiện', 'Quy cách', 'Dài cắt (mm)', 'SL', 'Tổng dài (m)', 'KL (kg)', 'Vị trí lắp');
    res.pieces.forEach((g, i) => row(i + 1, g.mark, g.name, g.sec.name, g.len, g.qty, g.totalLen / 1000, g.kg, g.locs.join('; ')));
    row('', 'Σ', 'Tổng', '', '', res.totals.pieces, res.totals.netLen, res.totals.netKg, '');
    row('');
    row('SƠ ĐỒ PHA CẮT CÂY 6 m');
    row('Quy cách', 'Số cây', 'Các đoạn cắt (KH:dài)', 'Dư (mm)');
    for (const e of res.cut) for (const p of e.plan.patterns) row(e.sec.name, p.count, p.pieces.map((x) => `${x.mark}:${x.len}`).join(' + '), p.waste);
    row('');
    row('VẬT TƯ CẦN MUA');
    row('TT', 'Nhóm', 'Vật tư', 'Quy cách', 'ĐVT', 'SL tính', 'SL mua', 'Ghi chú');
    res.purchase.forEach((r, i) => row(i + 1, r.group, r.name, r.spec, r.unit, r.qtyNet, r.qtyBuy, r.note));
    return '﻿' + lines.join('\r\n');
  }

  /* ------------------------------------------------------------------ */
  /* Excel (.xlsx)                                                        */
  /* ------------------------------------------------------------------ */
  async function xlsx(res) {
    if (!root.ExcelJS) await loadScript(EXCELJS_URL);
    const ExcelJS = root.ExcelJS;
    const p = res.p;
    const BLUE = 'FF005BAC', RED = 'FFE60012', CHIP = 'FFE8F1FB';
    const F = (o) => Object.assign({ name: 'Times New Roman', size: 12 }, o || {});
    const thin = { style: 'thin', color: { argb: 'FF8A94A6' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const wb = new ExcelJS.Workbook();
    wb.creator = p.project.author || 'Thiết kế khung bảng hiệu';
    wb.created = new Date();
    const page = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

    const title = (ws, text, n, sub) => {
      ws.mergeCells(1, 1, 1, n);
      const c = ws.getCell(1, 1);
      c.value = text; c.font = F({ size: 14, bold: true, color: { argb: BLUE } }); c.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 24;
      if (sub) {
        ws.mergeCells(2, 1, 2, n);
        const s = ws.getCell(2, 1);
        s.value = sub; s.font = F({ size: 11, italic: true }); s.alignment = { horizontal: 'center' };
      }
    };
    const header = (ws, r, labels) => {
      const row = ws.getRow(r);
      labels.forEach((l, i) => {
        const c = row.getCell(i + 1);
        c.value = l; c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } });
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border;
      });
      row.height = 32;
    };
    const style = (ws, r, n, o = {}) => {
      const row = ws.getRow(r);
      for (let i = 1; i <= n; i++) {
        const c = row.getCell(i);
        c.border = border;
        c.font = F(o.font);
        if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
        c.alignment = Object.assign({ vertical: 'middle', wrapText: true }, (o.left || []).includes(i) ? { horizontal: 'left' } : { horizontal: 'center' });
      }
    };
    const sub = `${p.project.name} – ${p.L} × ${p.H} mm – ${p.mount === 'roof' ? 'dựng trên mái, chống xiên' : 'áp tường, bắt pát'} – ngày ${p.project.date}`;

    // 1. Cắt thép
    {
      const ws = wb.addWorksheet('Cắt thép', { pageSetup: page, views: [{ state: 'frozen', ySplit: 4 }] });
      ws.columns = [{ width: 6 }, { width: 8 }, { width: 46 }, { width: 18 }, { width: 11 }, { width: 8 }, { width: 11 }, { width: 9 }, { width: 11 }, { width: 40 }, { width: 22 }];
      title(ws, 'BẢNG KÊ CHI TIẾT THANH CẮT – THÉP HỘP MẠ KẼM', 11, sub);
      header(ws, 4, ['TT', 'KH', 'Tên cấu kiện', 'Quy cách', 'Dài cắt (mm)', 'SL (thanh)', 'Tổng dài (m)', 'kg/m', 'KL (kg)', 'Vị trí lắp', 'Ghi chú']);
      let r = 5, n = 0;
      const subRows = [];
      for (const e of res.cut) {
        ws.mergeCells(r, 1, r, 11);
        const g = ws.getCell(r, 1);
        g.value = `${e.sec.name} – mạ kẽm (${U.fmt(e.sec.kgm, 3)} kg/m) – ${e.plan.nBars} cây 6 m theo sơ đồ cắt`;
        g.font = F({ bold: true, color: { argb: BLUE } }); g.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CHIP } };
        r++;
        const first = r;
        for (const pc of res.pieces.filter((x) => x.secId === e.sec.id)) {
          n++;
          const note = pc.angle ? `cắt vát 2 đầu, α≈${Math.round(pc.angle)}°` : (pc.role === 'D2' ? 'cắt vát 45°' : (pc.role === 'C5' ? 'hàn đính 30 mm @150 hai bên' : ''));
          ws.getRow(r).values = [n, pc.mark, pc.name, pc.sec.name, pc.len, pc.qty, null, Math.round(pc.sec.kgm * 1000) / 1000, null, pc.locs.join('; '), note];
          ws.getCell(r, 7).value = { formula: `E${r}*F${r}/1000`, result: pc.totalLen / 1000 };
          ws.getCell(r, 9).value = { formula: `G${r}*H${r}`, result: pc.kg };
          style(ws, r, 11, { left: [3, 10, 11] });
          ws.getCell(r, 2).font = F({ bold: true, color: { argb: BLUE } });
          ws.getCell(r, 7).numFmt = '#,##0.00'; ws.getCell(r, 9).numFmt = '#,##0.0'; ws.getCell(r, 8).numFmt = '0.000';
          r++;
        }
        ws.getRow(r).values = ['', '', `Cộng ${e.sec.name}`, '', '', null, null, '', null, '', ''];
        ws.getCell(r, 6).value = { formula: `SUM(F${first}:F${r - 1})` };
        ws.getCell(r, 7).value = { formula: `SUM(G${first}:G${r - 1})` };
        ws.getCell(r, 9).value = { formula: `SUM(I${first}:I${r - 1})` };
        style(ws, r, 11, { left: [3], font: { bold: true } });
        ws.getCell(r, 7).numFmt = '#,##0.00'; ws.getCell(r, 9).numFmt = '#,##0.0';
        subRows.push(r);
        r++;
      }
      ws.getRow(r).values = ['', 'Σ', 'TỔNG CỘNG THÉP HỘP (chiều dài tịnh)', '', '', null, null, '', null, '', ''];
      ws.getCell(r, 6).value = { formula: subRows.map((x) => `F${x}`).join('+') };
      ws.getCell(r, 7).value = { formula: subRows.map((x) => `G${x}`).join('+') };
      ws.getCell(r, 9).value = { formula: subRows.map((x) => `I${x}`).join('+') };
      style(ws, r, 11, { left: [3], font: { bold: true, color: { argb: RED } } });
      ws.getCell(r, 7).numFmt = '#,##0.00'; ws.getCell(r, 9).numFmt = '#,##0.0';
    }

    // 2. Pha cắt
    {
      const ws = wb.addWorksheet('Pha cắt 6m', { pageSetup: page, views: [{ state: 'frozen', ySplit: 4 }] });
      ws.columns = [{ width: 18 }, { width: 14 }, { width: 9 }, { width: 80 }, { width: 12 }, { width: 10 }];
      title(ws, 'SƠ ĐỒ PHA CẮT CÂY THÉP 6 m (mạch cắt 3 mm, cắt vuông đầu cây 10 mm)', 6, sub);
      header(ws, 4, ['Quy cách', 'Cây số', 'SL cây', 'Các đoạn cắt (ký hiệu: dài mm)', 'Dùng (mm)', 'Dư (mm)']);
      let r = 5;
      for (const e of res.cut) {
        let no = 0;
        for (const pt of e.plan.patterns) {
          const a = no + 1, b = no + pt.count; no = b;
          ws.getRow(r).values = [e.sec.name, pt.count > 1 ? `#${a} ÷ #${b}` : `#${a}`, pt.count, pt.pieces.map((x) => `${x.mark}: ${x.len}`).join('  +  '), 6000 - pt.waste, pt.waste];
          style(ws, r, 6, { left: [4] });
          r++;
        }
        ws.getRow(r).values = [`Cộng ${e.sec.name}`, '', e.plan.nBars, `Tịnh ${U.fmt(e.netLen / 1000, 2)} m – mua ${e.plan.nBars} cây = ${U.fmt(e.plan.nBars * 6, 0)} m`, '', ''];
        style(ws, r, 6, { left: [1, 4], font: { bold: true, color: { argb: BLUE } }, fill: CHIP });
        r += 2;
      }
    }

    // 3. Tôn
    {
      const f = res.face;
      const ws = wb.addWorksheet('Tôn 3 dem', { pageSetup: page });
      ws.columns = [{ width: 6 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 22 }];
      title(ws, `TÔN PHẲNG 3 DEM (0,30 mm) KHỔ 1 m – ${f.dir === 'h' ? 'TRẢI NGANG' : 'TRẢI ĐỨNG'}`, 7, sub);
      header(ws, 4, ['TT', 'Tấm', 'Dài cắt (mm)', 'Rộng dùng (mm)', 'Xẻ từ khổ 1 m', 'Vị trí x (mm)', 'Vị trí y (mm)']);
      let r = 5;
      f.strips.forEach((s, i) => {
        ws.getRow(r).values = [i + 1, `T${s.no}`, s.cut, Math.round(f.dir === 'h' ? s.h : s.w), s.rip ? 'Có' : 'Không', `${Math.round(s.x)} ÷ ${Math.round(s.x + s.w)}`, `${Math.round(s.y)} ÷ ${Math.round(s.y + s.h)}`];
        style(ws, r, 7); r++;
      });
      const first = 5, last = r - 1;
      ws.getRow(r).values = ['', 'Σ', { formula: `SUM(C${first}:C${last})/1000` }, '', 'm dài cần mua', '', ''];
      style(ws, r, 7, { font: { bold: true, color: { argb: RED } } }); ws.getCell(r, 3).numFmt = '#,##0.00';
      r++;
      ws.getRow(r).values = ['', '', { formula: `C${r - 1}*1` }, '', 'm² (khổ 1 m)', '', ''];
      style(ws, r, 7, { font: { bold: true } }); ws.getCell(r, 3).numFmt = '#,##0.00';
      r++;
      ws.getRow(r).values = ['', '', { formula: `C${r - 1}*0.3*7.85` }, '', 'kg (thép 0,30 mm)', '', ''];
      style(ws, r, 7, { font: { bold: true } }); ws.getCell(r, 3).numFmt = '#,##0.0';
      r += 2;
      ws.mergeCells(r, 1, r, 7);
      ws.getCell(r, 1).value = `${f.fast.name}: bước ${f.fast.pitch} mm trên mọi thanh khung – tính ${f.fast.count} con, mua ${f.fast.packs} ${f.fast.packName}. Giáp mí tôn trên tim thanh khung, bắn so le 2 hàng tại mối giáp mí.`;
      ws.getCell(r, 1).font = F({ italic: true }); ws.getCell(r, 1).alignment = { wrapText: true };
      ws.getRow(r).height = 36;
    }

    // 4. Vật tư mua
    {
      const ws = wb.addWorksheet('Vật tư mua', { pageSetup: page, views: [{ state: 'frozen', ySplit: 4 }] });
      ws.columns = [{ width: 6 }, { width: 12 }, { width: 44 }, { width: 40 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 15 }, { width: 34 }];
      title(ws, 'BẢNG VẬT TƯ CẦN MUA', 10, sub);
      header(ws, 4, ['TT', 'Nhóm', 'Vật tư', 'Quy cách', 'ĐVT', 'SL tính', 'SL mua', 'Đơn giá (đ)', 'Thành tiền (đ)', 'Ghi chú']);
      let r = 5;
      res.purchase.forEach((it, i) => {
        let price = null;
        const m = it.name.match(/Thép hộp mạ kẽm (\d+)×(\d+)×([\d.]+)/);
        if (m && p.cost.steel > 0) {
          const sec = SB.catalog.get(`${m[1]}x${m[2]}x${m[3]}`);
          price = Math.round(6 * sec.kgm * p.cost.steel / 100) * 100;
        }
        ws.getRow(r).values = [i + 1, it.group, it.name, it.spec, it.unit, it.qtyNet, it.qtyBuy, price, null, it.note];
        ws.getCell(r, 9).value = { formula: `IF(H${r}="","",G${r}*H${r})` };
        style(ws, r, 10, { left: [2, 3, 4, 10] });
        ws.getCell(r, 6).numFmt = '#,##0.##'; ws.getCell(r, 7).numFmt = '#,##0.##';
        ws.getCell(r, 8).numFmt = '#,##0'; ws.getCell(r, 9).numFmt = '#,##0';
        r++;
      });
      ws.getRow(r).values = ['', '', 'TỔNG CỘNG (các dòng có đơn giá)', '', '', '', '', '', { formula: `SUM(I5:I${r - 1})` }, 'Đơn giá thép = 6 m × kg/m × giá đ/kg nhập trên web'];
      style(ws, r, 10, { left: [3, 10], font: { bold: true, color: { argb: RED } } });
      ws.getCell(r, 9).numFmt = '#,##0';
    }

    // 5. Kiểm tra
    {
      const w = res.wind;
      const ws = wb.addWorksheet('Kiểm tra', { pageSetup: page });
      ws.columns = [{ width: 14 }, { width: 44 }, { width: 34 }, { width: 13 }, { width: 11 }, { width: 60 }];
      title(ws, 'KIỂM TRA SƠ BỘ THEO TẢI GIÓ (TCVN 2737)', 6, sub);
      const info = [
        ['Vùng gió', `${p.wind.zone} – W0 = ${U.fmt(w.W0, 2)} kN/m²`],
        ['Địa hình / cao độ', `${p.wind.terrain} – z = ${U.fmt(w.z, 1)} m – k = ${U.fmt(w.k, 3)}`],
        ['Hệ số khí động / vượt tải', `c = ${U.fmt(w.c, 2)}; γ = ${U.fmt(w.gamma, 2)}`],
        ['Áp lực gió tính toán', `q = ${U.fmt(w.qtt, 3)} kN/m² (tiêu chuẩn ${U.fmt(w.qtc, 3)})`],
        ['Vật liệu', res.regimeText],
      ];
      let r = 4;
      for (const [k, v] of info) {
        ws.getRow(r).values = [k, v]; ws.mergeCells(r, 2, r, 6);
        ws.getCell(r, 1).font = F({ bold: true }); ws.getCell(r, 2).font = F(); r++;
      }
      r++;
      header(ws, r, ['Nhóm', 'Cấu kiện', 'Quy cách', 'Hệ số sử dụng', 'Kết quả', 'Chi tiết']); r++;
      for (const c of res.checks) {
        ws.getRow(r).values = [c.group, c.member, c.sec, c.util, c.ok ? 'Đạt' : 'KHÔNG ĐẠT', c.detail];
        style(ws, r, 6, { left: [1, 2, 3, 6] });
        ws.getCell(r, 4).numFmt = '0%';
        ws.getCell(r, 5).font = F({ bold: true, color: { argb: c.ok ? 'FF17803D' : RED } });
        r++;
      }
      r++;
      header(ws, r, ['Bước chống', 'Quy cách (bao / giữa / thanh đứng chính / chống)', 'KL thép mua (kg) – số cây', 'Mối hàn', 'Chân/pát', 'Chi phí so sánh (đ)']); r++;
      for (const a of res.alternatives) {
        const s = a.cfg.sec;
        ws.getRow(r).values = [`mỗi ${a.cfg.k} khoang`, `${s.perim.id} / ${s.railInt.id} / ${s.colInt.id} / ${s.strut.id}`, `${U.fmt(a.kg, 1)} kg – ${a.bars} cây`, a.joints, a.feet || a.anchors, Math.round(a.cost)];
        style(ws, r, 6, { left: [2, 3] }); ws.getCell(r, 6).numFmt = '#,##0';
        r++;
      }
    }

    // 6. Thông số
    {
      const ws = wb.addWorksheet('Thông số', { pageSetup: page });
      ws.columns = [{ width: 36 }, { width: 70 }];
      title(ws, 'THÔNG SỐ ĐẦU VÀO', 2, sub);
      const rows = [
        ['Công trình / hạng mục', p.project.name], ['Mã hiệu', p.project.code], ['Người lập', p.project.author], ['Ngày', p.project.date],
        ['Kích thước L × H (mm)', `${p.L} × ${p.H}`], ['Bước ô lưới (mm)', p.grid], ['Số ô', res.geo.nCells],
        ['Kiểu lắp đặt', p.mount === 'roof' ? 'Dựng trên mái – chống xiên phía sau' : 'Áp tường – bắt pát'],
        ['Bước chống / pát', p.strut.spacing === 'auto' ? `Tự động → mỗi ${res.cfg.k} khoang` : `mỗi ${p.strut.spacing} khoang`],
        ['Tầm vươn chân chống (mm)', res.strut ? U.mm(res.strut.end.D) : '–'],
        ['Cao độ nút chống (mm)', res.strut ? U.mm(res.strut.end.ys) : '–'],
        ['Đèn pha', res.lamps.length ? `${res.lamps.length} bộ – cần ${p.lamps.rise} + ${p.lamps.reach} mm – ${p.lamps.power} W` : 'Không'],
        ['Mặt bảng', `Tôn phẳng 3 dem khổ 1 m – ${res.face.dir === 'h' ? 'trải ngang' : 'trải đứng'}; ${res.face.fast.name} @${res.face.fast.pitch}`],
        ['Quy cách thép đã chọn', res.sections.map((s) => s.name).join('; ')],
      ];
      rows.forEach((x, i) => { ws.getRow(4 + i).values = x; ws.getCell(4 + i, 1).font = F({ bold: true }); ws.getCell(4 + i, 2).font = F(); });
    }
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ------------------------------------------------------------------ */
  /* In PDF                                                               */
  /* ------------------------------------------------------------------ */
  function print(sheets) {
    const rootEl = document.getElementById('print-root');
    const paper = sheets[0].paper;
    rootEl.innerHTML = sheets.map((sh) => `<div class="print-sheet">${SB.drawing.sheetToSVG(sh, { width: `${paper.w}mm`, height: `${paper.h}mm` })}</div>`).join('');
    let st = document.getElementById('print-page-style');
    if (!st) { st = document.createElement('style'); st.id = 'print-page-style'; document.head.appendChild(st); }
    st.textContent = `@page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }`;
    setTimeout(() => root.print(), 60);
  }

  SB.exporter = { download, xlsx, csv, svgToPng, print, fileBase, EXCELJS_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);

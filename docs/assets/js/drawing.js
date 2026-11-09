/*!
 * Bảng hiệu – bản vẽ: dựng các hình chiếu (mặt đứng, mặt cắt, mặt bằng, trải tôn),
 * bảng biểu, sơ đồ pha cắt, khung tên; ghép tờ A3/A2/A1; xuất SVG và DXF (R12).
 * Mọi hình chiếu vẽ theo kích thước thật (mm); chữ/khoảng cách chú thích tính theo mm giấy x tỷ lệ.
 */
(function (root) {
  'use strict';
  const SB = (root.SB = root.SB || {});
  const U = SB.util;
  const CAT = SB.catalog;

  const LAYERS = {
    KHUNG: { aci: 5, color: '#005BAC' },
    KHUNG_C: { aci: 4, color: '#004A8C' },
    CHONG: { aci: 1, color: '#E60012' },
    GIANG: { aci: 6, color: '#A3267F' },
    TON: { aci: 3, color: '#1F8A4C' },
    DEN: { aci: 30, color: '#D98200' },
    TRUC: { aci: 8, color: '#7A7A7A' },
    DIM: { aci: 2, color: '#1C6E3A' },
    TEXT: { aci: 7, color: '#141414' },
    MAI: { aci: 8, color: '#6E4B2A' },
    HATCH: { aci: 9, color: '#9C9C9C' },
    BANG: { aci: 7, color: '#2B2B2B' },
    VIEN: { aci: 7, color: '#141414' },
  };
  const DASH = { dash: [3, 1.5], center: [6, 1.5, 1, 1.5], dot: [0.6, 1] };
  const SCALES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
  const PAPERS = {
    A3: { w: 420, h: 297, rw: 150 },
    A2: { w: 594, h: 420, rw: 230 },
    A1: { w: 841, h: 594, rw: 320 },
  };
  const BRAND = { blue: '#005BAC', red: '#E60012', navy: '#0B2545', mint: '#6EE7B7' };
  const FILL = { frame: '#C9DDF2', main: '#93BCE3', cut: '#6F9FD3', strut: '#F8C7CD', brace: '#EBC8E3', ton1: '#D3F1E1', ton2: '#E8F8EF', lamp: '#FFD84D', conc: '#ECE6DC' };

  const charW = (bold) => (bold ? 0.56 : 0.5);
  const textWidth = (s, h, bold) => String(s).length * h * charW(bold);

  /* ------------------------------------------------------------------ */
  /* Bộ ghi hình (Ctx)                                                    */
  /* ------------------------------------------------------------------ */
  class Ctx {
    /** k = số mm thật ứng với 1 mm giấy (tỷ lệ 1:k); bảng biểu dùng k = 1 */
    constructor(k) { this.k = k; this.items = []; }
    P(v) { return v * this.k; }
    _p(o) { this.items.push(o); return o; }
    line(x1, y1, x2, y2, layer, o = {}) {
      return this._p({ t: 'line', x1, y1, x2, y2, layer: layer || 'TEXT', lw: o.lw || 0.25, dash: o.dash || null, color: o.color || null });
    }
    poly(pts, layer, o = {}) {
      return this._p({ t: 'poly', pts, closed: o.closed !== false, layer: layer || 'TEXT', lw: o.lw === undefined ? 0.25 : o.lw, fill: o.fill || null, dash: o.dash || null, color: o.color || null });
    }
    rect(x, y, w, h, layer, o = {}) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], layer, o); }
    circle(x, y, r, layer, o = {}) { return this._p({ t: 'circle', x, y, r, layer: layer || 'TEXT', lw: o.lw || 0.25, fill: o.fill || null, color: o.color || null }); }
    /** hp = cỡ chữ giấy (mm) */
    text(x, y, s, hp, o = {}) {
      return this._p({
        t: 'text', x, y, s: String(s), h: hp * this.k, anchor: o.anchor || 'start', base: o.base || 'alpha',
        rot: o.rot || 0, layer: o.layer || 'TEXT', bold: !!o.bold, color: o.color || null, italic: !!o.italic,
      });
    }
    hatch(x0, y0, w, h, spacingPaper, layer, o = {}) {
      const s = this.P(spacingPaper);
      for (let d = -h; d < w; d += s) {
        const t0 = Math.max(0, -d), t1 = Math.min(h, w - d);
        if (t1 > t0) this.line(x0 + d + t0, y0 + t0, x0 + d + t1, y0 + t1, layer || 'HATCH', { lw: o.lw || 0.13 });
      }
    }
    cross(x, y, w, h, layer) {
      this.line(x, y, x + w, y + h, layer, { lw: 0.13 });
      this.line(x, y + h, x + w, y, layer, { lw: 0.13 });
    }
    tube(p1, p2, w, layer, o = {}) {
      const [x1, y1] = p1, [x2, y2] = p2;
      const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / L * w / 2, ny = (x2 - x1) / L * w / 2;
      this.poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], layer, o);
      if (o.axis) this.line(x1, y1, x2, y2, 'TRUC', { dash: 'center', lw: 0.13 });
    }
    arrow(x1, y1, x2, y2, layer, o = {}) {
      const hl = this.P(o.head || 2.2), hw = this.P((o.head || 2.2) * 0.35);
      const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      this.line(x1, y1, x2 - ux * hl * 0.6, y2 - uy * hl * 0.6, layer, { lw: o.lw || 0.3 });
      this.poly([[x2, y2], [x2 - ux * hl - uy * hw, y2 - uy * hl + ux * hw], [x2 - ux * hl + uy * hw, y2 - uy * hl - ux * hw]], layer,
        { fill: (LAYERS[layer] || LAYERS.TEXT).color, lw: 0.1 });
    }
    tick(x, y) {
      const d = this.P(0.9);
      this.line(x - d, y - d, x + d, y + d, 'DIM', { lw: 0.35 });
    }
    /** Kích thước ngang: gióng từ yRef tới đường kích thước yDim */
    dimH(x1, x2, yRef, yDim, o = {}) {
      if (Math.abs(x2 - x1) < 1e-6) return;
      const g = this.P(1), ov = this.P(1.2), dir = yDim < yRef ? -1 : 1;
      this.line(x1, yRef + dir * g, x1, yDim + dir * ov, 'DIM', { lw: 0.13 });
      this.line(x2, yRef + dir * g, x2, yDim + dir * ov, 'DIM', { lw: 0.13 });
      this.line(x1 - this.P(1), yDim, x2 + this.P(1), yDim, 'DIM', { lw: 0.18 });
      this.tick(x1, yDim); this.tick(x2, yDim);
      const s = o.text !== undefined ? o.text : U.mm(Math.abs(x2 - x1));
      const hp = o.h || 2.2;
      const fits = textWidth(s, hp) * this.k < Math.abs(x2 - x1) - this.P(2);
      const xm = fits ? (x1 + x2) / 2 : Math.max(x1, x2) + this.P(1.5);
      this.text(xm, yDim + this.P(0.8), s, hp, { anchor: fits ? 'middle' : 'start', layer: 'DIM' });
    }
    /** Kích thước đứng: gióng từ xRef tới đường kích thước xDim */
    dimV(y1, y2, xRef, xDim, o = {}) {
      if (Math.abs(y2 - y1) < 1e-6) return;
      const g = this.P(1), ov = this.P(1.2), dir = xDim < xRef ? -1 : 1;
      this.line(xRef + dir * g, y1, xDim + dir * ov, y1, 'DIM', { lw: 0.13 });
      this.line(xRef + dir * g, y2, xDim + dir * ov, y2, 'DIM', { lw: 0.13 });
      this.line(xDim, y1 - this.P(1), xDim, y2 + this.P(1), 'DIM', { lw: 0.18 });
      this.tick(xDim, y1); this.tick(xDim, y2);
      const s = o.text !== undefined ? o.text : U.mm(Math.abs(y2 - y1));
      const hp = o.h || 2.2;
      const fits = textWidth(s, hp) * this.k < Math.abs(y2 - y1) - this.P(2);
      const ym = fits ? (y1 + y2) / 2 : Math.max(y1, y2) + this.P(1.5);
      this.text(xDim - this.P(0.8), ym, s, hp, { anchor: fits ? 'middle' : 'start', rot: 90, layer: 'DIM' });
    }
    bubble(x, y, label, o = {}) {
      const r = this.P(o.r || 3);
      this.circle(x, y, r, o.layer || 'TRUC', { lw: 0.25, fill: o.fill || '#FFFFFF' });
      this.text(x, y, label, o.h || 2.4, { anchor: 'middle', base: 'middle', bold: true, layer: o.textLayer || 'TEXT' });
    }
    /** Đường dẫn ghi chú: đầu mũi tại tip, chữ tại (tx, ty) */
    leader(tip, tx, ty, label, o = {}) {
      const sh = this.P(2) * (o.anchor === 'end' ? -1 : 1);
      this.circle(tip[0], tip[1], this.P(0.45), 'TEXT', { fill: '#141414', lw: 0.1 });
      this.line(tip[0], tip[1], tx, ty, 'TEXT', { lw: 0.15 });
      this.line(tx, ty, tx + sh, ty, 'TEXT', { lw: 0.15 });
      this.text(tx + sh + this.P(o.anchor === 'end' ? -0.8 : 0.8), ty, label, o.h || 2.2,
        { anchor: o.anchor || 'start', base: 'middle', bold: !!o.bold, layer: o.layer || 'TEXT' });
    }
    bbox() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      for (const it of this.items) {
        if (it.t === 'line') { add(it.x1, it.y1); add(it.x2, it.y2); }
        else if (it.t === 'poly') it.pts.forEach(([x, y]) => add(x, y));
        else if (it.t === 'circle') { add(it.x - it.r, it.y - it.r); add(it.x + it.r, it.y + it.r); }
        else if (it.t === 'text') textCorners(it).forEach(([x, y]) => add(x, y));
      }
      if (x0 === Infinity) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    }
  }

  function textCorners(it) {
    const w = textWidth(it.s, it.h, it.bold);
    const ax = it.anchor === 'middle' ? -w / 2 : it.anchor === 'end' ? -w : 0;
    const by = it.base === 'middle' ? -0.5 * it.h : it.base === 'top' ? -it.h : -0.25 * it.h;
    const pts = [[ax, by], [ax + w, by], [ax + w, by + it.h], [ax, by + it.h]];
    const a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return pts.map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
  }

  /* ------------------------------------------------------------------ */
  /* Hình học phụ trợ                                                     */
  /* ------------------------------------------------------------------ */
  function sections(res) {
    const S = res.cfg.sec;
    const colSec = (i) => (i === 0 || i === res.geo.nV - 1 ? S.colEnd : S.colInt);
    const colBase = (i) => (colSec(i).composite ? CAT.get(colSec(i).baseId) : colSec(i));
    return { S, colSec, colBase };
  }

  function frameRects(res) {
    const { geo, cfg } = res;
    const { S, colSec, colBase } = sections(res);
    const bP = S.perim.b, bRi = S.railInt.b, bS = S.sub.b;
    const cols = cfg.cols, colSet = new Set(cols);
    const out = [
      { x: 0, y: 0, w: geo.L, h: bP, role: 'K1' },
      { x: 0, y: geo.H - bP, w: geo.L, h: bP, role: 'K1' },
    ];
    cols.forEach((i, n) => {
      const b = colBase(i).b;
      out.push({ x: res.xc[n] - b / 2, y: bP, w: b, h: geo.H - 2 * bP, role: 'K2', main: true, backed: colSec(i).composite });
    });
    geo.yLines.slice(1, -1).forEach((y) => {
      for (let n = 1; n < cols.length; n++) {
        const a = res.xc[n - 1] + colBase(cols[n - 1]).b / 2, b = res.xc[n] - colBase(cols[n]).b / 2;
        out.push({ x: a, y: y - bRi / 2, w: b - a, h: bRi, role: 'K3' });
      }
    });
    for (let i = 1; i < geo.nV - 1; i++) {
      if (colSet.has(i)) continue;
      for (let j = 0; j < geo.nR - 1; j++) {
        const y0 = j === 0 ? bP : geo.yLines[j] + bRi / 2;
        const y1 = j + 1 === geo.nR - 1 ? geo.H - bP : geo.yLines[j + 1] - bRi / 2;
        out.push({ x: geo.xLines[i] - bS / 2, y: y0, w: bS, h: y1 - y0, role: 'K4' });
      }
    }
    return out;
  }

  const fmtM = (mm) => U.fmt(mm / 1000, mm % 1000 === 0 ? 0 : (mm % 100 === 0 ? 1 : 2));
  const secShort = (s) => s.name.replace('Hộp ', '');

  /** Bố trí nhãn dọc theo cột chữ, tránh chồng chéo */
  function placeLabels(c, items, xText, o = {}) {
    if (!items.length) return;
    const gap = c.P(o.gap || 4.2);
    const arr = items.map((it) => Object.assign({ y: it.y !== undefined ? it.y : it.tip[1] }, it)).sort((a, b) => b.y - a.y);
    for (let i = 1; i < arr.length; i++) if (arr[i].y > arr[i - 1].y - gap) arr[i].y = arr[i - 1].y - gap;
    if (o.yMin !== undefined && arr[arr.length - 1].y < o.yMin) {
      const sh = o.yMin - arr[arr.length - 1].y;
      arr.forEach((a) => { a.y += sh; });
      for (let i = arr.length - 2; i >= 0; i--) if (arr[i].y < arr[i + 1].y + gap) arr[i].y = arr[i + 1].y + gap;
    }
    for (const a of arr) c.leader(a.tip, xText, a.y, a.text, { h: o.h || 2.2, anchor: o.anchor });
  }

  /* ------------------------------------------------------------------ */
  /* 1. Mặt đứng khung + lớp tôn                                         */
  /* ------------------------------------------------------------------ */
  function viewElevation(res, k) {
    const c = new Ctx(k);
    const { geo, p, cfg, face } = res;
    const { S, colBase } = sections(res);
    const L = geo.L, H = geo.H, bP = S.perim.b;
    const colSet = new Set(cfg.cols);
    // lớp tôn
    face.strips.forEach((s, n) => c.rect(s.x, s.y, s.w, s.h, 'TON', { fill: n % 2 ? FILL.ton2 : FILL.ton1, lw: 0.13 }));
    // khung
    for (const m of frameRects(res)) {
      c.rect(m.x, m.y, m.w, m.h, m.main ? 'KHUNG_C' : 'KHUNG', { fill: m.main ? FILL.main : FILL.frame, lw: 0.25 });
    }
    // mối nối ray bao K1
    for (const x of [...res.splices.bottom.map((v) => [v, 0]), ...res.splices.top.map((v) => [v, H - bP])]) {
      c.line(x[0], x[1] - c.P(1.2), x[0], x[1] + bP + c.P(1.2), 'CHONG', { lw: 0.35 });
    }
    // mối nối tôn
    for (const j of face.joints) c.line(j.x1, j.y1, j.x2, j.y2, 'TON', { dash: 'dash', lw: 0.4 });
    // ô lưới
    const cw = Math.min(...geo.bayW) / k, ch = Math.min(...geo.bayH) / k;
    if (cw >= 10 && ch >= 7.5) {
      let n = 1;
      const h1 = Math.min(2.4, ch / 4), h2 = Math.min(1.8, ch / 5);
      for (let j = geo.nR - 2; j >= 0; j--) {
        for (let i = 0; i < geo.nV - 1; i++) {
          const cx = (geo.xLines[i] + geo.xLines[i + 1]) / 2, cy = (geo.yLines[j] + geo.yLines[j + 1]) / 2;
          c.text(cx, cy + c.P(0.6), `Ô ${n}`, h1, { anchor: 'middle', bold: true });
          c.text(cx, cy - c.P(h2 + 0.6), `${fmtM(geo.bayW[i])}×${fmtM(geo.bayH[j])} m`, h2, { anchor: 'middle', layer: 'TON' });
          n++;
        }
      }
    }
    // đèn
    let top = H;
    res.lamps.forEach((lp, n) => {
      c.rect(lp.x - 10, H, 20, p.lamps.rise, 'DEN', { fill: FILL.lamp, lw: 0.2 });
      c.rect(lp.x - 150, H + p.lamps.rise, 300, 110, 'DEN', { fill: FILL.lamp, lw: 0.3 });
      c.text(lp.x, H + p.lamps.rise + 110 + c.P(1.2), `Đèn #${n + 1}`, 2.2, { anchor: 'middle', bold: true, layer: 'DEN' });
      top = Math.max(top, H + p.lamps.rise + 110 + c.P(4));
    });
    // trục ngang A, B, C...
    geo.yLines.forEach((y0, j) => {
      const y = j === 0 ? bP / 2 : j === geo.nR - 1 ? H - bP / 2 : y0;
      c.line(-c.P(4), y, 0, y, 'TRUC', { lw: 0.13 });
      c.bubble(-c.P(7), y, geo.axesH[j], { r: 2.8, h: 2.4 });
    });
    // kích thước
    const dimX = [0, ...geo.xLines.slice(1, -1), L];
    for (let i = 0; i < dimX.length - 1; i++) c.dimH(dimX[i], dimX[i + 1], 0, -c.P(6));
    c.dimH(0, L, 0, -c.P(12.5), { text: `${U.mm(L)}` });
    const dimY = [0, ...geo.yLines.slice(1, -1), H];
    for (let j = 0; j < dimY.length - 1; j++) c.dimV(dimY[j], dimY[j + 1], L, L + c.P(6));
    c.dimV(0, H, L, L + c.P(12.5), { text: `${U.mm(H)}` });
    // trục đứng T1..Tn
    const yb = -c.P(20);
    geo.xLines.forEach((x0, i) => {
      const isCol = colSet.has(i);
      const x = isCol ? res.xc[cfg.cols.indexOf(i)] : x0;
      c.line(x, -c.P(13.5), x, yb + c.P(2.8), 'TRUC', { dash: 'center', lw: 0.13 });
      c.bubble(x, yb, geo.axesV[i], {
        r: 2.8, h: 2.0, layer: isCol ? 'CHONG' : 'TRUC', fill: isCol ? '#FDE3E6' : '#FFFFFF',
      });
    });
    const mountTxt = p.mount === 'roof' ? 'chống xiên phía sau (C1+C2)' : 'bắt pát vào tường';
    c.text(0, yb - c.P(6), `Ghi chú: trục khoanh đỏ = thanh đứng chính có ${mountTxt}; nét đứt xanh = mối giáp mí tôn; vạch đỏ trên K1 = mối nối thanh.`, 1.9, { color: '#444' });
    // tiêu đề
    const title = `1. MẶT ĐỨNG KHUNG ${secShort(S.perim)}${S.colInt.id !== S.perim.id || S.colEnd.id !== S.perim.id ? ' (+ thanh đứng chính)' : ''} & LỚP TÔN PHẲNG 3 DEM (${U.mm(L)} × ${U.mm(H)} mm)`;
    c.text(L / 2, top + c.P(9), `${title} – TL 1:${k}`, 3.6, { anchor: 'middle', bold: true });
    c.text(L / 2, top + c.P(4), `${geo.nCells} ô lưới ${U.mm(geo.g)}×${U.mm(geo.g)} – tôn phẳng 3 dem khổ 1 m: ${face.strips.length} tấm ${face.dir === 'h' ? 'trải ngang' : 'trải đứng'}, giáp mí trên tim thanh khung`, 2.4, { anchor: 'middle', color: BRAND.blue });
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Mặt cắt A-A                                                      */
  /* ------------------------------------------------------------------ */
  function viewSection(res, k) {
    const c = new Ctx(k);
    const { geo, p, cfg } = res;
    const { S } = sections(res);
    const H = geo.H;
    const typInt = cfg.cols.length > 2;
    const colSec = typInt ? S.colInt : S.colEnd;
    const base = colSec.composite ? CAT.get(colSec.baseId) : colSec;
    const dF = base.h, dCol = colSec.h, bP = S.perim.b, hP = S.perim.h;
    const roof = p.mount === 'roof';
    const sg = roof ? (typInt && res.strut.int ? res.strut.int : res.strut.end) : null;
    const lampOn = res.lamps.length > 0;
    const reach = lampOn ? p.lamps.reach : 0;
    const labels = [];
    let rightEdge;
    let bottom;
    if (roof) {
      const gBot = Math.min(sg.drop, 0) - 250;
      c.rect(-150, gBot, dCol + 300, -gBot, 'MAI', { fill: FILL.conc, lw: 0.3 });
      c.hatch(-150, gBot, dCol + 300, -gBot, 2.2, 'HATCH');
      const r0 = dCol + 150, r1 = sg.D + 900, yr = sg.drop;
      c.line(r0, yr, r1, yr, 'MAI', { lw: 0.5 });
      const pts = [];
      const step = 75;
      for (let u = r0, n = 0; u <= r1; u += step / 2, n++) pts.push([u, yr - (n % 2 ? 18 : 0)]);
      c.poly(pts, 'MAI', { closed: false, lw: 0.18 });
      const pu = sg.D;
      c.poly([[pu + 30, yr - 25], [pu - 30, yr - 25], [pu - 30, yr - 125], [pu + 30, yr - 125]], 'MAI', { closed: false, lw: 0.4 });
      rightEdge = r1;
      bottom = Math.min(gBot, yr - 125);
      labels.push({ tip: [pu, yr - 75], text: 'Xà gồ hiện hữu – vít 6×65 + EPDM + silicone' });
      labels.push({ tip: [-100, gBot / 2], text: 'Gờ bê tông / sê nô hiện hữu', y: gBot / 2 });
    } else {
      const w0 = dCol + 60;
      c.rect(w0, -300, 240, H + 600, 'MAI', { fill: FILL.conc, lw: 0.3 });
      c.hatch(w0, -300, 240, H + 600, 2.2, 'HATCH');
      rightEdge = w0 + 240;
      bottom = -300;
      labels.push({ tip: [w0 + 120, -150], text: 'Tường hiện hữu', y: -150 });
    }
    // tôn + hiflex
    c.line(-c.P(0.35), 0, -c.P(0.35), H, 'TON', { lw: 0.7 });
    if (p.face.hiflex) c.line(-c.P(1.3), -c.P(1), -c.P(1.3), H + c.P(1), 'GIANG', { lw: 0.35, dash: 'dash' });
    // thanh đứng chính + ốp lưng
    c.rect(0, bP, dF, H - 2 * bP, 'KHUNG', { fill: FILL.main, lw: 0.3 });
    if (colSec.composite) {
      const y0 = hP <= dF ? 0 : bP, y1 = hP <= dF ? H : H - bP;
      c.rect(dF, y0, dF, y1 - y0, 'CHONG', { fill: '#F6D3D6', lw: 0.3 });
      labels.push({ tip: [dF * 1.5, H * 0.3], text: `C5 – ốp lưng ${secShort(base)} L=${U.mm(y1 - y0)}` });
    }
    // ray bị cắt
    const rails = [[0, bP, hP], [H - bP, bP, hP]];
    geo.yLines.slice(1, -1).forEach((y) => rails.push([y - S.railInt.b / 2, S.railInt.b, S.railInt.h]));
    for (const [y0, b, d] of rails) {
      c.rect(0, y0, d, b, 'KHUNG', { fill: FILL.cut, lw: 0.3 });
      c.cross(0, y0, d, b, 'KHUNG');
    }
    labels.push({ tip: [dF / 2, H * 0.62], text: `K2 – thanh đứng chính ${secShort(base)}` });
    labels.push({ tip: [hP * 0.6, H - bP / 2], text: `K1/K3 – thanh ngang ${secShort(S.perim)}${S.railInt.id !== S.perim.id ? ` / ${secShort(S.railInt)}` : ''}` });
    if (roof) {
      c.tube(sg.top, sg.foot, S.strut.b, 'CHONG', { fill: FILL.strut, lw: 0.3, axis: true });
      labels.push({ tip: [sg.top[0] + (sg.foot[0] - sg.top[0]) * 0.22, sg.top[1] + (sg.foot[1] - sg.top[1]) * 0.22],
        text: `C1 – chống xiên ${secShort(S.strut)} L≈${U.mm(U.ceilTo(sg.len, 10))}` });
      if (sg.hasK) {
        c.tube([sg.dCol, sg.yg], sg.mid, S.strut.b, 'GIANG', { fill: FILL.brace, lw: 0.3 });
        labels.push({ tip: [(sg.dCol + sg.mid[0]) / 2, (sg.yg + sg.mid[1]) / 2], text: `C2 – giằng K L≈${U.mm(U.ceilTo(sg.kLen, 10))}` });
      }
      const dx = sg.foot[0] - sg.top[0], dy = sg.foot[1] - sg.top[1], ln = Math.hypot(dx, dy);
      const nx = -dy / ln, ny = dx / ln;
      const cx = sg.mid[0] + nx * S.strut.b, cy = sg.mid[1] + ny * S.strut.b, b = S.strut.b;
      c.rect(cx - b / 2, cy - b / 2, b, b, 'GIANG', { fill: FILL.cut, lw: 0.3 }); c.cross(cx - b / 2, cy - b / 2, b, b, 'GIANG');
      labels.push({ tip: [cx, cy], text: 'C3 – giằng dọc nối các bộ chống' });
      const fy = sg.drop;
      c.rect(sg.D - b / 2, fy, b, b, 'CHONG', { fill: FILL.cut, lw: 0.3 }); c.cross(sg.D - b / 2, fy, b, b, 'CHONG');
      labels.push({ tip: [sg.D, fy + b / 2], text: 'C4 – chân dọc, trùng tim xà gồ' });
      // bát L chân bảng
      c.poly([[dCol, 0], [dCol + 45, 0], [dCol + 45, 4], [dCol + 4, 4], [dCol + 4, 45], [dCol, 45]], 'CHONG', { fill: '#F3A9B2', lw: 0.25 });
      labels.push({ tip: [dCol + 25, 3], text: `Bát L40×40×4 + ${res.accessories.anchorPer} tắc kê M8` });
    } else {
      const w0 = dCol + 60;
      geo.yLines.forEach((y0, j) => {
        const y = j === 0 ? bP / 2 : j === geo.nR - 1 ? H - bP / 2 : y0;
        c.poly([[dCol, y - 20], [w0, y - 20], [w0, y + 25], [w0 - 4, y + 25], [w0 - 4, y - 16], [dCol, y - 16]], 'CHONG', { fill: '#F3A9B2', lw: 0.25 });
        c.line(w0, y + 5, w0 + 80, y + 5, 'CHONG', { lw: 0.35 });
      });
      labels.push({ tip: [w0 - 2, H * 0.5], text: `Pát V40×40×4 + ${res.accessories.anchorPer} tắc kê M8/pát`, y: H * 0.5 });
    }
    // cần đèn
    let top = H;
    if (lampOn) {
      const rise = p.lamps.rise;
      c.rect(dF / 2 - 10, H, 20, rise, 'DEN', { fill: FILL.lamp, lw: 0.25 });
      c.rect(-reach, H + rise, reach + dF / 2 + 10, 20, 'DEN', { fill: FILL.lamp, lw: 0.25 });
      c.rect(-reach - 130, H + rise - 120, 260, 120, 'DEN', { fill: FILL.lamp, lw: 0.35 });
      c.line(-reach, H + rise - 120, -c.P(1), H * 0.45, 'DEN', { dash: 'dash', lw: 0.13 });
      c.line(-reach - 100, H + rise - 120, -c.P(1), H * 0.05, 'DEN', { dash: 'dash', lw: 0.13 });
      c.dimH(-reach, 0, H + rise + 20, H + rise + c.P(7));
      c.text(-reach / 2, H + rise + c.P(11.5), `Cần đèn D1+D2 (${U.mm(rise)} + ${U.mm(reach)}) + đèn pha LED`, 2.2, { anchor: 'middle', layer: 'DEN', bold: true });
      top = H + rise + c.P(14);
    }
    {
      const tip = [-c.P(0.35), H - c.P(2)];
      const tx = c.P(5), ty = H + c.P(5);
      c.circle(tip[0], tip[1], c.P(0.45), 'TEXT', { fill: '#141414', lw: 0.1 });
      c.line(tip[0], tip[1], tx, ty, 'TEXT', { lw: 0.15 });
      c.text(tx + c.P(0.8), ty, p.face.hiflex ? 'Tôn phẳng 3 dem + bạt Hiflex bọc ngoài' : 'Tôn phẳng 3 dem khổ 1 m (mặt trước)', 2.1, { anchor: 'start', base: 'middle', bold: true, layer: 'TON' });
      top = Math.max(top, ty + c.P(3));
    }
    // gió
    const aw = Math.min(c.P(16), Math.max(reach, c.P(10)));
    [0.22, 0.42, 0.62].forEach((t) => c.arrow(-aw - c.P(2), H * t, -c.P(1.6), H * t, 'TEXT', { head: 2 }));
    c.text(-aw / 2 - c.P(2), H * 0.62 + c.P(2.2), 'GIÓ', 2.2, { anchor: 'middle', bold: true });
    // kích thước đứng (bên trái)
    const xl = -Math.max(aw + c.P(4), reach + 150) - c.P(4);
    const dims = [[0, H, null]];
    if (roof) { dims.unshift([0, sg.ys, null]); if (sg.hasK) dims.unshift([0, sg.yg, null]); }
    dims.forEach(([a, b], n) => c.dimV(a, b, -c.P(1), xl - c.P(6) * n));
    // kích thước ngang (dưới)
    if (roof) {
      c.dimH(0, sg.D, bottom, bottom - c.P(6), { text: `${U.mm(sg.D)} (tầm vươn chân chống)` });
      c.dimH(0, sg.dCol, bottom, bottom - c.P(12));
    }
    // nhãn bên phải
    const xText = rightEdge + c.P(6);
    const left = labels.filter((l) => l.tip[0] < -1);
    const right = labels.filter((l) => l.tip[0] >= -1);
    placeLabels(c, right, xText, { yMin: bottom, h: 2.0, gap: 3.8 });
    left.forEach((l) => c.leader(l.tip, xl - c.P(4), l.y, l.text, { anchor: 'end' }));
    // tiêu đề
    const cx = (xl + rightEdge) / 2;
    c.text(cx, top + c.P(9), `2. MẶT CẮT A-A (${roof ? 'KHUNG + TÔN + HỆ CHỐNG SAU' : 'KHUNG + TÔN + PÁT TƯỜNG'}) – TL 1:${k}`, 3.6, { anchor: 'middle', bold: true });
    c.text(cx, top + c.P(4), roof ? `Chống xiên ${secShort(S.strut)} – chân chống cách mặt bảng ${U.mm(sg.D)} mm` : `Thanh đứng chính ${secShort(colSec)} – pát tại mọi đường ray`, 2.3, { anchor: 'middle', color: BRAND.blue });
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* 3. Mặt bằng hệ chống / pát + cần đèn                                */
  /* ------------------------------------------------------------------ */
  function viewPlan(res, k) {
    const c = new Ctx(k);
    const { geo, p, cfg } = res;
    const { S, colSec, colBase } = sections(res);
    const L = geo.L;
    const roof = p.mount === 'roof';
    const lampOn = res.lamps.length > 0;
    // tôn mặt trước
    c.line(0, c.P(0.5), L, c.P(0.5), 'TON', { lw: 0.7 });
    // ray bao trên nhìn từ trên
    c.rect(0, -S.perim.h, L, S.perim.h, 'KHUNG', { fill: FILL.frame, lw: 0.25 });
    cfg.cols.forEach((i, n) => {
      const cs = colSec(i), b = colBase(i).b;
      c.rect(res.xc[n] - b / 2, -cs.h, b, cs.h, 'KHUNG_C', { fill: cs.composite ? '#F6D3D6' : FILL.main, lw: 0.25 });
    });
    let bottom = -S.perim.h;
    const labels = [];
    if (roof) {
      const sgI = res.strut.int || res.strut.end;
      cfg.cols.forEach((i, n) => {
        const sg = (n === 0 || n === cfg.cols.length - 1) ? res.strut.end : sgI;
        c.tube([res.xc[n], -sg.dCol], [res.xc[n], -sg.D], S.strut.b, 'CHONG', { fill: FILL.strut, lw: 0.25 });
        c.rect(res.xc[n] - 40, -sg.D - 40, 80, 80, 'CHONG', { fill: '#E60012', lw: 0.1 });
      });
      const b = S.strut.b;
      const x0 = res.xc[0] - b / 2, x1 = res.xc[res.xc.length - 1] + b / 2;
      if (cfg.cols.length >= 2) {
        c.rect(x0, -sgI.mid[0] - b / 2, x1 - x0, b, 'GIANG', { fill: FILL.brace, lw: 0.25 });
        c.rect(x0, -sgI.D - b / 2, x1 - x0, b, 'CHONG', { fill: FILL.strut, lw: 0.25 });
        labels.push({ tip: [L * 0.62, -sgI.mid[0]], text: 'C3 – giằng dọc (nối giữa các C1)' });
        labels.push({ tip: [L * 0.42, -sgI.D], text: 'C4 – chân dọc trên mái' });
      }
      if (p.strut.endBracing && cfg.cols.length >= 3) {
        const e = res.strut.end;
        c.tube([res.xc[0], -e.dCol], [res.xc[1], -e.D], b, 'GIANG', { fill: FILL.brace, lw: 0.2 });
        const n = res.xc.length;
        c.tube([res.xc[n - 1], -e.dCol], [res.xc[n - 2], -e.D], b, 'GIANG', { fill: FILL.brace, lw: 0.2 });
        labels.push({ tip: [(res.xc[n - 1] + res.xc[n - 2]) / 2, -(e.dCol + e.D) / 2], text: 'C6 – giằng chéo đầu hồi (2 đầu)' });
      }
      labels.push({ tip: [res.xc[1] !== undefined ? res.xc[Math.min(1, res.xc.length - 1)] : res.xc[0], -(sgI.D * 0.3)], text: `C1 + C2 – ${cfg.cols.length} bộ chống xiên tại thanh đứng chính` });
      c.line(-c.P(6), -sgI.D, L + c.P(6), -sgI.D, 'TRUC', { dash: 'center', lw: 0.18 });
      c.text(-c.P(7), -sgI.D, 'Tim xà gồ', 2.0, { anchor: 'end', base: 'middle', color: '#555' });
      bottom = -sgI.D - 80;
      // kích thước phải
      c.dimV(-sgI.mid[0], 0, L, L + c.P(7));
      c.dimV(-sgI.D, 0, L, L + c.P(14));
    } else {
      const dmax = Math.max(...cfg.cols.map((i) => colSec(i).h));
      const w0 = dmax + 60;
      c.rect(-300, -w0 - 240, L + 600, 240, 'MAI', { fill: FILL.conc, lw: 0.3 });
      c.hatch(-300, -w0 - 240, L + 600, 240, 2.2, 'HATCH');
      cfg.cols.forEach((i, n) => c.rect(res.xc[n] - 25, -w0, 50, w0 - colSec(i).h, 'CHONG', { fill: '#F3A9B2', lw: 0.2 }));
      labels.push({ tip: [res.xc[Math.min(1, res.xc.length - 1)], -w0 + 10], text: `Pát tường tại ${cfg.cols.length} thanh đứng chính × ${geo.nR} đường ray` });
      labels.push({ tip: [L * 0.5, -w0 - 120], text: 'Tường hiện hữu' });
      bottom = -w0 - 240;
    }
    // cần đèn
    let top = c.P(1.5);
    if (lampOn) {
      res.lamps.forEach((lp) => {
        c.rect(lp.x - 10, -S.perim.h / 2, 20, p.lamps.reach + S.perim.h / 2, 'DEN', { fill: FILL.lamp, lw: 0.2 });
        c.rect(lp.x - 150, p.lamps.reach - 60, 300, 120, 'DEN', { fill: FILL.lamp, lw: 0.3 });
      });
      top = p.lamps.reach + 60;
      labels.push({ tip: [res.lamps[res.lamps.length - 1].x, p.lamps.reach], text: `${res.lamps.length} cần đèn vươn ${U.mm(p.lamps.reach)} + đèn pha LED`, y: p.lamps.reach + c.P(3) });
    }
    // kích thước trên: khoảng cách các tuyến chống/pát
    const yd = top + c.P(6);
    for (let n = 0; n < res.xc.length - 1; n++) c.dimH(res.xc[n], res.xc[n + 1], top, yd);
    c.dimH(0, L, top, yd + c.P(6.5), { text: U.mm(L) });
    placeLabels(c, labels, L + c.P(roof ? 22 : 8), { yMin: bottom });
    const tt = `${roof ? '3. MẶT BẰNG BỐ TRÍ HỆ CHỐNG SAU' : '3. MẶT BẰNG BẮT PÁT TƯỜNG'}${lampOn ? ' & CẦN ĐÈN' : ''}`;
    c.text(L / 2, yd + c.P(15.5), `${tt} – TL 1:${k}`, 3.6, { anchor: 'middle', bold: true });
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* 4. Sơ đồ trải tôn                                                   */
  /* ------------------------------------------------------------------ */
  function viewTon(res, k) {
    const c = new Ctx(k);
    const { geo, face } = res;
    const L = geo.L, H = geo.H;
    face.strips.forEach((s, n) => {
      c.rect(s.x, s.y, s.w, s.h, 'TON', { fill: n % 2 ? FILL.ton2 : FILL.ton1, lw: 0.25 });
      const ww = (face.dir === 'h' ? s.w : s.h) / k;
      const label = `T${s.no}: ${U.mm(s.cut)}×${U.mm(face.dir === 'h' ? s.h : s.w)}${s.rip ? ' (xẻ)' : ''}`;
      const hp = Math.min(2.2, (face.dir === 'h' ? s.h : s.w) / k / 3);
      if (hp >= 1.2 && textWidth(label, hp) < ww - 2) {
        c.text(s.x + s.w / 2, s.y + s.h / 2, label, hp, { anchor: 'middle', base: 'middle', bold: true, rot: face.dir === 'h' ? 0 : 90, layer: 'TON' });
      } else if (hp >= 1.2) {
        c.text(s.x + s.w / 2, s.y + s.h / 2, `T${s.no}`, hp, { anchor: 'middle', base: 'middle', bold: true, rot: face.dir === 'h' ? 0 : 90, layer: 'TON' });
      }
    });
    c.rect(0, 0, L, H, 'KHUNG', { lw: 0.35 });
    for (const j of face.joints) c.line(j.x1, j.y1, j.x2, j.y2, 'CHONG', { dash: 'dash', lw: 0.35 });
    c.dimH(0, L, 0, -c.P(6));
    c.dimV(0, H, L, L + c.P(6));
    if (face.dir === 'h') {
      let y = 0;
      geo.bayH.forEach((h) => { c.dimV(y, y + h, 0, -c.P(6)); y += h; });
    } else {
      let x = 0;
      geo.bayW.forEach((w) => { c.dimH(x, x + w, H, H + c.P(5)); x += w; });
    }
    const top = H + (face.dir === 'v' ? c.P(10) : c.P(2));
    c.text(L / 2, top + c.P(9), `4. SƠ ĐỒ TRẢI TÔN PHẲNG 3 DEM (0,30 mm) – KHỔ 1 m – TL 1:${k}`, 3.2, { anchor: 'middle', bold: true });
    c.text(L / 2, top + c.P(4.5), `${face.strips.length} tấm – mua ${U.fmt(face.buyM, 1)} m dài (${U.fmt(face.areaBuy, 2)} m², ≈${U.fmt(face.kg, 1)} kg) – mỗi tấm cộng ${U.mm(res.p.face.allowance)} mm mỗi đầu để cắt vuông`, 2.2, { anchor: 'middle', color: BRAND.blue });
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Bảng biểu & khối giấy (k = 1, gốc tại góc trên-trái, y âm đi xuống)   */
  /* ------------------------------------------------------------------ */
  function fitText(s, w, hp, bold) {
    let h = hp;
    while (h > 1.45 && textWidth(s, h, bold) > w) h -= 0.1;
    if (textWidth(s, h, bold) <= w) return { s, h };
    const n = Math.max(1, Math.floor(w / (h * charW(bold))) - 1);
    return { s: String(s).slice(0, n) + '…', h };
  }

  /**
   * cols: [{label, w, align}] ; rows: [{cells:[...], style:'total'|'group'|null}]
   * Trả về các khối (tách khi vượt chiều cao tối đa), mỗi khối là Ctx(k=1).
   */
  function tableBlocks(title, cols, rows, o = {}) {
    const rh = o.rowH || 5.2, hh = o.headH || 6.5, fs = o.font || 2.0;
    const W = U.sum(cols, (c) => c.w);
    const maxH = o.maxH || 1e9;
    const blocks = [];
    let i = 0, part = 0;
    while (i < rows.length || (rows.length === 0 && part === 0)) {
      const c = new Ctx(1);
      let y = 0;
      const t = part === 0 ? title : `${title} (tiếp)`;
      if (t) { c.text(0, y - 4, t, 3.0, { bold: true, color: BRAND.blue }); y -= 6.5; }
      // tiêu đề cột
      c.rect(0, y - hh, W, hh, 'BANG', { fill: BRAND.blue, lw: 0.25 });
      let x = 0;
      for (const col of cols) {
        const f = fitText(col.label, col.w - 1.2, fs, true);
        c.text(x + col.w / 2, y - hh / 2, f.s, f.h, { anchor: 'middle', base: 'middle', bold: true, color: '#FFFFFF' });
        x += col.w;
      }
      y -= hh;
      let used = 0;
      while (i < rows.length) {
        if (used > 0 && (-y + rh) > maxH) break;
        const r = rows[i];
        const fill = r.style === 'total' ? '#FFF1F2' : r.style === 'group' ? '#E8F1FB' : (i % 2 ? '#F7F9FC' : null);
        c.rect(0, y - rh, W, rh, 'BANG', { fill, lw: 0.13 });
        x = 0;
        if (r.style === 'group') {
          const f = fitText(r.cells[0], W - 2, fs, true);
          c.text(1, y - rh / 2, f.s, f.h, { base: 'middle', bold: true, color: BRAND.blue });
        } else {
          cols.forEach((col, ci) => {
            const v = r.cells[ci] === undefined || r.cells[ci] === null ? '' : String(r.cells[ci]);
            const f = fitText(v, col.w - 1.4, fs, r.style === 'total');
            const ax = col.align === 'left' ? x + 0.8 : col.align === 'right' ? x + col.w - 0.8 : x + col.w / 2;
            c.text(ax, y - rh / 2, f.s, f.h, {
              anchor: col.align === 'left' ? 'start' : col.align === 'right' ? 'end' : 'middle', base: 'middle',
              bold: r.style === 'total', color: r.style === 'total' ? BRAND.red : null,
            });
            if (ci > 0) c.line(x, y, x, y - rh, 'BANG', { lw: 0.13 });
            x += col.w;
          });
        }
        y -= rh; used++; i++;
      }
      x = 0;
      cols.forEach((col, ci) => { if (ci > 0) c.line(x, -(t ? 6.5 : 0), x, -(t ? 6.5 : 0) - hh, 'BANG', { lw: 0.13, color: '#FFFFFF' }); x += col.w; });
      c.rect(0, y, W, -(t ? 6.5 : 0) - y, 'BANG', { lw: 0.35 });
      blocks.push(c);
      part++;
      if (rows.length === 0) break;
    }
    return blocks;
  }

  const ROLE_FILL = { K: '#CFE2F6', C: '#FBD3D8', D: '#FFE9A8' };

  /** Sơ đồ pha cắt cây 6 m (giấy) – mỗi quy cách một khối */
  function cuttingBlocks(res, W) {
    const blocks = [];
    let barNo = 0;
    for (const e of res.cut) {
      const c = new Ctx(1);
      const pl = e.plan;
      const wasteM = U.sum(pl.bars, (b) => b.waste) / 1000;
      c.text(0, -4, `${e.sec.name} – ${pl.nBars} cây 6 m (tịnh ${U.fmt(e.netLen / 1000, 2)} m; dư ${U.fmt(wasteM, 2)} m)`, 2.8, { bold: true, color: BRAND.blue });
      const labW = 34, barW = W - labW - 1;
      const sc = barW / 6000;
      let y = -7;
      for (const pt of pl.patterns) {
        const a = barNo + 1, b = barNo + pt.count;
        barNo = b;
        c.text(0, y - 2.6, pt.count > 1 ? `Cây #${a}÷#${b} (${pt.count} cây)` : `Cây #${a} (1 cây)`, 2.0, { base: 'middle', bold: true });
        let x = labW;
        c.rect(labW, y - 5.2, barW, 5.2, 'BANG', { lw: 0.25 });
        pt.pieces.forEach((pc, n) => {
          const w = pc.len * sc;
          c.rect(x, y - 5.2, w, 5.2, 'BANG', { fill: ROLE_FILL[pc.mark[0]] || '#EEE', lw: 0.18 });
          const s1 = `${pc.mark} ${pc.len}`;
          const f = textWidth(s1, 1.8) < w - 1 ? { s: s1, h: 1.8 } : textWidth(pc.mark, 1.6) < w - 0.6 ? { s: pc.mark, h: 1.6 } : null;
          if (f) c.text(x + w / 2, y - 2.6, f.s, f.h, { anchor: 'middle', base: 'middle' });
          x += w + (n < pt.pieces.length - 1 ? 3 * sc : 0);
        });
        const ww = labW + barW - x;
        if (ww > 0.4) {
          c.hatch(x, y - 5.2, ww, 5.2, 0.9, 'HATCH');
          if (ww > 9) c.text(x + ww / 2, y - 2.6, `dư ${U.mm(pt.waste)}`, 1.6, { anchor: 'middle', base: 'middle', color: '#555' });
        }
        y -= 6.6;
      }
      blocks.push(c);
    }
    return blocks;
  }

  function notesBlock(lines, W, title) {
    const c = new Ctx(1);
    let y = 0;
    if (title) { c.text(0, y - 3.5, title, 2.8, { bold: true, color: BRAND.blue }); y -= 6; }
    const fs = 2.0;
    for (const ln of lines) {
      const words = ln.split(' ');
      let cur = '';
      const out = [];
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (textWidth(t, fs) > W && cur) { out.push(cur); cur = `   ${w}`; } else cur = t;
      }
      if (cur) out.push(cur);
      for (const o of out) { c.text(0, y - 2.4, o, fs); y -= 3.1; }
      y -= 0.4;
    }
    return c;
  }

  function titleBlock(res, info, W, Hh) {
    const c = new Ctx(1);
    const p = res.p;
    c.rect(0, -Hh, W, Hh, 'VIEN', { lw: 0.5 });
    const w1 = W * 0.36, w2 = W * 0.36;
    c.line(w1, 0, w1, -Hh, 'VIEN', { lw: 0.25 });
    c.line(w1 + w2, 0, w1 + w2, -Hh, 'VIEN', { lw: 0.25 });
    c.line(0, -Hh / 2, w1 + w2, -Hh / 2, 'VIEN', { lw: 0.25 });
    const cell = (x, y, w, cap, val, color) => {
      c.text(x + w / 2, y - 3.6, cap, 1.8, { anchor: 'middle', color: '#555' });
      const f = fitText(val, w - 3, 2.5, true);
      c.text(x + w / 2, y - 9.2, f.s, f.h, { anchor: 'middle', bold: true, color: color || '#141414' });
    };
    const mat = res.sections.map((s) => secShort(s)).join(' + ');
    cell(0, 0, w1, 'CÔNG TRÌNH / HẠNG MỤC:', (p.project.name || 'BẢNG HIỆU').toUpperCase());
    cell(w1, 0, w2, 'TÊN BẢN VẼ KỸ THUẬT:', info.drawingName);
    cell(0, -Hh / 2, w1, 'VẬT LIỆU KHUNG & NỀN:', `HỘP ${mat} + TÔN 3 DEM`, BRAND.blue);
    cell(w1, -Hh / 2, w2, 'TỔNG VẬT TƯ CHÍNH:', `${res.totals.bars} CÂY THÉP 6M + ${U.fmt(res.face.buyM, 1)}m TÔN`, BRAND.red);
    const x3 = w1 + w2 + 2.5;
    const rows3 = [
      `MÃ HIỆU: ${p.project.code || ''}-${String(info.no).padStart(2, '0')}`,
      `TỶ LỆ: ${info.scale || 'theo hình'}`,
      `ĐƠN VỊ: MILIMÉT (mm) – KHỔ ${p.paper}`,
      `NGƯỜI LẬP: ${p.project.author || '................'}`,
      `NGÀY: ${p.project.date}   TỜ: ${info.no}/${info.total}`,
    ];
    rows3.forEach((t, n) => {
      const f = fitText(t, W - w1 - w2 - 4, 2.0, n === 0);
      c.text(x3, -3.6 - n * (Hh - 5) / 5, f.s, f.h, { bold: n === 0 });
    });
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Ghép tờ                                                             */
  /* ------------------------------------------------------------------ */
  function pickScale(build, fitW, fitH) {
    for (const s of SCALES) {
      const ctx = build(s);
      const bb = ctx.bbox();
      if (bb.w / s <= fitW && bb.h / s <= fitH) return { s, ctx, bb };
    }
    const s = SCALES[SCALES.length - 1];
    const ctx = build(s);
    return { s, ctx, bb: ctx.bbox() };
  }

  /** placement: X = x/s + dx; Y = y/s + dy (mm giấy) */
  function placeTopLeft(ctx, s, x, yTop, bb) {
    const b = bb || ctx.bbox();
    return { ctx, s, dx: x - b.x0 / s, dy: yTop - b.y1 / s, w: b.w / s, h: b.h / s };
  }

  function sheetFrame(res, paper, info) {
    const c = new Ctx(1);
    const { w, h } = paper;
    c.rect(4, 4, w - 8, h - 8, 'VIEN', { lw: 0.25 });
    c.rect(9, 9, w - 18, h - 18, 'VIEN', { lw: 0.7 });
    const hb = 15;
    c.rect(9, h - 9 - hb, w - 18, hb, 'VIEN', { fill: BRAND.navy, lw: 0.4 });
    c.text(w / 2, h - 9 - 6.2, info.header, 4.4, { anchor: 'middle', bold: true, color: '#FFFFFF' });
    c.text(w / 2, h - 9 - 11.6, info.sub, 2.7, { anchor: 'middle', color: BRAND.mint });
    return { ctx: c, content: { x0: 13, x1: w - 13, y0: 13, y1: h - 9 - hb - 4 } };
  }

  function sheetHeader(res) {
    const p = res.p;
    const mat = res.sections.map((s) => secShort(s)).join(' + ');
    return {
      header: `BẢN VẼ THIẾT KẾ KHUNG SẮT HỘP ${mat} LÓT TÔN PHẲNG 3 DEM (KHỔ 1 m) – ${(p.project.name || 'BẢNG HIỆU').toUpperCase()} ${U.fmt(p.L / 1000, 2)}m × ${U.fmt(p.H / 1000, 2)}m`,
      sub: `Kết cấu: khung ${U.mm(p.L)} × ${U.mm(p.H)} mm (${res.geo.nCells} ô ${U.mm(res.geo.g)}×${U.mm(res.geo.g)}) + tôn phẳng 0,30 mm + ${p.mount === 'roof' ? `${res.cfg.cols.length} bộ chống xiên sau` : 'pát bắt tường'}${res.lamps.length ? ` + ${res.lamps.length} cần đèn pha LED` : ''}`,
    };
  }

  function sheetNotes(res) {
    const p = res.p, w = res.wind, S = res.cfg.sec;
    const lines = [
      `1. Vật liệu: ${res.regimeText}`,
      `2. Thép hộp mạ kẽm: ${res.sections.map((s) => `${s.name} (${U.fmt(s.kgm, 3)} kg/m)`).join('; ')}. Kích thước mm, tính theo mép thanh.`,
      `3. Tải gió sơ bộ TCVN 2737: vùng ${p.wind.zone} (W0=${U.fmt(w.W0, 2)} kN/m²), địa hình ${p.wind.terrain}, z=${U.fmt(w.z, 1)} m, k=${U.fmt(w.k, 2)}, c=${U.fmt(w.c, 2)}, γ=${U.fmt(w.gamma, 2)} → q=${U.fmt(w.qtt, 2)} kN/m². Hệ số sử dụng lớn nhất ${U.fmt(res.eval.maxUtil * 100, 0)}%.`,
      `4. Tôn phẳng 3 dem khổ 1 m, giáp mí trên tim thanh khung; ${res.face.fast.name} @${res.face.fast.pitch} mm, cách mép tôn ≥ 8 mm, bắn so le 2 hàng tại mối giáp mí.`,
      p.mount === 'roof'
        ? `5. Chân chống: C4 đặt trùng tim xà gồ, ${res.accessories.footScrewPer} vít 6×65 + long đen EPDM mỗi chân, bơm keo silicone chống dột. Chân bảng: bát L 40×40×4 + ${res.accessories.anchorPer} tắc kê M8/bát.`
        : `5. Pát V40×40×4 tại mọi nút thanh đứng chính × thanh ngang, ${res.accessories.anchorPer} tắc kê M8/pát vào tường đặc.`,
      '6. Hàn kín 4 mặt tại nút (que J421 Ø2.5); mài sạch, dặm sơn kẽm lạnh mọi mối hàn. Cắt vát chống xiên theo góc thực tế, đo lại trước khi cắt.',
      `7. Kết quả là kiểm tra sơ bộ, không thay thế thiết kế kết cấu chính thức; bảng lớn/vùng gió mạnh cần kỹ sư kết cấu kiểm tra. ${S.colInt.composite ? 'Không bỏ ốp lưng C5.' : ''}`,
    ];
    return lines;
  }

  function composeSheets(res) {
    const paper = PAPERS[res.p.paper] || PAPERS.A3;
    const hdr = sheetHeader(res);
    const sheets = [];
    const TBw = paper.rw, TBh = 34;

    // ---------------- Tờ 1: hình chiếu ----------------
    {
      const fr = sheetFrame(res, paper, hdr);
      const ct = fr.content;
      const RW = paper.rw;
      const LW = ct.x1 - ct.x0 - RW - 8;
      const avH = ct.y1 - ct.y0;
      // mặt đứng + mặt bằng cùng tỷ lệ
      let best = null;
      for (const s of SCALES) {
        const e = viewElevation(res, s), pl = viewPlan(res, s);
        const be = e.bbox(), bp = pl.bbox();
        const w = Math.max(be.w, bp.w) / s, h = be.h / s + bp.h / s + 8;
        if (w <= LW && h <= avH) { best = { s, e, pl, be, bp }; break; }
      }
      if (!best) {
        const s = SCALES[SCALES.length - 1];
        const e = viewElevation(res, s), pl = viewPlan(res, s);
        best = { s, e, pl, be: e.bbox(), bp: pl.bbox() };
      }
      const placements = [{ ctx: fr.ctx, s: 1, dx: 0, dy: 0 }];
      const pe = placeTopLeft(best.e, best.s, ct.x0 + (LW - best.be.w / best.s) / 2, ct.y1, best.be);
      placements.push(pe);
      const pp = placeTopLeft(best.pl, best.s, ct.x0 + (LW - best.bp.w / best.s) / 2, ct.y1 - pe.h - 8, best.bp);
      placements.push(pp);
      // sơ đồ trải tôn đặt luôn ở tờ 1 nếu còn chỗ
      let tonOnSheet1 = false;
      {
        const tv = viewTon(res, best.s);
        const tb = tv.bbox();
        const yTop = ct.y1 - pe.h - 8 - pp.h - 8;
        if (tb.h / best.s <= yTop - ct.y0 && tb.w / best.s <= LW) {
          placements.push(placeTopLeft(tv, best.s, ct.x0 + (LW - tb.w / best.s) / 2, yTop, tb));
          tonOnSheet1 = true;
        }
      }
      // cột phải: mặt cắt + ghi chú + khung tên
      const xr = ct.x1 - RW;
      const notes = notesBlock(sheetNotes(res), RW, 'GHI CHÚ KỸ THUẬT');
      const nb = notes.bbox();
      const secH = avH - TBh - 6 - nb.h - 6;
      const sec = pickScale((s) => viewSection(res, s), RW, Math.max(60, secH));
      placements.push(placeTopLeft(sec.ctx, sec.s, xr + (RW - sec.bb.w / sec.s) / 2, ct.y1, sec.bb));
      placements.push(placeTopLeft(notes, 1, xr, ct.y0 + TBh + 6 + nb.h, nb));
      const tb = titleBlock(res, { drawingName: `KHUNG ${U.fmt(res.p.L / 1000, 2)}×${U.fmt(res.p.H / 1000, 2)}m, TÔN PHẲNG & ${res.p.mount === 'roof' ? 'CHỐNG SAU' : 'PÁT TƯỜNG'}`, no: 1, total: 0, scale: `1:${best.s} (MC A-A 1:${sec.s})` }, TBw, TBh);
      placements.push(placeTopLeft(tb, 1, ct.x1 - TBw, ct.y0 + TBh));
      sheets.push({ name: 'KC-01 Bản vẽ khung', paper, placements, scales: { main: best.s, section: sec.s }, titleInfo: tb, tonOnSheet1 });
    }

    // ---------------- Tờ 2+: bảng biểu, sơ đồ cắt, trải tôn ----------------
    {
      const colW = (paper.w - 26 - 10) / 2;
      const blocks = [];
      // bảng cắt thép
      const cutCols = [
        { label: 'TT', w: 7 }, { label: 'KH', w: 12 }, { label: 'Tên cấu kiện', w: colW - 7 - 12 - 22 - 16 - 9 - 15 - 13 - 30, align: 'left' },
        { label: 'Quy cách', w: 22 }, { label: 'Dài cắt (mm)', w: 16 }, { label: 'SL', w: 9 }, { label: 'Tổng (m)', w: 15 },
        { label: 'KL (kg)', w: 13 }, { label: 'Vị trí lắp', w: 30, align: 'left' },
      ];
      const rows = [];
      let n = 0;
      for (const e of res.cut) {
        rows.push({ cells: [`${e.sec.name} – mạ kẽm (${U.fmt(e.sec.kgm, 3)} kg/m)`], style: 'group' });
        for (const g of res.pieces.filter((x) => x.secId === e.sec.id)) {
          n++;
          rows.push({ cells: [n, g.mark, g.name, secShort(g.sec), g.len, g.qty, U.fmt(g.totalLen / 1000, 2), U.fmt(g.kg, 1), g.locs.join('; ')] });
        }
      }
      rows.push({ cells: ['', 'Σ', `TỔNG ${res.totals.pieces} thanh – ${res.totals.bars} cây 6 m (+ dự phòng xem bảng vật tư)`, '', '', res.totals.pieces, U.fmt(res.totals.netLen, 2), U.fmt(res.totals.netKg, 1), ''], style: 'total' });
      tableBlocks('5. BẢNG KÊ CHI TIẾT THANH CẮT (CẮT ĐÚNG KÍCH THƯỚC)', cutCols, rows, { maxH: 150 }).forEach((b) => blocks.push({ ctx: b, col: 0 }));
      cuttingBlocks(res, colW).forEach((b, i) => blocks.push({ ctx: b, col: 0, title: i === 0 ? '6. SƠ ĐỒ PHA CẮT CÂY THÉP 6 m (mạch cắt 3 mm, cắt vuông đầu cây 10 mm)' : null }));
      // bảng vật tư
      const buyCols = [
        { label: 'TT', w: 7 }, { label: 'Vật tư', w: colW - 7 - 50 - 12 - 16 - 30, align: 'left' }, { label: 'Quy cách', w: 50, align: 'left' },
        { label: 'ĐVT', w: 12 }, { label: 'SL mua', w: 16 }, { label: 'Ghi chú', w: 30, align: 'left' },
      ];
      const brows = [];
      let lastG = null;
      res.purchase.forEach((r, i) => {
        if (r.group !== lastG) { brows.push({ cells: [r.group.toUpperCase()], style: 'group' }); lastG = r.group; }
        brows.push({ cells: [i + 1, r.name, r.spec, r.unit, U.fmt(r.qtyBuy, r.unit === 'm dài' || r.unit === 'm²' || r.unit === 'kg' ? 1 : 0), r.note] });
      });
      tableBlocks('7. BẢNG VẬT TƯ CẦN MUA', buyCols, brows, { maxH: 150 }).forEach((b) => blocks.push({ ctx: b, col: 1 }));
      // trải tôn (nếu chưa có ở tờ 1)
      if (!sheets[0].tonOnSheet1) {
        const ton = pickScale((s) => viewTon(res, s), colW, 70);
        blocks.push({ ctx: ton.ctx, s: ton.s, bb: ton.bb, col: 1 });
      }
      // kiểm tra
      const chkCols = [{ label: 'Cấu kiện', w: colW - 40 - 20, align: 'left' }, { label: 'Quy cách', w: 40, align: 'left' }, { label: 'Sử dụng', w: 20 }];
      const crow = res.checks.map((ck) => ({ cells: [ck.member, ck.sec.replace('Hộp ', ''), `${U.fmt(ck.util * 100, 0)}% ${ck.ok ? 'Đạt' : 'KHÔNG'}`], style: ck.ok ? null : 'total' }));
      tableBlocks(`8. KIỂM TRA SƠ BỘ THEO GIÓ (q = ${U.fmt(res.wind.qtt, 2)} kN/m²)`, chkCols, crow, { maxH: 120 }).forEach((b) => blocks.push({ ctx: b, col: 1 }));

      // xếp khối vào tờ
      let sheet = null;
      const colX = (i) => 13 + i * (colW + 10);
      const cursor = [0, 0];
      const newSheet = () => {
        const fr = sheetFrame(res, paper, hdr);
        sheet = { name: `KC-0${sheets.length + 1} Thống kê & pha cắt`, paper, placements: [{ ctx: fr.ctx, s: 1, dx: 0, dy: 0 }], content: fr.content, scales: {} };
        sheets.push(sheet);
        cursor[0] = fr.content.y1; cursor[1] = fr.content.y1;
      };
      newSheet();
      const floor = (col) => (col === 1 ? sheet.content.y0 + TBh + 5 : sheet.content.y0);
      for (const b of blocks) {
        const s = b.s || 1;
        const bb = b.bb || b.ctx.bbox();
        let col = b.col;
        let extra = 0;
        if (b.title) extra = 7;
        const need = bb.h / s + extra;
        if (cursor[col] - need < floor(col)) {
          const other = 1 - col;
          if (cursor[other] - need >= floor(other)) col = other;
          else { newSheet(); col = b.col; }
        }
        if (b.title) {
          const t = new Ctx(1); t.text(0, -4, b.title, 3.0, { bold: true, color: BRAND.blue });
          sheet.placements.push(placeTopLeft(t, 1, colX(col), cursor[col]));
          cursor[col] -= 7;
        }
        const pl = placeTopLeft(b.ctx, s, colX(col), cursor[col], bb);
        sheet.placements.push(pl);
        cursor[col] -= pl.h + 6;
      }
    }
    // khung tên cho các tờ sau
    sheets.forEach((sh, i) => {
      if (i === 0) return;
      const tb = titleBlock(res, { drawingName: 'BẢNG KÊ THANH CẮT, PHA CẮT & VẬT TƯ', no: i + 1, total: sheets.length, scale: sh.scales.ton ? `1:${sh.scales.ton}` : '–' }, TBw, TBh);
      sh.placements.push(placeTopLeft(tb, 1, paper.w - 13 - TBw, 13 + TBh));
    });
    // cập nhật tổng số tờ trên tờ 1
    const s1 = sheets[0];
    const idx = s1.placements.findIndex((pl) => pl.ctx === s1.titleInfo);
    const tb1 = titleBlock(res, { drawingName: `KHUNG ${U.fmt(res.p.L / 1000, 2)}×${U.fmt(res.p.H / 1000, 2)}m, TÔN PHẲNG & ${res.p.mount === 'roof' ? 'CHỐNG SAU' : 'PÁT TƯỜNG'}`, no: 1, total: sheets.length, scale: `1:${s1.scales.main} (MC A-A 1:${s1.scales.section})` }, TBw, TBh);
    s1.placements[idx] = placeTopLeft(tb1, 1, paper.w - 13 - TBw, 13 + TBh);
    return sheets;
  }

  /* ------------------------------------------------------------------ */
  /* Xuất SVG                                                            */
  /* ------------------------------------------------------------------ */
  const esc = (s) => U.escapeHtml(s);
  function colorOf(it) { return it.color || (LAYERS[it.layer] || LAYERS.TEXT).color; }

  function sheetToSVG(sheet, o = {}) {
    const { w, h } = sheet.paper;
    const out = [];
    const size = o.inline ? '' : ` width="${o.width || `${w}mm`}" height="${o.height || `${h}mm`}"`;
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${size} class="sheet-svg" font-family="'Times New Roman', Times, serif">`);
    out.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>`);
    const f = (v) => (Math.round(v * 1000) / 1000).toString();
    for (const pl of sheet.placements) {
      const X = (x) => x / pl.s + pl.dx;
      const Y = (y) => h - (y / pl.s + pl.dy);
      for (const it of pl.ctx.items) {
        const col = colorOf(it);
        const dash = it.dash ? ` stroke-dasharray="${DASH[it.dash].join(' ')}"` : '';
        if (it.t === 'line') {
          out.push(`<line x1="${f(X(it.x1))}" y1="${f(Y(it.y1))}" x2="${f(X(it.x2))}" y2="${f(Y(it.y2))}" stroke="${col}" stroke-width="${it.lw}"${dash}/>`);
        } else if (it.t === 'poly') {
          const pts = it.pts.map(([x, y]) => `${f(X(x))},${f(Y(y))}`).join(' ');
          const tag = it.closed ? 'polygon' : 'polyline';
          const stroke = it.lw > 0 ? ` stroke="${col}" stroke-width="${it.lw}"` : ' stroke="none"';
          out.push(`<${tag} points="${pts}" fill="${it.fill && it.closed ? it.fill : 'none'}"${stroke}${dash}/>`);
        } else if (it.t === 'circle') {
          out.push(`<circle cx="${f(X(it.x))}" cy="${f(Y(it.y))}" r="${f(it.r / pl.s)}" fill="${it.fill || 'none'}" stroke="${col}" stroke-width="${it.lw}"/>`);
        } else if (it.t === 'text') {
          const x = f(X(it.x)), y = f(Y(it.y));
          const anchor = it.anchor === 'middle' ? 'middle' : it.anchor === 'end' ? 'end' : 'start';
          const base = it.base === 'middle' ? 'central' : it.base === 'top' ? 'hanging' : 'alphabetic';
          const rot = it.rot ? ` transform="rotate(${-it.rot} ${x} ${y})"` : '';
          out.push(`<text x="${x}" y="${y}" font-size="${f(it.h / pl.s)}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${col}"${it.bold ? ' font-weight="bold"' : ''}${rot}>${esc(it.s)}</text>`);
        }
      }
    }
    out.push('</svg>');
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Xuất DXF R12 (AC1009) – mô hình 1:1 (mm), chú thích theo tỷ lệ in    */
  /* ------------------------------------------------------------------ */
  function dxfText(s) {
    let o = '';
    for (const ch of String(s)) {
      const cp = ch.codePointAt(0);
      if (cp < 128) o += ch;
      else if (cp <= 0xFFFF) o += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
      else o += '?';
    }
    return o;
  }

  function modelLayout(res) {
    const sheets = composeSheets(res);
    const S = sheets[0].scales.main;
    const gap = 18 * S;
    const parts = [];
    const add = (ctx, s, dx, dy) => { parts.push({ ctx, s, dx, dy }); };
    const e = viewElevation(res, S), pl = viewPlan(res, S), sec = viewSection(res, S), ton = viewTon(res, S);
    const be = e.bbox(), bp = pl.bbox(), bs = sec.bbox(), bt = ton.bbox();
    add(e, 1, 0, 0);
    const yPl = be.y0 - gap - bp.y1;
    add(pl, 1, 0, yPl);
    add(ton, 1, 0, yPl + bp.y0 - gap - bt.y1);
    const xr = Math.max(be.x1, bp.x1, bt.x1) + gap;
    const dxSec = xr - bs.x0, dySec = be.y1 - bs.y1;
    add(sec, 1, dxSec, dySec);
    // ghi chú dưới mặt cắt (khối giấy phóng theo tỷ lệ S)
    const notes = notesBlock(sheetNotes(res), 150, 'GHI CHÚ KỸ THUẬT');
    const nb = notes.bbox();
    const yNotesTop = dySec + bs.y0 - gap;
    add(notes, 1 / S, xr - nb.x0 * S, yNotesTop - nb.y1 * S);
    // nội dung các tờ 2+ (bảng, sơ đồ cắt, khung tên) – bỏ khung tờ và hình chiếu đã có ở trên
    let x2 = dxSec + bs.x1 + gap;
    for (const sh of sheets.slice(1)) {
      for (const p of sh.placements.slice(1)) {
        if (p.s !== 1) continue;
        add(p.ctx, p.s / S, x2 + (p.dx - 13) * S, be.y1 + (p.dy - sh.content.y1) * S);
      }
      x2 += (sh.paper.w - 26) * S + gap;
    }
    return { parts, scale: S };
  }

  function toDXF(res) {
    const { parts, scale } = modelLayout(res);
    const L = [];
    const g = (code, val) => { L.push(String(code)); L.push(String(val)); };
    const n = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ext = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    const ents = [];
    for (const pt of parts) {
      const X = (x) => x / pt.s + pt.dx, Y = (y) => y / pt.s + pt.dy;
      for (const it of pt.ctx.items) {
        const lt = it.dash === 'dash' ? 'DASHED' : it.dash === 'center' ? 'CENTER' : null;
        if (it.t === 'line') {
          ents.push(['LINE', it.layer, lt, [X(it.x1), Y(it.y1), X(it.x2), Y(it.y2)]]);
          ext(X(it.x1), Y(it.y1)); ext(X(it.x2), Y(it.y2));
        } else if (it.t === 'poly') {
          if (it.lw === 0) continue;
          const pts = it.pts.map(([x, y]) => [X(x), Y(y)]);
          const m = it.closed ? pts.length : pts.length - 1;
          for (let i = 0; i < m; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            ents.push(['LINE', it.layer, lt, [a[0], a[1], b[0], b[1]]]);
            ext(a[0], a[1]);
          }
        } else if (it.t === 'circle') {
          ents.push(['CIRCLE', it.layer, null, [X(it.x), Y(it.y), it.r / pt.s]]);
          ext(X(it.x) - it.r / pt.s, Y(it.y) - it.r / pt.s); ext(X(it.x) + it.r / pt.s, Y(it.y) + it.r / pt.s);
        } else if (it.t === 'text') {
          const h = it.h / pt.s * 0.72;
          ents.push(['TEXT', it.layer, null, [X(it.x), Y(it.y), h, it.rot || 0, it.anchor, it.base, it.s, it.color]]);
          ext(X(it.x), Y(it.y));
        }
      }
    }
    // HEADER
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
    g(9, '$INSBASE'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
    g(9, '$EXTMIN'); g(10, n(x0)); g(20, n(y0)); g(30, '0.0');
    g(9, '$EXTMAX'); g(10, n(x1)); g(20, n(y1)); g(30, '0.0');
    g(9, '$LTSCALE'); g(40, n(scale));
    g(9, '$TEXTSTYLE'); g(7, 'TNR');
    g(0, 'ENDSEC');
    // TABLES
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 3);
    const ltype = (name, desc, pat) => {
      g(0, 'LTYPE'); g(2, name); g(70, 0); g(3, desc); g(72, 65); g(73, pat.length);
      g(40, n(pat.reduce((a, b) => a + Math.abs(b), 0)));
      pat.forEach((v) => g(49, n(v)));
    };
    ltype('CONTINUOUS', 'Solid line', []);
    ltype('DASHED', '__ __ __', [3, -1.5]);
    ltype('CENTER', '____ _ ____', [6, -1.5, 1, -1.5]);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAYERS).length);
    for (const [name, v] of Object.entries(LAYERS)) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, v.aci); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'TNR'); g(70, 0); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, 0); g(42, '2.5'); g(3, 'times.ttf'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    // ENTITIES
    g(0, 'SECTION'); g(2, 'ENTITIES');
    const RED = '#E60012', BLUE = '#005BAC';
    for (const [type, layer, lt, a] of ents) {
      if (type === 'LINE') {
        g(0, 'LINE'); g(8, layer); if (lt) g(6, lt);
        g(10, n(a[0])); g(20, n(a[1])); g(30, '0.0'); g(11, n(a[2])); g(21, n(a[3])); g(31, '0.0');
      } else if (type === 'CIRCLE') {
        g(0, 'CIRCLE'); g(8, layer); g(10, n(a[0])); g(20, n(a[1])); g(30, '0.0'); g(40, n(a[2]));
      } else if (type === 'TEXT') {
        const [x, y, h, rot, anchor, base, s, color] = a;
        const ha = anchor === 'middle' ? 1 : anchor === 'end' ? 2 : 0;
        const va = base === 'middle' ? 2 : base === 'top' ? 3 : 0;
        g(0, 'TEXT'); g(8, layer);
        if (color === RED) g(62, 1); else if (color === BLUE) g(62, 5); else if (color === '#FFFFFF') g(62, 7);
        g(10, n(x)); g(20, n(y)); g(30, '0.0'); g(40, n(h)); g(1, dxfText(s));
        if (rot) g(50, n(rot));
        g(7, 'TNR');
        if (ha || va) { g(72, ha); g(11, n(x)); g(21, n(y)); g(31, '0.0'); g(73, va); }
      }
    }
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  SB.drawing = {
    Ctx, LAYERS, SCALES, PAPERS, frameRects,
    viewElevation, viewSection, viewPlan, viewTon, tableBlocks, cuttingBlocks,
    composeSheets, sheetToSVG, toDXF, modelLayout,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);

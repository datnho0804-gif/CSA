/*!
 * Bảng hiệu – lõi thiết kế: lưới khung, kiểm tra gió sơ bộ, chọn vật liệu tối ưu,
 * bóc tách từng thanh cắt, pha cắt cây 6 m, tôn phẳng, vật tư cần mua.
 */
(function (root) {
  'use strict';
  const SB = (root.SB = root.SB || {});
  const U = SB.util;
  const CAT = SB.catalog;
  const ST = SB.STEEL;

  /* ------------------------------------------------------------------ */
  /* Thông số mặc định                                                   */
  /* ------------------------------------------------------------------ */
  const DEFAULTS = {
    project: { name: 'BẢNG HIỆU', code: 'KT-BH', author: '', date: '' },
    L: 8000, H: 2000, grid: 1000,
    mount: 'roof', // roof: dựng trên mái, chống xiên | wall: áp tường, bắt pát
    strut: { spacing: 'auto', attach: 0, reach: 0, drop: 0, endBracing: true },
    lamps: { enabled: true, count: 0, rise: 500, reach: 700, power: 100 },
    wind: { zone: 'II-A', terrain: 'B', baseHeight: 5, c: 1.4, gamma: 1.2, W0: 0 },
    face: {
      orientation: 'auto', allowance: 50, maxLen: 12000,
      hiflex: false, hiflexWrap: 100, edgeTrim: false, jointCover: false,
      fastener: 'rivet', pitch: 'auto', capacity: 0.25,
    },
    material: 'rule', // rule: <= 8m x 2m dùng hộp 20x20x1.2 | free: tối ưu tự do
    steel: 'auto', // 'auto' hoặc mã quy cách người dùng chọn (vd '25x25x1.2') – dùng cho toàn bộ khung
    cost: { steel: 24000, joint: 5000, foot: 60000, anchor: 25000 },
    purchase: { spareBars: 1 },
    anchors: { baseCap: 1.5, roofScrewCap: 0.8 },
    paper: 'A3',
  };

  const TON = { thickness: 0.30, width: 1000, name: 'Tôn phẳng mạ màu 3 dem (0,30 mm) khổ 1 m' };
  const FASTENERS = {
    rivet: { name: 'Đinh rút nhôm Ø4×12', pack: 500, unit: 'con', packName: 'hộp 500 con' },
    screw: { name: 'Vít tự khoan đầu dù 4.2×13 mạ kẽm', pack: 100, unit: 'con', packName: 'bịch 100 con' },
  };
  const RULE_L = 8000, RULE_H = 2000;

  function deepMerge(a, b) {
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    if (!b) return out;
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object') out[k] = deepMerge(a[k], v);
      else if (v !== undefined && v !== null && v !== '') out[k] = v;
    }
    return out;
  }

  function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }

  function normalize(raw) {
    const p = deepMerge(DEFAULTS, raw || {});
    p.L = U.clamp(Math.round(num(p.L, 8000)), 500, 60000);
    p.H = U.clamp(Math.round(num(p.H, 2000)), 300, 8000);
    p.grid = U.clamp(Math.round(num(p.grid, 1000)), 300, 1500);
    p.mount = p.mount === 'wall' ? 'wall' : 'roof';
    p.material = p.material === 'free' ? 'free' : 'rule';
    p.steel = p.steel && p.steel !== 'auto' && CAT.byId[p.steel] ? p.steel : 'auto';
    p.strut.attach = Math.max(0, num(p.strut.attach, 0));
    p.strut.reach = Math.max(0, num(p.strut.reach, 0));
    p.strut.drop = num(p.strut.drop, 0);
    p.strut.endBracing = p.strut.endBracing !== false && p.strut.endBracing !== 'false';
    p.lamps.enabled = p.lamps.enabled !== false && p.lamps.enabled !== 'false';
    p.lamps.count = Math.max(0, Math.round(num(p.lamps.count, 0)));
    p.lamps.rise = U.clamp(num(p.lamps.rise, 500), 100, 2000);
    p.lamps.reach = U.clamp(num(p.lamps.reach, 700), 100, 2000);
    p.wind.baseHeight = Math.max(0, num(p.wind.baseHeight, 5));
    p.wind.c = U.clamp(num(p.wind.c, 1.4), 0.5, 3);
    p.wind.gamma = U.clamp(num(p.wind.gamma, 1.2), 1, 2);
    p.wind.W0 = Math.max(0, num(p.wind.W0, 0));
    p.face.allowance = U.clamp(num(p.face.allowance, 50), 0, 300);
    p.face.maxLen = U.clamp(num(p.face.maxLen, 12000), 2000, 30000);
    p.face.capacity = U.clamp(num(p.face.capacity, 0.25), 0.05, 2);
    p.face.hiflexWrap = U.clamp(num(p.face.hiflexWrap, 100), 0, 300);
    ['hiflex', 'edgeTrim', 'jointCover'].forEach((k) => { p.face[k] = p.face[k] === true || p.face[k] === 'true'; });
    if (!FASTENERS[p.face.fastener]) p.face.fastener = 'rivet';
    for (const k of Object.keys(DEFAULTS.cost)) p.cost[k] = Math.max(0, num(p.cost[k], DEFAULTS.cost[k]));
    p.purchase.spareBars = Math.max(0, Math.round(num(p.purchase.spareBars, 1)));
    p.anchors.baseCap = Math.max(0.1, num(p.anchors.baseCap, 1.5));
    p.anchors.roofScrewCap = Math.max(0.1, num(p.anchors.roofScrewCap, 0.8));
    if (!['A3', 'A2', 'A1'].includes(p.paper)) p.paper = 'A3';
    if (!p.project.date) {
      const d = new Date();
      p.project.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* Lưới khung                                                          */
  /* ------------------------------------------------------------------ */
  function grid1D(total, g) {
    const n = Math.floor(total / g + 1e-6);
    const rem = Math.round(total - n * g);
    const bays = [];
    for (let i = 0; i < n; i++) bays.push(g);
    if (rem > 0) bays.push(rem);
    if (!bays.length) bays.push(total);
    const lines = [0];
    let s = 0;
    for (const b of bays) { s += b; lines.push(s); }
    return { bays, lines };
  }

  const AXIS_H = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function buildGeom(p) {
    const gx = grid1D(p.L, p.grid);
    const gy = grid1D(p.H, p.grid);
    return {
      L: p.L, H: p.H, g: p.grid,
      xLines: gx.lines, bayW: gx.bays, nV: gx.lines.length,
      yLines: gy.lines, bayH: gy.bays, nR: gy.lines.length,
      axesV: gx.lines.map((_, i) => `T${i + 1}`),
      axesH: gy.lines.map((_, j) => (j < AXIS_H.length ? AXIS_H[j] : `R${j + 1}`)),
      nCells: gx.bays.length * gy.bays.length,
    };
  }

  function colIndices(nV, k) {
    const idx = [];
    for (let i = 0; i < nV; i += k) idx.push(i);
    if (idx[idx.length - 1] !== nV - 1) idx.push(nV - 1);
    return idx;
  }

  /* ------------------------------------------------------------------ */
  /* Kiểm tra cấu kiện                                                   */
  /* ------------------------------------------------------------------ */
  /** Mô-men dầm chịu tải từ ô tôn hai phía (phân bố 45° khi hai phương) hoặc phân bố đều */
  function beamLoad(q, span, sideA, sideB, twoWay) {
    if (twoWay) {
      let M = 0, Wt = 0;
      for (const h of [sideA, sideB]) {
        if (!(h > 0)) continue;
        const m = Math.min(span, h);
        const c = m / 2, pk = q * m / 2;
        M += pk * (span * span / 8 - c * c / 6);
        Wt += pk * (span - c);
      }
      return { M, wEq: Wt / span };
    }
    const w = q * ((sideA || 0) + (sideB || 0)) / 2;
    return { M: w * span * span / 8, wEq: w };
  }

  function beamUtil(sec, load, span, gamma) {
    const sig = load.M / sec.W;
    const delta = 5 * (load.wEq / gamma) * span ** 4 / (384 * ST.E * sec.I);
    return { sig, delta, util: Math.max(sig / ST.f, delta / (span / 100)) };
  }

  /** Kiểm tra thanh ngang (ray) – trả về hệ số sử dụng lớn nhất cho nhóm bao / giữa */
  function railChecks(geo, cols, q, gamma, secPerim, secInt) {
    const twoWay = cols.length === geo.nV;
    const spans = [];
    if (twoWay) geo.bayW.forEach((w) => spans.push(w));
    else for (let i = 1; i < cols.length; i++) spans.push(geo.xLines[cols[i]] - geo.xLines[cols[i - 1]]);
    const out = { perim: null, int: null };
    const rails = geo.yLines.map((y, j) => ({
      j, below: j > 0 ? geo.bayH[j - 1] : 0, above: j < geo.nR - 1 ? geo.bayH[j] : 0,
      perim: j === 0 || j === geo.nR - 1,
    }));
    for (const r of rails) {
      const sec = r.perim ? secPerim : secInt;
      if (!sec) continue;
      for (const s of spans) {
        const ld = beamLoad(q, s, r.below, r.above, twoWay);
        const u = beamUtil(sec, ld, s, gamma);
        const key = r.perim ? 'perim' : 'int';
        if (!out[key] || u.util > out[key].util) out[key] = Object.assign(u, { span: s, axis: geo.axesH[r.j], M: ld.M });
      }
    }
    return out;
  }

  /** Thanh đứng phụ (không có chống) nhịp giữa các ray, nhận tải hai phương từ ô tôn hai bên */
  function subCheck(geo, cols, q, gamma, sec) {
    const colSet = new Set(cols);
    let worst = null;
    for (let i = 1; i < geo.nV - 1; i++) {
      if (colSet.has(i)) continue;
      const wl = geo.bayW[i - 1], wr = geo.bayW[i];
      for (const h of geo.bayH) {
        const ld = beamLoad(q, h, wl, wr, true);
        const u = beamUtil(sec, ld, h, gamma);
        if (!worst || u.util > worst.util) worst = Object.assign(u, { span: h, axis: geo.axesV[i], M: ld.M });
      }
    }
    return worst;
  }

  /** Hình học hệ chống tại 1 tuyến cột (đơn vị mm; u = 0 tại mặt trước bảng, dương về phía sau) */
  function strutGeom(p, geo, dCol, secStrut) {
    const H = p.H;
    const ys = U.clamp(p.strut.attach > 0 ? p.strut.attach : U.roundTo(0.75 * H, 10), 0.4 * H, H - 50);
    const D = Math.max(400, p.strut.reach > 0 ? p.strut.reach : Math.max(600, U.roundTo(0.75 * H, 50)));
    const drop = p.strut.drop;
    const yFoot = drop + secStrut.h; // đỉnh thanh chân dọc C4 nằm trên mái
    const top = [dCol, ys];
    const foot = [D, yFoot];
    const len = Math.hypot(foot[0] - top[0], foot[1] - top[1]);
    const mid = [(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2];
    const interior = geo.yLines.slice(1, -1).filter((y) => y > 0.25 * ys && y < 0.85 * ys);
    let yg = null;
    if (len > 1200) {
      yg = interior.length ? interior.reduce((b, y) => (Math.abs(y - ys / 2) < Math.abs(b - ys / 2) ? y : b)) : U.roundTo(ys / 2, 10);
    }
    const kLen = yg !== null ? Math.hypot(mid[0] - dCol, mid[1] - yg) : 0;
    const alpha = U.deg(Math.atan2(top[1] - foot[1], foot[0] - top[0]));
    return { ys, D, drop, yFoot, top, foot, mid, len, yg, kLen, hasK: yg !== null, alpha, dCol };
  }

  /**
   * Phân tích 1 tuyến cột + hệ chống (roof) hoặc cột bắt pát (wall) bằng khung 2D.
   * w: tải gió phân bố trên cột (N/mm).
   */
  /**
   * Áp tường: cột chính được giữ bởi pát tại mọi đường ray, tải ô tôn truyền hai phương
   * (ray đưa tải thẳng vào pát) -> cột chỉ chịu tải hai phương của các ô kề bên.
   */
  function analyzeWallLine(p, geo, q, trib, isEnd, secCol) {
    const side = Math.max(...geo.bayW);
    let worst = { util: 0, sig: 0, M: 0, N: 0 };
    for (const h of geo.bayH) {
      const ld = beamLoad(q, h, side, isEnd ? 0 : side, true);
      const u = beamUtil(secCol, ld, h, p.wind.gamma);
      if (u.util > worst.util) worst = { util: u.util, sig: u.sig, M: ld.M, N: 0 };
    }
    const tribH = Math.max(...geo.yLines.map((y, j) => ((j > 0 ? geo.bayH[j - 1] : 0) + (j < geo.nR - 1 ? geo.bayH[j] : 0)) / 2));
    const R = q * trib * tribH; // N – lực nhổ lớn nhất tại 1 pát
    return { col: worst, defl: { util: 0, ux: 0 }, strut: null, k: null, reactions: {}, footIdx: -1, anchorR: R };
  }

  function analyzeLine(p, geo, w, secCol, secStrut, sg) {
    const H = p.H;
    const ys = [0, H, ...geo.yLines.slice(1, -1)];
    if (p.mount === 'roof') { ys.push(sg.ys); if (sg.hasK) ys.push(sg.yg); }
    let base = U.uniqSorted(ys, 1);
    // chia nhỏ <= 250 mm để tải phân bố đều
    const pts = [];
    for (let i = 0; i < base.length; i++) {
      pts.push(base[i]);
      if (i < base.length - 1) {
        const n = Math.ceil((base[i + 1] - base[i]) / 250);
        for (let k = 1; k < n; k++) pts.push(base[i] + (base[i + 1] - base[i]) * k / n);
      }
    }
    base = U.uniqSorted(pts, 0.1);
    const nodes = base.map((y) => ({ x: 0, y }));
    const elems = [];
    for (let i = 0; i < base.length - 1; i++) elems.push({ i, j: i + 1, A: secCol.A, I: secCol.I, tag: 'col' });
    const idxAt = (y) => base.findIndex((v) => Math.abs(v - y) < 0.2);
    const supports = { 0: [true, true, false] };
    const loads = {};
    for (let i = 0; i < base.length - 1; i++) {
      const P = w * (base[i + 1] - base[i]) / 2;
      loads[i] = loads[i] || [0, 0, 0]; loads[i][0] += P;
      loads[i + 1] = loads[i + 1] || [0, 0, 0]; loads[i + 1][0] += P;
    }
    let footIdx = -1;
    if (p.mount === 'roof') {
      const Dc = sg.D - sg.dCol / 2;
      const mid = nodes.length;
      nodes.push({ x: Dc / 2, y: (sg.ys + sg.drop) / 2 });
      footIdx = nodes.length;
      nodes.push({ x: Dc, y: sg.drop });
      const t = idxAt(sg.ys);
      elems.push({ i: t, j: mid, A: secStrut.A, I: secStrut.I, tag: 'strut' });
      elems.push({ i: mid, j: footIdx, A: secStrut.A, I: secStrut.I, tag: 'strut' });
      if (sg.hasK) elems.push({ i: idxAt(sg.yg), j: mid, A: secStrut.A, I: secStrut.I, tag: 'k' });
      supports[footIdx] = [true, true, false];
    } else {
      // pát tường tại mọi đường ray
      for (const y of geo.yLines.slice(1)) {
        const yy = y === H ? H : y;
        const id = idxAt(yy);
        if (id > 0) supports[id] = [true, false, false];
      }
    }
    const res = SB.frame2d.solve(nodes, elems, supports, loads);
    const out = { col: { util: 0 }, strut: null, k: null, reactions: res.R, footIdx, topUx: Math.abs(res.U[3 * idxAt(H)]) };
    for (const f of res.forces) {
      if (f.tag === 'col') {
        const sig = Math.abs(f.N) / secCol.A + f.M / secCol.W;
        if (sig / ST.f > out.col.util) out.col = { util: sig / ST.f, sig, N: f.N, M: f.M };
      }
    }
    if (p.mount === 'roof') {
      const memb = (tag, Lb) => {
        const fs = res.forces.filter((f) => f.tag === tag);
        const N = Math.max(...fs.map((f) => Math.abs(f.N)));
        const M = Math.max(...fs.map((f) => f.M));
        const lam = Lb / secStrut.r;
        const chi = SB.buckling.chi(lam);
        // độ mảnh vượt 200 coi như không đạt: hệ số sử dụng tối thiểu = λ/200
        const util = Math.max(N / (chi * secStrut.A * ST.f) + M / (secStrut.W * ST.f), lam > 200 ? lam / 200 : 0);
        return { N, M, lam, chi, util, Lb };
      };
      // có giằng K: chiều dài tính toán = 1/2 thanh (giằng K trong mặt phẳng, giằng dọc C3 ngoài mặt phẳng)
      out.strut = memb('strut', sg.hasK ? sg.len / 2 : sg.len);
      if (sg.hasK) out.k = memb('k', sg.kLen);
      const deflLimit = H / 100;
      out.defl = { util: (out.topUx / p.wind.gamma) / deflLimit, ux: out.topUx / p.wind.gamma };
    } else {
      out.defl = { util: 0, ux: out.topUx };
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Sinh danh sách thanh cắt (chính xác theo bề rộng mặt từng quy cách)  */
  /* ------------------------------------------------------------------ */
  function splitRun(start, end, allowed, stock, minPiece = 300) {
    const segs = [];
    let pos = start;
    const cands = allowed.filter((x) => x > start + 1 && x < end - 1).sort((a, b) => a - b);
    let guard = 0;
    while (end - pos > stock && guard++ < 100) {
      const ok = cands.filter((x) => x - pos <= stock && x - pos >= minPiece);
      const nx = ok.length ? ok[ok.length - 1] : pos + stock;
      segs.push([pos, nx]);
      pos = nx;
    }
    segs.push([pos, end]);
    return segs;
  }

  function colX(geo, i, b) {
    if (i === 0) return b / 2;
    if (i === geo.nV - 1) return geo.L - b / 2;
    return geo.xLines[i];
  }

  function buildPieces(p, geo, cfg) {
    const S = cfg.sec;
    const pieces = [];
    const add = (role, name, sec, len, qty, extra) => {
      const L = Math.round(len);
      if (L <= 0 || qty <= 0) return;
      pieces.push(Object.assign({ role, name, secId: sec.id, sec, len: L, qty, joints: 2 }, extra || {}));
    };
    const cols = cfg.cols;
    const colSet = new Set(cols);
    const bP = S.perim.b;
    const colSec = (i) => (i === 0 || i === geo.nV - 1 ? S.colEnd : S.colInt);
    const colBase = (i) => (colSec(i).composite ? CAT.get(colSec(i).baseId) : colSec(i));
    const xc = cols.map((i) => colX(geo, i, colBase(i).b));

    // K1 – ray bao trên/dưới, chạy suốt, nối tại tim cột chính (so le trên/dưới)
    const splitsAllowed = xc.slice(1, -1);
    const bot = splitRun(0, geo.L, splitsAllowed, ST.stock);
    const splices = { bottom: bot.slice(1).map(([a]) => a), top: [], c3: [], c4: [] };
    const top = splitRun(0, geo.L, splitsAllowed.map((x) => geo.L - x), ST.stock).map(([a, b]) => [geo.L - b, geo.L - a]).reverse();
    splices.top = top.slice(1).map(([a]) => a);
    for (const [lbl, segs, ax] of [['dưới', bot, geo.axesH[0]], ['trên', top, geo.axesH[geo.nR - 1]]]) {
      segs.forEach(([a, b], n) => add('K1', 'Thanh ngang bao trên/dưới (chạy suốt, nối tại thanh đứng chính)', S.perim, b - a, 1,
        { loc: `Trục ${ax}, x=${Math.round(a)}÷${Math.round(b)}`, joints: n === 0 ? 0 : 1 }));
    }
    // K2 – cột / thanh đứng chính chạy suốt giữa 2 ray bao
    const colLen = geo.H - 2 * bP;
    const nEndCols = 2, nIntCols = cols.length - 2;
    const k2name = p.mount === 'roof' ? 'Thanh đứng chính chạy suốt (tại tuyến chống)' : 'Thanh đứng chính chạy suốt (tại tuyến pát)';
    add('K2', k2name, colBase(0), colLen, nEndCols, { loc: `${geo.axesV[0]}, ${geo.axesV[geo.nV - 1]}` });
    if (nIntCols > 0) add('K2', k2name, colBase(cols[1]), colLen, nIntCols,
      { loc: cols.slice(1, -1).map((i) => geo.axesV[i]).join(', ') });
    // K3 – ray giữa, cắt giữa các cột chính (liên tục qua thanh đứng phụ)
    const intRails = geo.yLines.slice(1, -1);
    if (intRails.length) {
      for (let c = 1; c < cols.length; c++) {
        const a = xc[c - 1] + colBase(cols[c - 1]).b / 2;
        const b = xc[c] - colBase(cols[c]).b / 2;
        const subX = geo.xLines.filter((x, i) => i > cols[c - 1] && i < cols[c]);
        const segs = splitRun(a, b, subX, ST.stock);
        for (const [s0, s1] of segs) {
          add('K3', 'Thanh ngang giữa (hàn giữa 2 thanh đứng chính)', S.railInt, s1 - s0, intRails.length,
            { loc: `Trục ${intRails.map((y) => geo.axesH[geo.yLines.indexOf(y)]).join(', ')}; ${geo.axesV[cols[c - 1]]}–${geo.axesV[cols[c]]}` });
        }
      }
    }
    // K4 – thanh đứng phụ, cắt giữa các ray
    const subs = [];
    for (let i = 1; i < geo.nV - 1; i++) if (!colSet.has(i)) subs.push(i);
    if (subs.length) {
      for (let j = 0; j < geo.nR - 1; j++) {
        const y0 = j === 0 ? bP : geo.yLines[j] + S.railInt.b / 2;
        const y1 = j + 1 === geo.nR - 1 ? geo.H - bP : geo.yLines[j + 1] - S.railInt.b / 2;
        add('K4', 'Thanh đứng phụ (hàn giữa 2 thanh ngang)', S.sub, y1 - y0, subs.length,
          { loc: `${geo.axesH[j]}–${geo.axesH[j + 1]}; ${subs.map((i) => geo.axesV[i]).join(', ')}` });
      }
    }
    // C5 – ốp lưng
    const backedCols = cols.filter((i) => colSec(i).composite);
    if (backedCols.length) {
      const base = colBase(backedCols[0]);
      const len = S.perim.h <= base.h ? geo.H : geo.H - 2 * bP;
      add('C5', 'Ốp lưng tăng cứng thanh đứng chính (hàn đính 2 bên)', base, len, backedCols.length,
        { loc: backedCols.map((i) => geo.axesV[i]).join(', '), joints: 2 * Math.ceil(len / 150), stitch: true });
    }

    let strut = null;
    if (p.mount === 'roof' && cols.length >= 1) {
      const sgEnd = strutGeom(p, geo, colSec(0).h, S.strut);
      const sgInt = nIntCols > 0 ? strutGeom(p, geo, colSec(cols[1]).h, S.strut) : null;
      strut = { end: sgEnd, int: sgInt };
      const lens = [[sgEnd, nEndCols, 'đầu bảng', `${geo.axesV[0]}, ${geo.axesV[geo.nV - 1]}`]];
      if (sgInt) lens.push([sgInt, nIntCols, 'giữa', cols.slice(1, -1).map((i) => geo.axesV[i]).join(', ')]);
      for (const [sg, n, lbl, loc] of lens) {
        add('C1', `Thanh chống xiên (cắt vát 2 đầu, α≈${Math.round(sg.alpha)}°)`, S.strut, U.ceilTo(sg.len, 10), n,
          { loc: `Tuyến ${lbl}: ${loc}`, angle: sg.alpha });
        if (sg.hasK) add('C2', `Giằng K (nút y=${Math.round(sg.yg)} → giữa C1)`, S.strut, U.ceilTo(sg.kLen, 10), n, { loc: `Tuyến ${lbl}: ${loc}` });
      }
      if (cols.length >= 2) {
        const run = xc[xc.length - 1] - xc[0] + S.strut.b;
        const splits = xc.slice(1, -1).map((x) => x - xc[0] + S.strut.b / 2);
        const s3 = splitRun(0, run, splits, ST.stock);
        splices.c3 = s3.slice(1).map(([a]) => a + xc[0] - S.strut.b / 2);
        s3.forEach(([a, b]) => add('C3', 'Giằng dọc nối giữa các thanh chống', S.strut, b - a, 1,
          { loc: 'Giữa C1, suốt chiều dài', joints: 0 }));
        splitRun(0, run, splits, ST.stock).forEach(([a, b]) => add('C4', 'Thanh chân dọc trên mái (trùng tim xà gồ)', S.strut, b - a, 1,
          { loc: 'Chân C1, suốt chiều dài', joints: 0 }));
        if (p.strut.endBracing && cols.length >= 3) {
          const sL = xc[1] - xc[0], sR = xc[xc.length - 1] - xc[xc.length - 2];
          add('C6', 'Giằng chéo đầu hồi (đỉnh C1 → chân C1 kế bên)', S.strut, U.ceilTo(Math.hypot(sL, sgEnd.len), 10), 1, { loc: `${geo.axesV[cols[0]]}–${geo.axesV[cols[1]]}` });
          add('C6', 'Giằng chéo đầu hồi (đỉnh C1 → chân C1 kế bên)', S.strut, U.ceilTo(Math.hypot(sR, sgEnd.len), 10), 1, { loc: `${geo.axesV[cols[cols.length - 2]]}–${geo.axesV[cols[cols.length - 1]]}` });
        }
      }
    }
    // Cần đèn
    const lamps = lampPositions(p, geo);
    if (lamps.length) {
      const lampSec = p.steel !== 'auto' ? CAT.get(p.steel) : CAT.get(CAT.BASE);
      add('D1', 'Cần đèn – đoạn đứng (hàn lên ray bao trên)', lampSec, p.lamps.rise, lamps.length, { loc: lamps.map((l) => geo.axesV[l.i]).join(', ') });
      add('D2', 'Cần đèn – đoạn vươn ra trước (cắt vát 45°)', lampSec, p.lamps.reach, lamps.length, { loc: 'Gắn đèn pha ở đầu', joints: 1 });
    }
    return { pieces, xc, strut, lamps, splices };
  }

  function lampPositions(p, geo) {
    if (!p.lamps.enabled) return [];
    let n = p.lamps.count > 0 ? p.lamps.count : Math.max(2, Math.round(geo.L / 2000) + 1);
    n = Math.min(n, geo.nV);
    if (n === 1) {
      const i = geo.xLines.reduce((b, x, k) => (Math.abs(x - geo.L / 2) < Math.abs(geo.xLines[b] - geo.L / 2) ? k : b), 0);
      return [{ i, x: geo.xLines[i] }];
    }
    const used = new Set();
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = (geo.L * k) / (n - 1);
      let best = -1;
      geo.xLines.forEach((x, i) => { if (!used.has(i) && (best < 0 || Math.abs(x - t) < Math.abs(geo.xLines[best] - t))) best = i; });
      used.add(best);
      out.push({ i: best, x: Math.min(geo.L - 10, Math.max(10, geo.xLines[best])) });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  /** Gán ký hiệu: nhóm theo (vai trò, quy cách, chiều dài) */
  function assignMarks(pieces) {
    const groups = new Map();
    for (const pc of pieces) {
      const key = `${pc.role}|${pc.secId}|${pc.len}`;
      if (!groups.has(key)) groups.set(key, Object.assign({}, pc, { qty: 0, locs: [] }));
      const g = groups.get(key);
      g.qty += pc.qty;
      if (pc.loc && !g.locs.includes(pc.loc)) g.locs.push(pc.loc);
    }
    const byRole = new Map();
    for (const g of groups.values()) {
      if (!byRole.has(g.role)) byRole.set(g.role, []);
      byRole.get(g.role).push(g);
    }
    const order = ['K1', 'K2', 'K3', 'K4', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D1', 'D2'];
    const out = [];
    for (const role of order) {
      const arr = (byRole.get(role) || []).sort((a, b) => b.len - a.len || a.secId.localeCompare(b.secId));
      arr.forEach((g, n) => {
        g.mark = arr.length > 1 ? `${role}.${n + 1}` : role;
        g.totalLen = g.len * g.qty;
        g.kg = g.totalLen / 1000 * g.sec.kgm;
        out.push(g);
      });
    }
    return out;
  }

  function weldStats(pieces) {
    let joints = 0, weldLen = 0, cuts = 0, cutPerim = 0;
    for (const pc of pieces) {
      const per = 2 * (pc.sec.b + pc.sec.h);
      if (pc.stitch) { joints += pc.joints * pc.qty; weldLen += pc.joints * pc.qty * 30; }
      else { joints += pc.joints * pc.qty; weldLen += pc.joints * pc.qty * per; }
      cuts += pc.qty; cutPerim += pc.qty * per;
    }
    return { joints, weldLen, cuts, cutPerim };
  }

  /* ------------------------------------------------------------------ */
  /* Tôn phẳng 3 dem khổ 1 m                                              */
  /* ------------------------------------------------------------------ */
  function faceLayout(p, geo, q) {
    const a = p.face.allowance;
    const make = (dir) => {
      const strips = [];
      const joints = [];
      if (dir === 'h') {
        let y = 0;
        geo.bayH.forEach((h, j) => {
          const total = geo.L + 2 * a;
          const nSeg = Math.ceil(total / p.face.maxLen);
          const cuts = [0];
          for (let s = 1; s < nSeg; s++) {
            const t = (geo.L * s) / nSeg;
            const x = geo.xLines.reduce((b, v) => (Math.abs(v - t) < Math.abs(b - t) ? v : b), geo.xLines[0]);
            cuts.push(x);
          }
          cuts.push(geo.L);
          for (let s = 0; s < cuts.length - 1; s++) {
            strips.push({ x: cuts[s], y, w: cuts[s + 1] - cuts[s], h, cut: cuts[s + 1] - cuts[s] + 2 * a, rip: h < TON.width - 1 });
            if (s > 0) joints.push({ x1: cuts[s], y1: y, x2: cuts[s], y2: y + h });
          }
          if (j > 0) joints.push({ x1: 0, y1: y, x2: geo.L, y2: y });
          y += h;
        });
      } else {
        let x = 0;
        geo.bayW.forEach((w, i) => {
          const total = geo.H + 2 * a;
          const nSeg = Math.ceil(total / p.face.maxLen);
          const cuts = [0];
          for (let s = 1; s < nSeg; s++) {
            const t = (geo.H * s) / nSeg;
            cuts.push(geo.yLines.reduce((b, v) => (Math.abs(v - t) < Math.abs(b - t) ? v : b), geo.yLines[0]));
          }
          cuts.push(geo.H);
          for (let s = 0; s < cuts.length - 1; s++) {
            strips.push({ x, y: cuts[s], w, h: cuts[s + 1] - cuts[s], cut: cuts[s + 1] - cuts[s] + 2 * a, rip: w < TON.width - 1, vertical: true });
            if (s > 0) joints.push({ x1: x, y1: cuts[s], x2: x + w, y2: cuts[s] });
          }
          if (i > 0) joints.push({ x1: x, y1: 0, x2: x, y2: geo.H });
          x += w;
        });
      }
      const buyLen = U.sum(strips, (s) => s.cut);
      const jointLen = U.sum(joints, (j) => Math.hypot(j.x2 - j.x1, j.y2 - j.y1));
      return { dir, strips, joints, buyLen, jointLen };
    };
    let lay;
    if (p.face.orientation === 'h' || p.face.orientation === 'v') lay = make(p.face.orientation);
    else {
      const h = make('h'), v = make('v');
      lay = h.buyLen < v.buyLen - 1 || (Math.abs(h.buyLen - v.buyLen) <= 1 && h.jointLen <= v.jointLen) ? h : v;
    }
    // nhóm dải theo kích thước cắt
    const gm = new Map();
    lay.strips.forEach((s, n) => {
      s.no = n + 1;
      const key = `${s.cut}|${Math.round(lay.dir === 'h' ? s.h : s.w)}`;
      if (!gm.has(key)) gm.set(key, { cut: s.cut, width: Math.round(lay.dir === 'h' ? s.h : s.w), qty: 0, rip: s.rip, nos: [] });
      const g = gm.get(key); g.qty++; g.nos.push(n + 1);
    });
    lay.groups = [...gm.values()];
    lay.buyM = lay.buyLen / 1000;
    lay.areaBuy = lay.buyM * TON.width / 1000;
    lay.areaNet = geo.L * geo.H / 1e6;
    lay.kg = lay.areaBuy * TON.thickness * ST.rho / 1000;

    // liên kết tôn – khung
    const caps = p.face.capacity;
    const minBay = Math.min(Math.max(...geo.bayW), Math.max(...geo.bayH)) / 1000;
    const line = q.qtt * minBay; // kN/m trên thanh giữa (tôn liên tục hai phía)
    let pitch = p.face.pitch === 'auto' ? null : Number(p.face.pitch);
    const pitchOpts = [250, 200, 150, 120, 100];
    let fastWarn = null;
    if (!pitch) {
      pitch = pitchOpts.find((s) => line * s / 1000 <= caps) || 100;
      if (line * pitch / 1000 > caps) fastWarn = 'Lực nhổ trên mỗi liên kết tôn vượt khả năng ngay cả ở bước 100 mm – tăng chiều dày tôn hoặc dùng nẹp ép.';
    }
    const demand = line * pitch / 1000;
    // đếm liên kết theo đường thanh khung
    const isJointH = (y) => lay.joints.some((j) => Math.abs(j.y1 - y) < 1 && Math.abs(j.y2 - y) < 1 && j.x2 - j.x1 > 1);
    const isJointV = (x) => lay.joints.some((j) => Math.abs(j.x1 - x) < 1 && Math.abs(j.x2 - x) < 1 && j.y2 - j.y1 > 1);
    let count = 0;
    let lineLen = 0;
    geo.yLines.forEach((y) => {
      const rows = isJointH(y) ? (p.face.jointCover ? 1 : 2) : 1;
      count += rows * (Math.floor(geo.L / pitch) + 1); lineLen += geo.L;
    });
    geo.xLines.forEach((x) => {
      const rows = isJointV(x) ? (p.face.jointCover ? 1 : 2) : 1;
      count += rows * (Math.floor(geo.H / pitch) + 1); lineLen += geo.H;
    });
    count -= geo.nV * geo.nR; // trùng tại nút giao
    const F = FASTENERS[p.face.fastener];
    const buy = Math.ceil(count * 1.1);
    lay.fast = {
      type: p.face.fastener, name: F.name, pitch, count, buy, packs: Math.ceil(buy / F.pack), pack: F.pack, packName: F.packName,
      demand, capacity: caps, util: demand / caps, lineLen: lineLen / 1000, warn: fastWarn,
    };
    return lay;
  }

  /* ------------------------------------------------------------------ */
  /* Tối ưu vật liệu                                                     */
  /* ------------------------------------------------------------------ */
  function evaluateCfg(p, geo, q, cfg) {
    const S = cfg.sec;
    const checks = [];
    const push = (group, member, sec, util, detail) => checks.push({ group, member, sec: sec.name, util, ok: util <= 1.0001, detail });
    const rc = railChecks(geo, cfg.cols, q.N, p.wind.gamma, S.perim, geo.nR > 2 ? S.railInt : null);
    if (rc.perim) push('Khung mặt', 'K1 – thanh ngang bao', S.perim, rc.perim.util,
      `nhịp ${U.mm(rc.perim.span)} mm, M=${U.fmt(rc.perim.M / 1e6, 3)} kN·m, σ=${U.fmt(rc.perim.sig, 0)} MPa`);
    if (rc.int) push('Khung mặt', 'K3 – thanh ngang giữa', S.railInt, rc.int.util,
      `nhịp ${U.mm(rc.int.span)} mm, M=${U.fmt(rc.int.M / 1e6, 3)} kN·m, σ=${U.fmt(rc.int.sig, 0)} MPa`);
    const sc = subCheck(geo, cfg.cols, q.N, p.wind.gamma, S.sub);
    if (sc) push('Khung mặt', 'K4 – thanh đứng phụ', S.sub, sc.util, `nhịp ${U.mm(sc.span)} mm, σ=${U.fmt(sc.sig, 0)} MPa`);

    const xs = cfg.cols.map((i) => geo.xLines[i]);
    const spans = xs.slice(1).map((x, n) => x - xs[n]);
    const tribEnd = Math.max(spans[0], spans[spans.length - 1]) / 2;
    let tribInt = 0;
    for (let n = 1; n < xs.length - 1; n++) tribInt = Math.max(tribInt, (spans[n - 1] + spans[n]) / 2);
    const lines = [{ key: 'end', trib: tribEnd, sec: S.colEnd, label: 'đầu bảng' }];
    if (tribInt > 0) lines.push({ key: 'int', trib: tribInt, sec: S.colInt, label: 'giữa' });
    const an = {};
    for (const ln of lines) {
      const sg = strutGeom(p, geo, ln.sec.h, S.strut);
      const r = p.mount === 'wall' ? analyzeWallLine(p, geo, q.N, ln.trib, ln.key === 'end', ln.sec)
        : analyzeLine(p, geo, q.N * ln.trib, ln.sec, S.strut, sg);
      an[ln.key] = Object.assign(r, { sg, trib: ln.trib });
      push(p.mount === 'roof' ? 'Hệ chống' : 'Khung mặt', `K2 – thanh đứng chính ${ln.label}${ln.sec.composite ? ' (+ ốp lưng C5)' : ''}`, ln.sec,
        Math.max(r.col.util, r.defl.util), `tải ${U.fmt(ln.trib / 1000, 2)} m bề rộng, N=${U.fmt(Math.abs(r.col.N) / 1000, 2)} kN, M=${U.fmt(r.col.M / 1e6, 3)} kN·m`);
      if (p.mount === 'roof') {
        push('Hệ chống', `C1 – thanh chống xiên ${ln.label}`, S.strut, r.strut.util,
          `N=${U.fmt(r.strut.N / 1000, 2)} kN, λ=${U.fmt(r.strut.lam, 0)}, χ=${U.fmt(r.strut.chi, 2)}`);
        if (r.k) push('Hệ chống', `C2 – giằng K ${ln.label}`, S.strut, r.k.util,
          `N=${U.fmt(r.k.N / 1000, 2)} kN, λ=${U.fmt(r.k.lam, 0)}`);
      }
    }
    const ok = checks.every((c) => c.ok);
    return { checks, ok, an, maxUtil: Math.max(...checks.map((c) => c.util)) };
  }

  function costOf(p, geo, cfg) {
    const bp = buildPieces(p, geo, cfg);
    const bySec = new Map();
    for (const pc of bp.pieces) {
      if (!bySec.has(pc.secId)) bySec.set(pc.secId, { sec: pc.sec, lens: [] });
      for (let k = 0; k < pc.qty; k++) bySec.get(pc.secId).lens.push(pc.len);
    }
    let kg = 0, bars = 0, netKg = 0;
    for (const { sec, lens } of bySec.values()) {
      const n = SB.cutting.ffd(lens).length;
      bars += n; kg += n * ST.stock / 1000 * sec.kgm;
      netKg += U.sum(lens) / 1000 * sec.kgm;
    }
    const ws = weldStats(bp.pieces);
    const feet = p.mount === 'roof' ? cfg.cols.length : 0;
    const anchors = p.mount === 'wall' ? cfg.cols.length * geo.nR : 0;
    const cost = kg * p.cost.steel + ws.joints * p.cost.joint + feet * p.cost.foot + anchors * p.cost.anchor;
    return { cost, kg, netKg, bars, joints: ws.joints, feet, anchors, nSec: bySec.size };
  }

  function lightest(cands, test) {
    for (const c of cands) if (test(c)) return c;
    return null;
  }

  function optimize(p, geo, q, warnings) {
    const base = CAT.get(CAT.BASE);
    const fixed = p.steel !== 'auto' ? CAT.get(p.steel) : null;
    const ruleApplies = !fixed && p.material === 'rule' && p.L <= RULE_L && p.H <= RULE_H;
    const byKg = (arr) => [...arr].sort((a, b) => a.kgm - b.kgm || a.A - b.A);
    const pools = (mode) => {
      if (mode === 'fixed') return { fill: fixed, perim: [fixed], int: [fixed], sub: [fixed], col: [fixed, CAT.backed(fixed)], strut: [fixed] };
      if (mode === 'rule') return { fill: base, perim: [base], int: [base], sub: [base], col: [base, CAT.backed(base)], strut: [base] };
      return {
        fill: base, perim: byKg(CAT.list), int: byKg(CAT.list), sub: byKg(CAT.list.filter((s) => s.b <= 25 && s.h <= 25)),
        col: byKg([...CAT.list, CAT.backed(base)]), strut: byKg(CAT.square()),
      };
    };
    const run = (mode) => {
      const P = pools(mode);
      const maxK = Math.max(1, Math.min(6, geo.nV - 1));
      const ks = p.strut.spacing === 'auto' ? [1, 2, 3, 4].filter((k) => k <= maxK) : [U.clamp(Number(p.strut.spacing) || 1, 1, maxK)];
      const results = [];
      for (const k of ks) {
        const cols = colIndices(geo.nV, k);
        const twoWay = cols.length === geo.nV;
        const perim = lightest(P.perim, (s) => { const r = railChecks(geo, cols, q.N, p.wind.gamma, s, null); return r.perim.util <= 1; });
        if (!perim) continue;
        const railInt = geo.nR > 2 ? lightest(P.int, (s) => railChecks(geo, cols, q.N, p.wind.gamma, perim, s).int.util <= 1) : P.fill;
        if (!railInt) continue;
        const sub = twoWay ? P.fill : lightest(P.sub, (s) => { const r = subCheck(geo, cols, q.N, p.wind.gamma, s); return !r || r.util <= 1; });
        if (!sub) continue;
        const xs = cols.map((i) => geo.xLines[i]);
        const spans = xs.slice(1).map((x, n) => x - xs[n]);
        const tribEnd = Math.max(spans[0], spans[spans.length - 1]) / 2;
        let tribInt = 0;
        for (let n = 1; n < xs.length - 1; n++) tribInt = Math.max(tribInt, (spans[n - 1] + spans[n]) / 2);
        const strutPool = p.mount === 'roof' ? P.strut : [P.fill];
        for (const strut of strutPool) {
          const okLine = (sec, trib, isEnd) => {
            const sg = strutGeom(p, geo, sec.h, strut);
            const r = p.mount === 'wall' ? analyzeWallLine(p, geo, q.N, trib, isEnd, sec)
              : analyzeLine(p, geo, q.N * trib, sec, strut, sg);
            const u = Math.max(r.col.util, r.defl.util, r.strut ? r.strut.util : 0, r.k ? r.k.util : 0);
            return u <= 1;
          };
          // ốp lưng chỉ dùng khi ray bao không sâu hơn thanh đứng (ốp nằm sau, chạy suốt chiều cao)
          const colPool = P.col.filter((s) => !s.composite || perim.h <= s.h / 2);
          const colEnd = lightest(colPool, (s) => okLine(s, tribEnd, true));
          if (!colEnd) continue;
          const colInt = tribInt > 0 ? lightest(colPool, (s) => okLine(s, tribInt, false)) : colEnd;
          if (!colInt) continue;
          const cfg = { k, cols, sec: { perim, railInt, sub, colEnd, colInt, strut } };
          const c = costOf(p, geo, cfg);
          results.push(Object.assign({ cfg }, c));
        }
      }
      return results.sort((a, b) => a.cost - b.cost || a.kg - b.kg);
    };
    const secTxt = (alt) => [...new Set([alt.cfg.sec.perim, alt.cfg.sec.railInt, alt.cfg.sec.colInt, alt.cfg.sec.colEnd, alt.cfg.sec.strut]
      .map((s) => s.name.replace('Hộp ', '')))].join(' + ');
    if (fixed) {
      let results = run('fixed');
      let regime = 'fixed';
      if (!results.length) {
        regime = 'fixed-fail';
        const cols = colIndices(geo.nV, 1);
        const backed = CAT.backed(fixed);
        const cfg = { k: 1, cols, sec: { perim: fixed, railInt: fixed, sub: fixed, colEnd: backed, colInt: backed, strut: fixed } };
        results = [Object.assign({ cfg }, costOf(p, geo, cfg))];
        const sug = run(p.L <= RULE_L && p.H <= RULE_H ? 'rule' : 'free');
        const alt = sug.length ? sug[0] : run('free')[0];
        warnings.push(`Quy cách ${fixed.name} KHÔNG đủ chịu tải gió vùng ${p.wind.zone} ngay cả khi chống tại mọi thanh đứng và ốp lưng – bản vẽ vẫn lập theo quy cách đã chọn để tham khảo.`
          + (alt ? ` Đề xuất thay bằng: ${secTxt(alt)} (chống mỗi ${alt.cfg.k} khoang).` : ''));
      }
      return { regime, best: results[0], alternatives: results.slice(0, 8) };
    }
    let regime = ruleApplies ? 'rule' : 'free';
    let results = run(ruleApplies ? 'rule' : 'free');
    if (!results.length && ruleApplies) {
      warnings.push(p.strut.spacing === 'auto'
        ? 'Với tải gió đã chọn, hộp 20×20×1.2 không đủ chịu lực ngay cả khi chống/bắt pát tại mọi thanh đứng – đã chuyển sang tối ưu vật liệu.'
        : `Với bước chống/pát đã chọn (mỗi ${p.strut.spacing} khoang), hộp 20×20×1.2 không đủ chịu lực – đã chuyển sang tối ưu vật liệu. Chọn bước "Tự động" để giữ hộp 20×20×1.2.`);
      regime = 'free-fallback';
      results = run('free');
    }
    if (!results.length) {
      warnings.push('Không tìm được phương án đạt kiểm tra trong danh mục thép hộp – cần thiết kế kết cấu riêng (tăng số chống, giảm bước ô hoặc dùng thép hình).');
      const cols = colIndices(geo.nV, 1);
      const big = CAT.get('60x60x1.8');
      const cfg = { k: 1, cols, sec: { perim: big, railInt: big, sub: base, colEnd: CAT.get('50x100x2.0'), colInt: CAT.get('50x100x2.0'), strut: big } };
      results = [Object.assign({ cfg }, costOf(p, geo, cfg))];
      regime = 'none';
    }
    return { regime, best: results[0], alternatives: results.slice(0, 8) };
  }

  /* ------------------------------------------------------------------ */
  /* Vật tư cần mua                                                      */
  /* ------------------------------------------------------------------ */
  function purchaseList(p, geo, res) {
    const rows = [];
    const r2 = (v) => Math.round(v * 100) / 100;
    const add = (group, name, spec, unit, qtyNet, qtyBuy, note, extra) => rows.push(Object.assign({ group, name, spec, unit, qtyNet: r2(qtyNet), qtyBuy: r2(qtyBuy), note: note || '' }, extra || {}));
    // thép
    const plans = res.cut;
    const mainSec = [...plans].sort((a, b) => b.plan.nBars - a.plan.nBars)[0];
    for (const c of plans) {
      const spare = c === mainSec ? p.purchase.spareBars : 0;
      const n = c.plan.nBars + spare;
      add('Thép hộp', `Thép hộp mạ kẽm ${c.sec.name.replace('Hộp ', '')}`, 'Cây 6 m', 'cây', c.plan.nBars, n,
        `${U.fmt(n * 6 * c.sec.kgm, 1)} kg; tịnh ${U.fmt(c.netLen / 1000, 2)} m${spare ? `; +${spare} cây dự phòng` : ''}`, { secId: c.sec.id, kg: n * 6 * c.sec.kgm });
    }
    // tôn
    const f = res.face;
    add('Mặt bảng', TON.name, f.groups.map((g) => `${g.qty} tấm dài ${U.mm(g.cut)} (rộng ${g.width}${g.rip ? ', xẻ từ khổ 1 m' : ''})`).join(' + '), 'm dài', f.buyM, U.ceilTo(f.buyM, 0.1),
      `${U.fmt(f.areaBuy, 2)} m², ≈${U.fmt(f.kg, 1)} kg`);
    add('Mặt bảng', f.fast.name, `@${f.fast.pitch} mm trên mọi thanh khung`, 'con', f.fast.count, f.fast.packs * f.fast.pack,
      `${f.fast.packs} ${f.fast.packName} (đã +10%)`);
    if (p.face.hiflex) {
      const w = p.face.hiflexWrap;
      const a = (geo.L + 2 * w) * (geo.H + 2 * w) / 1e6;
      add('Mặt bảng', 'Bạt Hiflex in bọc ngoài', `${U.mm(geo.L + 2 * w)} × ${U.mm(geo.H + 2 * w)} mm (bọc mép ${w})`, 'm²', a, U.ceilTo(a, 0.1));
    }
    if (p.face.edgeTrim) {
      const m = 2 * (geo.L + geo.H) / 1000;
      add('Mặt bảng', 'Nẹp viền chu vi (V nhôm 20×20)', 'Cây 6 m', 'cây', m / 6, Math.ceil(m / 6), `${U.fmt(m, 2)} m`);
    }
    if (p.face.jointCover && f.jointLen > 0) {
      const m = f.jointLen / 1000;
      add('Mặt bảng', 'Nẹp che mối nối tôn (nhôm dẹt 25 mm)', 'Cây 6 m', 'cây', m / 6, Math.ceil(m / 6), `${U.fmt(m, 2)} m`);
    }
    // liên kết
    const acc = res.accessories;
    if (p.mount === 'roof') {
      add('Liên kết', 'Bát L chân bảng (thép V40×40×4, dài 60)', 'Hàn chân thanh đứng chính', 'cái', acc.baseBrackets, acc.baseBrackets);
      add('Liên kết', 'Tắc kê nở sắt M8×60 (hoặc vít bắn vào xà gồ)', `${acc.anchorPer} con/bát`, 'con', acc.anchors, acc.anchors);
      add('Liên kết', 'Vít bắn tôn 6×65 + long đen EPDM (chân chống vào xà gồ)', `${acc.footScrewPer} vít/chân chống`, 'con', acc.roofScrews, acc.roofScrews);
      add('Liên kết', 'Keo silicone chống dột', 'Tuýp 300 ml', 'tuýp', acc.silicone, acc.silicone);
    } else {
      add('Liên kết', 'Pát tường (thép V40×40×4, dài 60)', 'Tại mọi nút thanh đứng chính × thanh ngang', 'cái', acc.wallBrackets, acc.wallBrackets);
      add('Liên kết', 'Tắc kê nở sắt M8×60', `${acc.anchorPer} con/pát`, 'con', acc.anchors, acc.anchors);
    }
    // vật tư phụ gia công
    add('Gia công', 'Que hàn Ø2.5 (J421)', `≈${acc.rods} que (≈${U.fmt(acc.weldLen / 1000, 1)} m đường hàn)`, 'kg', acc.rodKg, U.ceilTo(acc.rodKg, 0.5), 'ước tính');
    add('Gia công', 'Đá cắt sắt Ø105', `≈${acc.cuts} vết cắt`, 'viên', acc.discs, acc.discs, 'ước tính');
    add('Gia công', 'Sơn kẽm lạnh dặm mối hàn', 'Bình xịt 400 ml', 'bình', acc.paint, acc.paint, 'ước tính');
    if (res.lamps.length) add('Chiếu sáng', `Đèn pha LED ${p.lamps.power} W`, 'Gắn đầu cần đèn', 'bộ', res.lamps.length, res.lamps.length, 'chọn công suất theo thực tế');
    return rows;
  }

  /* ------------------------------------------------------------------ */
  /* Chạy toàn bộ                                                        */
  /* ------------------------------------------------------------------ */
  function run(raw) {
    const p = normalize(raw);
    const warnings = [];
    const geo = buildGeom(p);
    const remW = geo.bayW[geo.bayW.length - 1], remH = geo.bayH[geo.bayH.length - 1];
    if (remW < 200 && geo.bayW.length > 1) warnings.push(`Khoang cuối theo chiều dài chỉ ${remW} mm – nên chỉnh chiều dài bảng hoặc bước ô.`);
    if (remH < 200 && geo.bayH.length > 1) warnings.push(`Khoang trên cùng chỉ ${remH} mm – nên chỉnh chiều cao bảng hoặc bước ô.`);
    if (p.grid !== 1000) warnings.push(`Bước ô ${p.grid} mm khác khổ tôn 1 m – mỗi dải tôn sẽ được xẻ theo khoang, hao hụt tôn tăng.`);
    const w = SB.wind.pressure(Object.assign({}, p.wind, { H: p.H }));
    const q = Object.assign({}, w, { N: w.qtt * 1e-3 }); // N/mm²
    const opt = optimize(p, geo, q, warnings);
    const cfg = opt.best.cfg;
    const ev = evaluateCfg(p, geo, q, cfg);
    if (!ev.ok) warnings.push('Một số cấu kiện vượt khả năng chịu lực – xem tab Kiểm tra kết cấu.');
    const bp = buildPieces(p, geo, cfg);
    const marked = assignMarks(bp.pieces);
    // pha cắt theo quy cách
    const bySec = new Map();
    for (const g of marked) {
      if (!bySec.has(g.secId)) bySec.set(g.secId, { sec: g.sec, pieces: [], netLen: 0 });
      const e = bySec.get(g.secId);
      for (let k = 0; k < g.qty; k++) e.pieces.push({ mark: g.mark, len: g.len });
      e.netLen += g.totalLen;
    }
    const cut = [...bySec.values()].map((e) => Object.assign(e, { plan: SB.cutting.plan(e.pieces) }))
      .sort((a, b) => b.sec.kgm - a.sec.kgm);
    const face = faceLayout(p, geo, q);
    if (face.fast.warn) warnings.push(face.fast.warn);
    // phụ kiện
    const ws = weldStats(bp.pieces);
    const acc = { joints: ws.joints, weldLen: ws.weldLen, cuts: ws.cuts };
    acc.rods = Math.ceil(ws.weldLen / 100);
    acc.rodKg = Math.max(0.5, acc.rods * 0.018);
    acc.discs = Math.max(1, Math.ceil(ws.cutPerim / 80 / 45));
    acc.paint = Math.max(1, Math.ceil(ws.joints / 60));
    const reac = (r, idx) => { const v = r.reactions[idx] || [0, 0, 0]; return { h: Math.abs(v[0]) / 1000, v: Math.abs(v[1]) / 1000, res: Math.hypot(v[0], v[1]) / 1000 }; };
    if (p.mount === 'roof') {
      const lines = Object.values(ev.an);
      const baseR = Math.max(...lines.map((l) => reac(l, 0).res));
      const footR = Math.max(...lines.map((l) => reac(l, l.footIdx).v));
      acc.baseBrackets = cfg.cols.length;
      acc.anchorPer = Math.max(1, Math.ceil(baseR / p.anchors.baseCap));
      acc.anchors = acc.baseBrackets * acc.anchorPer;
      acc.footScrewPer = Math.max(2, Math.ceil(footR / p.anchors.roofScrewCap));
      // thêm vít dọc thanh chân C4 để đạt tối thiểu 1 vít/m dài
      acc.roofScrews = cfg.cols.length * acc.footScrewPer + Math.max(0, Math.ceil(geo.L / 1000) - cfg.cols.length);
      acc.silicone = Math.max(1, Math.ceil(acc.roofScrews / 15));
      acc.baseR = baseR; acc.footR = footR;
    } else {
      const lines = Object.values(ev.an);
      const maxR = Math.max(...lines.map((l) => l.anchorR / 1000));
      acc.wallBrackets = cfg.cols.length * geo.nR;
      acc.anchorPer = Math.max(1, Math.ceil(maxR / p.anchors.baseCap));
      acc.anchors = acc.wallBrackets * acc.anchorPer;
      acc.baseR = maxR;
    }
    const totals = {
      netLen: U.sum(marked, (g) => g.totalLen) / 1000,
      netKg: U.sum(marked, (g) => g.kg),
      bars: U.sum(cut, (c) => c.plan.nBars),
      buyKg: U.sum(cut, (c) => c.plan.nBars * 6 * c.sec.kgm),
      pieces: U.sum(marked, (g) => g.qty),
    };
    const sections = [...new Set([cfg.sec.perim, cfg.sec.railInt, cfg.sec.colEnd, cfg.sec.colInt, cfg.sec.sub, p.mount === 'roof' ? cfg.sec.strut : null]
      .filter(Boolean).map((s) => (s.composite ? s.baseId : s.id)))].map((id) => CAT.get(id));
    const regimeText = {
      rule: `Bảng ≤ ${RULE_L / 1000} m × ${RULE_H / 1000} m → dùng hộp mạ kẽm 20×20×1.2 cho toàn bộ khung và hệ chống (theo quy tắc).`,
      free: 'Bảng vượt 8 m × 2 m (hoặc chọn tối ưu tự do) → đã chọn quy cách nhẹ nhất/chi phí thấp nhất đạt kiểm tra gió.',
      'free-fallback': 'Hộp 20×20×1.2 không đạt với tải gió đã chọn → đã chọn quy cách tối ưu khác.',
      none: 'Không có phương án đạt trong danh mục – kết quả chỉ để tham khảo.',
      fixed: p.steel !== 'auto'
        ? `Dùng quy cách đã chọn: ${CAT.get(p.steel).name} cho toàn bộ khung, thanh chống và giằng${cfg.sec.colInt.composite || cfg.sec.colEnd.composite ? '; thanh đứng chính ốp lưng thêm 1 thanh cùng quy cách' : ''} – đạt kiểm tra gió.` : '',
      'fixed-fail': p.steel !== 'auto' ? `Quy cách đã chọn ${CAT.get(p.steel).name} KHÔNG đủ chịu tải gió – xem đề xuất thay thế.` : '',
    }[opt.regime];
    const res = {
      p, geo, wind: w, q, regime: opt.regime, regimeText, cfg, eval: ev, checks: ev.checks,
      pieces: marked, rawPieces: bp.pieces, xc: bp.xc, strut: bp.strut, lamps: bp.lamps, splices: bp.splices,
      cut, face, accessories: acc, totals, sections, alternatives: opt.alternatives, best: opt.best,
      warnings, TON,
    };
    res.purchase = purchaseList(p, geo, res);
    return res;
  }

  SB.design = { DEFAULTS, normalize, run, buildGeom, colIndices, strutGeom, analyzeLine, beamLoad, faceLayout, TON, FASTENERS, RULE_L, RULE_H };
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);

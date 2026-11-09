/*!
 * Bảng hiệu – bài toán pha cắt cây thép 6 m (1D cutting stock).
 * Điều kiện 1 cây: 1 đoạn: dài <= cây; nhiều đoạn: tổng dài + mạch cắt x (n-1) + cắt vuông đầu cây <= cây.
 */
(function (root) {
  'use strict';
  const SB = (root.SB = root.SB || {});

  const DEF = { stock: 6000, kerf: 3, trim: 10 };

  function fits(lens, o) {
    const n = lens.length;
    if (n === 0) return true;
    const s = lens.reduce((a, b) => a + b, 0);
    return n === 1 ? s <= o.stock : s + o.kerf * (n - 1) + o.trim <= o.stock;
  }

  /** First-Fit Decreasing – nhanh, dùng trong vòng lặp tối ưu */
  function ffd(lengths, opt) {
    const o = Object.assign({}, DEF, opt);
    const items = [...lengths].sort((a, b) => b - a);
    const bins = [];
    for (const L of items) {
      if (L > o.stock) throw new Error(`Đoạn ${L} mm dài hơn cây ${o.stock} mm`);
      let placed = false;
      for (const b of bins) {
        if (fits([...b, L], o)) { b.push(L); placed = true; break; }
      }
      if (!placed) bins.push([L]);
    }
    return bins;
  }

  /**
   * Lấp đầy tốt nhất 1 cây (knapsack giới hạn theo nhóm chiều dài) – bắt buộc chứa 1 đoạn dài nhất còn lại.
   * types: [{len, cnt}] (giảm dần). Trả về mảng số lượng mỗi loại.
   */
  function bestFill(types, o) {
    const first = types.findIndex((t) => t.cnt > 0);
    const take = types.map(() => 0);
    const L0 = types[first].len;
    take[first] = 1;
    if (L0 >= o.stock - o.trim) return take; // đoạn chiếm gần trọn cây
    // dung lượng còn lại tính cả mạch cắt: mỗi đoạn thêm chiếm len + kerf
    const cap = Math.floor(o.stock - o.trim - L0);
    if (cap <= 0) return take;
    // bounded knapsack nhị phân hoá
    const units = [];
    types.forEach((t, i) => {
      let c = t.cnt - (i === first ? 1 : 0);
      const w = t.len + o.kerf;
      if (w > cap || c <= 0) return;
      c = Math.min(c, Math.floor(cap / w));
      let k = 1;
      while (c > 0) {
        const m = Math.min(k, c);
        units.push({ i, m, w: w * m });
        c -= m; k *= 2;
      }
    });
    const best = new Int32Array(cap + 1).fill(-1);
    best[0] = 0;
    const choice = new Array(cap + 1).fill(null);
    for (let u = 0; u < units.length; u++) {
      const { w } = units[u];
      for (let c = cap; c >= w; c--) {
        if (best[c - w] >= 0 && best[c - w] + w > best[c]) {
          best[c] = best[c - w] + w;
          choice[c] = { u, prev: c - w, from: choice[c - w] };
        }
      }
    }
    // chọn ô có tổng lớn nhất
    let bc = 0;
    for (let c = 0; c <= cap; c++) if (best[c] > best[bc]) bc = c;
    // truy vết: lưu chuỗi lựa chọn (mỗi trạng thái giữ con trỏ tới chuỗi trước đó)
    let node = choice[bc];
    const used = new Set();
    while (node) {
      if (!used.has(node.u)) { used.add(node.u); take[units[node.u].i] += units[node.u].m; }
      node = node.from;
    }
    return take;
  }

  function knapsackPlan(lengths, o) {
    const map = new Map();
    for (const L of lengths) map.set(L, (map.get(L) || 0) + 1);
    const types = [...map.entries()].map(([len, cnt]) => ({ len, cnt })).sort((a, b) => b.len - a.len);
    const bins = [];
    let guard = 0;
    while (types.some((t) => t.cnt > 0) && guard++ < 10000) {
      const take = bestFill(types, o);
      const bar = [];
      take.forEach((n, i) => { for (let k = 0; k < n; k++) bar.push(types[i].len); types[i].cnt -= n; });
      if (!fits(bar, o)) throw new Error('Lỗi pha cắt: mẫu cắt vượt chiều dài cây');
      bins.push(bar);
    }
    return bins;
  }

  /**
   * pieces: [{mark, len}] – trả về {bars:[{pieces:[{mark,len}], used, waste}], patterns:[...], nBars, lowerBound}
   */
  function plan(pieces, opt) {
    const o = Object.assign({}, DEF, opt);
    if (!pieces.length) return { bars: [], patterns: [], nBars: 0, lowerBound: 0, totalLen: 0 };
    for (const p of pieces) if (p.len > o.stock) throw new Error(`${p.mark}: ${p.len} mm > ${o.stock} mm`);
    const lengths = pieces.map((p) => p.len);
    const a = ffd(lengths, o);
    let b;
    try { b = knapsackPlan(lengths, o); } catch (e) { b = a; }
    const bins = b.length <= a.length ? b : a;
    // gán ký hiệu
    const pool = new Map();
    [...pieces].sort((x, y) => y.len - x.len).forEach((p) => {
      if (!pool.has(p.len)) pool.set(p.len, []);
      pool.get(p.len).push(p.mark);
    });
    const bars = bins.map((bin) => {
      const ps = [...bin].sort((x, y) => y - x).map((len) => ({ len, mark: pool.get(len).shift() }));
      const sum = ps.reduce((s, p) => s + p.len, 0);
      const waste = ps.length === 1 ? o.stock - sum : o.stock - sum - o.kerf * (ps.length - 1) - o.trim;
      return { pieces: ps, used: o.stock - waste, waste };
    });
    // nhóm mẫu cắt giống nhau
    const pm = new Map();
    for (const bar of bars) {
      const key = bar.pieces.map((p) => `${p.mark}:${p.len}`).join('|');
      if (!pm.has(key)) pm.set(key, { key, pieces: bar.pieces, waste: bar.waste, count: 0 });
      pm.get(key).count++;
    }
    const patterns = [...pm.values()].sort((x, y) => y.count - x.count || x.waste - y.waste);
    const totalLen = lengths.reduce((s, v) => s + v, 0);
    const lowerBound = Math.ceil((totalLen + o.kerf * Math.max(0, lengths.length - 1)) / o.stock);
    return { bars, patterns, nBars: bars.length, lowerBound, totalLen };
  }

  SB.cutting = { plan, ffd, fits: (lens, opt) => fits(lens, Object.assign({}, DEF, opt)), DEF };
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);

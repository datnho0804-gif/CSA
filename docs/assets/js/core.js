/*!
 * Bảng hiệu – core: tiện ích, danh mục thép hộp, tải gió, giải khung phẳng 2D.
 * Script thường (không dùng ES module) để chạy được cả khi mở file index.html trực tiếp.
 */
(function (root) {
  'use strict';
  const SB = (root.SB = root.SB || {});

  /* ------------------------------------------------------------------ */
  /* Tiện ích                                                            */
  /* ------------------------------------------------------------------ */
  const nfCache = {};
  const util = {
    ceilTo(x, step) { return Math.round(Math.ceil(x / step - 1e-9) * step * 1e6) / 1e6; },
    roundTo(x, step) { return Math.round(Math.round(x / step) * step * 1e6) / 1e6; },
    clamp(x, a, b) { return Math.max(a, Math.min(b, x)); },
    sum(arr, f) { let s = 0; for (const v of arr) s += f ? f(v) : v; return s; },
    uniqSorted(arr, eps = 0.5) {
      const s = [...arr].sort((a, b) => a - b);
      const out = [];
      for (const v of s) if (!out.length || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
      return out;
    },
    /** Định dạng số kiểu Việt Nam: 1.234,5 */
    fmt(n, d = 0) {
      if (n === null || n === undefined || Number.isNaN(n)) return '–';
      const key = d;
      if (!nfCache[key]) nfCache[key] = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
      return nfCache[key].format(n);
    },
    /** Số mm nguyên không phân cách (dùng cho kích thước cắt) */
    mm(n) { return String(Math.round(n)); },
    deg(rad) { return rad * 180 / Math.PI; },
    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
  };
  SB.util = util;

  /* ------------------------------------------------------------------ */
  /* Vật liệu thép                                                       */
  /* ------------------------------------------------------------------ */
  const STEEL = { E: 2.0e5, fy: 235, gammaM: 1.05, rho: 7850, stock: 6000 };
  STEEL.f = STEEL.fy / STEEL.gammaM; // cường độ tính toán (MPa)
  SB.STEEL = STEEL;

  /**
   * Thép hộp: b = bề rộng mặt (nằm trong mặt phẳng bảng), h = chiều sâu (vuông góc mặt bảng),
   * t = chiều dày. Uốn do gió quanh trục song song mặt bảng -> dùng chiều sâu h.
   */
  function makeSection(b, h, t, extra) {
    const A = b * h - (b - 2 * t) * (h - 2 * t);
    const Is = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12; // trục mạnh (gió)
    const Iw = (h * b ** 3 - (h - 2 * t) * (b - 2 * t) ** 3) / 12; // trục yếu
    const sq = b === h;
    const id = `${b}x${h}x${t}`;
    return Object.assign({
      id, b, h, t, A, I: Is, Iw,
      W: Is / (h / 2),
      r: Math.sqrt(Math.min(Is, Iw) / A),
      kgm: A * STEEL.rho * 1e-6,
      shape: sq ? 'SHS' : 'RHS',
      name: `Hộp ${b}×${h}×${t}`,
      composite: false,
    }, extra || {});
  }

  /** Thanh đứng 20x20 + 1 thanh ốp lưng 20x20 hàn phía sau -> tiết diện ghép 20x40 */
  function makeBackedSection(base) {
    const A = 2 * base.A;
    const I = 2 * (base.I + base.A * (base.h / 2) ** 2);
    return Object.assign({}, base, {
      id: `2x${base.id}`,
      A, I, W: I / base.h, h: 2 * base.h,
      kgm: 2 * base.kgm,
      name: `${base.name} + ốp lưng ${base.b}×${base.h}×${base.t}`,
      composite: true,
      baseId: base.id,
    });
  }

  const RAW = [
    // vuông
    [20, 20, 1.2], [20, 20, 1.4], [25, 25, 1.2], [25, 25, 1.4], [30, 30, 1.2], [30, 30, 1.4],
    [40, 40, 1.2], [40, 40, 1.4], [40, 40, 1.8], [50, 50, 1.4], [50, 50, 1.8], [60, 60, 1.8],
    // chữ nhật (đặt cạnh dài vuông góc mặt bảng)
    [20, 40, 1.2], [20, 40, 1.4], [25, 50, 1.2], [25, 50, 1.4], [30, 60, 1.4], [30, 60, 1.8],
    [40, 80, 1.4], [40, 80, 1.8], [50, 100, 1.8], [50, 100, 2.0],
  ];
  const list = RAW.map(([b, h, t]) => makeSection(b, h, t));
  const byId = Object.fromEntries(list.map((s) => [s.id, s]));
  SB.catalog = {
    list, byId,
    get(id) {
      if (byId[id]) return byId[id];
      if (id && id.startsWith('2x')) return makeBackedSection(byId[id.slice(2)]);
      throw new Error('Không có quy cách thép: ' + id);
    },
    backed: makeBackedSection,
    BASE: '20x20x1.2',
    square() { return list.filter((s) => s.shape === 'SHS'); },
  };

  /* ------------------------------------------------------------------ */
  /* Tải gió (TCVN 2737:1995 – dùng cho kiểm tra sơ bộ)                   */
  /* ------------------------------------------------------------------ */
  const ZONES = [
    { id: 'I-A', W0: 0.55 }, { id: 'I', W0: 0.65 }, { id: 'II-A', W0: 0.83 }, { id: 'II', W0: 0.95 },
    { id: 'III-A', W0: 1.10 }, { id: 'III', W0: 1.25 }, { id: 'IV', W0: 1.55 }, { id: 'V', W0: 1.85 },
  ];
  const KZ_Z = [3, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100];
  const KZ = {
    A: [1.00, 1.07, 1.18, 1.24, 1.29, 1.37, 1.43, 1.47, 1.51, 1.57, 1.62],
    B: [0.80, 0.88, 1.00, 1.08, 1.13, 1.22, 1.28, 1.34, 1.38, 1.45, 1.51],
    C: [0.47, 0.54, 0.66, 0.74, 0.80, 0.89, 0.97, 1.03, 1.08, 1.18, 1.25],
  };
  SB.wind = {
    zones: ZONES,
    terrains: { A: 'A – trống trải (ven biển, cánh đồng)', B: 'B – tương đối trống (ngoại ô, làng xóm)', C: 'C – bị che chắn mạnh (nội đô)' },
    kz(zm, terrain) {
      const t = KZ[terrain] || KZ.B;
      if (zm <= KZ_Z[0]) return t[0];
      for (let i = 1; i < KZ_Z.length; i++) {
        if (zm <= KZ_Z[i]) {
          const r = (zm - KZ_Z[i - 1]) / (KZ_Z[i] - KZ_Z[i - 1]);
          return t[i - 1] + r * (t[i] - t[i - 1]);
        }
      }
      return t[t.length - 1];
    },
    /** @returns {{W0,k,c,gamma,z,qtc,qtt}} kN/m² */
    pressure({ zone, terrain, baseHeight, H, c, gamma, W0 }) {
      const z0 = ZONES.find((zz) => zz.id === zone);
      const w0 = W0 > 0 ? W0 : (z0 ? z0.W0 : 0.83);
      const z = Math.max(0, baseHeight) + H / 1000;
      const k = this.kz(z, terrain);
      const qtc = w0 * k * c;
      return { W0: w0, k, c, gamma, z, qtc, qtt: qtc * gamma };
    },
  };

  /* ------------------------------------------------------------------ */
  /* Giải khung phẳng 2D (phần tử dầm Euler-Bernoulli, độ cứng trực tiếp) */
  /* ------------------------------------------------------------------ */
  function solveDense(K, F, n) {
    // Khử Gauss với chọn trụ (ma trận nhỏ)
    const A = K.map((r) => r.slice());
    const b = F.slice();
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) throw new Error('Hệ khung không ổn định (thiếu liên kết)');
      if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
      for (let r = c + 1; r < n; r++) {
        const m = A[r][c] / A[c][c];
        if (m === 0) continue;
        for (let k = c; k < n; k++) A[r][k] -= m * A[c][k];
        b[r] -= m * b[c];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
      x[r] = s / A[r][r];
    }
    return x;
  }

  /**
   * nodes: [{x,y}] (mm); elems: [{i,j,A,I,tag}]; supports: {nodeIdx:[ux,uy,rz] (true = giữ)};
   * loads: {nodeIdx:[fx,fy,m]} (N, N·mm). Trả về chuyển vị và nội lực đầu phần tử.
   */
  function frameSolve(nodes, elems, supports, loads) {
    const E = STEEL.E;
    const ndof = nodes.length * 3;
    const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
    const F = new Array(ndof).fill(0);
    const cache = [];
    for (const e of elems) {
      const a = nodes[e.i], b = nodes[e.j];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const c = (b.x - a.x) / L, s = (b.y - a.y) / L;
      const EA = E * e.A / L, EI = E * e.I;
      const k = [
        [EA, 0, 0, -EA, 0, 0],
        [0, 12 * EI / L ** 3, 6 * EI / L ** 2, 0, -12 * EI / L ** 3, 6 * EI / L ** 2],
        [0, 6 * EI / L ** 2, 4 * EI / L, 0, -6 * EI / L ** 2, 2 * EI / L],
        [-EA, 0, 0, EA, 0, 0],
        [0, -12 * EI / L ** 3, -6 * EI / L ** 2, 0, 12 * EI / L ** 3, -6 * EI / L ** 2],
        [0, 6 * EI / L ** 2, 2 * EI / L, 0, -6 * EI / L ** 2, 4 * EI / L],
      ];
      const T = Array.from({ length: 6 }, () => new Array(6).fill(0));
      for (const o of [0, 3]) {
        T[o][o] = c; T[o][o + 1] = s; T[o + 1][o] = -s; T[o + 1][o + 1] = c; T[o + 2][o + 2] = 1;
      }
      // kg = T^T k T
      const kT = k.map((row) => T[0].map((_, j) => row.reduce((acc, v, m) => acc + v * T[m][j], 0)));
      const kg = T[0].map((_, i) => kT[0].map((__, j) => T.reduce((acc, row, m) => acc + row[i] * kT[m][j], 0)));
      const idx = [3 * e.i, 3 * e.i + 1, 3 * e.i + 2, 3 * e.j, 3 * e.j + 1, 3 * e.j + 2];
      for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) K[idx[p]][idx[q]] += kg[p][q];
      cache.push({ k, T, idx, L });
    }
    for (const [nd, f] of Object.entries(loads)) {
      for (let q = 0; q < 3; q++) F[3 * nd + q] += f[q] || 0;
    }
    const fixed = new Set();
    for (const [nd, d] of Object.entries(supports)) d.forEach((v, q) => { if (v) fixed.add(3 * nd + q); });
    const free = [];
    for (let d = 0; d < ndof; d++) if (!fixed.has(d)) free.push(d);
    const Kf = free.map((r) => free.map((c) => K[r][c]));
    const Ff = free.map((r) => F[r]);
    const uf = solveDense(Kf, Ff, free.length);
    const U = new Array(ndof).fill(0);
    free.forEach((d, i) => { U[d] = uf[i]; });
    const forces = cache.map(({ k, T, idx, L }, n) => {
      const ug = idx.map((d) => U[d]);
      const ul = T.map((row) => row.reduce((acc, v, m) => acc + v * ug[m], 0));
      const fl = k.map((row) => row.reduce((acc, v, m) => acc + v * ul[m], 0));
      return { tag: elems[n].tag, L, N: -fl[0], V: fl[1], M1: fl[2], M2: fl[5], M: Math.max(Math.abs(fl[2]), Math.abs(fl[5])) };
    });
    // phản lực
    const R = {};
    for (const nd of Object.keys(supports)) R[nd] = [0, 0, 0];
    elems.forEach((e, n) => {
      const { T, idx } = cache[n];
      const ug = idx.map((d) => U[d]);
      const ul = T.map((row) => row.reduce((acc, v, m) => acc + v * ug[m], 0));
      const fl = cache[n].k.map((row) => row.reduce((acc, v, m) => acc + v * ul[m], 0));
      // nội lực toàn cục = T^T fl
      const fg = T[0].map((_, i) => T.reduce((acc, row, m) => acc + row[i] * fl[m], 0));
      [e.i, e.j].forEach((nd, w) => {
        if (R[nd]) for (let q = 0; q < 3; q++) R[nd][q] += fg[3 * w + q];
      });
    });
    for (const nd of Object.keys(R)) {
      const f = loads[nd] || [0, 0, 0];
      for (let q = 0; q < 3; q++) R[nd][q] -= f[q] || 0;
    }
    return { U, forces, R };
  }
  SB.frame2d = { solve: frameSolve };

  /** Hệ số giảm khả năng chịu nén (EC3 đường cong c – thép hộp cán nguội) */
  SB.buckling = {
    chi(lambda) {
      const l1 = Math.PI * Math.sqrt(STEEL.E / STEEL.fy);
      const lb = lambda / l1;
      if (lb <= 0.2) return 1;
      const a = 0.49;
      const ph = 0.5 * (1 + a * (lb - 0.2) + lb * lb);
      return Math.min(1, 1 / (ph + Math.sqrt(ph * ph - lb * lb)));
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof window !== 'undefined' ? window : globalThis);

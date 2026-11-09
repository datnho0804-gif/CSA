/* Kiểm thử lõi tính toán web app thiết kế khung bảng hiệu – chạy: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

globalThis.SB = {};
for (const f of ['core', 'cutting', 'design', 'drawing', 'export']) require(path.join(__dirname, '..', 'docs', 'assets', 'js', `${f}.js`));
require(path.join(__dirname, '..', 'docs', 'assets', 'vendor', 'fonts-tinos.js'));
const { jsPDF } = require(path.join(__dirname, '..', 'docs', 'assets', 'vendor', 'jspdf.umd.min.js'));
const SB = globalThis.SB;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (±${tol})`);
const piece = (res, role, len) => res.pieces.filter((g) => g.role === role && (len === undefined || g.len === len));
const qty = (res, role, len) => piece(res, role, len).reduce((s, g) => s + g.qty, 0);

test('áp lực gió TCVN 2737: vùng II-A, địa hình B, z = 7 m', () => {
  const w = SB.wind.pressure({ zone: 'II-A', terrain: 'B', baseHeight: 5, H: 2000, c: 1.4, gamma: 1.2 });
  near(w.k, 0.928, 0.002, 'k(z)');
  near(w.qtt, 0.83 * 0.928 * 1.4 * 1.2, 0.003, 'q tính toán');
});

test('giải khung 2D: dầm đơn giản chịu lực tập trung giữa nhịp', () => {
  const s = SB.catalog.get('20x20x1.2');
  const nodes = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }];
  const elems = [{ i: 0, j: 1, A: s.A, I: s.I }, { i: 1, j: 2, A: s.A, I: s.I }];
  const r = SB.frame2d.solve(nodes, elems, { 0: [true, true, false], 2: [false, true, false] }, { 1: [0, -1000, 0] });
  near(Math.max(...r.forces.map((f) => f.M)), 1000 * 1000 / 4, 1, 'M max = PL/4');
  const defl = Math.abs(r.U[4]);
  near(defl, 1000 * 1000 ** 3 / (48 * SB.STEEL.E * s.I), 0.01, 'độ võng PL³/48EI');
});

test('pha cắt cây 6 m: đủ đoạn, không vượt chiều dài cây', () => {
  const pcs = [];
  const add = (mark, len, n) => { for (let i = 0; i < n; i++) pcs.push({ mark, len }); };
  add('A', 6000, 2); add('B', 1960, 9); add('C', 2080, 7); add('D', 980, 6); add('E', 770, 7); add('F', 500, 5);
  const p = SB.cutting.plan(pcs);
  const used = p.bars.flatMap((b) => b.pieces).length;
  assert.equal(used, pcs.length);
  for (const b of p.bars) assert.ok(SB.cutting.fits(b.pieces.map((x) => x.len)), 'mẫu cắt hợp lệ');
  assert.ok(p.nBars >= p.lowerBound);
  assert.ok(p.nBars <= p.lowerBound + 1, `số cây ${p.nBars} gần cận dưới ${p.lowerBound}`);
});

test('bảng 8 m × 2 m: theo quy tắc dùng toàn bộ hộp 20×20×1.2', () => {
  const r = SB.design.run({ L: 8000, H: 2000 });
  assert.equal(r.regime, 'rule');
  for (const s of r.sections) assert.equal(s.id, '20x20x1.2');
  assert.equal(r.cfg.cols.length, 9, 'chống tại mọi thanh đứng T1–T9');
  assert.equal(qty(r, 'K2', 1960), 9);
  assert.equal(qty(r, 'K3', 980) + qty(r, 'K3', 970), 8);
  assert.equal(qty(r, 'K1'), 4, 'ray bao 8 m nối thành 2 đoạn mỗi ray');
  assert.ok(qty(r, 'C5') === 7, 'ốp lưng 7 thanh đứng giữa');
  assert.ok(r.eval.ok, 'mọi cấu kiện đạt kiểm tra gió');
  assert.equal(r.face.buyM, 16.2, 'tôn 2 tấm × 8,1 m');
  assert.equal(r.face.dir, 'h');
  assert.ok(r.pieces.every((g) => g.len <= 6000));
  const steel = r.purchase.filter((x) => x.group === 'Thép hộp');
  assert.equal(steel.length, 1);
  assert.equal(steel[0].qtyBuy, r.cut[0].plan.nBars + 1);
});

test('bảng 6 m × 2 m khớp thiết kế tay (lưới 1 m, ốp lưng)', () => {
  const r = SB.design.run({ L: 6000, H: 2000, lamps: { enabled: false } });
  assert.equal(qty(r, 'K1', 6000), 2);
  assert.equal(qty(r, 'K2', 1960), 7);
  assert.equal(qty(r, 'K3', 980), 4);
  assert.equal(qty(r, 'K3', 970), 2);
  assert.equal(qty(r, 'C5', 2000), 5);
  assert.equal(r.face.buyM, 12.2);
});

test('bảng > 8 m: tối ưu vật liệu và đạt kiểm tra', () => {
  for (const [L, H] of [[12000, 3000], [16000, 2000], [20000, 4000]]) {
    const r = SB.design.run({ L, H });
    assert.equal(r.regime, 'free', `${L}×${H}`);
    assert.ok(r.eval.ok, `${L}×${H} đạt kiểm tra`);
    assert.ok(r.alternatives.length >= 1);
    assert.ok(r.pieces.every((g) => g.len <= 6000 && g.len > 0));
  }
});

test('áp tường: không có thanh chống, pát tại mọi nút tuyến chính', () => {
  const r = SB.design.run({ L: 8000, H: 2000, mount: 'wall' });
  assert.equal(qty(r, 'C1'), 0);
  assert.equal(r.accessories.wallBrackets, r.cfg.cols.length * r.geo.nR);
  assert.ok(r.eval.ok);
});

test('tôn luôn 3 dem khổ 1 m, mối giáp mí nằm trên thanh khung', () => {
  const r = SB.design.run({ L: 8500, H: 1500 });
  assert.equal(SB.design.TON.thickness, 0.30);
  assert.equal(SB.design.TON.width, 1000);
  for (const s of r.face.strips) assert.ok((r.face.dir === 'h' ? s.h : s.w) <= 1000);
  const lines = r.face.dir === 'h' ? r.geo.yLines : r.geo.xLines;
  for (const j of r.face.joints) {
    const v = j.x1 === j.x2 ? j.x1 : j.y1;
    const onFrame = (j.x1 === j.x2 ? r.geo.xLines : r.geo.yLines).some((x) => Math.abs(x - v) < 1);
    assert.ok(onFrame || lines.length === 0, 'mối nối trùng tim thanh');
  }
});

test('quét nhiều kích thước: không lỗi, thanh cắt ≤ 6 m', () => {
  for (const L of [1200, 2500, 4000, 6000, 7500, 8000, 9000, 14000, 24000]) {
    for (const H of [600, 1000, 1500, 2000, 2400, 3000]) {
      for (const mount of ['roof', 'wall']) {
        const r = SB.design.run({ L, H, mount });
        assert.ok(r.pieces.length > 0, `${L}×${H} ${mount}`);
        assert.ok(r.pieces.every((g) => g.len > 0 && g.len <= 6000), `${L}×${H} ${mount} chiều dài cắt`);
        const n = r.cut.reduce((s, c) => s + c.plan.bars.reduce((t, b) => t + b.pieces.length, 0), 0);
        assert.equal(n, r.totals.pieces, 'mọi thanh đều có trong sơ đồ cắt');
        if (L <= 8000 && H <= 2000) assert.ok(r.regime === 'rule', `${L}×${H} theo quy tắc 20×20×1.2`);
      }
    }
  }
});

test('bản vẽ: tờ A3, hình chiếu nằm trong khổ giấy, SVG và DXF hợp lệ', () => {
  for (const inp of [{ L: 8000, H: 2000 }, { L: 12000, H: 3000 }, { L: 3000, H: 1000, lamps: { enabled: false } }, { L: 20000, H: 4000, mount: 'wall' }]) {
    const r = SB.design.run(inp);
    const sheets = SB.drawing.composeSheets(r);
    assert.ok(sheets.length >= 1 && sheets.length <= 4);
    for (const sh of sheets) {
      for (const pl of sh.placements) {
        const bb = pl.ctx.bbox();
        const x0 = bb.x0 / pl.s + pl.dx, x1 = bb.x1 / pl.s + pl.dx, y0 = bb.y0 / pl.s + pl.dy, y1 = bb.y1 / pl.s + pl.dy;
        assert.ok(x0 >= -0.5 && y0 >= -0.5 && x1 <= sh.paper.w + 0.5 && y1 <= sh.paper.h + 0.5,
          `${JSON.stringify(inp)} ${sh.name}: khối vượt khổ giấy [${x0.toFixed(1)},${y0.toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)}]`);
      }
      const svg = SB.drawing.sheetToSVG(sh);
      assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    }
    const dxf = SB.drawing.toDXF(r);
    assert.ok(dxf.includes('AC1009') && dxf.trim().endsWith('EOF'));
    assert.ok(!/[^\x00-\x7F]/.test(dxf), 'DXF chỉ chứa ASCII (tiếng Việt mã hoá \\U+)');
    assert.ok(dxf.includes('\\U+00D4'), 'có chữ Ô mã hoá');
  }
});

test('quy cách do người dùng chọn: dùng cho toàn bộ khung', () => {
  const r = SB.design.run({ L: 8000, H: 2000, steel: '25x25x1.2' });
  assert.equal(r.regime, 'fixed');
  assert.deepEqual(r.sections.map((x) => x.id), ['25x25x1.2']);
  assert.ok(r.pieces.every((g) => g.secId === '25x25x1.2'));
  assert.ok(r.eval.ok);
  const r2 = SB.design.run({ L: 6000, H: 2000, steel: '30x60x1.4' });
  assert.equal(r2.regime, 'fixed');
  assert.ok(r2.pieces.every((g) => g.secId === '30x60x1.4'));
});

test('quy cách tự chọn không đủ chịu gió: cảnh báo + đề xuất thay thế', () => {
  const r = SB.design.run({ L: 14000, H: 3000, steel: '20x20x1.0' });
  assert.equal(r.regime, 'fixed-fail');
  assert.ok(!r.eval.ok);
  assert.ok(r.warnings.some((w) => w.includes('Đề xuất thay bằng')));
  assert.ok(r.pieces.every((g) => g.secId === '20x20x1.0'), 'bản vẽ vẫn theo quy cách đã chọn');
});

test('danh mục: quy cách 1.0 mm chỉ dùng khi tự chọn, mã quy cách chuẩn', () => {
  assert.ok(SB.catalog.byId['20x20x1.0'] && SB.catalog.byId['50x100x2.0']);
  assert.ok(SB.catalog.list.every((x) => x.auto));
  const o = SB.catalog.options();
  assert.ok(o.square.length > 10 && o.rect.length > 8);
  near(SB.catalog.get('20x20x1.2').kgm, 0.708, 0.001, 'kg/m hộp 20×20×1.2');
});

test('xuất PDF vector: đúng số tờ, nhúng font Tinos', () => {
  const r = SB.design.run({ L: 8000, H: 2000, project: { name: 'Bảng hiệu GHN' } });
  const sheets = SB.drawing.composeSheets(r);
  const doc = SB.exporter.buildPdf(jsPDF, r, sheets, SB.fontsTinos);
  assert.equal(doc.getNumberOfPages(), sheets.length);
  const buf = Buffer.from(doc.output('arraybuffer'));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.includes('Tinos'), 'có font Tinos nhúng');
  assert.ok(buf.length > 20000);
});

/*!
 * Bảng hiệu – giao diện: đọc biểu mẫu, chạy thiết kế, hiển thị bản vẽ/bảng, tải file.
 */
(function () {
  'use strict';
  const SB = window.SB;
  const U = SB.util;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = U.escapeHtml;
  const form = $('#form');
  const STORE = 'bang-hieu-khung-v1';
  let res = null;
  let sheets = null;
  let zoom = 'fit';

  /* ------------------------------ biểu mẫu ------------------------------ */
  const getPath = (o, path) => path.split('.').reduce((a, k) => (a === null || a === undefined ? undefined : a[k]), o);
  function setPath(o, path, v) {
    const ks = path.split('.');
    let t = o;
    ks.slice(0, -1).forEach((k) => { t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; });
    t[ks[ks.length - 1]] = v;
  }
  function readForm() {
    const o = {};
    for (const el of $$('[data-k]', form)) {
      if (el.type === 'radio') { if (el.checked) setPath(o, el.dataset.k, el.value); continue; }
      if (el.type === 'checkbox') { setPath(o, el.dataset.k, el.checked); continue; }
      const v = String(el.value).trim();
      if (v === '') continue;
      setPath(o, el.dataset.k, el.type === 'number' ? Number(v) : v);
    }
    return o;
  }
  function writeForm(o) {
    for (const el of $$('[data-k]', form)) {
      const v = getPath(o, el.dataset.k);
      if (el.type === 'radio') el.checked = v !== undefined ? String(v) === el.value : el.defaultChecked;
      else if (el.type === 'checkbox') el.checked = v !== undefined ? !!v : el.defaultChecked;
      else if (el.tagName === 'SELECT') {
        const opt = [...el.options].find((x) => x.value === String(v)) || [...el.options].find((x) => x.defaultSelected) || el.options[0];
        el.value = opt.value;
      } else el.value = v !== undefined && v !== null ? v : el.defaultValue;
    }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(readForm())); } catch (e) { /* bỏ qua */ } }
  function load() {
    try {
      const s = localStorage.getItem(STORE);
      if (s) writeForm(JSON.parse(s));
    } catch (e) { /* bỏ qua */ }
  }

  /* ------------------------------ tính toán ----------------------------- */
  function run() {
    const t0 = performance.now();
    try {
      res = SB.design.run(readForm());
      sheets = SB.drawing.composeSheets(res);
    } catch (e) {
      console.error(e);
      $('#regime').innerHTML = `<div class="error"><b>Lỗi tính toán:</b> ${esc(e.message)}</div>`;
      return;
    }
    renderAll();
    save();
    document.body.dataset.ms = String(Math.round(performance.now() - t0));
  }
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 280); };

  /* ------------------------------ hiển thị ------------------------------ */
  function renderAll() {
    renderSummary();
    renderSheets();
    renderCut();
    renderBuy();
    renderCheck();
  }

  function renderSummary() {
    const p = res.p;
    const rule = p.L <= SB.design.RULE_L && p.H <= SB.design.RULE_H;
    $('#ruleHint').textContent = rule
      ? `Bảng ${U.fmt(p.L / 1000, 2)} × ${U.fmt(p.H / 1000, 2)} m ≤ 8 × 2 m → hộp mạ kẽm 20×20×1.2.`
      : `Bảng ${U.fmt(p.L / 1000, 2)} × ${U.fmt(p.H / 1000, 2)} m > 8 × 2 m → tự chọn quy cách tối ưu chi phí & khối lượng.`;
    $('#regime').innerHTML = `${esc(res.regimeText)}<small>${res.geo.nCells} ô lưới ${U.mm(res.geo.g)}×${U.mm(res.geo.g)} · gió vùng ${esc(p.wind.zone)}: q = ${U.fmt(res.wind.qtt, 2)} kN/m² · ${p.mount === 'roof' ? `chống xiên tại ${res.cfg.cols.length} thanh đứng chính` : `pát tường tại ${res.cfg.cols.length} thanh đứng chính`}</small>`;
    const steelRows = res.purchase.filter((r) => r.group === 'Thép hộp');
    const bars = U.sum(steelRows, (r) => r.qtyBuy);
    const kg = U.sum(res.cut, (c) => c.plan.nBars * 6 * c.sec.kgm) + (p.purchase.spareBars ? 6 * res.cut.slice().sort((a, b) => b.plan.nBars - a.plan.nBars)[0].sec.kgm * p.purchase.spareBars : 0);
    const util = res.eval.maxUtil;
    const ok = res.eval.ok;
    const spanTxt = res.cfg.cols.length > 1 ? `bước ${U.fmt(res.cfg.k * res.geo.g / 1000, 2)} m` : '';
    $('#cards').innerHTML = [
      `<div class="card"><div class="k">Vật liệu khung</div><div class="chips">${res.sections.map((s) => `<span class="chip">${esc(s.name.replace('Hộp ', ''))}</span>`).join('')}</div><div class="s">${res.regime === 'rule' ? 'theo quy tắc ≤ 8×2 m' : 'tối ưu chi phí & khối lượng'}</div></div>`,
      `<div class="card"><div class="k">Thép hộp cần mua</div><div class="v">${bars} cây 6 m</div><div class="s">≈ ${U.fmt(kg, 1)} kg · tịnh ${U.fmt(res.totals.netLen, 1)} m (${res.totals.pieces} thanh)</div></div>`,
      `<div class="card"><div class="k">Tôn phẳng 3 dem khổ 1 m</div><div class="v">${U.fmt(res.face.buyM, 1)} m dài</div><div class="s">${res.face.strips.length} tấm · ${U.fmt(res.face.areaBuy, 2)} m² · ≈ ${U.fmt(res.face.kg, 1)} kg</div></div>`,
      p.mount === 'roof'
        ? `<div class="card"><div class="k">Hệ chống xiên</div><div class="v">${res.cfg.cols.length} bộ</div><div class="s">${spanTxt} · chân cách mặt bảng ${U.mm(res.strut.end.D)} mm</div></div>`
        : `<div class="card"><div class="k">Pát tường</div><div class="v">${res.accessories.wallBrackets} pát</div><div class="s">${res.accessories.anchors} tắc kê M8</div></div>`,
      `<div class="card ${ok ? 'ok' : 'bad'}"><div class="k">Kiểm tra gió (sơ bộ)</div><div class="v">${U.fmt(util * 100, 0)}%</div><div class="s">${ok ? 'Mọi cấu kiện đạt' : 'Có cấu kiện vượt – xem tab Kiểm tra'}</div></div>`,
    ].join('');
    $('#warnings').innerHTML = res.warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join('');
  }

  function renderSheets() {
    const host = $('#sheets');
    host.innerHTML = sheets.map((sh, i) => `
      <div class="sheet">
        <div class="sheet-head"><h3>Tờ ${i + 1}/${sheets.length}: ${esc(sh.name)}${sh.scales.main ? ` – TL 1:${sh.scales.main}` : ''}</h3>
          <span><button type="button" data-svg="${i}">SVG</button> <button type="button" data-png="${i}">PNG</button></span></div>
        <div class="sheet-wrap">${SB.drawing.sheetToSVG(sh, { inline: true })}</div>
      </div>`).join('');
    applyZoom();
  }
  function applyZoom() {
    $$('#sheets .sheet-svg').forEach((svg, i) => {
      const paper = sheets[i].paper;
      if (zoom === 'fit') { svg.style.width = '100%'; svg.style.maxWidth = '100%'; }
      else { svg.style.width = `${Math.round(paper.w * 3.78 * zoom)}px`; svg.style.maxWidth = 'none'; }
    });
    $('#zoomVal').textContent = zoom === 'fit' ? 'Vừa' : `${Math.round(zoom * 100)}%`;
  }

  function table(head, rows, cls) {
    return `<div class="tbl-wrap"><table class="t ${cls || ''}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function renderCut() {
    const rows = [];
    let n = 0;
    for (const e of res.cut) {
      rows.push(`<tr class="grp"><td colspan="9">${esc(e.sec.name)} – mạ kẽm ${U.fmt(e.sec.kgm, 3)} kg/m – ${e.plan.nBars} cây 6 m theo sơ đồ cắt (tịnh ${U.fmt(e.netLen / 1000, 2)} m)</td></tr>`);
      for (const g of res.pieces.filter((x) => x.secId === e.sec.id)) {
        n++;
        rows.push(`<tr><td class="c">${n}</td><td class="mark">${esc(g.mark)}</td><td>${esc(g.name)}</td><td>${esc(g.sec.name.replace('Hộp ', ''))}</td>
          <td class="n"><b>${g.len}</b></td><td class="n">${g.qty}</td><td class="n">${U.fmt(g.totalLen / 1000, 2)}</td><td class="n">${U.fmt(g.kg, 1)}</td><td>${esc(g.locs.join('; '))}</td></tr>`);
      }
    }
    rows.push(`<tr class="tot"><td></td><td>Σ</td><td>Tổng cộng</td><td></td><td></td><td class="n">${res.totals.pieces}</td><td class="n">${U.fmt(res.totals.netLen, 2)}</td><td class="n">${U.fmt(res.totals.netKg, 1)}</td><td></td></tr>`);
    let html = `<h2 class="sec">Bảng kê chi tiết thanh cắt – cắt đúng kích thước</h2>
      <p class="muted">Chiều dài cắt tính theo mép thanh (hàn đối đầu). Thanh chống xiên/giằng tính theo tim, cắt vát hai đầu – đo lại tại công trình trước khi cắt.</p>`;
    html += table(['TT', 'KH', 'Tên cấu kiện', 'Quy cách', 'Dài cắt (mm)', 'SL', 'Tổng (m)', 'KL (kg)', 'Vị trí lắp'], rows);
    html += '<h2 class="sec">Sơ đồ pha cắt cây 6 m (mạch cắt 3 mm, cắt vuông đầu cây 10 mm)</h2>';
    for (const e of res.cut) {
      html += `<p><b>${esc(e.sec.name)}</b> – ${e.plan.nBars} cây (cận dưới lý thuyết ${e.plan.lowerBound} cây)</p><div class="bars">`;
      let no = 0;
      for (const pt of e.plan.patterns) {
        const a = no + 1, b = no + pt.count; no = b;
        const segs = pt.pieces.map((pc) => `<div class="pc ${pc.mark[0]}" style="width:${(pc.len / 6000 * 100).toFixed(2)}%" title="${esc(pc.mark)} – ${pc.len} mm">${esc(pc.mark)} ${pc.len}</div>`).join('');
        html += `<div class="bar-row"><div class="lbl">${pt.count > 1 ? `Cây #${a}÷#${b} (${pt.count} cây)` : `Cây #${a}`}</div><div class="bar">${segs}<div class="waste">${pt.waste > 150 ? `dư ${pt.waste}` : ''}</div></div></div>`;
      }
      html += '</div>';
    }
    const f = res.face;
    html += `<h2 class="sec">Tôn phẳng 3 dem khổ 1 m – ${f.dir === 'h' ? 'trải ngang' : 'trải đứng'}</h2>`;
    html += table(['Nhóm tấm', 'Số tấm', 'Dài cắt (mm)', 'Rộng dùng (mm)', 'Ghi chú'], f.groups.map((g) => `<tr><td>${g.nos.map((x) => `T${x}`).join(', ')}</td><td class="n">${g.qty}</td><td class="n"><b>${g.cut}</b></td><td class="n">${g.width}</td><td>${g.rip ? 'xẻ dọc từ khổ 1 m' : 'nguyên khổ'}</td></tr>`)
      .concat([`<tr class="tot"><td>Tổng</td><td class="n">${f.strips.length}</td><td class="n">${U.fmt(f.buyM, 2)} m dài</td><td class="n">${U.fmt(f.areaBuy, 2)} m²</td><td>≈ ${U.fmt(f.kg, 1)} kg</td></tr>`]));
    $('#cutView').innerHTML = html;
  }

  function renderBuy() {
    const rows = [];
    let last = null;
    res.purchase.forEach((r, i) => {
      if (r.group !== last) { rows.push(`<tr class="grp"><td colspan="7">${esc(r.group)}</td></tr>`); last = r.group; }
      const dec = ['m dài', 'm²', 'kg'].includes(r.unit) ? 1 : 0;
      rows.push(`<tr><td class="c">${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.spec)}</td><td class="c">${esc(r.unit)}</td><td class="n">${U.fmt(r.qtyNet, dec ? 2 : 0)}</td><td class="n"><b>${U.fmt(r.qtyBuy, dec)}</b></td><td>${esc(r.note)}</td></tr>`);
    });
    $('#buyView').innerHTML = `<h2 class="sec">Vật tư cần mua – ${esc(res.p.project.name)} ${U.mm(res.p.L)} × ${U.mm(res.p.H)} mm</h2>`
      + table(['TT', 'Vật tư', 'Quy cách', 'ĐVT', 'SL tính', 'SL mua', 'Ghi chú'], rows)
      + '<p class="muted">Thép hộp mua theo số cây của sơ đồ pha cắt (+ cây dự phòng). Đinh rút/vít đã cộng 10% hao hụt và làm tròn theo hộp. Que hàn, đá cắt, sơn là ước tính.</p>';
  }

  function renderCheck() {
    const w = res.wind, p = res.p;
    let html = '<h2 class="sec">Tải gió tính toán</h2>';
    html += table(['Thông số', 'Giá trị'], [
      ['Vùng áp lực gió', `${p.wind.zone} – W0 = ${U.fmt(w.W0, 2)} kN/m²`],
      ['Địa hình / cao độ đỉnh bảng', `${p.wind.terrain} – z = ${U.fmt(w.z, 1)} m → k = ${U.fmt(w.k, 3)}`],
      ['Hệ số khí động c / vượt tải γ', `${U.fmt(w.c, 2)} / ${U.fmt(w.gamma, 2)}`],
      ['Áp lực tính toán q = W0·k·c·γ', `<b>${U.fmt(w.qtt, 3)} kN/m²</b> (tổng lực lên bảng ≈ ${U.fmt(w.qtt * p.L * p.H / 1e6, 1)} kN)`],
    ].map(([a, b]) => `<tr><td>${esc(a)}</td><td>${b}</td></tr>`));
    html += '<h2 class="sec">Kiểm tra cấu kiện</h2>';
    html += table(['Nhóm', 'Cấu kiện', 'Quy cách', 'Hệ số sử dụng', 'Kết quả', 'Chi tiết'], res.checks.map((c) =>
      `<tr><td>${esc(c.group)}</td><td>${esc(c.member)}</td><td>${esc(c.sec)}</td><td class="n">${U.fmt(c.util * 100, 0)}%</td><td class="${c.ok ? 'good' : 'bad'}">${c.ok ? 'Đạt' : 'Không đạt'}</td><td>${esc(c.detail)}</td></tr>`));
    const a = res.accessories;
    html += '<h2 class="sec">Liên kết</h2>';
    html += table(['Hạng mục', 'Giá trị'], (p.mount === 'roof' ? [
      ['Phản lực chân bảng (lớn nhất)', `${U.fmt(a.baseR, 2)} kN → ${a.anchorPer} tắc kê M8/bát (tải 1 con ${U.fmt(p.anchors.baseCap, 2)} kN)`],
      ['Lực nhổ chân chống (lớn nhất)', `${U.fmt(a.footR, 2)} kN → ${a.footScrewPer} vít 6×65/chân (tải 1 vít ${U.fmt(p.anchors.roofScrewCap, 2)} kN)`],
    ] : [
      ['Lực nhổ 1 pát (lớn nhất)', `${U.fmt(a.baseR, 2)} kN → ${a.anchorPer} tắc kê M8/pát (tải 1 con ${U.fmt(p.anchors.baseCap, 2)} kN)`],
    ]).concat([[`${res.face.fast.name}`, `bước ${res.face.fast.pitch} mm – lực 1 liên kết ${U.fmt(res.face.fast.demand, 3)} kN / khả năng ${U.fmt(res.face.fast.capacity, 2)} kN (${U.fmt(res.face.fast.util * 100, 0)}%)`]])
      .map(([x, y]) => `<tr><td>${esc(x)}</td><td>${esc(y)}</td></tr>`));
    html += '<h2 class="sec">So sánh phương án (sắp theo chi phí so sánh)</h2>';
    html += table(['#', 'Bước chống', 'Bao / giữa / đứng chính / chống', 'Thép mua', 'Mối hàn', p.mount === 'roof' ? 'Chân chống' : 'Pát', 'Chi phí so sánh'], res.alternatives.map((alt, i) => {
      const s = alt.cfg.sec;
      return `<tr${i === 0 ? ' class="tot"' : ''}><td class="c">${i + 1}</td><td>mỗi ${alt.cfg.k} khoang</td><td>${esc([s.perim.id, s.railInt.id, s.colInt.id, s.strut.id].join(' / '))}</td><td class="n">${alt.bars} cây · ${U.fmt(alt.kg, 1)} kg</td><td class="n">${alt.joints}</td><td class="n">${alt.feet || alt.anchors}</td><td class="n">${U.fmt(alt.cost, 0)} đ</td></tr>`;
    }));
    html += '<p class="muted">Kiểm tra sơ bộ: khung phẳng 2D cho tuyến chống, dầm tải 2 phương cho thanh ô lưới, ổn định thanh nén theo đường cong EC3-c, f = 235/1,05 MPa. Không thay thế thiết kế kết cấu chính thức.</p>';
    $('#checkView').innerHTML = html;
  }

  /* ------------------------------ sự kiện ------------------------------ */
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('.tabpanel').forEach((pnl) => { pnl.hidden = pnl.id !== `tab-${b.dataset.tab}`; });
  }));

  $('#zoomIn').addEventListener('click', () => { zoom = zoom === 'fit' ? 1 : Math.min(4, zoom * 1.25); applyZoom(); });
  $('#zoomOut').addEventListener('click', () => { zoom = zoom === 'fit' ? 0.8 : Math.max(0.3, zoom / 1.25); applyZoom(); });
  $('#zoomFit').addEventListener('click', () => { zoom = 'fit'; applyZoom(); });

  const base = () => SB.exporter.fileBase(res);
  $('#btnDxf').addEventListener('click', () => SB.exporter.download(`${base()}.dxf`, SB.drawing.toDXF(res), 'application/dxf'));
  $('#btnSvg').addEventListener('click', () => sheets.forEach((sh, i) => setTimeout(() => SB.exporter.download(`${base()}_to${i + 1}.svg`, SB.drawing.sheetToSVG(sh), 'image/svg+xml'), i * 400)));
  $('#btnPng').addEventListener('click', async () => {
    for (let i = 0; i < sheets.length; i++) {
      const blob = await SB.exporter.svgToPng(SB.drawing.sheetToSVG(sheets[i]), sheets[i].paper.w, sheets[i].paper.h);
      SB.exporter.download(`${base()}_to${i + 1}.png`, blob);
      await new Promise((r) => setTimeout(r, 400));
    }
  });
  $('#sheets').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.svg !== undefined) {
      const i = Number(b.dataset.svg);
      SB.exporter.download(`${base()}_to${i + 1}.svg`, SB.drawing.sheetToSVG(sheets[i]), 'image/svg+xml');
    } else if (b.dataset.png !== undefined) {
      const i = Number(b.dataset.png);
      const blob = await SB.exporter.svgToPng(SB.drawing.sheetToSVG(sheets[i]), sheets[i].paper.w, sheets[i].paper.h);
      SB.exporter.download(`${base()}_to${i + 1}.png`, blob);
    }
  });
  $('#btnPdf').addEventListener('click', () => SB.exporter.print(sheets));
  const doXlsx = async (btn) => {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Đang tạo Excel…';
    try {
      const blob = await SB.exporter.xlsx(res);
      SB.exporter.download(`${base()}_BOQ.xlsx`, blob);
      $('#xlsxNote').textContent = '';
    } catch (e) {
      console.error(e);
      $('#xlsxNote').textContent = 'Không tải được thư viện Excel (cần mạng) – đã xuất CSV thay thế.';
      SB.exporter.download(`${base()}_BOQ.csv`, SB.exporter.csv(res), 'text/csv;charset=utf-8');
    } finally { btn.disabled = false; btn.textContent = old; }
  };
  $('#btnXlsx').addEventListener('click', (e) => doXlsx(e.currentTarget));
  $('#btnXlsx2').addEventListener('click', (e) => doXlsx(e.currentTarget));
  $('#btnCsv').addEventListener('click', () => SB.exporter.download(`${base()}_BOQ.csv`, SB.exporter.csv(res), 'text/csv;charset=utf-8'));
  $('#btnCopyBuy').addEventListener('click', async (e) => {
    const txt = res.purchase.map((r, i) => `${i + 1}. ${r.name} – ${r.spec}: ${U.fmt(r.qtyBuy, ['m dài', 'm²', 'kg'].includes(r.unit) ? 1 : 0)} ${r.unit}${r.note ? ` (${r.note})` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(txt); e.currentTarget.textContent = 'Đã sao chép ✓'; } catch (err) { e.currentTarget.textContent = 'Trình duyệt chặn sao chép'; }
    const btn = e.currentTarget;
    setTimeout(() => { btn.textContent = 'Sao chép danh sách'; }, 1800);
  });

  $('#btnSave').addEventListener('click', () => {
    const data = readForm();
    SB.exporter.download(`${res ? base() : 'bang_hieu'}.json`, JSON.stringify({ app: 'bang-hieu-khung', version: 1, input: data }, null, 2), 'application/json');
  });
  $('#fileOpen').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      form.reset();
      writeForm(j.input || j);
      run();
    } catch (e) { alert('File dự án không hợp lệ: ' + e.message); }
    ev.target.value = '';
  });
  $('#btnReset').addEventListener('click', () => { form.reset(); writeForm({}); run(); });
  $('#btnSample').addEventListener('click', () => {
    form.reset();
    writeForm({
      L: 8000, H: 2000, grid: 1000, mount: 'roof', paper: 'A3',
      lamps: { enabled: true, count: 5, rise: 500, reach: 700, power: 100 },
      strut: { spacing: 'auto', endBracing: true, drop: 0 },
      face: { orientation: 'auto', fastener: 'rivet', pitch: 'auto', allowance: 50, hiflex: true },
      project: { name: 'Bảng hiệu GHN', code: 'KT-GHN', author: $('[data-k="project.author"]').value || '' },
    });
    run();
  });

  load();
  run();
})();

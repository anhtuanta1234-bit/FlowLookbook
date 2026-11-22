/* Cắt ảnh chuyên nghiệp — viết riêng, không dùng thư viện.
 * - Pointer Events + setPointerCapture: kéo ra ngoài khung / ngoài cửa sổ vẫn không mất chuột.
 * - Vẽ bằng <canvas> theo requestAnimationFrame: mượt kể cả ảnh rất lớn.
 * - Tỉ lệ khung, lưới 1/3, 8 điểm kéo, thu phóng bằng lăn chuột, kéo ảnh bằng Space/chuột giữa, phím mũi tên tinh chỉnh.
 * Dùng: const blob = await openCropper(fileOrBlob, 'Tiêu đề');  // trả về Blob đã cắt, hoặc null nếu hủy.
 */
(function () {
  const MIN = 16; // cạnh nhỏ nhất của khung cắt (px ảnh gốc)
  const RATIOS = [
    ['free', 'Tự do', null, 'Kéo khung tự do, không khóa tỉ lệ'],
    ['9:16', '9:16', 9 / 16, 'Khung dọc 9:16 (đúng tỉ lệ ảnh Flow)'],
    ['3:4', '3:4', 3 / 4, 'Khung dọc 3:4'],
    ['1:1', '1:1', 1, 'Khung vuông'],
    ['4:3', '4:3', 4 / 3, 'Khung ngang 4:3'],
    ['16:9', '16:9', 16 / 9, 'Khung ngang 16:9'],
    ['orig', 'Gốc', 0, 'Giữ đúng tỉ lệ của ảnh gốc'],
  ];
  const ic = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    out: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>'),
    in: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
    fit: ic('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    all: ic('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16" opacity=".5"/>'),
    reset: ic('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  async function loadBitmap(blob) {
    try { return await createImageBitmap(blob); } catch (_) { /* dùng cách dự phòng */ }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.src = url; await img.decode();
      return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight, close() {} });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  window.openCropper = async function openCropper(blob, title = 'Cắt sát ảnh') {
    const bmp = await loadBitmap(blob);
    const iw = bmp.width, ih = bmp.height;
    const norm = (r) => { const w = clamp(Math.round(r.w), 1, iw), h = clamp(Math.round(r.h), 1, ih); return { x: clamp(Math.round(r.x), 0, iw - w), y: clamp(Math.round(r.y), 0, ih - h), w, h }; };

    // ---------- giao diện ----------
    const root = document.createElement('div');
    root.className = 'cropper-ui';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Cắt ảnh');
    root.innerHTML = `
      <div class="cu-top">
        <div class="cu-title">${title.replace(/[<>&]/g, '')}</div>
        <div class="cu-ratios" role="group" aria-label="Tỉ lệ khung cắt">${RATIOS.map(([k, t, , tip]) => `<button type="button" data-r="${k}" data-tip="${tip}">${t}</button>`).join('')}</div>
        <div class="grow"></div>
        <span class="cu-info" id="cuInfo" data-tip="Kích thước vùng cắt (px ảnh gốc)">—</span>
        <button type="button" class="ib" data-cu="all" data-tip="Đặt khung cắt = toàn bộ ảnh gốc" aria-label="Chọn toàn bộ ảnh">${ICON.all}</button>
        <span class="cu-sep"></span>
        <button type="button" class="ib" data-cu="out" data-tip="Thu nhỏ (phím -)" aria-label="Thu nhỏ">${ICON.out}</button>
        <span class="cu-info" id="cuZoom" data-tip="Mức phóng to của khung xem">100%</span>
        <button type="button" class="ib" data-cu="in" data-tip="Phóng to (phím +)" aria-label="Phóng to">${ICON.in}</button>
        <button type="button" class="ib" data-cu="fit" data-tip="Vừa khung hình (phím 0 hoặc nhấp đúp)" aria-label="Vừa khung hình">${ICON.fit}</button>
      </div>
      <div class="cu-stage" id="cuStage" tabindex="-1"><canvas id="cuCanvas" aria-label="Vùng cắt ảnh"></canvas></div>
      <div class="cu-foot">
        <span class="hint grow">Kéo trong khung để di chuyển · kéo 8 điểm để đổi cỡ · kéo ngoài khung để vẽ khung mới · lăn chuột để phóng to · giữ <b>Space</b> (hoặc chuột giữa) để kéo ảnh · phím mũi tên tinh chỉnh · <b>Enter</b> xác nhận · <b>Esc</b> hủy</span>
        <button type="button" class="btn" data-cu="cancel" data-tip="Hủy, không cắt (Esc)">Hủy</button>
        <button type="button" class="btn primary" data-cu="ok" data-tip="Cắt và dùng vùng đang chọn (Enter)">Cắt và dùng</button>
      </div>`;
    document.body.appendChild(root);
    const stage = root.querySelector('#cuStage'), canvas = root.querySelector('#cuCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const info = root.querySelector('#cuInfo'), zoomEl = root.querySelector('#cuZoom');

    let resolveFn; const result = new Promise((r) => { resolveFn = r; });

    // ---------- trạng thái ----------
    const initial = { x: 0, y: 0, w: iw, h: ih }; // mở ra là toàn bộ ảnh, đúng kích thước gốc
    let cr = { ...initial };
    let ratio = null, ratioKey = 'free';
    let W = 1, H = 1, dpr = window.devicePixelRatio || 1;
    let view = { s: 1, ox: 0, oy: 0 }, userZoomed = false;
    let drag = null, space = false, hoverCursor = '', raf = 0, interacting = false, done = false;

    const toScreen = (x, y) => [view.ox + x * view.s, view.oy + y * view.s];
    const toImage = (sx, sy) => [(sx - view.ox) / view.s, (sy - view.oy) / view.s];
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * W / Math.max(1, r.width), (e.clientY - r.top) * H / Math.max(1, r.height)];
    };

    function fit() {
      const pad = 30;
      const s = Math.max(0.01, Math.min((W - pad * 2) / iw, (H - pad * 2) / ih));
      view = { s, ox: (W - iw * s) / 2, oy: (H - ih * s) / 2 }; userZoomed = false;
    }
    function resizeCanvas() {
      const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (!userZoomed) fit();
      schedule();
    }
    function zoomAt(sx, sy, f) {
      const fitS = Math.max(0.01, Math.min((W - 60) / iw, (H - 60) / ih));
      const ns = clamp(view.s * f, fitS * 0.4, 14); const k = ns / view.s;
      view = { s: ns, ox: sx - (sx - view.ox) * k, oy: sy - (sy - view.oy) * k }; userZoomed = true; schedule();
    }

    // ---------- tỉ lệ ----------
    function setRatio(key) {
      const def = RATIOS.find((r) => r[0] === key); ratioKey = key;
      ratio = key === 'orig' ? iw / ih : def[2];
      root.querySelectorAll('[data-r]').forEach((b) => b.classList.toggle('on', b.dataset.r === key));
      if (ratio) {
        const cx = cr.x + cr.w / 2, cy = cr.y + cr.h / 2;
        let w = Math.min(cr.w, cr.h * ratio); w = Math.min(w, iw, ih * ratio); const h = w / ratio;
        cr = norm({ x: clamp(cx - w / 2, 0, iw - w), y: clamp(cy - h / 2, 0, ih - h), w, h });
      }
      schedule();
    }

    // ---------- tính khung khi kéo ----------
    function computeRect(handle, px, py, start, minS) {
      const r = ratio;
      let x1 = start.x, y1 = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
      const W_ = handle.includes('w'), E_ = handle.includes('e'), N_ = handle.includes('n'), S_ = handle.includes('s');
      if (!r) {
        if (W_) x1 = clamp(px, 0, x2 - minS);
        if (E_) x2 = clamp(px, x1 + minS, iw);
        if (N_) y1 = clamp(py, 0, y2 - minS);
        if (S_) y2 = clamp(py, y1 + minS, ih);
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      if ((W_ || E_) && (N_ || S_)) { // góc: neo ở góc đối diện
        const ax = W_ ? x2 : x1, ay = N_ ? y2 : y1;
        const availW = W_ ? ax : iw - ax, availH = N_ ? ay : ih - ay;
        let w = Math.max(Math.abs(px - ax), Math.abs(py - ay) * r);
        w = Math.max(Math.min(minS, availW), Math.min(w, availW, availH * r)); const h = w / r;
        return { x: W_ ? ax - w : ax, y: N_ ? ay - h : ay, w, h };
      }
      if (W_ || E_) { // cạnh trái/phải: đổi rộng, cao đổi theo quanh tâm dọc
        const ax = W_ ? x2 : x1, availW = W_ ? ax : iw - ax, cy = start.y + start.h / 2;
        let w = Math.abs(px - ax);
        w = Math.max(minS, Math.min(w, availW, ih * r, Math.min(cy, ih - cy) * 2 * r)); const h = w / r;
        return { x: W_ ? ax - w : ax, y: cy - h / 2, w, h };
      }
      const ay = N_ ? y2 : y1, availH = N_ ? ay : ih - ay, cx = start.x + start.w / 2; // cạnh trên/dưới
      let h = Math.abs(py - ay);
      h = Math.max(minS / r, Math.min(h, availH, iw / r, Math.min(cx, iw - cx) * 2 / r)); const w = h * r;
      return { x: cx - w / 2, y: N_ ? ay - h : ay, w, h };
    }

    // ---------- chạm vào đâu ----------
    function handlePoints() {
      const [x1, y1] = toScreen(cr.x, cr.y), [x2, y2] = toScreen(cr.x + cr.w, cr.y + cr.h), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return { nw: [x1, y1], ne: [x2, y1], se: [x2, y2], sw: [x1, y2], n: [mx, y1], e: [x2, my], s: [mx, y2], w: [x1, my] };
    }
    function hit(sx, sy) {
      const R = 13, hs = handlePoints();
      for (const k of ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']) if (Math.abs(sx - hs[k][0]) <= R && Math.abs(sy - hs[k][1]) <= R) return k;
      if (sx >= hs.nw[0] && sx <= hs.se[0] && sy >= hs.nw[1] && sy <= hs.se[1]) return 'move';
      return 'new';
    }
    const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', new: 'crosshair' };

    // ---------- vẽ ----------
    function schedule() { if (!raf) raf = requestAnimationFrame(draw); }
    function draw() {
      raf = 0; if (done) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#080b11'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = interacting ? 'low' : 'high';
      ctx.drawImage(bmp, view.ox, view.oy, iw * view.s, ih * view.s);
      const [x1, y1] = toScreen(cr.x, cr.y), cw = cr.w * view.s, ch = cr.h * view.s;
      // làm tối phần ngoài khung
      ctx.fillStyle = 'rgba(2,5,10,.62)'; ctx.beginPath();
      ctx.rect(view.ox, view.oy, iw * view.s, ih * view.s); ctx.rect(x1, y1, cw, ch); ctx.fill('evenodd');
      // lưới 1/3
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < 3; i++) { ctx.moveTo(x1 + (cw * i) / 3, y1); ctx.lineTo(x1 + (cw * i) / 3, y1 + ch); ctx.moveTo(x1, y1 + (ch * i) / 3); ctx.lineTo(x1 + cw, y1 + (ch * i) / 3); }
      ctx.stroke();
      // viền khung
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x1, y1, cw, ch);
      // 8 điểm kéo
      const hs = handlePoints(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2f86ff'; ctx.lineWidth = 2;
      for (const k in hs) { const [hx, hy] = hs[k]; const corner = k.length === 2, sz = corner ? 11 : 9; ctx.beginPath(); ctx.roundRect(hx - sz / 2, hy - sz / 2, sz, sz, 3); ctx.fill(); ctx.stroke(); }
      // nhãn kích thước
      const label = `${Math.round(cr.w)} × ${Math.round(cr.h)}`; ctx.font = '600 12px "Segoe UI",sans-serif';
      const tw = ctx.measureText(label).width + 14, ly = y1 - 26 < 4 ? y1 + 6 : y1 - 26;
      ctx.fillStyle = 'rgba(10,15,26,.82)'; ctx.beginPath(); ctx.roundRect(x1, ly, tw, 20, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, x1 + 7, ly + 10);
      info.textContent = `${Math.round(cr.w)} × ${Math.round(cr.h)} px`;
      zoomEl.textContent = Math.round(view.s * 100) + '%';
    }

    // ---------- chuột / bút / cảm ứng ----------
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      canvas.setPointerCapture(e.pointerId); // giữ chuột kể cả khi kéo ra ngoài
      const [sx, sy] = local(e);
      interacting = true;
      if (e.button === 1 || space) { drag = { type: 'pan', sx, sy, ox: view.ox, oy: view.oy }; canvas.style.cursor = 'grabbing'; e.preventDefault(); return; }
      const h = hit(sx, sy), [px, py] = toImage(sx, sy);
      if (h === 'move') drag = { type: 'move', px, py, start: { ...cr } };
      else if (h === 'new') { const ax = clamp(px, 0, iw), ay = clamp(py, 0, ih); drag = { type: 'new', ax, ay, prev: { ...cr }, start: { x: ax, y: ay, w: 0.001, h: 0.001 } }; }
      else drag = { type: 'resize', h, start: { ...cr } };
      canvas.style.cursor = CURSOR[h === 'new' ? 'new' : h];
      schedule();
    });
    canvas.addEventListener('pointermove', (e) => {
      const [sx, sy] = local(e);
      if (!drag) { const c = space ? 'grab' : CURSOR[hit(sx, sy)]; if (c !== hoverCursor) { hoverCursor = c; canvas.style.cursor = c; } return; }
      if (drag.type === 'pan') { view.ox = drag.ox + sx - drag.sx; view.oy = drag.oy + sy - drag.sy; userZoomed = true; }
      else {
        const [px, py] = toImage(sx, sy);
        if (drag.type === 'move') { cr = norm({ ...cr, x: clamp(drag.start.x + px - drag.px, 0, iw - cr.w), y: clamp(drag.start.y + py - drag.py, 0, ih - cr.h) }); }
        else if (drag.type === 'resize') cr = norm(computeRect(drag.h, px, py, drag.start, MIN));
        else { // vẽ khung mới: chọn góc theo hướng kéo
          const qx = clamp(px, 0, iw), qy = clamp(py, 0, ih);
          const h = (qy >= drag.ay ? 's' : 'n') + (qx >= drag.ax ? 'e' : 'w');
          cr = norm(computeRect(h, qx, qy, drag.start, 1));
        }
      }
      schedule();
    });
    const endDrag = (e) => {
      if (!drag) return;
      if (drag.type === 'new' && (cr.w < MIN || cr.h < MIN)) cr = drag.prev; // chỉ bấm, chưa kéo: giữ khung cũ
      drag = null; interacting = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      canvas.style.cursor = space ? 'grab' : ''; hoverCursor = ''; schedule();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = local(e); zoomAt(sx, sy, e.deltaY < 0 ? 1.13 : 1 / 1.13); }, { passive: false });
    canvas.addEventListener('dblclick', () => { fit(); schedule(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------- bàn phím ----------
    const onKey = (e) => {
      if (done) return;
      if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'keydown' && !space) { space = true; canvas.style.cursor = 'grab'; } if (e.type === 'keyup') { space = false; canvas.style.cursor = ''; } return; }
      if (e.type !== 'keydown') return;
      const step = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); cr = norm({ ...cr, x: clamp(cr.x + mv[0], 0, iw - cr.w), y: clamp(cr.y + mv[1], 0, ih - cr.h) }); schedule(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(null); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); confirm_(); }
      else if (e.key === '+' || e.key === '=') { e.stopImmediatePropagation(); zoomAt(W / 2, H / 2, 1.25); }
      else if (e.key === '-') { e.stopImmediatePropagation(); zoomAt(W / 2, H / 2, 1 / 1.25); }
      else if (e.key === '0') { e.stopImmediatePropagation(); fit(); schedule(); }
    };
    document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKey, true);

    // ---------- nút ----------
    root.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]'); if (r) return setRatio(r.dataset.r);
      const b = e.target.closest('[data-cu]'); if (!b) return; const a = b.dataset.cu;
      if (a === 'ok') confirm_(); else if (a === 'cancel') finish(null);
      else if (a === 'in') zoomAt(W / 2, H / 2, 1.25); else if (a === 'out') zoomAt(W / 2, H / 2, 1 / 1.25);
      else if (a === 'fit') { fit(); schedule(); }
      else if (a === 'all') { ratioKey = 'free'; ratio = null; root.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x.dataset.r === 'free')); cr = { x: 0, y: 0, w: iw, h: ih }; schedule(); }
    });

    const ro = new ResizeObserver(resizeCanvas); ro.observe(stage);

    // ---------- kết thúc ----------
    function cleanup() {
      done = true; document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKey, true);
      ro.disconnect(); if (raf) cancelAnimationFrame(raf); root.remove(); try { bmp.close(); } catch (_) {}
    }
    function finish(v) { if (done) return; cleanup(); resolveFn(v); }
    function confirm_() {
      const x = Math.round(cr.x), y = Math.round(cr.y), w = Math.round(cr.w), h = Math.round(cr.h);
      // Chọn toàn bộ ảnh: trả lại ĐÚNG file gốc — không nén lại, không đổi kích thước
      if (x === 0 && y === 0 && w === iw && h === ih) return finish(blob);
      // Cắt: giữ đúng kích thước điểm ảnh của vùng cắt (1 điểm ảnh gốc = 1 điểm ảnh kết quả), không co giãn
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const c2 = out.getContext('2d'); c2.imageSmoothingEnabled = false;
      c2.drawImage(bmp, x, y, w, h, 0, 0, w, h);
      const type = /png/i.test(blob.type) ? 'image/png' : 'image/jpeg'; // PNG giữ PNG; JPG/WEBP -> JPG chất lượng rất cao
      out.toBlob((r) => finish(r), type, 0.98);
    }
    setRatio('free'); resizeCanvas(); stage.focus({ preventScroll: true });
    return result;
  };
})();

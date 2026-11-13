/* ตัวช่วยของหน้าแรกและหน้าหมวด: ไอคอน, วันที่ไทย, โหลดสถานะข้อมูล */
window.UI = (() => {
  const P = {
    pie: '<path d="M12 3v9h9"/><path d="M20.5 15.5A9 9 0 1 1 8.5 3.7"/>',
    compare: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',
    chart: '<path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    stack: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5"/>',
  };
  let gid = 0;
  const GRAD = (id) => `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="2" y1="3" x2="22" y2="21"><stop offset="0" stop-color="#1f5eff"/><stop offset=".55" stop-color="#6a5cff"/><stop offset="1" stop-color="#18c4f5"/></linearGradient></defs>`;
  /** ไอคอนเส้น · grad = เส้นไล่สีน้ำเงิน-ม่วง-ฟ้า */
  const icon = (n, cls = "ico", grad = false) => {
    const id = "ug" + (++gid);
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="${grad ? `url(#${id})` : "currentColor"}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${grad ? GRAD(id) : ""}${P[n] || ""}</svg>`;
  };
  /** ภาพประจำหมวด (ไล่สี) */
  const ART = {
    // Auto Top Funds: พอร์ต = โดนัทสัดส่วนสินทรัพย์
    portfolio: (id) => `<svg viewBox="0 0 64 64" class="art" aria-hidden="true">
      <defs><linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f5eff"/><stop offset="1" stop-color="#6a5cff"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#18c4f5"/><stop offset="1" stop-color="#1f5eff"/></linearGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a48bff"/><stop offset="1" stop-color="#6a5cff"/></linearGradient></defs>
      <g fill="none" stroke-width="12" transform="rotate(-90 32 32)">
        <circle cx="32" cy="32" r="22" stroke="url(#${id}a)" stroke-dasharray="62 138.2"/>
        <circle cx="32" cy="32" r="22" stroke="url(#${id}b)" stroke-dasharray="41 138.2" stroke-dashoffset="-64"/>
        <circle cx="32" cy="32" r="22" stroke="url(#${id}c)" stroke-dasharray="29 138.2" stroke-dashoffset="-107"/>
      </g></svg>`,
    // รายกองทุน: factsheet ของกองหนึ่งกอง (กราฟ NAV + บรรทัดข้อมูล)
    factsheet: (id) => `<svg viewBox="0 0 64 64" class="art" aria-hidden="true">
      <defs><linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f5eff"/><stop offset=".6" stop-color="#6a5cff"/><stop offset="1" stop-color="#18c4f5"/></linearGradient></defs>
      <rect x="10" y="5" width="44" height="54" rx="9" fill="url(#${id}a)"/>
      <path d="M18 34l7-7 6 5 9-11 6 5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="18" y="13" width="16" height="4" rx="2" fill="#fff" opacity=".9"/>
      <rect x="18" y="43" width="28" height="3.5" rx="1.75" fill="#fff" opacity=".55"/>
      <rect x="18" y="50" width="18" height="3.5" rx="1.75" fill="#fff" opacity=".55"/></svg>`,
  };
  const art = (n) => ART[n] ? ART[n]("ua" + (++gid)) : "";
  const TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const thDate = iso => { if (!iso) return "–"; const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${+d} ${TH[+m - 1]} ${(+y + 543) % 100}`; };
  const pct = v => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const getJSON = url => fetch(url, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
  return {
    icon, art, thDate, pct, esc,
    /** {count, navTo, pending} ของ NAV กองทุนรวม (หน้าเปรียบเทียบ) */
    async navIndex(root) { const d = await getJSON(root + "atf/compare/data/index.json"); return d && { count: d.funds.length, navTo: d.nav_to || d.updated, pending: d.pending || 0 }; },
    /** {updated, funds:[{name, since, asOf, rec}]} ของกราฟ Weekly */
    async weekly(root) {
      const d = await getJSON(root + "funds/weekly/data.json"); if (!d) return null;
      return { updated: d.updated, funds: d.funds.map(f => ({ name: f.name, since: f.returns?.since_rec, w1: f.returns?.["1W"], asOf: f.returns?.as_of, rec: f.recommend_date })) };
    },
    /** สถานะไฟล์ Model Performance ในเครื่องนี้ */
    async atfFile() { return window.UTFIT_ATF ? await UTFIT_ATF.get() : null; },
  };
})();

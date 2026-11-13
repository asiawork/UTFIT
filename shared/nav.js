/* แถบนำทางด้านบนของทุกหน้า: โลโก้ UTFIT › หมวด › เครื่องมือ + ลิงก์หมวด
   ใช้: <script src="../../shared/nav.js" data-section="atf" data-title="ชื่อเครื่องมือ"></script> */
(() => {
  const me = document.currentScript;
  const root = me.src.replace(/shared\/nav\.js.*$/, "");
  const SECT = { atf: ["Auto Top Funds", "atf/"], funds: ["รายกองทุน", "funds/"] };
  const secKey = me.dataset.section, sec = SECT[secKey], title = me.dataset.title;
  const st = document.createElement("style");
  st.textContent = `
  .utfit-nav{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.86);backdrop-filter:saturate(1.6) blur(12px);
    -webkit-backdrop-filter:saturate(1.6) blur(12px);border-bottom:1px solid #e6eaf3;
    font:500 14.5px/1 "BLS Text","Anuphan","IBM Plex Sans Thai",system-ui,sans-serif;color:#0b1430}
  .utfit-nav .in{max-width:1160px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;gap:10px;white-space:nowrap}
  .utfit-nav a{color:inherit;text-decoration:none}
  .utfit-nav .logo{display:flex;align-items:center;gap:9px;font:700 18px/1 "BLS Bold","Anuphan",sans-serif;letter-spacing:.01em}
  .utfit-nav .mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;font-size:15px;
    background:linear-gradient(135deg,#2463ff,#22c8f0);box-shadow:0 4px 12px rgba(36,99,255,.35)}
  .utfit-nav .sep{color:#b5bdd0}
  .utfit-nav .crumb{color:#6b7690;overflow:hidden;text-overflow:ellipsis}
  .utfit-nav a.crumb:hover{color:#2463ff}
  .utfit-nav .cur{color:#0b1430;font-weight:600;overflow:hidden;text-overflow:ellipsis}
  .utfit-nav .links{margin-left:auto;display:flex;gap:4px}
  .utfit-nav .links a{padding:9px 14px;border-radius:99px;color:#3a4560;transition:background .15s,color .15s}
  .utfit-nav .links a:hover{background:#eef3ff;color:#2463ff}
  .utfit-nav .links a.on{background:#2463ff;color:#fff}
  @media (max-width:720px){.utfit-nav .links{display:none}}
  @media print{.utfit-nav{display:none}}`;
  document.head.appendChild(st);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const parts = [`<a class="logo" href="${root}"><span class="mark">U</span>UTFIT</a>`];
  if (sec && title) parts.push(`<span class="sep">/</span><a class="crumb" href="${root}${sec[1]}">${esc(sec[0])}</a>`);
  if (title) parts.push(`<span class="sep">/</span><span class="cur">${esc(title)}</span>`);
  parts.push(`<span class="links">${Object.entries(SECT).map(([k, [n, p]]) => `<a href="${root}${p}"${k === secKey ? ' class="on"' : ""}>${esc(n)}</a>`).join("")}</span>`);
  const bar = document.createElement("nav");
  bar.className = "utfit-nav"; bar.setAttribute("aria-label", "เมนู UTFIT");
  bar.innerHTML = `<div class="in">${parts.join("")}</div>`;
  const put = () => document.body.prepend(bar);
  document.body ? put() : document.addEventListener("DOMContentLoaded", put);
})();

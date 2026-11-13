/* แถบนำทางด้านบนของทุกหน้า: โลโก้ UTFIT › หมวด › เครื่องมือ + ลิงก์หมวด
   ใช้: <script src="../../shared/nav.js" data-section="atf" data-title="ชื่อเครื่องมือ"></script> */
(() => {
  const me = document.currentScript;
  const root = me.src.replace(/shared\/nav\.js.*$/, "");
  const SECT = { atf: ["Auto Top Funds", "atf/"], funds: ["รายกองทุน", "funds/"] };
  const secKey = me.dataset.section, sec = SECT[secKey], title = me.dataset.title;
  const st = document.createElement("style");
  st.textContent = `
  .utfit-nav{position:sticky;top:0;z-index:60;background:#080e22;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid #1f2a50;
    font:500 14.5px/1 "BLS Text","Anuphan","IBM Plex Sans Thai",system-ui,sans-serif;color:#eef1ff}
  .utfit-nav .in{max-width:1120px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;gap:10px;white-space:nowrap}
  .utfit-nav a{color:inherit;text-decoration:none}
  .utfit-nav .logo{display:flex;align-items:center;gap:9px;font:700 18px/1 "BLS Bold","Anuphan",sans-serif;letter-spacing:.01em}
  .utfit-nav .mark{width:28px;height:28px;border-radius:9px;background:#4c6bff;color:#fff;display:grid;place-items:center;font-size:14px}
  .utfit-nav .sep{color:#3a4778}
  .utfit-nav .crumb{color:#8a94b8;overflow:hidden;text-overflow:ellipsis}
  .utfit-nav a.crumb:hover{color:#fff}
  .utfit-nav .cur{color:#eef1ff;font-weight:600;overflow:hidden;text-overflow:ellipsis}
  .utfit-nav .links{margin-left:auto;display:flex;gap:4px}
  .utfit-nav .links a{padding:9px 14px;border-radius:99px;color:#c2c9e6;transition:background .15s,color .15s}
  .utfit-nav .links a:hover{background:#16214a;color:#fff}
  .utfit-nav .links a.on{color:#fff;font-weight:600;background:#1d2a5c}
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

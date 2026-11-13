/* แถบนำทางด้านบนของทุกหน้า: UTFIT › หมวด › เครื่องมือ
   ใช้: <script src="../../shared/nav.js" data-section="atf" data-title="ชื่อเครื่องมือ"></script> */
(() => {
  const me = document.currentScript;
  const root = me.src.replace(/shared\/nav\.js.*$/, "");
  const SECT = { atf: ["Auto Top Funds", "atf/"], funds: ["รายกองทุน", "funds/"] };
  const sec = SECT[me.dataset.section], title = me.dataset.title;
  const st = document.createElement("style");
  st.textContent = `
  .utfit-nav{background:#0b2265;color:#fff;font:500 14px/1 "BLS Text","IBM Plex Sans Thai",system-ui,sans-serif;position:relative;z-index:50}
  .utfit-nav .in{max-width:1280px;margin:0 auto;padding:0 20px;height:40px;display:flex;align-items:center;gap:8px;overflow:hidden;white-space:nowrap}
  .utfit-nav a{color:#fff;text-decoration:none;opacity:.8}
  .utfit-nav a:hover{opacity:1;text-decoration:underline}
  .utfit-nav .home{font-family:"BLS Bold","BLS","IBM Plex Sans Thai",sans-serif;font-weight:700;opacity:1;letter-spacing:.02em}
  .utfit-nav .sep{opacity:.45}
  .utfit-nav .cur{opacity:1;overflow:hidden;text-overflow:ellipsis}
  @media print{.utfit-nav{display:none}}`;
  document.head.appendChild(st);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const parts = [`<a class="home" href="${root}">UTFIT</a>`];
  if (sec) parts.push(`<span class="sep">›</span>`, title ? `<a href="${root}${sec[1]}">${esc(sec[0])}</a>` : `<span class="cur">${esc(sec[0])}</span>`);
  if (title) parts.push(`<span class="sep">›</span>`, `<span class="cur">${esc(title)}</span>`);
  const bar = document.createElement("nav");
  bar.className = "utfit-nav"; bar.setAttribute("aria-label", "เมนู UTFIT");
  bar.innerHTML = `<div class="in">${parts.join("")}</div>`;
  const put = () => document.body.prepend(bar);
  document.body ? put() : document.addEventListener("DOMContentLoaded", put);
})();

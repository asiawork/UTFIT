/* แถบนำทางด้านบนของทุกหน้า: โลโก้ UTFIT › หมวด › เครื่องมือ + ลิงก์หมวด
   ใช้: <script src="../../shared/nav.js" data-section="atf" data-title="ชื่อเครื่องมือ"></script> */
(() => {
  // ธีม: light (ค่าเริ่มต้น) / dark — จำไว้ในเบราว์เซอร์
  const THEME_KEY = "utfit-theme";
  let theme = "light"; try { theme = localStorage.getItem(THEME_KEY) || "light"; } catch (e) {}
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; };
  applyTheme(theme);
  const me = document.currentScript;
  const root = me.src.replace(/shared\/nav\.js.*$/, "");
  const SECT = { atf: ["Auto Top Funds", "atf/"], funds: ["รายกองทุน", "funds/"] };
  const secKey = me.dataset.section, sec = SECT[secKey], title = me.dataset.title;
  const st = document.createElement("style");
  st.textContent = `
  .utfit-nav{--n-bg:#ffffff;--n-ln:#e7e9f2;--n-tx:#0f1a3c;--n-tx2:#4a5272;--n-mu:#868ca6;--n-hov:#eef1f8;--n-on:#0f1a3c;--n-ontx:#fff;--n-mark:#0f1a3c}
  html[data-theme=dark] .utfit-nav{--n-bg:#080e22;--n-ln:#1f2a50;--n-tx:#eef1ff;--n-tx2:#c2c9e6;--n-mu:#8a94b8;--n-hov:#16214a;--n-on:#1d2a5c;--n-ontx:#fff;--n-mark:#4c6bff}
  .utfit-nav{position:sticky;top:0;z-index:60;background:var(--n-bg);border-bottom:1px solid var(--n-ln);
    font:500 14.5px/1 "BLS Text","Anuphan","IBM Plex Sans Thai",system-ui,sans-serif;color:var(--n-tx)}
  .utfit-nav .in{max-width:1120px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;gap:10px;white-space:nowrap}
  .utfit-nav a{color:inherit;text-decoration:none}
  .utfit-nav .logo{display:flex;align-items:center;gap:9px;font:700 18px/1 "BLS Bold","Anuphan",sans-serif;letter-spacing:.01em}
  .utfit-nav .mark{width:28px;height:28px;border-radius:9px;background:var(--n-mark);color:#fff;display:grid;place-items:center;font-size:14px}
  .utfit-nav .sep{color:var(--n-ln)}
  .utfit-nav .crumb{color:var(--n-mu);overflow:hidden;text-overflow:ellipsis}
  .utfit-nav a.crumb:hover{color:var(--n-tx)}
  .utfit-nav .cur{color:var(--n-tx);font-weight:600;overflow:hidden;text-overflow:ellipsis}
  .utfit-nav .links{margin-left:auto;display:flex;align-items:center;gap:4px}
  .utfit-nav .links a{padding:9px 14px;border-radius:99px;color:var(--n-tx2);transition:background .15s,color .15s}
  .utfit-nav .links a:hover{background:var(--n-hov);color:var(--n-tx)}
  .utfit-nav .links a.on{color:var(--n-ontx);font-weight:600;background:var(--n-on)}
  .utfit-nav .theme{margin-left:6px;width:38px;height:38px;border-radius:50%;border:1px solid var(--n-ln);background:none;color:var(--n-tx);display:grid;place-items:center;cursor:pointer}
  .utfit-nav .theme:hover{background:var(--n-hov)}
  .utfit-nav .theme svg{width:18px;height:18px}
  .utfit-nav .home-only{display:none}
  @media (max-width:720px){.utfit-nav .links a{display:none}}
  @media print{.utfit-nav{display:none}}`;
  document.head.appendChild(st);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const parts = [`<a class="logo" href="${root}"><span class="mark">U</span>UTFIT</a>`];
  if (sec && title) parts.push(`<span class="sep">/</span><a class="crumb" href="${root}${sec[1]}">${esc(sec[0])}</a>`);
  if (title) parts.push(`<span class="sep">/</span><span class="cur">${esc(title)}</span>`);
  const ICON = { light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/></svg>', dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' };
  const themeBtn = title ? "" : `<button class="theme" type="button" aria-label="สลับธีมสว่าง/มืด">${ICON[theme] || ICON.light}</button>`;
  parts.push(`<span class="links">${Object.entries(SECT).map(([k, [n, p]]) => `<a href="${root}${p}"${k === secKey ? ' class="on"' : ""}>${esc(n)}</a>`).join("")}${themeBtn}</span>`);
  const bar = document.createElement("nav");
  bar.className = "utfit-nav"; bar.setAttribute("aria-label", "เมนู UTFIT");
  bar.innerHTML = `<div class="in">${parts.join("")}</div>`;
  const tb = bar.querySelector(".theme");
  if (tb) tb.onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme(theme); tb.innerHTML = ICON[theme];
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  };
  const put = () => document.body.prepend(bar);
  document.body ? put() : document.addEventListener("DOMContentLoaded", put);
})();

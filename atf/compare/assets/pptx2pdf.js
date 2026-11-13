/* pptx2pdf.js — วาดสไลด์จากไฟล์ .pptx ลง canvas แล้วรวมเป็น PDF (ทำในเบราว์เซอร์ทั้งหมด)
   รองรับเฉพาะสิ่งที่แม่แบบ Review Portfolio ใช้: รูป, กล่องข้อความ, สี่เหลี่ยม/มุมมน, freeform, กลุ่ม, ตาราง,
   placeholder (สืบตำแหน่ง/รูปแบบตัวอักษรจาก layout/master), theme color, พื้นหลัง, เลขหน้า
   ไม่รองรับ: chart, เงา/เอฟเฟกต์, table style สำเร็จรูป (ใช้สี/เส้นที่ระบุในแต่ละช่อง)
   ฟอนต์ใช้ตามชื่อในไฟล์ (เช่น BLS Text / BLS Bold / BLS ExtraBold) ต้องติดตั้งในเครื่องที่เปิดหน้าเว็บ

   ใช้: const blob = await PptxPdf.render(jszipObject, { jsPDF, scale: 2 })                         */
(function () {
  const PR = "http://schemas.openxmlformats.org/package/2006/relationships";
  const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const EMU = 12700;                       // EMU ต่อ 1 pt
  const pt = (v, d = 0) => (v == null || v === "" ? d : +v / EMU);

  // ---------- XML helpers (เทียบชื่อ tag แบบไม่สน prefix) ----------
  const ch = (el, name) => el ? [...el.children].find(c => c.localName === name) || null : null;
  const chs = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const at = (el, name, d) => (el && el.hasAttribute(name) ? el.getAttribute(name) : d);
  const dig = (el, ...names) => names.reduce((e, n) => (e ? ch(e, n) : null), el);
  const resolve = (base, target) => {
    if (target.startsWith("/")) return target.slice(1);
    const parts = base.split("/"); parts.pop();
    for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
    return parts.join("/");
  };

  class Pkg {
    constructor(zip) { this.zip = zip; this.docs = {}; this.imgs = {}; }
    async xml(path) {
      if (!(path in this.docs)) {
        const f = this.zip.file(path);
        this.docs[path] = f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null;
      }
      return this.docs[path];
    }
    async rels(path) {
      const d = await this.xml(path.replace(/([^/]+)$/, "_rels/$1.rels")), m = {};
      if (d) for (const r of d.getElementsByTagNameNS(PR, "Relationship"))
        m[r.getAttribute("Id")] = { type: r.getAttribute("Type"), target: r.getAttribute("TargetMode") === "External" ? null : resolve(path, r.getAttribute("Target")) };
      return m;
    }
    async image(path) {
      if (!path) return null;
      if (!(path in this.imgs)) {
        const f = this.zip.file(path);
        this.imgs[path] = f ? await createImageBitmap(await f.async("blob")).catch(() => null) : null;
      }
      return this.imgs[path];
    }
  }
  const relOfType = (rels, t) => Object.values(rels).find(r => r.type.endsWith("/" + t));

  // ---------- สี ----------
  const PRST = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", gray: "808080", yellow: "FFFF00" };
  const hex = (h) => ({ r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 });
  function toHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function fromHsl(h, s, l, a) {
    const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255, a };
  }
  function mods(c, el) {
    let { r, g, b, a } = c;
    for (const m of el.children) {
      const v = +at(m, "val", 0) / 100000;
      switch (m.localName) {
        case "alpha": a = v; break;
        case "tint": r = 255 - (255 - r) * v; g = 255 - (255 - g) * v; b = 255 - (255 - b) * v; break;
        case "shade": r *= v; g *= v; b *= v; break;
        case "lumMod": case "lumOff": {
          const [h, s, l] = toHsl({ r, g, b });
          const l2 = m.localName === "lumMod" ? l * v : l + v;
          ({ r, g, b } = fromHsl(h, s, Math.max(0, Math.min(1, l2)), a)); break;
        }
      }
    }
    return { r, g, b, a };
  }
  function color(parent, env) {
    if (!parent) return null;
    for (const c of parent.children) {
      let base = null;
      switch (c.localName) {
        case "srgbClr": base = hex(at(c, "val", "000000")); break;
        case "sysClr": base = hex(at(c, "lastClr", "000000")); break;
        case "prstClr": base = hex(PRST[at(c, "val")] || "000000"); break;
        case "schemeClr": {
          let v = at(c, "val");
          if (v === "phClr") { if (!env.phClr) return null; base = { ...env.phClr }; break; }
          v = env.clrMap[v] || v;
          base = hex(env.theme.colors[v] || "000000"); break;
        }
        default: continue;
      }
      return mods(base, c);
    }
    return null;
  }
  const css = (c) => c ? `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a})` : "transparent";

  // ---------- theme ----------
  async function loadTheme(pkg, path) {
    const d = await pkg.xml(path), colors = {}, fonts = { major: "", minor: "", majorCs: "", minorCs: "" };
    const scheme = d && d.getElementsByTagNameNS("*", "clrScheme")[0];
    if (scheme) for (const c of scheme.children) {
      const s = ch(c, "srgbClr"), y = ch(c, "sysClr");
      colors[c.localName] = s ? at(s, "val") : y ? at(y, "lastClr", "000000") : "000000";
    }
    const fs = d && d.getElementsByTagNameNS("*", "fontScheme")[0];
    if (fs) {
      const mj = ch(fs, "majorFont"), mn = ch(fs, "minorFont");
      fonts.major = at(ch(mj, "latin"), "typeface", ""); fonts.minor = at(ch(mn, "latin"), "typeface", "");
      fonts.majorCs = at(ch(mj, "cs"), "typeface", ""); fonts.minorCs = at(ch(mn, "cs"), "typeface", "");
    }
    return { colors, fonts };
  }

  // ---------- ฟอนต์ ----------
  const FONT_FALLBACK = `"BLS Text", "BLSBody", Tahoma, "Leelawadee UI", sans-serif`;
  const fontTried = new Map();
  function ensureFont(name) {
    if (!name || fontTried.has(name)) return fontTried.get(name);
    // ลงทะเบียนชื่อฟอนต์จากเครื่อง (local) ช่วงน้ำหนัก 100–900 กันเบราว์เซอร์ทำตัวหนาซ้อนให้ฟอนต์ที่หนาอยู่แล้ว
    const p = (async () => {
      try {
        const ff = new FontFace(name, `local("${name}"), local("${name.replace(/\s+/g, "")}"), local("${name.replace(/\s+/g, "-")}")`, { weight: "100 900" });
        await ff.load(); document.fonts.add(ff); return true;
      } catch (e) { return false; }
    })();
    fontTried.set(name, p); return p;
  }

  // ---------- สืบทอดรูปแบบข้อความ ----------
  // รวม attribute + ลูก (fill/latin/cs) ของ pPr/defRPr ตามลำดับความสำคัญ (ตัวหลังทับตัวหน้า)
  function mergePara(list) {
    const p = { attrs: {}, lnSpc: null, spcBef: null, spcAft: null, bu: null, buFont: null, r: { attrs: {}, fill: undefined, latin: null, cs: null } };
    for (const el of list) {
      if (!el) continue;
      for (const a of el.attributes) p.attrs[a.name] = a.value;
      for (const c of el.children) {
        switch (c.localName) {
          case "lnSpc": p.lnSpc = c; break;
          case "spcBef": p.spcBef = c; break;
          case "spcAft": p.spcAft = c; break;
          case "buNone": p.bu = null; break;
          case "buChar": p.bu = at(c, "char", "•"); break;
          case "buAutoNum": p.bu = "•"; break;
          case "buFont": p.buFont = at(c, "typeface"); break;
          case "defRPr": mergeRun(p.r, c); break;
        }
      }
    }
    return p;
  }
  function mergeRun(r, el) {
    if (!el) return r;
    for (const a of el.attributes) r.attrs[a.name] = a.value;
    for (const c of el.children) {
      if (c.localName === "solidFill" || c.localName === "gradFill") r.fill = c;
      else if (c.localName === "noFill") r.fill = null;
      else if (c.localName === "latin") r.latin = at(c, "typeface");
      else if (c.localName === "cs") r.cs = at(c, "typeface");
    }
    return r;
  }
  const cloneRun = (r) => ({ attrs: { ...r.attrs }, fill: r.fill, latin: r.latin, cs: r.cs });
  const lvlEl = (lst, lvl) => lst ? ch(lst, `lvl${lvl + 1}pPr`) : null;

  // ---------- วาด ----------
  const THAI = /[฀-๿]/;
  let SEG = null; try { SEG = new Intl.Segmenter("th", { granularity: "word" }); } catch (e) {}
  const words = (s) => SEG ? [...SEG.segment(s)].map(x => x.segment) : s.split(/(\s+)/).filter(Boolean);

  function typeface(name, env) {
    if (!name) return null;
    if (name.startsWith("+mj")) return name.endsWith("cs") ? env.theme.fonts.majorCs || env.theme.fonts.major : env.theme.fonts.major;
    if (name.startsWith("+mn")) return name.endsWith("cs") ? env.theme.fonts.minorCs || env.theme.fonts.minor : env.theme.fonts.minor;
    return name;
  }
  function fontCss(st, text) {
    const face = (THAI.test(text) ? st.cs || st.latin : st.latin || st.cs) || "";
    if (face) ensureFont(face);
    return `${st.i ? "italic " : ""}${st.b ? 700 : 400} ${st.size}px ${face ? `"${face}", ` : ""}${FONT_FALLBACK}`;
  }
  const metricsCache = new Map();
  function metrics(ctx, font) {
    if (!metricsCache.has(font)) {
      ctx.font = font; const m = ctx.measureText("ÀกญุHg");
      const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]);
      const asc = m.fontBoundingBoxAscent ?? size * 0.95, desc = m.fontBoundingBoxDescent ?? size * 0.3;
      metricsCache.set(font, { asc, desc });
    }
    return metricsCache.get(font);
  }

  /* จัดข้อความในกรอบ (หน่วย pt) แล้ววาด
     body = a:txBody, box = {x,y,w,h}, env.styles = รายการ lstStyle จากต่ำไปสูง (master → layout → shape)
     dry = true → คืนความสูงข้อความอย่างเดียว (ใช้คำนวณความสูงแถวตาราง) */
  function drawText(ctx, body, box, env, opts = {}) {
    if (!body) return 0;
    const bp = {};
    for (const b of [...(opts.bodyPrs || []), ch(body, "bodyPr")]) if (b) {
      for (const a of b.attributes) bp[a.name] = a.value;
      const fit = ch(b, "normAutofit"); if (fit) { bp.fontScale = at(fit, "fontScale", "100000"); bp.lnRed = at(fit, "lnSpcReduction", "0"); }
      if (ch(b, "noAutofit") || ch(b, "spAutoFit")) { delete bp.fontScale; delete bp.lnRed; }
    }
    const ins = opts.insets || { l: pt(bp.lIns ?? 91440), t: pt(bp.tIns ?? 45720), r: pt(bp.rIns ?? 91440), b: pt(bp.bIns ?? 45720) };
    const fs = (+(bp.fontScale || 100000)) / 100000, lnRed = (+(bp.lnRed || 0)) / 100000;
    const wrap = bp.wrap !== "none", W = Math.max(1, box.w - ins.l - ins.r);
    const lst = ch(body, "lstStyle");
    const lines = []; let first = true;

    for (const p of chs(body, "p")) {
      const pPr = ch(p, "pPr"), lvl = +at(pPr, "lvl", 0);
      const P = mergePara([...(env.styles || []).map(s => lvlEl(s, lvl)), lvlEl(lst, lvl), pPr]);
      const pa = P.attrs, algn = pa.algn || "l";
      const marL = pt(pa.marL), indent = pt(pa.indent);
      // runs → token
      const toks = []; let anyRun = false;
      const runStyle = (rPr) => {
        const r = mergeRun(cloneRun(P.r), rPr), a = r.attrs;
        const size = (+(a.sz || 1800) / 100) * fs;
        const fill = r.fill === undefined ? (env.fontColor ? null : null) : r.fill;
        const c = fill ? color(fill.localName === "gradFill" ? ch(dig(fill, "gsLst"), "gs") : fill, env) : r.fill === null ? null : (env.fontColor || { r: 0, g: 0, b: 0, a: 1 });
        return { size, b: a.b === "1" || a.b === "true", i: a.i === "1" || a.i === "true", u: a.u && a.u !== "none", spc: +(a.spc || 0) / 100,
                 cap: a.cap, base: +(a.baseline || 0) / 100000, latin: typeface(r.latin, env), cs: typeface(r.cs || r.latin, env), color: c };
      };
      let endSt = runStyle(ch(p, "endParaRPr"));
      for (const r of p.children) {
        if (r.localName === "r" || r.localName === "fld") {
          let t = ch(r, "t")?.textContent ?? "";
          if (r.localName === "fld" && at(r, "type") === "slidenum") t = String(env.slideNum);
          const st = runStyle(ch(r, "rPr")); if (st.cap === "all") t = t.toUpperCase();
          for (const w of words(t)) toks.push({ t: w, st }); anyRun = true; endSt = st;
        } else if (r.localName === "br") { toks.push({ br: true, st: runStyle(ch(r, "rPr")) }); }
      }
      if (!anyRun && !toks.length) toks.push({ t: "", st: endSt });
      // วัด + ตัดบรรทัด
      const bullet = P.bu && anyRun ? P.bu : null;
      const avail = W - marL;
      let cur = { toks: [], w: 0 }; const pl = [cur];
      const measure = (tk) => {
        if (tk.br) return 0;
        ctx.font = fontCss(tk.st, tk.t); ctx.letterSpacing = `${tk.st.spc}px`;
        const w = ctx.measureText(tk.t).width; ctx.letterSpacing = "0px"; return w;
      };
      for (const tk of toks) {
        if (tk.br) { cur.toks.push(tk); cur = { toks: [], w: 0 }; pl.push(cur); continue; }
        let w = measure(tk);
        if (wrap && cur.w + w > avail + 0.5 && cur.toks.some(x => x.t && x.t.trim())) {
          // เว้นวรรคที่ล้นบรรทัด: ห้อยท้ายบรรทัด (ไม่นับความกว้าง) แล้วข้อความถัดไปขึ้นบรรทัดใหม่ เหมือน PowerPoint
          if (!tk.t.trim()) { cur.toks.push({ ...tk, w: Math.max(0, avail - cur.w) }); cur.w = avail; cur = { toks: [], w: 0 }; pl.push(cur); continue; }
          cur = { toks: [], w: 0 }; pl.push(cur);
        }
        if (wrap && w > avail && tk.t.length > 1) {         // คำยาวเกินบรรทัด: ตัดทีละตัวอักษร
          let part = "";
          for (const g of [...tk.t]) {
            const t2 = part + g, w2 = measure({ ...tk, t: t2 });
            if (cur.w + w2 > avail && part) { cur.toks.push({ ...tk, t: part, w: measure({ ...tk, t: part }) }); cur.w += measure({ ...tk, t: part }); cur = { toks: [], w: 0 }; pl.push(cur); part = g; }
            else part = t2;
          }
          w = measure({ ...tk, t: part }); cur.toks.push({ ...tk, t: part, w }); cur.w += w; continue;
        }
        cur.toks.push({ ...tk, w }); cur.w += w;
      }
      // ระยะบรรทัด
      const spc = (el, size) => {
        if (!el) return 0;
        const pts = ch(el, "spcPts"), pct = ch(el, "spcPct");
        return pts ? +at(pts, "val") / 100 : pct ? (+at(pct, "val") / 100000) * size * 1.2 : 0;
      };
      pl.forEach((ln, li) => {
        const sts = ln.toks.filter(x => !x.br).map(x => x.st); if (!sts.length) sts.push(ln.toks[0]?.st || endSt);
        let asc = 0, desc = 0, maxSize = 0;
        for (const s of sts) { const m = metrics(ctx, fontCss(s, "ก")); asc = Math.max(asc, m.asc); desc = Math.max(desc, m.desc); maxSize = Math.max(maxSize, s.size); }
        // PowerPoint ใช้ระยะบรรทัดเดียว ≈ 1.2 × ขนาดตัวอักษร (กรอบฟอนต์ไทยบางตัวสูงเกินจริง ทำให้ตารางยืด)
        const lh = Math.min(asc + desc, maxSize * 1.2);
        let h = lh, a2 = lh * asc / (asc + desc);
        const pts = dig(P.lnSpc, "spcPts"), pct = dig(P.lnSpc, "spcPct");
        if (pts) { h = +at(pts, "val") / 100; a2 = h * asc / (asc + desc); }
        else { const f = (pct ? +at(pct, "val") / 100000 : 1) - lnRed; h *= f; a2 *= f; }
        const before = li === 0 && !first ? spc(P.spcBef, maxSize) : li === 0 ? 0 : 0;
        const after = li === pl.length - 1 ? spc(P.spcAft, maxSize) : 0;
        lines.push({ ...ln, h, asc: a2, before, after, algn, marL: marL + (li === 0 ? indent : 0), bullet: li === 0 ? bullet : null, bulletSt: sts[0], bulletAt: marL + indent });
      });
      first = false;
    }
    const textH = lines.reduce((s, l) => s + l.before + l.h + l.after, 0);
    if (opts.dry) return textH + ins.t + ins.b;
    const anchor = bp.anchor || "t";
    let y = box.y + ins.t + (anchor === "ctr" ? (box.h - ins.t - ins.b - textH) / 2 : anchor === "b" ? box.h - ins.t - ins.b - textH : 0);
    for (const ln of lines) {
      y += ln.before;
      const base = y + ln.asc;
      const lw = ln.toks.reduce((s, t) => s + (t.w || 0), 0) - (ln.toks.length && !ln.toks.at(-1).br && !(ln.toks.at(-1).t || "").trim() ? ln.toks.at(-1).w : 0);
      const avail = W - ln.marL;
      let x = box.x + ins.l + ln.marL + (ln.algn === "ctr" ? (avail - lw) / 2 : ln.algn === "r" ? avail - lw : 0);
      if (ln.bullet) {
        ctx.font = fontCss({ ...ln.bulletSt, latin: ln.bulletSt.latin }, ln.bullet); ctx.fillStyle = css(ln.bulletSt.color);
        ctx.fillText(ln.bullet, box.x + ins.l + ln.bulletAt, base);
      }
      for (const tk of ln.toks) {
        if (tk.br || !tk.t) continue;
        const st = tk.st;
        if (st.color && st.color.a > 0) {
          ctx.font = fontCss(st, tk.t); ctx.fillStyle = css(st.color); ctx.letterSpacing = `${st.spc}px`;
          ctx.fillText(tk.t, x, base - st.base * st.size);
          ctx.letterSpacing = "0px";
          if (st.u) { ctx.fillRect(x, base + st.size * 0.12, tk.w, Math.max(0.6, st.size / 18)); }
        }
        x += tk.w;
      }
      y += ln.h + ln.after;
    }
    return textH;
  }

  // ---------- รูปทรง ----------
  function geomPath(ctx, spPr, w, h) {
    const cust = ch(spPr, "custGeom");
    ctx.beginPath();
    if (cust) {
      for (const path of chs(dig(cust, "pathLst"), "path")) {
        const pw = +at(path, "w", 0) || w * EMU, ph = +at(path, "h", 0) || h * EMU, sx = w / (pw / EMU), sy = h / (ph / EMU);
        const P = (e) => [pt(at(e, "x")) * sx, pt(at(e, "y")) * sy];
        let last = [0, 0];
        for (const c of path.children) {
          const ps = chs(c, "pt").map(P);
          switch (c.localName) {
            case "moveTo": ctx.moveTo(...ps[0]); last = ps[0]; break;
            case "lnTo": ctx.lineTo(...ps[0]); last = ps[0]; break;
            case "cubicBezTo": ctx.bezierCurveTo(...ps[0], ...ps[1], ...ps[2]); last = ps[2]; break;
            case "quadBezTo": ctx.quadraticCurveTo(...ps[0], ...ps[1]); last = ps[1]; break;
            case "arcTo": {
              const wr = pt(at(c, "wR")) * sx, hr = pt(at(c, "hR")) * sy, st = +at(c, "stAng", 0) / 60000 * Math.PI / 180, sw = +at(c, "swAng", 0) / 60000 * Math.PI / 180;
              const cx = last[0] - wr * Math.cos(st), cy = last[1] - hr * Math.sin(st);
              ctx.ellipse(cx, cy, wr, hr, 0, st, st + sw, sw < 0);
              last = [cx + wr * Math.cos(st + sw), cy + hr * Math.sin(st + sw)]; break;
            }
            case "close": ctx.closePath(); break;
          }
        }
      }
      return;
    }
    const prst = at(ch(spPr, "prstGeom"), "prst", "rect");
    if (prst === "roundRect") {
      const gd = dig(spPr, "prstGeom", "avLst")?.firstElementChild, adj = gd ? +(at(gd, "fmla", "val 16667").split(" ")[1]) : 16667;
      ctx.roundRect(0, 0, w, h, Math.min(w, h) * adj / 100000);
    } else if (prst === "ellipse") ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (prst === "line") { ctx.moveTo(0, 0); ctx.lineTo(w, h); }
    else ctx.rect(0, 0, w, h);
  }

  async function fillShape(ctx, spPr, style, w, h, env, part) {
    const fillEl = spPr && [...spPr.children].find(c => /^(solidFill|gradFill|blipFill|noFill|pattFill)$/.test(c.localName));
    let filled = false;
    if (fillEl) {
      if (fillEl.localName === "solidFill") { ctx.fillStyle = css(color(fillEl, env)); ctx.fill(); filled = true; }
      else if (fillEl.localName === "gradFill") {
        const gs = chs(dig(fillEl, "gsLst"), "gs").map(g => ({ pos: +at(g, "pos") / 100000, c: color(g, env) }));
        const ang = (+at(ch(fillEl, "lin"), "ang", 0) / 60000) * Math.PI / 180;
        const cx = w / 2, cy = h / 2, r = (Math.abs(w * Math.cos(ang)) + Math.abs(h * Math.sin(ang))) / 2;
        const g = ctx.createLinearGradient(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        for (const s of gs) g.addColorStop(Math.min(1, Math.max(0, s.pos)), css(s.c));
        ctx.fillStyle = g; ctx.fill(); filled = true;
      } else if (fillEl.localName === "blipFill") {
        const img = await blipImage(fillEl, env, part);
        if (img) { ctx.save(); ctx.clip(); drawBlip(ctx, img, fillEl, 0, 0, w, h); ctx.restore(); filled = true; }
      }
    } else if (style) {
      const fr = ch(style, "fillRef");
      if (fr && +at(fr, "idx", 0) > 0) { ctx.fillStyle = css(color(fr, env)); ctx.fill(); filled = true; }
    }
    // เส้นขอบ
    const ln = spPr && ch(spPr, "ln");
    let lc = null, lw = 0;
    if (ln) {
      if (!ch(ln, "noFill")) {
        lw = pt(at(ln, "w", 9525)); const sf = ch(ln, "solidFill");
        lc = sf ? color(sf, env) : style ? color(ch(style, "lnRef"), env) : null;
      }
    } else if (style) {
      const lr = ch(style, "lnRef");
      if (lr && +at(lr, "idx", 0) > 0) { lc = color(lr, env); lw = 0.75 * +at(lr, "idx"); }
    }
    if (lc && lw > 0) { ctx.strokeStyle = css(lc); ctx.lineWidth = lw; ctx.stroke(); }
    return filled;
  }
  async function blipImage(blipFill, env, part) {
    const blip = ch(blipFill, "blip"); if (!blip) return null;
    const rid = blip.getAttributeNS(RNS, "embed") || at(blip, "r:embed");
    const rel = env.rels[part]?.[rid];
    return rel ? env.pkg.image(rel.target) : null;
  }
  function drawBlip(ctx, img, blipFill, x, y, w, h) {
    const sr = ch(blipFill, "srcRect");
    const l = +at(sr, "l", 0) / 100000, t = +at(sr, "t", 0) / 100000, r = +at(sr, "r", 0) / 100000, b = +at(sr, "b", 0) / 100000;
    const iw = img.width, ih = img.height;
    const sx = iw * l, sy = ih * t, sw = iw * (1 - l - r), sh = ih * (1 - t - b);
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // ตำแหน่ง/ขนาด: ของตัวเอง หรือสืบจาก placeholder บน layout → master
  function phKey(sh) {
    const ph = dig(sh, "nvSpPr", "nvPr", "ph") || dig(sh, "nvPicPr", "nvPr", "ph") || dig(sh, "nvGraphicFramePr", "nvPr", "ph");
    if (!ph) return null;
    return { type: at(ph, "type", "body"), idx: at(ph, "idx", null) };
  }
  function findPh(tree, key) {
    if (!tree || !key) return null;
    const all = [...tree.children].filter(c => c.localName === "sp" || c.localName === "pic");
    const k = (c) => phKey(c);
    return (key.idx != null && all.find(c => k(c) && k(c).idx === key.idx)) ||
           all.find(c => { const q = k(c); return q && (q.type === key.type || (key.type === "ctrTitle" && q.type === "title") || (key.type === "subTitle" && q.type === "body")); }) || null;
  }
  const xfrmOf = (el) => dig(el, "spPr", "xfrm") || dig(el, "grpSpPr", "xfrm") || dig(el, "xfrm");
  function boxOf(xf) {
    const off = ch(xf, "off"), ext = ch(xf, "ext");
    return { x: pt(at(off, "x")), y: pt(at(off, "y")), w: pt(at(ext, "cx")), h: pt(at(ext, "cy")),
             rot: +at(xf, "rot", 0) / 60000, flipH: at(xf, "flipH") === "1", flipV: at(xf, "flipV") === "1" };
  }

  async function drawShape(ctx, sh, env, part) {
    const name = sh.localName;
    const nv = ch(sh, "nvSpPr") || ch(sh, "nvPicPr") || ch(sh, "nvGrpSpPr") || ch(sh, "nvGraphicFramePr") || ch(sh, "nvCxnSpPr");
    if (at(ch(nv, "cNvPr"), "hidden") === "1") return;
    const key = phKey(sh);
    if (key && env.skipPh) return;                                     // placeholder บน master/layout ไม่วาด
    if (name === "grpSp") {
      const b = boxOf(xfrmOf(sh)), xf = xfrmOf(sh), co = ch(xf, "chOff"), ce = ch(xf, "chExt");
      const cx = pt(at(co, "x")), cy = pt(at(co, "y")), cw = pt(at(ce, "cx")) || b.w, chh = pt(at(ce, "cy")) || b.h;
      ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.w / cw || 1, b.h / chh || 1); ctx.translate(-cx, -cy);
      for (const c of sh.children) await drawShape(ctx, c, env, part);
      ctx.restore(); return;
    }
    if (!/^(sp|pic|cxnSp|graphicFrame)$/.test(name)) return;
    const lay = key ? findPh(env.layoutTree, key) : null, mas = key ? findPh(env.masterTree, key) : null;
    const xf = xfrmOf(sh) || xfrmOf(lay) || xfrmOf(mas); if (!xf) return;
    const b = boxOf(xf);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    if (b.rot) ctx.rotate(b.rot * Math.PI / 180);
    ctx.scale(b.flipH ? -1 : 1, b.flipV ? -1 : 1);
    ctx.translate(-b.w / 2, -b.h / 2);
    if (name === "graphicFrame") { await drawFrame(ctx, sh, b, env, part); ctx.restore(); return; }
    const spPr = ch(sh, "spPr"), style = ch(sh, "style");
    if (name === "pic") {
      const bf = ch(sh, "blipFill"), img = await blipImage(bf, env, part);
      geomPath(ctx, spPr, b.w, b.h);
      if (img) { ctx.save(); ctx.clip(); drawBlip(ctx, img, bf, 0, 0, b.w, b.h); ctx.restore(); }
      await fillShape(ctx, { children: [...(spPr?.children || [])].filter(c => c.localName === "ln") }, null, b.w, b.h, env, part);
      ctx.restore(); return;
    }
    geomPath(ctx, spPr, b.w, b.h);
    env.phClr = style ? color(ch(style, "fillRef"), env) : null;
    await fillShape(ctx, spPr, style, b.w, b.h, env, part);
    env.phClr = null;
    // ข้อความ
    const body = ch(sh, "txBody");
    if (body && body.textContent.trim()) {
      const isTitle = key && /title/i.test(key.type);
      const txSty = env.txStyles ? ch(env.txStyles, key ? (isTitle ? "titleStyle" : "bodyStyle") : "otherStyle") : null;
      const styles = [env.defaultText, key ? txSty : null, ch(mas && ch(mas, "txBody"), "lstStyle"), ch(lay && ch(lay, "txBody"), "lstStyle")].filter(Boolean);
      const fr = style ? ch(style, "fontRef") : null;
      env.fontColor = fr ? color(fr, env) : null;
      drawText(ctx, body, { x: 0, y: 0, w: b.w, h: b.h }, { ...env, styles }, { bodyPrs: [ch(mas && ch(mas, "txBody"), "bodyPr"), ch(lay && ch(lay, "txBody"), "bodyPr")] });
      env.fontColor = null;
    }
    ctx.restore();
  }

  // ---------- ตาราง ----------
  async function drawFrame(ctx, sh, b, env) {
    const tbl = sh.getElementsByTagNameNS("*", "tbl")[0];
    if (!tbl) return;                                                  // chart/อื่น ๆ ไม่รองรับ
    const cols = chs(dig(tbl, "tblGrid"), "gridCol").map(g => pt(at(g, "w")));
    const rows = chs(tbl, "tr");
    const styles = [env.defaultText].filter(Boolean);
    const cellBox = (tc) => {
      const pr = ch(tc, "tcPr");
      return { pr, ins: { l: pt(at(pr, "marL", 91440)), r: pt(at(pr, "marR", 91440)), t: pt(at(pr, "marT", 45720)), b: pt(at(pr, "marB", 45720)) } };
    };
    // ความสูงแถว: ขยายตามข้อความ (เหมือน PowerPoint)
    const H = rows.map(tr => pt(at(tr, "h")));
    rows.forEach((tr, ri) => {
      let ci = 0;
      for (const tc of chs(tr, "tc")) {
        const span = +at(tc, "gridSpan", 1), rs = +at(tc, "rowSpan", 1);
        if (at(tc, "hMerge") !== "1" && at(tc, "vMerge") !== "1" && rs === 1) {
          const w = cols.slice(ci, ci + span).reduce((a, c) => a + c, 0), { pr, ins } = cellBox(tc);
          const need = drawText(ctx, ch(tc, "txBody"), { x: 0, y: 0, w, h: 0 }, { ...env, styles }, { dry: true, insets: ins, bodyPrs: [] });
          H[ri] = Math.max(H[ri], Math.min(need, H[ri] * 1.0));   // ไม่ขยายเกินที่บันทึกไว้ (ไฟล์ PowerPoint บันทึกความสูงจริงแล้ว)
        }
        ci += 1;
      }
    });
    const X = [0]; cols.forEach(c => X.push(X.at(-1) + c));
    const Y = [0]; H.forEach(h => Y.push(Y.at(-1) + h));
    const borders = [];
    rows.forEach((tr, ri) => {
      let ci = 0;
      for (const tc of chs(tr, "tc")) {
        const span = +at(tc, "gridSpan", 1), rs = +at(tc, "rowSpan", 1);
        if (at(tc, "hMerge") === "1" || at(tc, "vMerge") === "1") { ci += 1; continue; }
        const x = X[ci], y = Y[ri], w = X[Math.min(ci + span, cols.length)] - x, h = Y[Math.min(ri + rs, rows.length)] - y;
        const { pr, ins } = cellBox(tc);
        const fill = pr && [...pr.children].find(c => c.localName === "solidFill" || c.localName === "gradFill");
        if (fill) { ctx.fillStyle = css(color(fill.localName === "gradFill" ? ch(dig(fill, "gsLst"), "gs") : fill, env)); ctx.fillRect(x, y, w, h); }
        const anchor = at(pr, "anchor", "t");
        const body = ch(tc, "txBody");
        if (body) {
          const bp = { lIns: ins.l * EMU, rIns: ins.r * EMU, tIns: ins.t * EMU, bIns: ins.b * EMU, anchor };
          const fake = { attributes: Object.entries(bp).map(([name, value]) => ({ name, value: String(value) })), children: [] };
          drawText(ctx, body, { x, y, w, h }, { ...env, styles }, { insets: ins, bodyPrs: [fake] });
        }
        for (const [tag, x1, y1, x2, y2] of [["lnL", x, y, x, y + h], ["lnR", x + w, y, x + w, y + h], ["lnT", x, y, x + w, y], ["lnB", x, y + h, x + w, y + h]]) {
          const l = ch(pr, tag); if (!l || ch(l, "noFill")) continue;
          const c = color(ch(l, "solidFill"), env); if (!c) continue;
          borders.push({ c, w: pt(at(l, "w", 12700)), x1, y1, x2, y2 });
        }
        ci += 1;
      }
    });
    for (const s of borders) { ctx.strokeStyle = css(s.c); ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
  }

  // ---------- พื้นหลัง ----------
  async function drawBg(ctx, W, H, parts, env) {
    for (const [doc, part] of parts) {
      const bg = dig(doc?.documentElement, "cSld", "bg"); if (!bg) continue;
      const pr = ch(bg, "bgPr"), ref = ch(bg, "bgRef");
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      if (pr) await fillShape(ctx, pr, null, W, H, env, part);
      else if (ref) { ctx.fillStyle = css(color(ref, env)); ctx.fill(); }
      return;
    }
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  }

  async function renderSlide(pkg, slidePath, num, size, scale, base) {
    const sDoc = await pkg.xml(slidePath), sRels = await pkg.rels(slidePath);
    const lPath = relOfType(sRels, "slideLayout")?.target, lDoc = lPath && await pkg.xml(lPath), lRels = lPath ? await pkg.rels(lPath) : {};
    const mPath = relOfType(lRels, "slideMaster")?.target, mDoc = mPath && await pkg.xml(mPath), mRels = mPath ? await pkg.rels(mPath) : {};
    const theme = await loadTheme(pkg, relOfType(mRels, "theme")?.target);
    const clrMap = {}; const cm = dig(mDoc?.documentElement, "clrMap");
    if (cm) for (const a of cm.attributes) clrMap[a.name] = a.value;
    const tree = (d) => dig(d?.documentElement, "cSld", "spTree");
    const env = { pkg, theme, clrMap, rels: { [slidePath]: sRels, [lPath]: lRels, [mPath]: mRels }, slideNum: num,
                  layoutTree: tree(lDoc), masterTree: tree(mDoc), txStyles: dig(mDoc?.documentElement, "txStyles"), defaultText: base.defaultText };
    const cv = document.createElement("canvas"); cv.width = Math.round(size.w * scale); cv.height = Math.round(size.h * scale);
    const ctx = cv.getContext("2d"); ctx.scale(scale, scale); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    await drawBg(ctx, size.w, size.h, [[sDoc, slidePath], [lDoc, lPath], [mDoc, mPath]], env);
    const showMaster = (d) => at(d?.documentElement, "showMasterSp", "1") !== "0";
    if (showMaster(sDoc) && showMaster(lDoc)) for (const c of tree(mDoc)?.children || []) await drawShape(ctx, c, { ...env, skipPh: true }, mPath);
    if (showMaster(sDoc)) for (const c of tree(lDoc)?.children || []) await drawShape(ctx, c, { ...env, skipPh: true }, lPath);
    for (const c of tree(sDoc)?.children || []) await drawShape(ctx, c, env, slidePath);
    return cv;
  }

  async function slideList(pkg) {
    const pres = await pkg.xml("ppt/presentation.xml"), rels = await pkg.rels("ppt/presentation.xml");
    const sz = pres.getElementsByTagNameNS("*", "sldSz")[0];
    const ids = [...pres.getElementsByTagNameNS("*", "sldId")].map(e => rels[e.getAttributeNS(RNS, "id") || at(e, "r:id")]?.target).filter(Boolean);
    return { size: { w: pt(at(sz, "cx", 12192000)), h: pt(at(sz, "cy", 6858000)) }, ids, defaultText: pres.getElementsByTagNameNS("*", "defaultTextStyle")[0] || null };
  }

  async function render(zip, { jsPDF, scale = 2, quality = 0.92, onProgress } = {}) {
    const pkg = new Pkg(zip), info = await slideList(pkg);
    // โหลดฟอนต์ที่ใช้ในไฟล์ก่อนวาด
    const faces = new Set();
    for (const f of Object.keys(zip.files).filter(n => /^ppt\/(slides|slideLayouts|slideMasters|theme)\/[^/]+\.xml$/.test(n))) {
      const s = await zip.file(f).async("string");
      for (const m of s.matchAll(/typeface="([^"+][^"]*)"/g)) faces.add(m[1]);
    }
    await Promise.all([...faces].map(ensureFont));
    await document.fonts.ready;
    const pdf = new jsPDF({ orientation: info.size.w >= info.size.h ? "landscape" : "portrait", unit: "pt", format: [info.size.w, info.size.h], compress: true });
    let n = 0;
    for (let i = 0; i < info.ids.length; i++) {
      const sDoc = await pkg.xml(info.ids[i]);
      if (at(sDoc?.documentElement, "show", "1") === "0") continue;     // สไลด์ที่ซ่อนไว้ไม่ใส่ใน PDF (เหมือน PowerPoint)
      const cv = await renderSlide(pkg, info.ids[i], i + 1, info.size, scale, info);
      if (n++) pdf.addPage([info.size.w, info.size.h], info.size.w >= info.size.h ? "landscape" : "portrait");
      pdf.addImage(cv.toDataURL("image/jpeg", quality), "JPEG", 0, 0, info.size.w, info.size.h, undefined, "FAST");
      onProgress && onProgress(i + 1, info.ids.length);
    }
    return pdf.output("blob");
  }

  // ใช้ทดสอบ: วาดสไลด์เดียวเป็น canvas
  async function renderCanvases(zip, scale = 1) {
    const pkg = new Pkg(zip), info = await slideList(pkg), out = [];
    for (let i = 0; i < info.ids.length; i++) out.push(await renderSlide(pkg, info.ids[i], i + 1, info.size, scale, info));
    return out;
  }
  window.PptxPdf = { render, renderCanvases };
})();

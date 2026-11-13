/* ไฟล์ Model Performance (Tableau) ที่อัปโหลดครั้งเดียว ใช้ร่วมกันทุกเครื่องมือในหมวด Auto Top Funds
   เก็บใน IndexedDB ของเบราว์เซอร์เครื่องนั้นเท่านั้น ไม่ถูกส่งขึ้นเว็บ จำไว้จนกว่าจะอัปโหลดไฟล์ใหม่หรือกดล้าง */
window.UTFIT_ATF = (() => {
  const DB = "utfit", OS = "kv", KEY = "atf-file";
  const open = () => new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  async function run(mode, fn) {
    const db = await open();
    return new Promise((ok, no) => {
      const t = db.transaction(OS, mode), req = fn(t.objectStore(OS));
      t.oncomplete = () => { db.close(); ok(req && req.result); };
      t.onerror = () => { db.close(); no(t.error); };
    });
  }
  const listeners = [];
  return {
    /** {text, name, savedAt(ms)} หรือ null */
    async get() { try { return (await run("readonly", s => s.get(KEY))) || null; } catch (e) { return null; } },
    async set(text, name) {
      const o = { text, name, savedAt: Date.now() };
      try { await run("readwrite", s => s.put(o, KEY)); } catch (e) {}
      listeners.forEach(f => f(o)); return o;
    },
    async clear() { try { await run("readwrite", s => s.delete(KEY)); } catch (e) {} listeners.forEach(f => f(null)); },
    onChange(f) { listeners.push(f); },
  };
})();

/* Beepin Docx — paste/AI → clean preview → .docx (native OMML) + PDF */
const $ = (s) => document.querySelector(s) || NULL_EL;
/* Null-object: a missing element degrades to a no-op instead of killing the script */
const NULL_EL = new Proxy(function () {}, {
  get(t, k) {
    if (k === "then") return undefined;
    if (k === "style" || k === "dataset") return {};
    if (k === "classList") return { add() {}, remove() {}, toggle() {}, contains: () => false };
    if (k === "children" || k === "childNodes") return [];
    if (k === "textContent" || k === "value" || k === "innerHTML") return "";
    if (k === "hidden" || k === "checked") return false;
    if (k === Symbol.toPrimitive) return () => "";
    return (...a) => NULL_EL;
  },
  set() { return true; },
  apply() { return NULL_EL; }
});
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); };
const CHECK_SVG = '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

/* ---------- Theme gallery: circular reveal from the menu choice ---------- */
const THEMES = [
  { value: "light", label: "Light" }, { value: "dark", label: "Dark" },
  { value: "amoled", label: "AMOLED" }, { value: "mono", label: "Mono" },
  { value: "forest", label: "Forest" }
];
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  return THEMES.some(x => x.value === t) ? t : "dark";
}
function paintToggle() {
  const light = currentTheme() === "light";
  const b = $("#themeToggle");
  b.setAttribute("aria-pressed", String(light));
  b.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
}
(function initTheme() {
  let s = "dark";
  try { s = localStorage.getItem("bd_theme") || "dark"; } catch {}
  if (!THEMES.some(x => x.value === s)) s = "dark"; // night/caffeine → dark
  document.documentElement.dataset.theme = s;
  try { localStorage.setItem("bd_theme", s); } catch {}
  paintToggle();
})();
function setTheme(n, ev) {
  if (n === currentTheme() || !THEMES.some(x => x.value === n)) return;
  const apply = () => {
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem("bd_theme", n); } catch {}
    paintToggle();
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keyboard = ev && ev.detail === 0; // Enter/Space: no pointer position → instant
  if (!ev || keyboard || reduce || !document.startViewTransition) { apply(); return; } // fallback: instant
  const x = ev.clientX, y = ev.clientY;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  try {
    const tr = document.startViewTransition(apply);
    tr.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 900, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => {});
  } catch { apply(); }
}
makeDropdown("ddTheme", {
  options: THEMES, value: currentTheme(),
  onChange: (v, ev) => setTheme(v, ev)
});
$("#themeToggle").addEventListener("click", (e) => setTheme(currentTheme() === "light" ? "dark" : "light", e));

/* ---------- Tabs ---------- */
const tabs = [...document.querySelectorAll(".tab")];
tabs.forEach((b) => b.onclick = () => {
  tabs.forEach(x => { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
  b.classList.add("active"); b.setAttribute("aria-selected", "true");
  document.querySelectorAll(".tabpage").forEach(p => p.classList.remove("show"));
  $("#page-" + b.dataset.tab).classList.add("show");
});

/* ---------- Author modal ---------- */
const modal = $("#authorModal"), modalCard = modal.querySelector(".modal");
function openAuthor() { modal.classList.add("show"); }
function closeAuthor() {
  modalCard.classList.add("closing");
  setTimeout(() => { modal.classList.remove("show"); modalCard.classList.remove("closing"); }, 220);
}
$("#btnAuthor").onclick = openAuthor;
$("#authorClose").onclick = closeAuthor;
modal.onclick = (e) => { if (e.target === modal) closeAuthor(); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("show")) closeAuthor(); });

/* ---------- Sample (shows full coverage) ---------- */
const SAMPLE = `## Section A — Short Answers (2 marks each)

Q1. Solve $x^2 - 5x + 6 = 0$ by factorisation. [2]

Q2. If $\\sin A = \\frac{3}{5}$, find $\\cos A$. Also evaluate $\\sqrt{16} + \\sqrt[3]{27}$. [2]

Q3. Find $\\lim_{x \\to 0} \\frac{\\sin x}{x}$ and $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$. [3]

## Section B — Long Answers

Q4. Prove $$\\sin^2 \\theta + \\cos^2 \\theta = 1$$ and evaluate $\\int_0^{\\pi} \\sin x \\, dx$. [5]

Q5. Given $$A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$$ find $\\det A$ and $A^{-1} = \\frac{1}{\\det A}\\begin{pmatrix} 4 & -2 \\\\ -3 & 1 \\end{pmatrix}$. [4]

Q6. Define $$f(x) = \\begin{cases} x^2, & \\text{if } x \\geq 0 \\\\ -x, & \\text{otherwise} \\end{cases}$$ Sketch it. If $\\hat{x} = 5$ and $\\vec{v} = \\binom{n}{k}$, state $\\overline{AB}$. [4]

> All questions are compulsory. Show all steps clearly.`;
$("#btnSample").onclick = () => { $("#rawInput").value = SAMPLE; syncCount(); render(); };
const EMPTY_PAPER = '<div class="empty"><div class="empty-icon">✦</div><p>Paste AI text → Clean & Preview — then click here to edit</p></div>';
$("#btnClearPaste").onclick = () => { $("#rawInput").value = ""; syncCount(); toast("Paste cleared"); };
$("#btnClearPaper").onclick = () => { $("#paperBody").innerHTML = EMPTY_PAPER; toast("Paper cleared"); };
$("#rawInput").addEventListener("input", syncCount);
function syncCount() {
  const v = $("#rawInput").value;
  $("#statWords").textContent = (v.trim() ? v.trim().split(/\s+/).length : 0) + " words";
}

/* ---------- Normalize ---------- */
function normalizeAIText(raw) {
  let t = (raw || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  t = t.replace(/(?:^|\n)\s*(?:Question|Q\.?|Ques\.?)\s*(\d+)\s*[:.)\-–—]?\s*/gi, "\nQ$1. ");
  t = t.replace(/(?:^|\n)\s*(\d{1,2})\s*[.)]\s+(?=[A-Z])/g, "\nQ$1. ");
  t = t.replace(/[\[\(]\s*(\d{1,3})\s*(?:marks?|m)?\s*[\]\)]\s*$/gim, " [$1 marks]");
  t = t.replace(/\\\(\s*/g, "$").replace(/\s*\\\)/g, "$").replace(/\\\[\s*/g, "$$").replace(/\s*\\\]/g, "$$");
  t = t.split("\n").map(line => {
    const s = line.trim();
    if (/^section\s+[a-d]/i.test(s) && !s.startsWith("#")) return "## " + s;
    return line;
  }).join("\n");
  return t.trim();
}

/* ---------- Header ---------- */
function syncHeader() {
  $("#pSchool").textContent = $("#sSchool").value || "School Name";
  $("#pTitle").textContent = $("#sTitle").value || "Examination";
  $("#pMeta").textContent = `${$("#sSub").value}  •  ${$("#sMeta").value}`;
  $("#pInstr").textContent = $("#sInstr").value || "";
  $("#paperHead").style.display = $("#cHeader").checked ? "" : "none";
  $("#pFootL").textContent = "Beepin Docx";
}
["sSchool","sTitle","sSub","sMeta","sInstr","cHeader"].forEach(id => $("#"+id).addEventListener("input", syncHeader));

/* ---------- Preview ---------- */
function render() {
  syncHeader();
  const raw = $("#rawInput").value;
  if (!raw.trim()) return;
  const clean = normalizeAIText(raw);
  let html = "";
  try { html = marked.parse(clean, { breaks: true }); }
  catch { html = "<p>" + clean.replace(/\n/g, "<br>") + "</p>"; }
  const body = $("#paperBody");
  body.innerHTML = html.replace(/\[(\d{1,3}\s*marks?)\]/gi, '<span class="marks" contenteditable="false">[$1]</span>');
  [...body.children].forEach(el => { if (/^Q\d+\./.test(el.textContent.trim())) el.classList.add("q"); });
  wrapMathSrc(body);
  try {
    renderMathInElement(body, { delimiters: [
      { left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }
    ], throwOnError: false });
  } catch {}
  toast("Preview updated — click the paper to edit it");
}
$("#btnClean").onclick = render;

/* keep original LaTeX on each formula so exports stay native + edits can't break math */
function wrapMathSrc(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || n.nodeValue.indexOf("$") < 0) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (p && (p.closest("pre,code") || p.closest(".math-src"))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  nodes.forEach(n => {
    const txt = n.nodeValue;
    let last = 0, m, hit = false;
    const frag = document.createDocumentFragment();
    re.lastIndex = 0;
    while ((m = re.exec(txt))) {
      hit = true;
      if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      const tok = m[0];
      const sp = document.createElement("span");
      sp.className = "math-src";
      sp.dataset.latex = tok.startsWith("$$") ? tok.slice(2, -2) : tok.slice(1, -1);
      sp.setAttribute("contenteditable", "false");
      sp.textContent = tok;
      frag.appendChild(sp);
      last = m.index + tok.length;
    }
    if (hit) {
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      n.parentNode.replaceChild(frag, n);
    }
  });
}

/* edit-in-place: format bar + paste-as-plain-text */
document.querySelectorAll(".fmt [data-cmd]").forEach(b => {
  b.addEventListener("mousedown", e => e.preventDefault());
  b.addEventListener("click", () => { $("#paperBody").focus(); document.execCommand(b.dataset.cmd, false, null); });
});
$("#paperBody").addEventListener("paste", e => {
  e.preventDefault();
  const t = (e.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, t);
});

/* ---------- Zoom ---------- */
let zoom = 90, fitZoom = 1;
function computeFit() {
  const scroller = document.querySelector(".paper-scroll");
  const avail = scroller ? scroller.clientWidth - 4 : 794;
  fitZoom = Math.min(1, avail / 794); // shrink whole sheet to fit, margins stay proportional
}
function applyZoom() {
  computeFit();
  const eff = Math.max(0.2, Math.min(1.6, (zoom / 100) * fitZoom));
  $("#zoomLbl").textContent = zoom + "%";
  const paper = $("#paper");
  if ("zoom" in paper.style) { paper.style.zoom = eff; paper.style.transform = ""; } // reflows layout
  else paper.style.transform = `scale(${eff})`; // fallback
}
window.addEventListener("resize", applyZoom);
$("#zoomIn").onclick = () => { zoom = Math.min(140, zoom + 10); applyZoom(); };
$("#zoomOut").onclick = () => { zoom = Math.max(60, zoom - 10); applyZoom(); };
applyZoom();

/* ---------- PDF (via print — full fidelity, no backend) ---------- */
document.title = "beepin-paper";
$("#btnPdf").onclick = () => {
  if (!$("#rawInput").value.trim()) { toast("Nothing to export yet"); return; }
  toast("Choose “Save as PDF” in the print dialog");
  setTimeout(() => window.print(), 350);
};
/* ---------- More-formats menu ---------- */
const ddExport = $("#ddExport"), btnMore = $("#btnMore"), exportMenu = ddExport.querySelector(".dd-menu");
function closeExportMenu() { btnMore.setAttribute("aria-expanded", "false"); exportMenu.classList.remove("open"); exportMenu.hidden = true; }
btnMore.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = exportMenu.hidden;
  btnMore.setAttribute("aria-expanded", String(open));
  if (open) { exportMenu.hidden = false; exportMenu.classList.add("open"); }
  else closeExportMenu();
});
document.addEventListener("click", (e) => { if (!exportMenu.hidden && !ddExport.contains(e.target)) closeExportMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !exportMenu.hidden) { closeExportMenu(); btnMore.focus(); } });
exportMenu.querySelectorAll(".menu-item").forEach(b => b.addEventListener("click", () => {
  closeExportMenu();
  ({ print: () => window.print(), doc: exportDoc, pptx: exportPptx, md: exportMd, html: exportHtml })[b.dataset.fmt]();
}));

/* ---------- AI Generate ---------- */
/* custom dropdown: tonal trigger, soft-glass menu, selected fill + check */
function makeDropdown(rootId, opts) {
  let { options, value, onChange } = opts;
  const root = document.getElementById(rootId);
  if (!root || !root.querySelector) return { get value() { return value; }, setOptions() {}, setValue() {} };
  const btn = root.querySelector(".dd-btn"), val = root.querySelector(".dd-val"), menu = root.querySelector(".dd-menu");
  if (!btn || !menu) return { get value() { return value; }, setOptions() {}, setValue() {} };
  let open = false;
  function paint() { if (val) val.textContent = (options.find(o => o.value === value) || {}).label || value; }
  function render() {
    menu.innerHTML = "";
    options.forEach(opt => {
      const it = document.createElement("div");
      it.className = "dd-item";
      it.setAttribute("role", "option");
      it.setAttribute("aria-selected", opt.value === value ? "true" : "false");
      const lb = document.createElement("span");
      lb.className = "dd-label"; lb.textContent = opt.label;
      it.append(lb); it.insertAdjacentHTML("beforeend", CHECK_SVG);
      it.addEventListener("click", (e) => { setValue(opt.value, e); close(); btn.focus(); });
      menu.appendChild(it);
    });
  }
  function setValue(v, ev) {
    if (value === v) return;
    value = v; paint(); render(); onChange(v, ev);
  }
  function close() { open = false; btn.setAttribute("aria-expanded", "false"); menu.classList.remove("open"); menu.hidden = true; }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    open = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) { menu.hidden = false; menu.classList.add("open"); }
    else close();
  });
  document.addEventListener("click", (e) => { if (open && !root.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { close(); btn.focus(); } });
  render(); paint();
  return {
    get value() { return value; },
    setOptions(list) {
      options = list;
      if (!options.some(o => o.value === value)) value = options[0].value;
      render(); paint();
    },
    setValue(v) { setValue(v); }
  };
}
const GEMINI_MODELS = [{ value: "gemini-1.5-flash", label: "gemini-1.5-flash" }, { value: "gemini-1.5-pro", label: "gemini-1.5-pro" }];
const GROQ_MODELS = [{ value: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile" }, { value: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" }];
const PREF_MODELS = {
  gemini: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
};
let aiProvider = "auto", aiModel = "gemini-1.5-flash";
const discovered = { gemini: null, groq: null };   // short-lived in-memory catalogue
const verified = JSON.parse(localStorage.getItem("bd_verified") || "{}");
function saveVerified() { try { localStorage.setItem("bd_verified", JSON.stringify(verified)); } catch {} }
const ddModel = makeDropdown("ddModel", { options: GEMINI_MODELS, value: aiModel, onChange: (v) => { aiModel = v; } });
makeDropdown("ddProvider", {
  options: [{ value: "auto", label: "Auto" }, { value: "gemini", label: "Gemini" }, { value: "groq", label: "Groq" }], value: aiProvider,
  onChange: (v) => { aiProvider = v; }
});
try { localStorage.removeItem("bd_key_gemini"); localStorage.removeItem("bd_key_groq"); } catch {}

/* ---------- one frontend entry: askAI({provider, model, messages, signal}) ---------- */
async function askAI({ provider = "auto", model, messages, signal, timeout = 55000, maxTokens, vision } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  const t0 = performance.now();
  try {
    const r = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, messages, maxTokens, vision: !!vision }),
      signal: ctrl.signal
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = new Error(j.error || ("Server error " + r.status));
      e.code = j.code || "SERVER_" + r.status;
      throw e;
    }
    j.ms = Math.round(performance.now() - t0);
    return j; // {text, provider, model, ms}
  } catch (e) {
    if (e.name === "AbortError") { const a = new Error("Cancelled"); a.code = "CANCELLED"; throw a; }
    throw e;
  } finally { clearTimeout(t); }
}

/* ---------- provider settings: keys, discovery, bounded verification ---------- */
$("#setToggle").addEventListener("click", () => {
  const btn = $("#setToggle"), reg = $("#setRegion");
  setExpanded(reg, btn, reg.hidden);
});
document.querySelectorAll('input[name="defprov"]').forEach(r => r.addEventListener("change", async () => {
  try {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultProvider: r.value }) });
    toast("Default provider: " + r.value);
  } catch { toast("Could not save default"); }
}));
async function refreshStatus() {
  try {
    const j = await (await fetch("/api/status")).json();
    $("#ks-gemini").textContent = j.gemini ? "Key saved" : "No key";
    $("#ks-groq").textContent = j.groq ? "Key saved" : "No key";
    document.querySelectorAll('input[name="defprov"]').forEach(r => { r.checked = r.value === j.defaultProvider; });
  } catch {}
}
function keyCard(p) {
  const st = (msg, cls) => { const el = $("#st-" + p); el.className = "status" + (cls ? " " + cls : ""); el.textContent = msg; };
  $("#show-" + p).onclick = () => { // explicit click only
    const inp = $("#key-" + p);
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    $("#show-" + p).setAttribute("aria-label", (show ? "Hide " : "Show ") + p + " key");
  };
  $("#clear-" + p).onclick = async () => { // explicit click only
    $("#key-" + p).value = "";
    try { await fetch("/api/keys?provider=" + p, { method: "DELETE" }); } catch {}
    discovered[p] = null; delete verified[p]; saveVerified();
    refreshStatus(); st("Cleared.");
  };
  $("#save-" + p).onclick = async () => {
    const key = $("#key-" + p).value.trim();
    if (!key) { st("Paste a key first.", "err"); return; }
    st("Saving…");
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p, key }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Save failed");
      $("#key-" + p).value = ""; // never keep the secret in the page
      refreshStatus(); st("Saved on server (memory only).", "ok");
    } catch (e) { st(e.message, "err"); }
  };
  $("#disc-" + p).onclick = async () => {
    st("Discovering models…");
    try {
      const r = await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      discovered[p] = j.models.map(m => m.id);
      st(`Found ${discovered[p].length} model${discovered[p].length === 1 ? "" : "s"}${j.cached ? " (cached)" : ""}.`, "ok");
      if ((aiProvider === p) || (aiProvider === "auto" && p === "gemini")) {
        ddModel.setOptions(discovered[p].map(id => ({ value: id, label: id })));
        if (discovered[p].length) { aiModel = discovered[p][0]; ddModel.setValue(aiModel); }
      }
    } catch (e) { st(e.message, "err"); }
  };
  let cancelFn = null;
  $("#test-" + p).onclick = async () => {
    const cancelBtn = $("#cancel-" + p);
    st("Verifying…");
    cancelBtn.hidden = false;
    const ctrl = new AbortController();
    cancelFn = () => ctrl.abort();
    const t0 = performance.now();
    try {
      if (!discovered[p]) {
        const r = await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: p }), signal: ctrl.signal });
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        discovered[p] = j.models.map(m => m.id);
      }
      // one candidate only: preferred known-good ∩ discovered, else first — never test them all
      const cand = PREF_MODELS[p].find(m => discovered[p].includes(m)) || discovered[p][0];
      if (!cand) throw new Error("No models available for this key.");
      const j = await askAI({ provider: p, model: cand,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        signal: ctrl.signal, timeout: 25000, maxTokens: 16 });
      verified[p] = cand; saveVerified();
      // optionally try the other provider if this one has no working model
      st(`Verified · ${cand} · ${((performance.now() - t0) / 1000).toFixed(1)}s`, "ok");
      ddModel.setOptions(discovered[p].map(id => ({ value: id, label: id })));
      aiModel = cand; ddModel.setValue(cand);
    } catch (e) {
      const code = e.code ? ` [${e.code}]` : "";
      st("Failed: " + e.message + code + " — you can try the other provider.", "err");
    } finally { cancelBtn.hidden = true; cancelFn = null; }
  };
  $("#cancel-" + p).onclick = () => { if (cancelFn) cancelFn(); };
}
keyCard("gemini"); keyCard("groq"); refreshStatus();
function servedLine(j) {
  const el = $("#servedBy");
  el.hidden = false;
  el.textContent = `Answered by ${j.provider} · ${j.model}${j.ms ? ` · ${(j.ms / 1000).toFixed(1)}s` : ""}`;
}
function buildPrompt() {
  return `Create a school question paper in clean Markdown. Subject: ${$("#fSubject").value}, ${$("#fClass").value}. ` +
    `Topics: ${$("#fTopics").value}. Total ~${$("#fMarks").value} marks, Time ${$("#fTime").value}. ` +
    `Rules: headings ## Section A/B, each question as "Q1. ... [N marks]". Math in $...$ / $$...$$ LaTeX. Tables in Markdown. Code in fences. End with Instructions blockquote. No preamble.`;
}
$("#btnGenerate").onclick = async () => {
  const st = $("#aiStatus");
  $("#genLabel").textContent = "Generating…"; st.className = "status"; st.textContent = "Calling " + aiProvider + "…";
  try {
    const j = await askAI({ provider: aiProvider, model: aiModel, messages: [
      { role: "system", content: "You write clean Markdown exam papers with LaTeX math." },
      { role: "user", content: buildPrompt() }
    ]});
    if (!j.text.trim()) throw new Error("Empty response — try again.");
    $("#rawInput").value = j.text; syncCount(); render(); tabs[0].click();
    servedLine(j);
    st.className = "status ok"; st.textContent = "Done.";
  } catch (e) { st.className = "status err"; st.textContent = e.message + (e.code ? ` [${e.code}]` : ""); }
  finally { $("#genLabel").textContent = "Generate with AI"; }
};

/* ================= FULL CONVERSION ENGINE =================
   LaTeX → native docx OMML (verified against docx@8.5.0 UMD exports):
   Math, MathRun, MathFraction, MathRadical(+degree), MathSuperScript,
   MathSubScript, MathSubSuperScript, MathSum, MathIntegral, MathFunction,
   MathRound/Square/Curly/AngledBrackets. Tables via Table+TableBorders. */
const SYM = {
  alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",varepsilon:"ε",zeta:"ζ",eta:"η",
  theta:"θ",vartheta:"ϑ",iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",
  pi:"π",varpi:"ϖ",rho:"ρ",varrho:"ϱ",sigma:"σ",varsigma:"ς",tau:"τ",upsilon:"υ",
  phi:"φ",varphi:"ϕ",chi:"χ",psi:"ψ",omega:"ω",
  Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Pi:"Π",Sigma:"Σ",Phi:"Φ",Psi:"Ψ",Omega:"Ω",
  infty:"∞",times:"×",div:"÷",pm:"±",mp:"∓",cdot:"·",ast:"∗",star:"⋆",
  leq:"≤",geq:"≥",neq:"≠",approx:"≈",equiv:"≡",propto:"∝",sim:"∼",cong:"≈",
  ll:"≪",gg:"≫",subset:"⊂",supset:"⊃",subseteq:"⊆",supseteq:"⊇",in:"∈",ni:"∋",notin:"∉",
  cup:"∪",cap:"∩",setminus:"∖",emptyset:"∅",forall:"∀",exists:"∃",neg:"¬",
  land:"∧",lor:"∨",oplus:"⊕",otimes:"⊗",odot:"⊙",
  to:"→",rightarrow:"→",leftarrow:"←",leftrightarrow:"↔",Rightarrow:"⇒",Leftarrow:"⇐",
  Leftrightarrow:"⇔",mapsto:"↦",uparrow:"↑",downarrow:"↓",infty2:"∞",
  circ:"∘",degree:"°",prime:"′",ldots:"…",vdots:"⋮",ddots:"⋱",cdots:"⋯",
  dots:"…",hellip:"…",partial:"∂",nabla:"∇",surd:"√",angle:"∠",perp:"⊥",
  parallel:"∥",mid:"∣",lvert:"|",rvert:"|",Vert:"‖",
  sum:"∑",prod:"∏",coprod:"∐",int:"∫",oint:"∮",iint:"∬",iiint:"∭",
  bigcup:"⋃",bigcap:"⋂",bigvee:"⋁",bigwedge:"⋀",bigoplus:"⨁",bigotimes:"⨂",
  sqrt2:"√",aleph:"ℵ",hbar:"ℏ",ell:"ℓ",Re:"ℜ",Im:"ℑ",wp:"℘",
  dotsb:"⋯",dotsc:"…",dotsi:"⋯",dotsm:"⋯",dotso:"…"
};
const FUNC_NAMES = ["sin","cos","tan","sec","csc","cot","sinh","cosh","tanh","log","ln","lg","exp","arg","deg","det","gcd","min","max","sup","inf","lim","limsup","liminf","Pr"];
const COMB = { hat:"\u0302",check:"\u030C",tilde:"\u0303",acute:"\u0301",grave:"\u0300",dot:"\u0307",ddot:"\u0308",dddot:"\u0307\u0307",breve:"\u0306",bar:"\u0304",ring:"\u030A",vec:"\u20D7",widevec:"\u20D7",widehat:"\u0302",widetilde:"\u0303",overline:"\u0305",underline:"\u0332" };
function mathReady() { return typeof docx !== "undefined" && docx.Math && docx.MathRun && docx.MathFraction; }
function MR(t) { return new docx.MathRun(String(t)); }

function splitTop(s, sep) { // split on sep ignoring {...}
  const parts = []; let d = 0, cur = "";
  for (let k = 0; k < s.length; k++) {
    if (s.startsWith(sep, k) && d === 0) { parts.push(cur); cur = ""; k += sep.length - 1; continue; }
    if (s[k] === "{") d++; if (s[k] === "}") d--;
    cur += s[k];
  }
  parts.push(cur); return parts;
}

function latexToMathKids(src) {
  let s = String(src);
  s = s.replace(/\\(left|right|middle|big|Big|bigg|Bigg)\s*/g, "");
  const kids = [];
  let i = 0, buf = "";
  const flush = () => { if (buf) { kids.push(MR(buf)); buf = ""; } };
  function readBrace() {
    if (s[i] !== "{") return null;
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "{") d++;
      if (s[j] === "}") { d--; if (d === 0) { const out = s.slice(i + 1, j); i = j + 1; return out; } }
    }
    return null;
  }
  function readBracket() {
    if (s[i] !== "[") return null;
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "[") d++;
      if (s[j] === "]") { d--; if (d === 0) { const out = s.slice(i + 1, j); i = j + 1; return out; } }
    }
    return null;
  }
  function readCmd() {
    const m = s.slice(i).match(/^\\([a-zA-Z]+|.)/);
    if (!m) return null;
    i += m[0].length; return m[1];
  }
  function kidsOf(str) { return latexToMathKids(str); }
  function scriptsAfter() {
    let sub = null, sup = null;
    for (let guard = 0; guard < 2; guard++) {
      while (s[i] === " ") i++;
      if (s[i] === "_" || s[i] === "^") {
        const isSub = s[i] === "_"; i++;
        while (s[i] === " ") i++;
        let v;
        if (s[i] === "{") v = readBrace(); else { v = s[i] || ""; i++; }
        if (isSub) sub = v; else sup = v;
      } else break;
    }
    return { sub, sup };
  }
  function attachScripts(baseKids, baseText, ss) {
    if (ss.sub != null && ss.sup != null && docx.MathSubSuperScript)
      return [new docx.MathSubSuperScript({ children: baseKids, subScript: kidsOf(ss.sub), superScript: kidsOf(ss.sup) })];
    if (ss.sub != null && docx.MathSubScript)
      return [new docx.MathSubScript({ children: baseKids, subScript: kidsOf(ss.sub) })];
    if (ss.sup != null && docx.MathSuperScript)
      return [new docx.MathSuperScript({ children: baseKids, superScript: kidsOf(ss.sup) })];
    return baseKids; // no scripts → plain base, never null
  }
  function applyCombining(str, comb) {
    return str.split("").map(c => /[{}]/.test(c) ? c : c + comb).join("");
  }
  while (i < s.length) {
    const ch = s[i];
    if (ch === "%") break; // LaTeX comment
    if (ch === "\\") {
      const cmd = readCmd();
      if (cmd === null) break;
      if (cmd === " " || cmd === ",") { buf += " "; continue; }
      if (";:!".includes(cmd)) { buf += cmd === "!" ? "" : " "; continue; }
      if (["quad", "qquad", "\\", "newline"].includes(cmd)) { buf += cmd === "\\" || cmd === "newline" ? " " : "  "; continue; }
      if (["text", "mathrm", "mathit", "mathbf", "boldsymbol", "mathsf", "mathtt", "mathcal", "mathscr", "mathsf"].includes(cmd)) {
        while (s[i] === " ") i++;
        const g = s[i] === "{" ? readBrace() : (s[i++] || "");
        flush(); kids.push(MR(g ?? "")); continue;
      }
      if (cmd === "mathbb") {
        while (s[i] === " ") i++;
        const g = (s[i] === "{" ? readBrace() : (s[i++] || "")) || "";
        const dbl = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ" };
        flush(); kids.push(MR(dbl[g] || g)); continue;
      }
      if (["frac", "dfrac", "tfrac", "cfrac"].includes(cmd)) {
        flush();
        while (s[i] === " ") i++;
        const a = s[i] === "{" ? readBrace() : (s[i++] || "");
        while (s[i] === " ") i++;
        const b = s[i] === "{" ? readBrace() : (s[i++] || "");
        kids.push(new docx.MathFraction({ numerator: kidsOf(a ?? ""), denominator: kidsOf(b ?? "") }));
        continue;
      }
      if (cmd === "binom") {
        flush();
        while (s[i] === " ") i++;
        const a = s[i] === "{" ? readBrace() : (s[i++] || "");
        while (s[i] === " ") i++;
        const b = s[i] === "{" ? readBrace() : (s[i++] || "");
        kids.push(new docx.MathRoundBrackets({ children: [new docx.MathFraction({ numerator: kidsOf(a ?? ""), denominator: kidsOf(b ?? "") })] }));
        continue;
      }
      if (cmd === "sqrt") {
        flush();
        while (s[i] === " ") i++;
        const deg = s[i] === "[" ? readBracket() : null;
        while (s[i] === " ") i++;
        const a = s[i] === "{" ? readBrace() : (s[i++] || "");
        if (deg != null) kids.push(new docx.MathRadical({ children: kidsOf(a ?? ""), degree: kidsOf(deg) }));
        else kids.push(new docx.MathRadical({ children: kidsOf(a ?? "") }));
        continue;
      }
      if (["sum", "prod", "coprod"].includes(cmd)) {
        flush();
        const ss = scriptsAfter();
        const base = { sum: "∑", prod: "∏", coprod: "∐" }[cmd];
        if (cmd === "sum") kids.push(new docx.MathSum({ children: [MR(" ")], subScript: ss.sub != null ? kidsOf(ss.sub) : undefined, superScript: ss.sup != null ? kidsOf(ss.sup) : undefined }));
        else kids.push(...attachScripts([MR(base)], base, ss));
        continue;
      }
      if (["int", "oint", "iint", "iiint", "oiiint"].includes(cmd)) {
        flush();
        const ss = scriptsAfter();
        if (cmd === "int") kids.push(new docx.MathIntegral({ children: [MR(" ")], subScript: ss.sub != null ? kidsOf(ss.sub) : undefined, superScript: ss.sup != null ? kidsOf(ss.sup) : undefined }));
        else kids.push(...attachScripts([MR(SYM[cmd] || "∫")], "", ss));
        continue;
      }
      if (["bigcup", "bigcap", "bigvee", "bigwedge", "bigoplus", "bigotimes", "bigodot", "bigsqcup", "biguplus"].includes(cmd)) {
        flush();
        const ss = scriptsAfter();
        kids.push(...attachScripts([MR(SYM[cmd] || cmd)], "", ss));
        continue;
      }
      if (FUNC_NAMES.includes(cmd)) {
        flush();
        const ss = scriptsAfter();
        while (s[i] === " ") i++;
        let arg = null;
        if (s[i] === "{") arg = readBrace();
        else if (s[i] && /[a-zA-Z0-9(]/.test(s[i]) && (ss.sub == null && ss.sup == null)) { arg = s[i]; i++; }
        let fn;
        if (arg != null) fn = new docx.MathFunction({ name: [MR(cmd)], children: kidsOf(arg) });
        else fn = MR(cmd);
        if ((ss.sub != null || ss.sup != null) && typeof fn !== "string") {
          const w = attachScripts([fn], "", ss);
          if (w) { kids.push(...w); continue; }
        }
        kids.push(fn); continue;
      }
      if (COMB[cmd] !== undefined) {
        while (s[i] === " ") i++;
        let base = s[i] === "{" ? readBrace() : (s[i] ? s[i++] : "");
        base = base ?? "";
        if (buf) { buf = applyCombining(buf, COMB[cmd]); }
        else if (base) { flush(); kids.push(MR(applyCombining(base, COMB[cmd]))); }
        continue;
      }
      if (cmd === "overline" || cmd === "underline" || cmd === "overbrace" || cmd === "underbrace") {
        while (s[i] === " ") i++;
        const g = (s[i] === "{" ? readBrace() : (s[i++] || "")) || "";
        const comb = (cmd === "underline" || cmd === "underbrace") ? "\u0332" : "\u0305";
        flush(); kids.push(MR(applyCombining(g, comb))); continue;
      }
      if (cmd === "boxed") {
        while (s[i] === " ") i++;
        const g = s[i] === "{" ? readBrace() : (s[i++] || "");
        flush(); kids.push(new docx.MathSquareBrackets({ children: kidsOf(g ?? "") })); continue;
      }
      if (["cancel", "bcancel", "xcancel"].includes(cmd)) {
        while (s[i] === " ") i++;
        const g = (s[i] === "{" ? readBrace() : (s[i++] || "")) || "";
        flush(); kids.push(MR(applyCombining(g, "\u0338"))); continue;
      }
      if (cmd === "phantom" || cmd === "hphantom" || cmd === "vphantom") {
        while (s[i] === " ") i++;
        if (s[i] === "{") readBrace(); else if (s[i]) i++;
        buf += " "; continue;
      }
      if (["overset", "underset", "stackrel"].includes(cmd)) {
        while (s[i] === " ") i++;
        const a = s[i] === "{" ? readBrace() : (s[i++] || "");
        while (s[i] === " ") i++;
        const b = s[i] === "{" ? readBrace() : (s[i++] || "");
        flush(); kids.push(MR(`(${(cmd === "underset" ? b : a) ?? ""})`)); buf += (b ?? ""); continue;
      }
      if (["begin", "end"].includes(cmd)) {
        // environments handled at block level; inline: linearize matrix/cases content
        while (s[i] === " ") i++;
        const env = s[i] === "{" ? readBrace() : "";
        if (cmd === "begin" && env) {
          const rest = s.slice(i);
          const endTag = `\\end{${env}}`;
          const at = rest.indexOf(endTag);
          const body = at >= 0 ? rest.slice(0, at) : rest;
          if (at >= 0) i += at + endTag.length; else i = s.length;
          flush();
          kids.push(...linearEnv(env, body));
        }
        continue;
      }
      if (["hline", "hdashline", "tag", "label", "nonumber", "displaystyle", "limits", "nolimits"].includes(cmd)) {
        if (cmd === "tag") { while (s[i] === " ") i++; if (s[i] === "{") readBrace(); }
        continue;
      }
      if (SYM[cmd] !== undefined) { buf += SYM[cmd]; continue; }
      if (/^(rm|it|bf|sf|tt)$/.test(cmd)) continue;
      buf += cmd; continue; // unknown command → literal, never lost
    }
    else if (ch === "^" || ch === "_") {
      const isSup = ch === "^"; i++;
      while (s[i] === " ") i++;
      let scr;
      if (s[i] === "{") scr = readBrace(); else { scr = s[i] || ""; i++; }
      const scrKids = kidsOf(scr ?? "");
      if (buf) { const base = buf; buf = ""; flush(); kids.push(...attachScripts([MR(base)], base, isSup ? { sup: scr, sub: null } : { sub: scr, sup: null }) || [MR(base)]); }
      else {
        const prev = kids.pop();
        if (prev) {
          const w = isSup
            ? (docx.MathSuperScript ? new docx.MathSuperScript({ children: [prev], superScript: scrKids }) : null)
            : (docx.MathSubScript ? new docx.MathSubScript({ children: [prev], subScript: scrKids }) : null);
          kids.push(w || prev);
          if (!w) scrKids.forEach(k => kids.push(k));
        } else scrKids.forEach(k => kids.push(k));
      }
      continue;
    }
    else if (ch === "{") { const g = readBrace(); if (g !== null) { const k = kidsOf(g); if (buf) { flush(); } k.forEach(x => kids.push(x)); continue; } }
    else if (ch === "}") { i++; continue; }
    else if (ch === "&") { buf += "  "; i++; continue; }
    else if (ch === "~") { buf += " "; i++; continue; }
    else if (ch === "$") { i++; continue; }
    else { buf += ch; i++; continue; }
  }
  flush();
  return kids.length ? kids : [MR("")];
}

function matrixBodyToTable(env, body) {
  const rows = splitTop(body, "\\\\").map(r => splitTop(r, "&").map(c => c.trim()));
  return rows.filter(r => r.join("").trim() !== "");
}
function linearEnv(env, body) {
  // inline fallback using REAL growing brackets — editable, compact
  const e = env.replace("*", "");
  if (/^(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|array|smallmatrix)$/.test(e)) {
    const rows = matrixBodyToTable(e, body);
    const txt = rows.map(r => r.join("  ")).join(";  ");
    const inner = latexToMathKids(txt);
    if (e === "pmatrix") return [new docx.MathRoundBrackets({ children: inner })];
    if (e === "bmatrix") return [new docx.MathSquareBrackets({ children: inner })];
    if (e === "Bmatrix") return [new docx.MathCurlyBrackets({ children: inner })];
    if (e === "vmatrix" || e === "Vmatrix") return [MR("‖"), ...inner, MR("‖")];
    return inner;
  }
  if (e === "cases" || e === "dcases") {
    const rows = matrixBodyToTable(e, body);
    const txt = rows.map(r => r.join("  ")).join(";  ");
    return [new docx.MathCurlyBrackets({ children: latexToMathKids(txt) })];
  }
  if (/^(align|aligned|gather|gathered|multline|equation|split)$/.test(e)) {
    const rows = splitTop(body, "\\\\").map(r => r.replace(/&/g, " ").trim()).filter(Boolean);
    const out = [];
    rows.forEach((r, k) => { if (k) out.push(MR("   ")); latexToMathKids(r).forEach(x => out.push(x)); });
    return out;
  }
  return latexToMathKids(body);
}

function latexFallbackText(src) {
  return String(src).replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2")
    .replace(/\\([a-zA-Z]+)/g, (m, n) => (SYM[n] !== undefined ? SYM[n] : n))
    .replace(/[{}]/g, "");
}

/* ---------- Export from the EDITED paper (live DOM → docx) ---------- */
function mathKid(latex) {
  if ($("#cNativeMath").checked && mathReady()) {
    try { return new docx.Math({ children: latexToMathKids(latex) }); }
    catch { /* fall through to text */ }
  }
  return new docx.TextRun({ text: latexFallbackText(latex), size: 24 });
}
function runsFromNode(node, st = {}) {
  const size = st.size || 24;
  const out = [];
  node.childNodes.forEach(ch => {
    if (ch.nodeType === 3) {
      if (!ch.textContent) return;
      out.push(new docx.TextRun({ text: ch.textContent, size,
        bold: st.b || undefined, italics: st.i || undefined,
        underline: st.u ? {} : undefined, strike: st.s || undefined,
        font: st.mono ? "Consolas" : undefined, color: st.mono ? "0f172a" : undefined }));
    } else if (ch.nodeType === 1) {
      const tag = ch.tagName.toLowerCase();
      if (ch.classList && ch.classList.contains("math-src")) {
        out.push(mathKid(ch.dataset.latex || ch.textContent));
      }
      else if (tag === "br") out.push(new docx.TextRun({ text: "", size, break: 1 }));
      else if (tag === "img" || tag === "hr" || tag === "button" || tag === "input") return;
      else if (tag === "span" && ch.classList.contains("marks")) {
        const t = ch.textContent.replace(/[\[\]]/g, "").trim();
        if (t) out.push(new docx.TextRun({ text: "  [" + t + "]", size }));
      }
      else {
        const s2 = { ...st };
        if (tag === "b" || tag === "strong") s2.b = true;
        if (tag === "i" || tag === "em") s2.i = true;
        if (tag === "u") s2.u = true;
        if (tag === "s" || tag === "strike" || tag === "del") s2.s = true;
        if (tag === "code") s2.mono = true;
        runsFromNode(ch, s2).forEach(r => out.push(r));
      }
    }
  });
  return out;
}
function blocksFromEl(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "hr") return [new docx.Paragraph({ thematicBreak: true })];
  if (/^h[1-3]$/.test(tag)) {
    const sz = tag === "h1" ? 34 : tag === "h2" ? 30 : 26;
    const center = tag === "h1" ? { alignment: docx.AlignmentType.CENTER } : {};
    return [new docx.Paragraph({ children: runsFromNode(el, { size: sz, b: true }), spacing: { before: 200, after: 120 }, ...center })];
  }
  if (tag === "pre") {
    const kids = [];
    el.innerText.split("\n").forEach((ln, k) => {
      if (k) kids.push(new docx.TextRun({ text: "", size: 20, break: 1 }));
      kids.push(new docx.TextRun({ text: ln || " ", size: 20, font: "Consolas", color: "0f172a" }));
    });
    return [new docx.Paragraph({ children: kids, shading: { fill: "F1F5F9" }, spacing: { after: 200 } })];
  }
  if (tag === "table") {
    const rows = [...el.querySelectorAll("tr")].map((tr, ri) => new docx.TableRow({
      children: [...tr.querySelectorAll("th,td")].map(td => {
        const isHead = td.tagName === "TH" || (ri === 0 && tr.querySelectorAll("th").length > 0);
        return new docx.TableCell({
          children: [new docx.Paragraph({ children: runsFromNode(td) })],
          ...(isHead ? { shading: { fill: "EDE9FE" } } : {})
        });
      })
    }));
    return rows.length ? [new docx.Table({ rows, width: { size: 100, type: docx.WidthType.PERCENTAGE } })] : [];
  }
  if (tag === "blockquote") {
    const inner = [...el.children].filter(c => /^(p|h\d|pre|ul|ol|div)$/i.test(c.tagName));
    if (inner.length) { const kids = []; inner.forEach(b => blocksFromEl(b).forEach(x => kids.push(x))); return kids; }
    return [new docx.Paragraph({ children: runsFromNode(el), shading: { fill: "F5F3FF" } })];
  }
  if (tag === "ul" || tag === "ol") {
    const kids = [];
    [...el.children].forEach(li => {
      if (li.tagName === "LI") kids.push(new docx.Paragraph({ children: [new docx.TextRun({ text: "•  ", size: 24 }), ...runsFromNode(li)], spacing: { after: 80 } }));
    });
    return kids;
  }
  if (tag === "li") return [new docx.Paragraph({ children: [new docx.TextRun({ text: "•  ", size: 24 }), ...runsFromNode(el)], spacing: { after: 80 } })];
  const center = el.querySelector && el.querySelector(".katex-display") ? { alignment: docx.AlignmentType.CENTER } : {};
  const extra = el.className === "q" ? { shading: { fill: "F8FAFC" } } : {};
  const runs = runsFromNode(el);
  if (!runs.length) runs.push(new docx.TextRun({ text: "", size: 24 }));
  return [new docx.Paragraph({ children: runs, spacing: { after: 140 }, ...center, ...extra })];
}

/* ---------- Export ---------- */
async function exportDocx() {
  const body = $("#paperBody");
  if (!body || !body.textContent.trim()) { toast("Nothing to export yet"); return; }
  if (typeof docx === "undefined") { exportDoc(); return; }
  toast("Building .docx from your edited paper…");
  try {
    const kids = [];
    if ($("#cHeader").checked && $("#paperHead").style.display !== "none") {
      const H = id => (((document.getElementById(id) || {}).textContent) || "").trim();
      kids.push(new docx.Paragraph({ children: [new docx.TextRun({ text: H("pSchool") || $("#sSchool").value, bold: true, size: 40 })], alignment: docx.AlignmentType.CENTER }));
      kids.push(new docx.Paragraph({ children: [new docx.TextRun({ text: H("pTitle") || $("#sTitle").value, bold: true, size: 28 })], alignment: docx.AlignmentType.CENTER }));
      kids.push(new docx.Paragraph({ children: [new docx.TextRun({ text: (H("pMeta") || `${$("#sSub").value}  •  ${$("#sMeta").value}`).replace(/\s+/g, " "), size: 20, color: "555555" })], alignment: docx.AlignmentType.CENTER }));
      const instr = (H("pInstr") || $("#sInstr").value || "").replace(/\s+/g, " ");
      if (instr) kids.push(new docx.Paragraph({ children: [new docx.TextRun({ text: instr, size: 22 })], spacing: { after: 240 } }));
    }
    [...body.children].forEach(ch => {
      if (ch.nodeType !== 1 || (ch.classList && ch.classList.contains("empty"))) return;
      blocksFromEl(ch).forEach(b => kids.push(b));
    });
    const doc = new docx.Document({ sections: [{ children: kids, page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }] });
    const blob = await docx.Packer.toBlob(doc);
    saveAs(blob, "beepin-paper.docx");
    toast("Downloaded beepin-paper.docx");
  } catch (e) { console.error(e); toast("Export failed — trying .doc"); exportDoc(); }
}
function exportDoc() {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>
    body{font-family:Calibri,Arial;font-size:12pt}h1{text-align:center}table{border-collapse:collapse;width:100%}th,td{border:1.5pt solid #000;padding:6px}th{background:#EDE9FE}pre{background:#F1F5F9;padding:10px}</style></head><body>
    <h1>${$("#sSchool").value}</h1><p style="text-align:center">${$("#sTitle").value} — ${$("#sSub").value} • ${$("#sMeta").value}</p><hr/>
    ${$("#paperBody").innerHTML}</body></html>`;
  saveAs(new Blob(["\ufeff", html], { type: "application/msword" }), "beepin-paper.doc");
  toast("Downloaded beepin-paper.doc");
}
/* ---------- Focus mode: hide sidebar, full paper ---------- */
(function initFocus() {
  let on = "";
  try { on = localStorage.getItem("bd_focus") || ""; } catch {}
  if (on) { document.body.classList.add("focus-paper"); $("#btnFocus").setAttribute("aria-pressed", "true"); }
})();
$("#btnFocus").onclick = () => {
  const on = document.body.classList.toggle("focus-paper");
  $("#btnFocus").setAttribute("aria-pressed", String(on));
  try { localStorage.setItem("bd_focus", on ? "1" : ""); } catch {}
};

/* ---------- Fullscreen preview ---------- */
$("#btnFull").onclick = async () => {
  const wrap = $("#previewWrap");
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (wrap.requestFullscreen) await wrap.requestFullscreen();
    else wrap.classList.toggle("fs-max");
  } catch { wrap.classList.toggle("fs-max"); }
};
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  $("#btnFull").setAttribute("aria-pressed", String(on));
  if (!on) $("#previewWrap").classList.remove("fs-max");
});

/* ---------- Markdown / HTML download ---------- */
function exportMd() {
  const src = $("#rawInput").value.trim() || $("#paperBody").innerText.trim();
  if (!src) { toast("Nothing to export yet"); return; }
  saveAs(new Blob([src], { type: "text/markdown" }), "beepin-paper.md");
  toast("Downloaded beepin-paper.md");
}
function exportHtml() {
  const body = $("#paperBody");
  if (!body || !body.textContent.trim()) { toast("Nothing to export yet"); return; }
  const H = id => (((document.getElementById(id) || {}).textContent) || "").trim();
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>beepin-paper</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">` +
    `<style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;color:#111;line-height:1.7}` +
    `h1{text-align:center}table{border-collapse:collapse;width:100%}th,td{border:1px solid #666;padding:6px}` +
    `pre{background:#22201c;color:#f0e9db;padding:12px;border-radius:8px;overflow:auto}` +
    `blockquote{border-left:3px solid #b26a2b;background:#faf6ee;padding:6px 12px;margin:10px 0}</style></head><body>` +
    `<h1>${H("pSchool")}</h1><h2 style="text-align:center">${H("pTitle")}</h2>` +
    `<p style="text-align:center">${H("pMeta")}</p><hr><p>${H("pInstr")}</p>${body.innerHTML}</body></html>`;
  saveAs(new Blob([html], { type: "text/html" }), "beepin-paper.html");
  toast("Downloaded beepin-paper.html");
}

/* ---------- PowerPoint export (slides; math as readable Unicode) ---------- */
async function exportPptx() {
  if (typeof PptxGenJS === "undefined") { toast("PPTX engine still loading — try again"); return; }
  const body = $("#paperBody");
  if (!body || !body.textContent.trim()) { toast("Nothing to export yet"); return; }
  toast("Building .pptx…");
  try {
    const H = id => (((document.getElementById(id) || {}).textContent) || "").trim();
    const tx = (el) => ((el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
    pptx.layout = "WIDE";
    const cover = pptx.addSlide();
    cover.background = { color: "1F2937" };
    cover.addText(H("pSchool") || "Question Paper", { x: 0.5, y: 1.4, w: 12.33, h: 1, fontSize: 32, bold: true, color: "FFFFFF", align: "center" });
    cover.addText(H("pTitle"), { x: 0.5, y: 2.5, w: 12.33, h: 0.7, fontSize: 22, color: "D9D9D9", align: "center" });
    cover.addText(H("pMeta"), { x: 0.5, y: 3.2, w: 12.33, h: 0.6, fontSize: 14, color: "BFBFBF", align: "center" });
    let slide = pptx.addSlide(), y = 0.4;
    const need = (h) => { if (y + h > 7.0) { slide = pptx.addSlide(); y = 0.4; } };
    [...body.children].forEach(ch => {
      if (ch.nodeType !== 1 || (ch.classList && ch.classList.contains("empty"))) return;
      const tag = ch.tagName.toLowerCase(), t = tx(ch);
      if (/^h[12]$/.test(tag)) {
        slide = pptx.addSlide(); y = 0.4;
        slide.addText(t, { x: 0.5, y, w: 12.33, h: 0.9, fontSize: tag === "h1" ? 28 : 24, bold: true, color: "1F2937" });
        y += 1.1;
      }
      else if (tag === "h3") { if (!t) return; need(0.7); slide.addText(t, { x: 0.6, y, w: 12.1, h: 0.6, fontSize: 18, bold: true, color: "1F2937" }); y += 0.75; }
      else if (tag === "hr") { need(0.4); slide.addShape(pptx.shapes.LINE, { x: 0.6, y: y + 0.15, w: 12.1, h: 0, line: { color: "808080", width: 1.5 } }); y += 0.4; }
      else if (tag === "table") {
        const rows = [...ch.querySelectorAll("tr")]
          .map(tr => [...tr.querySelectorAll("th,td")].map(td => tx(td)))
          .filter(r => r.join("").trim() !== "");
        if (!rows.length) return;
        const h = rows.length * 0.38 + 0.1;
        need(h);
        slide.addTable(rows.map((r, ri) => r.map(c => ({
          text: c, options: { fontSize: 12, color: "111111", fill: ri === 0 ? { color: "EDE9FE" } : undefined, bold: ri === 0 }
        }))), { x: 0.6, y, w: 12.1, border: { pt: 1, color: "666666" } });
        y += h + 0.15;
      }
      else if (tag === "pre") {
        if (!t) return;
        const h = Math.min(0.5 + t.length * 0.004, 4.5);
        need(h);
        slide.addText(t, { x: 0.6, y, w: 12.1, h, fontSize: 11, fontFace: "Consolas", fill: { color: "0F172A" }, color: "E2E8F0" });
        y += h + 0.15;
      }
      else if (tag === "blockquote") { if (!t) return; need(0.8); slide.addText(t, { x: 0.9, y, w: 11.8, h: 0.7, fontSize: 14, italic: true, color: "4B5563" }); y += 0.85; }
      else {
        if (!t) return;
        const prefix = tag === "li" ? "•  " : "";
        const h = Math.max(0.5, Math.ceil((prefix + t).length / 105) * 0.42);
        need(h);
        slide.addText(prefix + t, { x: 0.6, y, w: 12.1, h, fontSize: 15, color: "111111" });
        y += h + 0.1;
      }
    });
    await pptx.writeFile({ fileName: "beepin-paper.pptx" });
    toast("Downloaded beepin-paper.pptx");
  } catch (e) { console.error(e); toast("PPTX failed"); }
}

$("#btnDocx").onclick = exportDocx;
$("#btnDocxTop").onclick = exportDocx;

/* ---------- Expandable sections: measured 420ms, interrupt-safe ---------- */
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function setExpanded(region, btn, open) {
  if (region._anim) { region._anim.cancel(); region._anim = null; }
  if (btn) btn.setAttribute("aria-expanded", String(open));
  if (reduceMotion()) { region.hidden = !open; return; }
  const startH = region.hidden ? 0 : region.offsetHeight;
  region.hidden = false;
  region.style.overflow = "hidden";
  const endH = open ? region.scrollHeight : 0;
  const a = region.animate([
    { height: startH + "px", opacity: open ? 0 : 1 },
    { height: endH + "px", opacity: open ? 1 : 0 }
  ], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
  region._anim = a;
  a.onfinish = () => {
    if (region._anim !== a) return;
    region._anim = null;
    region.hidden = !open;
    region.style.height = "";
    region.style.overflow = "";
    region.style.opacity = "";
  };
  a.oncancel = () => { if (region._anim === a) region._anim = null; };
}
/* ---------- Photo → AI (camera / upload → chat + text extraction) ---------- */
$("#photoToggle").addEventListener("click", () => {
  const btn = $("#photoToggle"), reg = $("#photoRegion");
  setExpanded(reg, btn, reg.hidden);
});
let attachedImage = null; // dataURL jpeg
let camStream = null;
const camModal = $("#camModal"), camVideo = $("#camVideo");
async function openCam() {
  camModal.classList.add("show");
  $("#camHint").textContent = "Starting camera…";
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    camVideo.srcObject = camStream;
    $("#camHint").textContent = "Camera needs HTTPS or localhost — upload works everywhere.";
  } catch {
    $("#camHint").textContent = "Camera blocked or unavailable here (needs HTTPS/localhost + permission). Use Upload instead.";
  }
}
function closeCam() {
  camModal.querySelector(".modal").classList.add("closing");
  setTimeout(() => { camModal.classList.remove("show"); camModal.querySelector(".modal").classList.remove("closing"); }, 220);
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null;
}
$("#btnCamera").onclick = openCam;
$("#camClose").onclick = closeCam;
camModal.onclick = (e) => { if (e.target === camModal) closeCam(); };
$("#btnUpload").onclick = () => $("#fileImg").click();
$("#btnUploadAlt").onclick = () => { closeCam(); setTimeout(() => $("#fileImg").click(), 250); };
$("#btnSnap").onclick = () => {
  if (!camStream) { toast("No camera — upload instead"); return; }
  const c = document.createElement("canvas");
  const w = camVideo.videoWidth || 1280, h = camVideo.videoHeight || 720;
  const k = Math.min(1, 1024 / Math.max(w, h));
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(camVideo, 0, 0, c.width, c.height);
  setPhoto(c.toDataURL("image/jpeg", 0.82));
  closeCam();
};
$("#fileImg").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    setPhoto(c.toDataURL("image/jpeg", 0.82));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
  e.target.value = "";
};
function setPhoto(dataURL) {
  attachedImage = dataURL;
  $("#imgPrev").src = dataURL;
  $("#imgPrevWrap").hidden = false;
  if ($("#imgQ") && !$("#imgQ").value) $("#imgQ").value = "Extract all questions as clean Markdown with $LaTeX$ math, one per line as Q1. Q2. with [marks] where shown.";
  toast("Photo attached");
}
$("#imgClear").onclick = () => { attachedImage = null; $("#imgPrevWrap").hidden = true; setExpanded($("#imgAns"), null, false); };
$("#btnAskImg").onclick = async () => {
  const q = ($("#imgQ").value || "Describe this image and extract all text.").trim();
  const box = $("#imgAns");
  if (!attachedImage) { toast("Attach a photo first"); return; }
  box.innerHTML = "<p class='status'>Reading photo…</p>";
  setExpanded(box, null, true);
  try {
    const j = await askAI({ provider: aiProvider,
      model: aiProvider === "groq" ? "meta-llama/llama-4-scout-17b-16e-instruct" : aiModel,
      messages: [
        { role: "system", content: "Extract text faithfully. Return math in $...$ / $$...$$ LaTeX." },
        { role: "user", content: q, image: attachedImage }
      ], vision: true });
    const answer = j.text;
    if (!answer.trim()) throw new Error("Empty response — try again.");
    servedLine(j);
    box.innerHTML = "";
    const pre = document.createElement("div");
    pre.className = "ans-text";
    pre.textContent = answer;
    const row = document.createElement("div");
    row.className = "row";
    const use = document.createElement("button");
    use.className = "btn primary sm";
    use.textContent = "Send to editor";
    use.onclick = () => { $("#rawInput").value = answer; syncCount(); render(); tabs[0].click(); toast("Sent to editor — review, then export"); };
    row.appendChild(use);
    box.append(pre, row);
  } catch (e) { box.innerHTML = "<p class='status err'>" + e.message + (e.code ? ` [${e.code}]` : "") + "</p>"; }
};

syncHeader(); syncCount();

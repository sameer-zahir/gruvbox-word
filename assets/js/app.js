// app.js — orchestration: state, UI wiring, events.

import * as store from "./storage.js";
import { applyCommand, activeCommands, execCmd, initEditorDefaults } from "./editor.js";
import { tryBlockShortcut, tryInlineShortcut, markdownToHtml } from "./markdown.js";
import { runExport } from "./export.js";

const $ = (sel) => document.querySelector(sel);
const editor = $("#editor");
const app = $("#app");

const WELCOME = `<h1>Welcome to Gruvbox Word</h1><p>A calm place to write. Start typing, or try a little Markdown — type <code>#&nbsp;</code> for a heading, <code>-&nbsp;</code> for a list, or wrap a word in <code>**stars**</code> for <strong>bold</strong>.</p><p>Everything saves automatically and stays on your device. When you're done, hit <strong>Export</strong> for Word, Markdown, HTML or PDF.</p><p>Happy writing. ✶</p>`;

let docs = [];
let activeId = null;
let saveTimer = null;
let statTimer = null;

/* ===================== documents ===================== */

function currentDoc() {
  return docs.find((d) => d.id === activeId) || null;
}

function newDoc(html = "<p></p>", focus = true) {
  const now = Date.now();
  const doc = { id: store.uid(), title: "Untitled", html, createdAt: now, updatedAt: now };
  docs.unshift(doc);
  activeId = doc.id;
  store.saveDocs(docs);
  store.setActiveId(activeId);
  loadDoc(doc, focus);
  renderDocList();
  return doc;
}

function loadDoc(doc, focus = true) {
  activeId = doc.id;
  store.setActiveId(activeId);
  editor.innerHTML = doc.html || "<p></p>";
  refreshEmpty();
  updateStats();
  buildOutline();
  renderDocList();
  if (focus) {
    editor.focus();
    placeCaretEnd();
  }
}

function deleteDoc(id) {
  const idx = docs.findIndex((d) => d.id === id);
  if (idx === -1) return;
  const wasActive = docs[idx].id === activeId;
  docs.splice(idx, 1);
  store.saveDocs(docs);
  if (!docs.length) {
    newDoc(WELCOME);
    return;
  }
  if (wasActive) loadDoc(docs[Math.max(0, idx - 1)]);
  else renderDocList();
}

function persist(now = false) {
  const doc = currentDoc();
  if (!doc) return;
  const save = () => {
    doc.html = editor.innerHTML;
    doc.title = doc.renamed ? doc.title : store.deriveTitle(doc.html);
    doc.updatedAt = Date.now();
    store.saveDocs(docs);
    renderDocList();
    setSaved(true);
  };
  if (now) {
    clearTimeout(saveTimer);
    save();
    return;
  }
  setSaved(false);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}

function setSaved(saved) {
  const el = $("#stat-save");
  el.classList.toggle("is-saving", !saved);
  el.textContent = saved ? "Saved" : "Saving";
}

function renderDocList() {
  const list = $("#doc-list");
  list.innerHTML = "";
  docs.forEach((doc) => {
    const li = document.createElement("li");
    li.className = "doc-item" + (doc.id === activeId ? " is-active" : "");
    li.tabIndex = 0;
    li.innerHTML = `<span class="doc-item__title"></span>
      <span class="doc-item__actions">
        <button class="iconbtn iconbtn--sm" data-act="rename" title="Rename" aria-label="Rename"><svg><use href="#icon-edit"/></svg></button>
        <button class="iconbtn iconbtn--sm" data-act="delete" title="Delete" aria-label="Delete"><svg><use href="#icon-trash"/></svg></button>
      </span>`;
    li.querySelector(".doc-item__title").textContent = doc.title || "Untitled";
    li.addEventListener("click", (e) => {
      if (e.target.closest("[data-act]")) return;
      if (doc.id !== activeId) {
        persist(true);
        loadDoc(doc);
      }
    });
    li.querySelector('[data-act="rename"]').addEventListener("click", (e) => {
      e.stopPropagation();
      const name = window.prompt("Rename document", doc.title || "Untitled");
      if (name && name.trim()) {
        doc.title = name.trim().slice(0, 60);
        doc.renamed = true;
        store.saveDocs(docs);
        renderDocList();
      }
    });
    li.querySelector('[data-act="delete"]').addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.confirm(`Delete "${doc.title || "Untitled"}"? This can't be undone.`)) deleteDoc(doc.id);
    });
    list.appendChild(li);
  });
}

/* ===================== stats + outline ===================== */

function updateStats() {
  clearTimeout(statTimer);
  statTimer = setTimeout(() => {
    const text = (editor.textContent || "").replace(/​/g, "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.replace(/\s/g, "").length;
    const mins = Math.max(1, Math.round(words / 200));
    $("#stat-words").textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
    $("#stat-chars").textContent = `${chars.toLocaleString()} ${chars === 1 ? "character" : "characters"}`;
    $("#stat-read").textContent = words ? `${mins} min read` : "0 min read";
  }, 120);
}

function buildOutline() {
  const out = $("#outline");
  out.innerHTML = "";
  const heads = editor.querySelectorAll("h1, h2, h3");
  heads.forEach((h, i) => {
    if (!h.id) h.id = "h-" + i;
    const a = document.createElement("a");
    a.href = "#" + h.id;
    a.className = "lvl-" + h.tagName[1];
    a.textContent = h.textContent.replace(/​/g, "") || "Untitled heading";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    out.appendChild(a);
  });
}

function refreshEmpty() {
  const empty = !editor.textContent.replace(/​/g, "").trim() && editor.children.length <= 1;
  editor.classList.toggle("is-empty", empty);
  editor.dataset.placeholder = empty ? "Start writing…" : "";
}

/* ===================== caret helpers ===================== */

function placeCaretEnd() {
  const r = document.createRange();
  r.selectNodeContents(editor);
  r.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

/* ===================== toolbar + commands ===================== */

function syncToolbar() {
  const active = activeCommands();
  document.querySelectorAll(".toolbar [data-cmd]").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    if (["bold", "italic", "strikeThrough", "inlineCode", "h1", "h2", "h3", "ul", "ol", "quote", "codeblock"].includes(cmd))
      btn.classList.toggle("is-active", active.has(cmd));
  });
}

const ACTIONS = {
  sidebar: toggleSidebar,
  find: openFind,
  import: () => $("#file-input").click(),
  export: toggleExportMenu,
  theme: toggleTheme,
  zen: toggleZen,
  help: openHelp,
};

document.querySelector(".toolbar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cmd]");
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  if (ACTIONS[cmd]) ACTIONS[cmd]();
  else {
    applyCommand(cmd, editor);
    persist();
    syncToolbar();
    buildOutline();
    updateStats();
    refreshEmpty();
  }
});

/* ===================== editor events ===================== */

editor.addEventListener("input", () => {
  refreshEmpty();
  persist();
  updateStats();
  buildOutline();
});

editor.addEventListener("keydown", (e) => {
  // Space triggers block-level Markdown shortcuts
  if (e.key === " ") {
    if (tryBlockShortcut(editor, execCmd)) {
      e.preventDefault();
      persist();
      syncToolbar();
      buildOutline();
      refreshEmpty();
    }
  }
});

// inline shortcuts fire after a delimiter is inserted
editor.addEventListener("input", (e) => {
  if (e.inputType === "insertText" && e.data && "*_`~".includes(e.data)) {
    if (tryInlineShortcut(editor)) {
      persist();
      updateStats();
    }
  }
});

document.addEventListener("selectionchange", () => {
  if (document.activeElement === editor) syncToolbar();
});

// Paste as plain text to keep documents clean (Markdown still applies as you type).
editor.addEventListener("paste", (e) => {
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");
  if (text == null) return;
  e.preventDefault();
  execCmd("insertText", text);
});

/* ===================== sidebar / zen / theme ===================== */

function toggleSidebar() {
  if (window.matchMedia("(max-width: 820px)").matches) app.classList.toggle("show-sidebar");
  else {
    app.classList.toggle("no-sidebar");
    savePref("sidebar", !app.classList.contains("no-sidebar"));
  }
}

function toggleZen() {
  app.classList.toggle("zen");
  const on = app.classList.contains("zen");
  $("#btn-zen-exit").hidden = !on;
  savePref("zen", on);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  savePref("theme", next);
}

/* ===================== export menu ===================== */

function toggleExportMenu() {
  const menu = $("#export-menu");
  if (!menu.hidden) {
    menu.hidden = true;
    return;
  }
  const btn = $("#btn-export");
  const r = btn.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = r.bottom + 6 + "px";
  menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 12) + "px";
}

$("#export-menu").addEventListener("click", (e) => {
  const item = e.target.closest("[data-export]");
  if (!item) return;
  $("#export-menu").hidden = true;
  const doc = currentDoc();
  runExport(item.dataset.export, editor, doc ? doc.title : "document");
  if (item.dataset.export !== "pdf") toast(`Exported as ${item.dataset.export.toUpperCase()}`);
});

document.addEventListener("click", (e) => {
  const menu = $("#export-menu");
  if (!menu.hidden && !e.target.closest("#export-menu, #btn-export")) menu.hidden = true;
});

/* ===================== import ===================== */

$("#file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result);
    let html;
    if (/\.html?$/i.test(file.name)) {
      const tmp = document.createElement("div");
      tmp.innerHTML = content;
      const body = tmp.querySelector("body");
      html = (body ? body.innerHTML : content);
    } else {
      html = markdownToHtml(content);
    }
    const base = file.name.replace(/\.[^.]+$/, "");
    const doc = newDoc(html);
    doc.title = base.slice(0, 60);
    doc.renamed = true;
    store.saveDocs(docs);
    renderDocList();
    toast(`Imported ${file.name}`);
  };
  reader.readAsText(file);
  e.target.value = "";
});

// drag & drop import
["dragover", "drop"].forEach((ev) =>
  editor.addEventListener(ev, (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      if (ev === "drop" && e.dataTransfer.files[0]) {
        $("#file-input").files = e.dataTransfer.files;
        $("#file-input").dispatchEvent(new Event("change"));
      }
    }
  })
);

/* ===================== find & replace ===================== */

let findHits = [];
let findIdx = -1;

function openFind() {
  const bar = $("#find-bar");
  bar.hidden = false;
  const input = $("#find-input");
  const sel = window.getSelection().toString();
  if (sel) input.value = sel;
  input.focus();
  input.select();
  runFind();
}

function closeFind() {
  $("#find-bar").hidden = true;
  clearHighlights();
  findHits = [];
  findIdx = -1;
  editor.focus();
}

function clearHighlights() {
  editor.querySelectorAll("mark.find-hit").forEach((m) => {
    const p = m.parentNode;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  });
}

function runFind() {
  clearHighlights();
  findHits = [];
  findIdx = -1;
  const term = $("#find-input").value;
  if (!term) {
    $("#find-count").textContent = "0/0";
    return;
  }
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement.closest("mark.find-hit") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const lc = term.toLowerCase();
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent;
    let from = 0;
    let i;
    while ((i = text.toLowerCase().indexOf(lc, from)) !== -1) {
      targets.push({ node, start: i, end: i + term.length });
      from = i + term.length;
    }
  }
  // wrap from last to first so offsets stay valid
  targets.reverse().forEach((t) => {
    const r = document.createRange();
    r.setStart(t.node, t.start);
    r.setEnd(t.node, t.end);
    const mark = document.createElement("mark");
    mark.className = "find-hit";
    r.surroundContents(mark);
    findHits.unshift(mark);
  });
  if (findHits.length) {
    findIdx = 0;
    focusHit();
  }
  $("#find-count").textContent = `${findHits.length ? 1 : 0}/${findHits.length}`;
}

function focusHit() {
  findHits.forEach((m, i) => m.classList.toggle("is-current", i === findIdx));
  const cur = findHits[findIdx];
  if (cur) {
    cur.scrollIntoView({ block: "center", behavior: "smooth" });
    $("#find-count").textContent = `${findIdx + 1}/${findHits.length}`;
  }
}

function stepFind(dir) {
  if (!findHits.length) return;
  findIdx = (findIdx + dir + findHits.length) % findHits.length;
  focusHit();
}

function replaceOne() {
  if (findIdx < 0 || !findHits[findIdx]) return;
  const mark = findHits[findIdx];
  const repl = document.createTextNode($("#replace-input").value);
  mark.replaceWith(repl);
  findHits.splice(findIdx, 1);
  persist();
  runFind();
}

function replaceAll() {
  const val = $("#replace-input").value;
  if (!findHits.length) return;
  const n = findHits.length;
  findHits.forEach((m) => m.replaceWith(document.createTextNode(val)));
  persist();
  updateStats();
  runFind();
  toast(`Replaced ${n}`);
}

$("#find-input").addEventListener("input", runFind);
$("#find-next").addEventListener("click", () => stepFind(1));
$("#find-prev").addEventListener("click", () => stepFind(-1));
$("#find-replace").addEventListener("click", replaceOne);
$("#find-replace-all").addEventListener("click", replaceAll);
$("#find-close").addEventListener("click", closeFind);
$("#find-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
  if (e.key === "Escape") closeFind();
});
$("#replace-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); replaceOne(); }
  if (e.key === "Escape") closeFind();
});

/* ===================== help modal ===================== */

function openHelp() { $("#help-modal").hidden = false; }
function closeHelp() { $("#help-modal").hidden = true; }
document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeHelp));
$("#btn-help-2").addEventListener("click", openHelp);

/* ===================== misc ===================== */

$("#btn-new-doc").addEventListener("click", () => { persist(true); newDoc(); });
$("#btn-zen-exit").addEventListener("click", toggleZen);

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("is-show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("is-show");
    setTimeout(() => (t.hidden = true), 200);
  }, 1900);
}

function savePref(key, val) {
  const p = store.loadPrefs();
  p[key] = val;
  store.savePrefs(p);
}

/* ===================== keyboard shortcuts ===================== */

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "Escape") {
    if (!$("#export-menu").hidden) $("#export-menu").hidden = true;
    else if (!$("#help-modal").hidden) closeHelp();
    else if (!$("#find-bar").hidden) closeFind();
    else if (app.classList.contains("zen")) toggleZen();
    return;
  }
  if (e.key === "?" && e.shiftKey && document.activeElement !== editor) { openHelp(); return; }
  if (!mod) return;

  const k = e.key.toLowerCase();
  const map = {
    b: "bold", i: "italic", e: "inlineCode", k: "link",
    1: "h1", 2: "h2", 3: "h3",
  };
  if (e.shiftKey && k === "s") { e.preventDefault(); applyCommand("strikeThrough", editor); persist(); syncToolbar(); return; }
  if (e.shiftKey && k === "l") { e.preventDefault(); toggleTheme(); return; }
  if (e.shiftKey && k === "z") { e.preventDefault(); toggleZen(); return; }
  if (e.altKey && k === "n") { e.preventDefault(); persist(true); newDoc(); return; }
  if (k === "\\") { e.preventDefault(); toggleSidebar(); return; }
  if (k === "s") { e.preventDefault(); toggleExportMenu(); return; }
  if (k === "f") { e.preventDefault(); openFind(); return; }
  if (k === "y") { e.preventDefault(); applyCommand("redo", editor); return; }

  if (map[k] && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    applyCommand(map[k], editor);
    persist();
    syncToolbar();
    buildOutline();
    refreshEmpty();
  }
});

/* ===================== init ===================== */

function init() {
  initEditorDefaults();
  const prefs = store.loadPrefs();
  document.documentElement.dataset.theme =
    prefs.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  if (prefs.sidebar === false && !window.matchMedia("(max-width: 820px)").matches) app.classList.add("no-sidebar");
  if (window.matchMedia("(max-width: 820px)").matches) app.classList.add("no-sidebar");

  docs = store.loadDocs();
  activeId = store.getActiveId();
  if (!docs.length) {
    newDoc(WELCOME, false);
  } else {
    const doc = currentDoc() || docs[0];
    loadDoc(doc, false);
  }
  setSaved(true);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {})
    );
  }
}

init();

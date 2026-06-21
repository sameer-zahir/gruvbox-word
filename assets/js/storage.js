// storage.js — document persistence in localStorage (private, on-device only)

const DOCS_KEY = "gruvbox-word:docs";
const ACTIVE_KEY = "gruvbox-word:active";
const PREFS_KEY = "gruvbox-word:prefs";

export function uid() {
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function loadDocs() {
  try {
    const d = JSON.parse(localStorage.getItem(DOCS_KEY));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export function saveDocs(docs) {
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
}

export function getActiveId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveId(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// Derive a human title from document HTML: first heading, else first line of text.
export function deriveTitle(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  const h = tmp.querySelector("h1, h2, h3");
  let text = (h ? h.textContent : tmp.textContent) || "";
  text = text.replace(/​/g, "").trim().split("\n")[0].trim();
  return text.slice(0, 60) || "Untitled";
}

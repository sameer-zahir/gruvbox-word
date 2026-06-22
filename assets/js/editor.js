// editor.js — formatting commands.
// Uses document.execCommand (deprecated but reliably supported in all current
// browsers); kept isolated here so the engine can be swapped without touching the UI.

import { safeHref } from "./markdown.js";

export function execCmd(cmd, value = null) {
  document.execCommand(cmd, false, value);
}

function currentBlockTag() {
  try {
    return (document.queryCommandValue("formatBlock") || "").toUpperCase();
  } catch {
    return "";
  }
}

function toggleBlock(tag) {
  execCmd("formatBlock", currentBlockTag() === tag ? "P" : tag);
}

function unwrap(el) {
  const p = el.parentNode;
  while (el.firstChild) p.insertBefore(el.firstChild, el);
  p.removeChild(el);
}

export function closest(node, sel) {
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  return el && el.closest ? el.closest(sel) : null;
}

// Tab / Shift+Tab inside a list: indent creates a nested list (sub-bullets),
// outdent promotes one level. Scoped to list items — outside a list, indent would
// wrap the block in a <blockquote> (styleWithCSS is off), which we don't want.
export function tryListIndent(editor, outdent) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const startLi = closest(sel.getRangeAt(0).startContainer, "li");
  if (!startLi) return false;
  const wasTask = startLi.classList.contains("task");
  editor.focus();
  execCmd(outdent ? "outdent" : "indent");
  // Indent nests a checklist item inside a plain <ul> — re-mark it as a task list
  // so the sub-item keeps its checkbox instead of becoming a disc bullet.
  if (!outdent && wasTask) {
    const s = window.getSelection();
    const li = s.rangeCount ? closest(s.getRangeAt(0).startContainer, "li") : null;
    const ul = li && li.parentElement;
    if (ul && ul.tagName === "UL" && !ul.classList.contains("task-list")) {
      ul.classList.add("task-list");
      decorateTaskItem(li);
    }
  }
  return true;
}

function toggleInlineCode() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const existing = closest(range.commonAncestorContainer, "code");
  if (existing) {
    unwrap(existing);
    return;
  }
  if (range.collapsed) {
    const c = document.createElement("code");
    c.textContent = "code";
    range.insertNode(c);
    const nr = document.createRange();
    nr.selectNodeContents(c);
    sel.removeAllRanges();
    sel.addRange(nr);
    return;
  }
  const text = range.toString();
  const c = document.createElement("code");
  c.textContent = text;
  range.deleteContents();
  range.insertNode(c);
  const nr = document.createRange();
  nr.setStartAfter(c);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
}

function insertLink() {
  const sel = window.getSelection();
  const hasSelection = sel.rangeCount && !sel.isCollapsed;
  const raw = window.prompt("Link URL", "https://");
  if (!raw) return;
  const url = safeHref(raw);
  if (hasSelection) {
    execCmd("createLink", url);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.textContent = raw;
    if (sel.rangeCount) sel.getRangeAt(0).insertNode(a);
  }
}

function clearFormat() {
  execCmd("removeFormat");
  execCmd("unlink");
  execCmd("formatBlock", "P");
}

/* ---------- checklists ---------- */

function makeCheckbox() {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.setAttribute("contenteditable", "false");
  return box;
}

function decorateTaskItem(li) {
  li.classList.add("task");
  if (!li.querySelector(":scope > input[type=checkbox]")) li.insertBefore(makeCheckbox(), li.firstChild);
}

// A blank checklist <li> with a checkbox and an empty text node ready for the caret.
export function createTaskItem() {
  const li = document.createElement("li");
  li.className = "task";
  li.append(makeCheckbox(), document.createTextNode(""));
  return li;
}

function placeCaretInItem(li) {
  if (!li) return;
  const box = li.querySelector(":scope > input[type=checkbox]");
  let target = box ? box.nextSibling : li.firstChild;
  if (!target || target.nodeType !== 3) {
    target = document.createTextNode("");
    if (box) box.after(target);
    else li.insertBefore(target, li.firstChild);
  }
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(target, target.length);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function toggleTaskList(editor) {
  editor.focus();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const node = sel.getRangeAt(0).startContainer;
  const li = closest(node, "li");

  // Already a checklist → turn it back into plain paragraphs. Only strip this list's
  // own checkboxes (:scope) so a nested checklist survives.
  if (li && li.classList.contains("task")) {
    const ul = li.closest("ul");
    if (ul) ul.querySelectorAll(":scope > li > input[type=checkbox]").forEach((b) => b.remove());
    execCmd("insertUnorderedList");
    return;
  }

  // Plain bullet list → convert it in place.
  const ul = closest(node, "ul");
  if (ul && !ul.classList.contains("task-list")) {
    ul.classList.add("task-list");
    ul.querySelectorAll(":scope > li").forEach(decorateTaskItem);
    placeCaretInItem(li || ul.querySelector(":scope > li"));
    return;
  }

  // Otherwise make a fresh list from the current block(s), then decorate it.
  execCmd("insertUnorderedList");
  const newUl = closest(window.getSelection().getRangeAt(0).startContainer, "ul");
  if (!newUl) return;
  newUl.classList.add("task-list");
  newUl.querySelectorAll(":scope > li").forEach(decorateTaskItem);
  placeCaretInItem(closest(window.getSelection().getRangeAt(0).startContainer, "li"));
}

export function applyCommand(name, editor) {
  editor.focus();
  switch (name) {
    case "bold": return execCmd("bold");
    case "italic": return execCmd("italic");
    case "strikeThrough": return execCmd("strikeThrough");
    case "inlineCode": return toggleInlineCode();
    case "h1": return toggleBlock("H1");
    case "h2": return toggleBlock("H2");
    case "h3": return toggleBlock("H3");
    case "ul": return execCmd("insertUnorderedList");
    case "ol": return execCmd("insertOrderedList");
    case "checklist": return toggleTaskList(editor);
    case "quote": return toggleBlock("BLOCKQUOTE");
    case "codeblock": return toggleBlock("PRE");
    case "link": return insertLink();
    case "hr": return execCmd("insertHorizontalRule");
    case "clear": return clearFormat();
    case "undo": return execCmd("undo");
    case "redo": return execCmd("redo");
  }
}

// Which formatting commands are active at the caret — used to highlight toolbar buttons.
export function activeCommands() {
  const s = new Set();
  const state = (c) => {
    try { return document.queryCommandState(c); } catch { return false; }
  };
  if (state("bold")) s.add("bold");
  if (state("italic")) s.add("italic");
  if (state("strikeThrough")) s.add("strikeThrough");
  const selN = window.getSelection();
  const inTask = selN.rangeCount && closest(selN.getRangeAt(0).commonAncestorContainer, "li.task");
  if (inTask) s.add("checklist");
  else if (state("insertUnorderedList")) s.add("ul");
  if (state("insertOrderedList")) s.add("ol");
  const b = currentBlockTag();
  if (b === "H1") s.add("h1");
  else if (b === "H2") s.add("h2");
  else if (b === "H3") s.add("h3");
  else if (b === "BLOCKQUOTE") s.add("quote");
  else if (b === "PRE") s.add("codeblock");
  const sel = window.getSelection();
  if (sel.rangeCount && closest(sel.getRangeAt(0).commonAncestorContainer, "code")) s.add("inlineCode");
  return s;
}

// Configure paragraph separator so Enter creates <p> blocks (needed by shortcuts).
export function initEditorDefaults() {
  try {
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand("styleWithCSS", false, "false");
  } catch {}
}

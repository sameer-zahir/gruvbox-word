// editor.js — formatting commands.
// Uses document.execCommand (deprecated but reliably supported in all current
// browsers); kept isolated here so the engine can be swapped without touching the UI.

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

function closest(node, sel) {
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  return el && el.closest ? el.closest(sel) : null;
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
  const url = window.prompt("Link URL", "https://");
  if (!url) return;
  if (hasSelection) {
    execCmd("createLink", url);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.textContent = url;
    if (sel.rangeCount) sel.getRangeAt(0).insertNode(a);
  }
}

function clearFormat() {
  execCmd("removeFormat");
  execCmd("unlink");
  execCmd("formatBlock", "P");
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
  if (state("insertUnorderedList")) s.add("ul");
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

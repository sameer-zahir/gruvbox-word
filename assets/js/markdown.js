// markdown.js — live Markdown input shortcuts + HTML <-> Markdown conversion

const ZWSP = "​";

/* ---------- helpers ---------- */

function topBlock(editor, node) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && el !== editor && el.parentElement !== editor) el = el.parentElement;
  return el && el !== editor ? el : null;
}

function inCodeContext(node) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  return !!(el && el.closest && el.closest("pre, code"));
}

/* ---------- block-level shortcuts (fired on Space) ---------- */
// Returns true if it consumed the space and transformed the block.
export function tryBlockShortcut(editor, execCmd) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (inCodeContext(range.startContainer)) return false;

  const block = topBlock(editor, range.startContainer);
  // Allow paragraphs, headings, and bare top-level text (e.g. a freshly-cleared
  // editor). Only stay out of lists, quotes, and code blocks where these
  // characters are legitimate content.
  if (block && /^(UL|OL|LI|BLOCKQUOTE|PRE|TABLE)$/.test(block.tagName)) return false;
  const scope = block || editor;

  const probe = range.cloneRange();
  probe.selectNodeContents(scope);
  probe.setEnd(range.startContainer, range.startOffset);
  const marker = probe.toString();

  const blockMap = { "#": "H1", "##": "H2", "###": "H3", ">": "BLOCKQUOTE" };
  let action = null;
  if (blockMap[marker]) action = { kind: "format", tag: blockMap[marker] };
  else if (marker === "-" || marker === "*" || marker === "+") action = { kind: "ul" };
  else if (/^\d+\.$/.test(marker)) action = { kind: "ol" };
  else if (marker === "```") action = { kind: "format", tag: "PRE" };
  if (!action) return false;

  // remove the typed marker
  const del = range.cloneRange();
  del.selectNodeContents(scope);
  del.setEnd(range.startContainer, range.startOffset);
  del.deleteContents();

  if (action.kind === "format") execCmd("formatBlock", action.tag);
  else if (action.kind === "ul") execCmd("insertUnorderedList");
  else if (action.kind === "ol") execCmd("insertOrderedList");
  return true;
}

/* ---------- inline shortcuts (fired on input of a delimiter) ---------- */
const INLINE_RULES = [
  { re: /\*\*([^*\n]+?)\*\*$/, tag: "strong", d: 2 },
  { re: /__([^_\n]+?)__$/, tag: "strong", d: 2 },
  { re: /~~([^~\n]+?)~~$/, tag: "del", d: 2 },
  { re: /`([^`\n]+?)`$/, tag: "code", d: 1, raw: true },
  { re: /(?:^|[^*])\*([^*\n]+?)\*$/, tag: "em", d: 1 },
  { re: /(?:^|[^_\w])_([^_\n]+?)_$/, tag: "em", d: 1 },
];

export function tryInlineShortcut(editor) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  if (inCodeContext(node)) return false;

  const caret = range.startOffset;
  const text = node.textContent.slice(0, caret);

  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const inner = m[1];
    if (!inner || (rule.raw && inner.includes(ZWSP))) continue;
    const span = inner.length + rule.d * 2; // delimiter+inner+delimiter
    const start = caret - span;
    if (start < 0) continue;

    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, caret);
    r.deleteContents();

    const el = document.createElement(rule.tag);
    el.textContent = inner;
    r.insertNode(el);

    // Break out of the inline element with a zero-width space so typing
    // continues unformatted (ZWSP is stripped on export and from word counts).
    const tail = document.createTextNode("​");
    el.after(tail);
    const nr = document.createRange();
    nr.setStart(tail, 1);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
    return true;
  }
  return false;
}

/* ---------- HTML -> Markdown (export) ---------- */
export function htmlToMarkdown(root) {
  const lines = [];

  function inline(node) {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        out += n.textContent.replace(/​/g, "");
      } else if (n.nodeType === 1) {
        const t = n.tagName;
        if (t === "BR") out += "  \n";
        else if (t === "STRONG" || t === "B") out += `**${inline(n)}**`;
        else if (t === "EM" || t === "I") out += `*${inline(n)}*`;
        else if (t === "DEL" || t === "S" || t === "STRIKE") out += `~~${inline(n)}~~`;
        else if (t === "CODE") out += "`" + n.textContent.replace(/​/g, "") + "`";
        else if (t === "A") out += `[${inline(n)}](${n.getAttribute("href") || ""})`;
        else out += inline(n);
      }
    });
    return out;
  }

  function walk(parent) {
    Array.from(parent.children).forEach((el) => {
      const t = el.tagName;
      if (t === "H1") lines.push("# " + inline(el), "");
      else if (t === "H2") lines.push("## " + inline(el), "");
      else if (t === "H3") lines.push("### " + inline(el), "");
      else if (t === "UL") {
        el.querySelectorAll(":scope > li").forEach((li) => lines.push("- " + inline(li)));
        lines.push("");
      } else if (t === "OL") {
        let i = 1;
        el.querySelectorAll(":scope > li").forEach((li) => lines.push(`${i++}. ` + inline(li)));
        lines.push("");
      } else if (t === "BLOCKQUOTE") {
        inline(el).split("\n").forEach((l) => lines.push("> " + l));
        lines.push("");
      } else if (t === "PRE") {
        lines.push("```", el.textContent.replace(/​/g, "").replace(/\n$/, ""), "```", "");
      } else if (t === "HR") {
        lines.push("---", "");
      } else {
        const s = inline(el);
        lines.push(s, "");
      }
    });
  }

  walk(root);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/* ---------- Markdown -> HTML (import) ---------- */
export function markdownToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inlineMd = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  const blockStart = /^(#{1,3}\s|>\s?|```|\s*[-*+]\s|\s*\d+\.\s)/;

  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      let code = "";
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code += lines[i++] + "\n";
      i++;
      html += `<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const lvl = line.match(/^#+/)[0].length;
      html += `<h${lvl}>${inlineMd(line.replace(/^#+\s/, ""))}</h${lvl}>`;
      i++;
      continue;
    }
    if (/^\s*[-*+]\s/.test(line)) {
      let items = "";
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i]))
        items += `<li>${inlineMd(lines[i++].replace(/^\s*[-*+]\s/, ""))}</li>`;
      html += `<ul>${items}</ul>`;
      continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      let items = "";
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i]))
        items += `<li>${inlineMd(lines[i++].replace(/^\s*\d+\.\s/, ""))}</li>`;
      html += `<ol>${items}</ol>`;
      continue;
    }
    if (/^>\s?/.test(line)) {
      let q = "";
      while (i < lines.length && /^>\s?/.test(lines[i])) q += lines[i++].replace(/^>\s?/, "") + " ";
      html += `<blockquote>${inlineMd(q.trim())}</blockquote>`;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      html += "<hr>";
      i++;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !blockStart.test(lines[i])) para += " " + lines[i++];
    html += `<p>${inlineMd(para)}</p>`;
  }
  return html || "<p></p>";
}

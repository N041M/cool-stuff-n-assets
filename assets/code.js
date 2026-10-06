// Code blocks on the documentation pages, drawn like a code view on GitHub:
// a header with the file name, the line count and a Copy button, line numbers
// in a gutter, and syntax colours for JavaScript, HTML, CSS, GLSL and shell.
//
// It looks for <pre><code> inside .code and .readme__code. A <p class="file">
// just before the block gives the file name, and its extension the language.
// Without one the language is guessed from the code. The text of the block is
// left exactly as it was, so copying it gives the original code.
(function () {
  "use strict";

  const JS_KEYWORDS = new Set(("break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while with yield async await get set").split(" "));
  const JS_CONSTANTS = new Set(("true false null undefined this NaN Infinity arguments").split(" "));
  const GLSL_KEYWORDS = new Set(("attribute const uniform varying in out inout layout centroid flat smooth break continue do for while switch case default if else discard return struct precision highp mediump lowp invariant").split(" "));
  const GLSL_TYPES = new Set(("void bool int uint float double vec2 vec3 vec4 bvec2 bvec3 bvec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 mat2 mat3 mat4 mat2x2 mat3x3 mat4x4 sampler2D sampler3D samplerCube sampler2DArray isampler2D usampler2D").split(" "));

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Each tokenizer returns a list of [class, text] pairs whose texts join up
  // to exactly the input. An empty class is plain text.
  function tokenizeScript(src, glsl) {
    const out = [];
    const re = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?)|(#[a-z]+[^\n]*)|(\b(?:0x[\da-f]+|\d[\d_]*(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)[uf]?\b)|([A-Za-z_$][\w$]*)|([\s\S])/gi;
    let m, prev = "";
    while ((m = re.exec(src))) {
      if (m[1]) out.push(["c", m[1]]);
      else if (m[2]) out.push(["s", m[2]]);
      else if (m[3] && glsl) out.push(["k", m[3]]);
      else if (m[3]) { re.lastIndex = m.index + 1; out.push(["", "#"]); }
      else if (m[4]) out.push(["n", m[4]]);
      else if (m[5]) {
        const w = m[5];
        const after = src.slice(re.lastIndex).match(/^\s*(\(|=>)?/);
        let cls = "";
        if (glsl && GLSL_TYPES.has(w)) cls = "k";
        else if (glsl && GLSL_KEYWORDS.has(w)) cls = "k";
        else if (!glsl && JS_KEYWORDS.has(w)) cls = "k";
        else if (JS_CONSTANTS.has(w)) cls = "n";
        else if (prev === "new" || (/^[A-Z][a-z]/.test(w) && after[1] === "(")) cls = "y";
        else if (after[1] === "(") cls = "f";
        else if (/^[A-Z][A-Z0-9_]+$/.test(w)) cls = "n";
        else if (out.length && out[out.length - 1][1] === ".") cls = "n";
        out.push([cls, w]);
        prev = w;
        continue;
      } else out.push(["", m[6]]);
      if (!/^\s$/.test(m[0])) prev = m[0];
    }
    return out;
  }

  function tokenizeCSS(src) {
    const out = [];
    let i = 0, depth = 0;
    const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?)|(@[\w-]+)|(#[\da-f]{3,8}\b)|(-?\d*\.?\d+(?:%|[a-z]+)?)|([{}])|(;)|(:)|([\w-]+)|([\s\S])/gi;
    let m, inValue = false;
    while ((m = re.exec(src))) {
      if (m[1]) out.push(["c", m[1]]);
      else if (m[2]) out.push(["s", m[2]]);
      else if (m[3]) out.push(["k", m[3]]);
      else if (m[4]) out.push(["n", m[4]]);
      else if (m[5]) out.push([depth > 0 && inValue ? "n" : (depth > 0 ? "" : "t"), m[5]]);
      else if (m[6]) { depth += m[6] === "{" ? 1 : -1; inValue = false; out.push(["", m[6]]); }
      else if (m[7]) { inValue = false; out.push(["", m[7]]); }
      else if (m[8]) {
        // A colon in a declaration starts the value. In a selector it is a
        // pseudo-class and belongs to the selector.
        if (depth > 0 && !inValue) inValue = true;
        out.push([depth > 0 ? "" : "t", m[8]]);
      } else if (m[9]) {
        if (depth === 0) out.push(["t", m[9]]);
        else if (!inValue) out.push(["p", m[9]]);
        else if (/^var$|^calc$|^rgba?$|^url$|^min$|^max$|^clamp$/.test(m[9]) && src[re.lastIndex] === "(") out.push(["f", m[9]]);
        else out.push(["n", m[9]]);
      } else out.push([depth === 0 && /\S/.test(m[10]) ? "t" : "", m[10]]);
    }
    return out;
  }

  function tokenizeHTML(src) {
    const out = [];
    const re = /(<!--[\s\S]*?(?:-->|$))|(<\/?)([\w-]+)([^>]*?)(\/?>)|([^<]+|<)/g;
    let m, inside = null;
    while ((m = re.exec(src))) {
      if (m[1]) { out.push(["c", m[1]]); continue; }
      if (m[2]) {
        out.push(["", m[2]]);
        out.push(["t", m[3]]);
        const attrRe = /(\s+)([\w:-]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+))?|([\s\S])/g;
        let a;
        while ((a = attrRe.exec(m[4]))) {
          if (a[5] !== undefined) { out.push(["", a[5]]); continue; }
          out.push(["", a[1]]);
          out.push(["a", a[2]]);
          if (a[3]) { out.push(["", a[3]]); out.push(["s", a[4]]); }
        }
        out.push(["", m[5]]);
        const tag = m[3].toLowerCase();
        if (m[2] === "<" && (tag === "script" || tag === "style")) {
          const close = src.indexOf("</" + tag, re.lastIndex);
          const end = close < 0 ? src.length : close;
          const body = src.slice(re.lastIndex, end);
          const isJSON = /type="(importmap|application\/json)"/.test(m[4]);
          out.push.apply(out, tag === "style" ? tokenizeCSS(body) : tokenizeScript(body, false, isJSON));
          re.lastIndex = end;
        }
        continue;
      }
      out.push(["", m[6]]);
    }
    return out;
  }

  function tokenizeShell(src) {
    const out = [];
    src.split(/(\n)/).forEach(function (line) {
      if (line === "\n") { out.push(["", line]); return; }
      const m = line.match(/^(\s*)(#.*)$/);
      if (m) { out.push(["", m[1]]); out.push(["c", m[2]]); return; }
      const w = line.match(/^(\s*)(\S+)([\s\S]*)$/);
      if (!w) { out.push(["", line]); return; }
      out.push(["", w[1]]);
      out.push(["f", w[2]]);
      w[3].split(/("[^"]*"|'[^']*')/).forEach(function (part, i) { out.push([i % 2 ? "s" : "", part]); });
    });
    return out;
  }

  function guess(code) {
    const t = code.trim();
    if (/^</.test(t)) return "html";
    if (/^(python3|npm|npx|node|git|cd|ls|curl)\b/.test(t)) return "sh";
    if (/^#version|\b(vec[234]|uniform|gl_FragColor)\b/.test(t)) return "glsl";
    if (/^[^{}()=;]*\{[\s\S]*?:[^;{}]*;/.test(t) && !/\b(function|const|let|var|=>|return)\b/.test(t)) return "css";
    return "js";
  }

  function langOf(name, code) {
    const ext = (name || "").split(".").pop().toLowerCase();
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "css") return "css";
    if (ext === "glsl" || ext === "frag" || ext === "vert") return "glsl";
    if (ext === "sh") return "sh";
    if (ext === "js" || ext === "mjs" || ext === "json") return guess(code) === "html" ? "html" : "js";
    return guess(code);
  }

  function tokenize(lang, code) {
    if (lang === "html") return tokenizeHTML(code);
    if (lang === "css") return tokenizeCSS(code);
    if (lang === "glsl") return tokenizeScript(code, true);
    if (lang === "sh") return tokenizeShell(code);
    return tokenizeScript(code, false);
  }

  // Splits the tokens into lines, closing and reopening a token's span where
  // it runs over a line break, so every line is complete HTML on its own.
  function toLines(tokens) {
    const lines = [""];
    tokens.forEach(function (t) {
      t[1].split("\n").forEach(function (part, i) {
        if (i > 0) lines.push("");
        if (!part) return;
        lines[lines.length - 1] += t[0] ? '<span class="tok-' + t[0] + '">' + esc(part) + "</span>" : esc(part);
      });
    });
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  const LABEL = { js: "JavaScript", html: "HTML", css: "CSS", glsl: "GLSL", sh: "Shell" };

  function copyText(button, text) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      button.textContent = "Copied";
      setTimeout(function () { button.textContent = "Copy"; }, 1500);
    }, function () {});
  }

  function enhance(box) {
    const code = box.querySelector("pre > code");
    if (!code || box.classList.contains("codeview")) return;
    const text = code.textContent;
    const prev = box.previousElementSibling;
    const fileEl = prev && prev.matches("p.file") ? prev : null;
    const name = fileEl ? fileEl.textContent.trim() : "";
    const lang = langOf(name, text);
    const lines = toLines(tokenize(lang, text));
    code.innerHTML = lines.map(function (l) { return '<span class="line">' + l + "</span>"; }).join("\n");

    const head = document.createElement("div");
    head.className = "codeview__head";
    const title = document.createElement("span");
    title.className = "codeview__file";
    title.textContent = name || LABEL[lang];
    const meta = document.createElement("span");
    meta.className = "codeview__meta";
    meta.textContent = lines.length + (lines.length === 1 ? " line" : " lines");
    head.append(title, meta);
    // The page's own Copy button moves into the header. It is replaced by a
    // copy with a handler of its own, because the page's handler looks for the
    // code beside the button.
    const old = box.querySelector("[data-copy-code]");
    const button = old ? old.cloneNode(true) : document.createElement("button");
    if (!old) { button.type = "button"; button.className = "btn"; button.textContent = "Copy"; }
    button.addEventListener("click", function (e) {
      e.stopPropagation();
      copyText(button, text);
    });
    head.append(button);
    if (old) old.remove();
    box.prepend(head);
    if (fileEl) fileEl.hidden = true;
    box.classList.add("codeview");
    box.dataset.lang = lang;
  }

  function run() {
    document.querySelectorAll(".code, .readme__code").forEach(enhance);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();

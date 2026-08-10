/* Minimal renderer for the `sc-if` / `sc-for` / `{{ }}` template dialect that
   Claude Design emits, so the itinerary page can stay a plain static file
   instead of shipping React plus the generated design-canvas runtime.

   Supported, because that is all the template uses:
     {{ path.to.value }}   in text and in any attribute, alone or interpolated
     <sc-if value="{{ x }}">        <sc-for list="{{ xs }}" as="x">
     onClick / onChange / onKeyDown / onMouseEnter / onMouseLeave
     style-hover="css"     compiled to a real :hover rule

   Patching is keyed on (template node, loop position), so a re-render reuses
   the existing DOM node for a given template position. That is what keeps the
   caret in a text input while you are typing into it. */
(function (global) {
  "use strict";

  const ALIAS = { "sc-select": "select" };

  /* Attribute names arrive lowercased from the HTML parser (SVG names are
     already case-corrected by the parser's own adjustment table). */
  const EVENTS = {
    onclick: "click",
    onchange: "input",
    oninput: "input",
    onkeydown: "keydown",
    onkeyup: "keyup",
    onmouseenter: "mouseenter",
    onmouseleave: "mouseleave",
    onfocus: "focus",
    onblur: "blur",
    onsubmit: "submit",
  };

  const VALUE_TAGS = new Set(["input", "textarea", "select", "option"]);
  const BOOL_PROPS = { readonly: "readOnly", disabled: "disabled", checked: "checked" };

  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  const NUMBER = /^-?\d+(\.\d+)?$/;

  function resolve(vals, src) {
    const expr = String(src).trim();
    if (!expr) return undefined;
    if (expr[0] === "!") return !resolve(vals, expr.slice(1));
    if (expr === "true") return true;
    if (expr === "false") return false;
    if (expr === "null") return null;
    if (NUMBER.test(expr)) return Number(expr);
    const head = expr.match(IDENT);
    if (!head) return undefined;
    let cur = vals == null ? undefined : vals[head[0]];
    let i = head[0].length;
    while (i < expr.length && expr[i] === ".") {
      const m = expr.slice(i + 1).match(IDENT);
      if (!m) return undefined;
      cur = cur == null ? undefined : cur[m[0]];
      i += 1 + m[0].length;
    }
    return cur;
  }

  function compileAttr(raw) {
    const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) return (vals) => resolve(vals, whole[1]);
    if (raw.indexOf("{{") < 0) return () => raw;
    const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
    return (vals) =>
      parts.map((s, i) => (i & 1 ? (resolve(vals, s) ?? "") : s)).join("");
  }

  /* Inline `style` beats any selector, so hover declarations need
     !important to win against the style attribute on the same element. */
  const pseudoClass = (function () {
    const cache = new Map();
    let sheet = null;
    let n = 0;
    return function (pseudo, css) {
      const cacheKey = pseudo + "|" + css;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      if (!sheet) {
        const el = document.createElement("style");
        document.head.appendChild(el);
        sheet = el.sheet;
      }
      const cls = "scp" + (n++).toString(36);
      const body = css
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => d + " !important")
        .join(";");
      sheet.insertRule("." + cls + ":" + pseudo + "{" + body + "}", sheet.cssRules.length);
      cache.set(cacheKey, cls);
      return cls;
    };
  })();

  function compile(root) {
    let uid = 0;

    function children(node) {
      const out = [];
      node.childNodes.forEach((child) => {
        const b = build(child);
        if (b) out.push(b);
      });
      return out;
    }

    function build(node) {
      if (node.nodeType === Node.TEXT_NODE) return text(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.localName;
      if (tag === "sc-if") return conditional(node);
      if (tag === "sc-for") return loop(node);
      return element(node, tag);
    }

    function text(raw) {
      const id = uid++;
      if (raw.indexOf("{{") < 0) {
        return (_, out, prefix) => out.push({ key: prefix + "#" + id, text: raw });
      }
      const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
      return (vals, out, prefix) => {
        let s = "";
        for (let i = 0; i < parts.length; i++) {
          if (!(i & 1)) {
            s += parts[i];
            continue;
          }
          const v = resolve(vals, parts[i]);
          if (v == null || typeof v === "boolean") continue;
          s += String(v);
        }
        out.push({ key: prefix + "#" + id, text: s });
      };
    }

    function conditional(node) {
      const get = compileAttr(node.getAttribute("value") || "");
      const kids = children(node);
      return (vals, out, prefix) => {
        if (!get(vals)) return;
        for (const b of kids) b(vals, out, prefix);
      };
    }

    function loop(node) {
      const get = compileAttr(node.getAttribute("list") || "");
      const as = node.getAttribute("as") || "item";
      const kids = children(node);
      return (vals, out, prefix) => {
        const list = get(vals);
        if (!Array.isArray(list)) return;
        list.forEach((item, i) => {
          const sub = Object.assign({}, vals, { [as]: item, $index: i });
          const p = prefix + "/" + i;
          for (const b of kids) b(sub, out, p);
        });
      };
    }

    function element(node, tag) {
      const id = uid++;
      const ns = node.namespaceURI;
      const name = ALIAS[tag] || tag;
      const attrs = [];
      const handlers = [];
      let hover = "";
      for (const a of node.attributes) {
        if (a.name.indexOf("style-") === 0) {
          hover = pseudoClass(a.name.slice(6), a.value);
          continue;
        }
        if (EVENTS[a.name]) {
          /* React's onChange fires per keystroke on text controls but on
             commit for a select, and the template is written against that. */
          const type = a.name === "onchange" && name === "select" ? "change" : EVENTS[a.name];
          handlers.push([type, compileAttr(a.value)]);
          continue;
        }
        attrs.push([a.name, compileAttr(a.value)]);
      }
      const kids = children(node);
      return (vals, out, prefix) => {
        const props = {};
        for (const [k, g] of attrs) props[k] = g(vals);
        if (hover) props.class = (props.class ? props.class + " " : "") + hover;
        const on = {};
        for (const [k, g] of handlers) on[k] = g(vals);
        const kidNodes = [];
        for (const b of kids) b(vals, kidNodes, prefix);
        out.push({ key: prefix + "#" + id, tag: name, ns, props, on, children: kidNodes });
      };
    }

    return children(root);
  }

  function create(vnode) {
    const node =
      vnode.text !== undefined
        ? document.createTextNode("")
        : document.createElementNS(vnode.ns, vnode.tag);
    node.__key = vnode.key;
    node.__tag = vnode.tag;
    return node;
  }

  function reusable(node, vnode) {
    if (vnode.text !== undefined) return node.nodeType === Node.TEXT_NODE;
    return node.nodeType === Node.ELEMENT_NODE && node.__tag === vnode.tag;
  }

  function applyProps(el, vnode) {
    const prev = el.__props || {};
    const next = vnode.props;
    for (const k in prev) {
      if (k in next) continue;
      if (k === "class") el.removeAttribute("class");
      else if (BOOL_PROPS[k]) el[BOOL_PROPS[k]] = false;
      else el.removeAttribute(k);
    }
    for (const k in next) {
      const v = next[k];
      if (prev[k] === v && k !== "value") continue;
      if (BOOL_PROPS[k]) {
        el[BOOL_PROPS[k]] = !!v;
      } else if (k === "value" && VALUE_TAGS.has(vnode.tag)) {
        const s = v == null ? "" : String(v);
        if (el.value !== s) el.value = s;
      } else if (k === "style") {
        el.style.cssText = v == null ? "" : String(v);
      } else if (v == null || v === false) {
        el.removeAttribute(k);
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    el.__props = next;
  }

  function applyHandlers(el, vnode) {
    el.__on = vnode.on;
    let bound = el.__bound;
    if (!bound) bound = el.__bound = {};
    for (const type in vnode.on) {
      if (bound[type]) continue;
      bound[type] = true;
      el.addEventListener(type, (ev) => {
        const fn = el.__on[type];
        if (typeof fn === "function") fn(ev);
      });
    }
  }

  function patch(parent, vnodes) {
    const pool = new Map();
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (n.__key !== undefined) pool.set(n.__key, n);
    }

    const ordered = [];
    for (const vnode of vnodes) {
      let node = pool.get(vnode.key);
      if (node && !reusable(node, vnode)) node = undefined;
      if (node) pool.delete(vnode.key);
      else node = create(vnode);

      if (vnode.text !== undefined) {
        if (node.nodeValue !== vnode.text) node.nodeValue = vnode.text;
      } else {
        /* Children first: a <select> can only take a value once its
           <option>s exist. */
        patch(node, vnode.children);
        applyProps(node, vnode);
        applyHandlers(node, vnode);
      }
      ordered.push(node);
    }

    for (const node of pool.values()) parent.removeChild(node);

    let cur = parent.firstChild;
    for (const node of ordered) {
      if (cur === node) {
        cur = cur.nextSibling;
        continue;
      }
      parent.insertBefore(node, cur);
    }
    while (cur) {
      const next = cur.nextSibling;
      parent.removeChild(cur);
      cur = next;
    }
  }

  class DCLogic {
    constructor() {
      this.state = {};
    }
    setState(update, callback) {
      this.__host.apply(update, callback);
    }
    componentDidMount() {}
    renderVals() {
      return {};
    }
  }

  function mount(template, root, Logic) {
    const builders = compile(template.content);
    const logic = new Logic();
    const callbacks = [];
    let queued = false;

    function render() {
      const vals = logic.renderVals();
      const out = [];
      for (const b of builders) b(vals, out, "");
      patch(root, out);
    }

    function flush() {
      queued = false;
      render();
      callbacks.splice(0).forEach((cb) => cb());
    }

    logic.__host = {
      apply(update, callback) {
        const next = typeof update === "function" ? update(logic.state) : update;
        if (next) logic.state = Object.assign({}, logic.state, next);
        if (callback) callbacks.push(callback);
        if (queued) return;
        queued = true;
        Promise.resolve().then(flush);
      },
    };

    render();
    logic.componentDidMount();
    return logic;
  }

  global.DCLogic = DCLogic;
  global.DC = { mount };
})(window);

// Search: tint matching rows, scroll to the first, and <mark> the exact
// matched text inside each row. A row matches when the query is a
// substring of its visible text, OR a prefix of the spelled-out name of
// a Greek symbol in the row — so "lam" or "lambda" finds λ, "ome" or
// "omega" finds Ω/ω. Prefix (not substring) matching on the name keeps
// "mega" from matching "omega".
const greek = {
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon",
  "ζ": "zeta", "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa",
  "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi", "ο": "omicron",
  "π": "pi", "ρ": "rho", "σ": "sigma", "τ": "tau", "υ": "upsilon",
  "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
  "Γ": "gamma", "Δ": "delta", "Θ": "theta", "Λ": "lambda", "Ξ": "xi",
  "Π": "pi", "Σ": "sigma", "Φ": "phi", "Ψ": "psi", "Ω": "omega",
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const rows = [...document.querySelectorAll(".sheet tbody tr")];
for (const row of rows) {
  const raw = row.textContent;
  row.__text = raw.toLowerCase();
  row.__html = row.innerHTML; // snapshot, so we can clear old highlights
  const g = [];
  for (const [ch, name] of Object.entries(greek)) {
    if (raw.includes(ch)) g.push([ch, name]);
  }
  row.__greek = g;
}

// Wrap every occurrence of any term in <mark>, walking text nodes only so
// we never touch the markup (sup/sub/spans) around the matched text.
function markTerms(row, terms) {
  if (!terms.length) return;
  const re = new RegExp("(" + terms.map(escapeRe).join("|") + ")", "gi");
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    re.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = re.exec(text))) {
      frag = frag || document.createDocumentFragment();
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const el = document.createElement("mark");
      el.textContent = m[0];
      frag.appendChild(el);
      last = m.index + m[0].length;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    if (frag) {
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }
      node.parentNode.replaceChild(frag, node);
    }
  }
}

const input = document.getElementById("search");
input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();
  let first = null;
  for (const row of rows) {
    row.innerHTML = row.__html; // restore, clearing previous <mark>s
    if (!q) {
      row.classList.remove("match");
      continue;
    }
    const textHit = row.__text.includes(q);
    const greekChars = row.__greek
      .filter(([, name]) => name.startsWith(q))
      .map(([ch]) => ch);
    const hit = textHit || greekChars.length > 0;
    row.classList.toggle("match", hit);
    if (hit) {
      const terms = [];
      if (textHit) terms.push(q);
      terms.push(...greekChars);
      markTerms(row, terms);
      if (!first) first = row;
    }
  }
  if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
});

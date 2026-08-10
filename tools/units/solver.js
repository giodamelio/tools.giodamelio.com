// Click a unit row to see the equations that relate it to other
// quantities — "related" means linked by an equation. The relation set
// was discovered and dimensionally validated offline, then curated by
// hand; only the named equations ship here. Each equation is a compact
// list row with a calculator toggle on the right; opening it reveals an
// inline solver — fill all but one field and the remaining (disabled) box
// shows the result — with a unit selector per input (default SI). Click a
// symbol to jump to a quantity.
(() => {
  const ALIAS = {
    "Length / Displacement": "Length / Distance",
    "Wavelength": "Length / Distance",
  };
  const canon = (q) => ALIAS[q] || q;

  // [name, display, coefficient, [ [symbol, quantity, exponent], ... ]]
  // The variables form a monomial: coeff · Π varᵢ^expᵢ = 1, so the
  // target gets exponent -1 and the factors get positive exponents.
  // Variables are a LIST (not keyed by quantity) so distinct variables
  // that share a quantity — e.g. length × width — each get their own box.
  const EQ = [
    ["Newton's 2nd law", "F = m·a", 1, [["F", "Force", -1], ["m", "Mass", 1], ["a", "Acceleration", 1]]],
    ["Momentum", "p = m·v", 1, [["p", "Linear Momentum", -1], ["m", "Mass", 1], ["v", "Velocity / Speed", 1]]],
    ["Work", "W = F·d", 1, [["W", "Energy / Work / Heat", -1], ["F", "Force", 1], ["d", "Length / Distance", 1]]],
    ["Kinetic energy", "Eₖ = ½·m·v²", 0.5, [["Eₖ", "Energy / Work / Heat", -1], ["m", "Mass", 1], ["v", "Velocity / Speed", 2]]],
    ["Power (work rate)", "P = W / t", 1, [["P", "Power", -1], ["W", "Energy / Work / Heat", 1], ["t", "Time", -1]]],
    ["Power (force × velocity)", "P = F·v", 1, [["P", "Power", -1], ["F", "Force", 1], ["v", "Velocity / Speed", 1]]],
    ["Velocity", "v = d / t", 1, [["v", "Velocity / Speed", -1], ["d", "Length / Distance", 1], ["t", "Time", -1]]],
    ["Acceleration", "a = Δv / Δt", 1, [["a", "Acceleration", -1], ["Δv", "Velocity / Speed", 1], ["Δt", "Time", -1]]],
    ["Jerk", "j = Δa / Δt", 1, [["j", "Jerk / Jolt", -1], ["Δa", "Acceleration", 1], ["Δt", "Time", -1]]],
    ["Density", "ρ = m / V", 1, [["ρ", "Density", -1], ["m", "Mass", 1], ["V", "Volume", -1]]],
    ["Pressure", "P = F / A", 1, [["P", "Pressure / Stress", -1], ["F", "Force", 1], ["A", "Area", -1]]],
    ["Impulse", "J = F·Δt", 1, [["J", "Impulse", -1], ["F", "Force", 1], ["Δt", "Time", 1]]],
    ["Impulse–momentum", "J = Δp", 1, [["J", "Impulse", -1], ["Δp", "Linear Momentum", 1]]],
    ["Surface tension", "γ = F / L", 1, [["γ", "Surface Tension", -1], ["F", "Force", 1], ["L", "Length / Distance", -1]]],
    ["Area", "A = l·w", 1, [["A", "Area", -1], ["l", "Length / Distance", 1], ["w", "Length / Distance", 1]]],
    ["Volume", "V = l·w·h", 1, [["V", "Volume", -1], ["l", "Length / Distance", 1], ["w", "Length / Distance", 1], ["h", "Length / Distance", 1]]],
    ["Angular velocity", "ω = Δθ / Δt", 1, [["ω", "Angular Velocity", -1], ["Δθ", "Angular Displacement", 1], ["Δt", "Time", -1]]],
    ["Angular acceleration", "α = Δω / Δt", 1, [["α", "Angular Acceleration", -1], ["Δω", "Angular Velocity", 1], ["Δt", "Time", -1]]],
    ["Frequency", "f = 1 / T", 1, [["f", "Frequency", -1], ["T", "Period", -1]]],
    ["Angular frequency", "ω = 2π·f", 6.283185307, [["ω", "Angular Velocity", -1], ["f", "Frequency", 1]]],
    ["Torque", "τ = I·α", 1, [["τ", "Torque", -1], ["I", "Moment of Inertia", 1], ["α", "Angular Acceleration", 1]]],
    ["Angular momentum", "L = I·ω", 1, [["L", "Angular Momentum", -1], ["I", "Moment of Inertia", 1], ["ω", "Angular Velocity", 1]]],
    ["Moment of inertia (point mass)", "I = m·r²", 1, [["I", "Moment of Inertia", -1], ["m", "Mass", 1], ["r", "Length / Distance", 2]]],
    ["Rotational kinetic energy", "Eₖ = ½·I·ω²", 0.5, [["Eₖ", "Energy / Work / Heat", -1], ["I", "Moment of Inertia", 1], ["ω", "Angular Velocity", 2]]],
    ["Charge", "Q = I·t", 1, [["Q", "Electric Charge", -1], ["I", "Electric Current", 1], ["t", "Time", 1]]],
    ["Ohm's law", "V = I·R", 1, [["V", "Voltage / EMF", -1], ["I", "Electric Current", 1], ["R", "Resistance", 1]]],
    ["Electric power", "P = V·I", 1, [["P", "Power", -1], ["V", "Voltage / EMF", 1], ["I", "Electric Current", 1]]],
    ["Joule heating", "P = I²·R", 1, [["P", "Power", -1], ["I", "Electric Current", 2], ["R", "Resistance", 1]]],
    ["Electric field", "E = V / d", 1, [["E", "Electric Field", -1], ["V", "Voltage / EMF", 1], ["d", "Length / Distance", -1]]],
    ["Capacitance", "C = Q / V", 1, [["C", "Capacitance", -1], ["Q", "Electric Charge", 1], ["V", "Voltage / EMF", -1]]],
    ["Conductance", "G = 1 / R", 1, [["G", "Conductance", -1], ["R", "Resistance", -1]]],
    ["Current density", "J = I / A", 1, [["J", "Current Density", -1], ["I", "Electric Current", 1], ["A", "Area", -1]]],
    ["Magnetic flux", "Φ = B·A", 1, [["Φ", "Magnetic Flux", -1], ["B", "Magnetic Flux Density", 1], ["A", "Area", 1]]],
    ["Inductance", "L = Φ / I", 1, [["L", "Inductance", -1], ["Φ", "Magnetic Flux", 1], ["I", "Electric Current", -1]]],
    ["Capacitor energy", "E = ½·C·V²", 0.5, [["E", "Energy / Work / Heat", -1], ["C", "Capacitance", 1], ["V", "Voltage / EMF", 2]]],
    ["Inductor energy", "E = ½·L·I²", 0.5, [["E", "Energy / Work / Heat", -1], ["L", "Inductance", 1], ["I", "Electric Current", 2]]],
    ["Luminous flux", "Φᵥ = Iᵥ·Ω", 1, [["Φᵥ", "Luminous Flux", -1], ["Iᵥ", "Luminous Intensity", 1], ["Ω", "Solid Angle", 1]]],
    ["Illuminance", "Eᵥ = Φᵥ / A", 1, [["Eᵥ", "Illuminance", -1], ["Φᵥ", "Luminous Flux", 1], ["A", "Area", -1]]],
  ];

  // Units per quantity: [symbol, value-in-SI]. SI unit first = default.
  const _LEN = [["m", 1], ["cm", 0.01], ["mm", 0.001], ["km", 1000], ["in", 0.0254], ["ft", 0.3048], ["mi", 1609.344]];
  const _MASS = [["kg", 1], ["g", 0.001], ["mg", 1e-6], ["t", 1000], ["lb", 0.45359237], ["oz", 0.028349523125], ["slug", 14.5939029]];
  const _TIME = [["s", 1], ["ms", 0.001], ["min", 60], ["h", 3600], ["day", 86400]];
  const _AREA = [["m²", 1], ["cm²", 1e-4], ["ft²", 0.09290304], ["in²", 0.00064516], ["km²", 1e6], ["ha", 1e4], ["acre", 4046.8564224]];
  const _VOL = [["m³", 1], ["L", 0.001], ["mL", 1e-6], ["ft³", 0.028316846592], ["in³", 1.6387064e-5], ["gal", 0.003785411784]];
  const _SPEED = [["m/s", 1], ["km/h", 0.277777778], ["mph", 0.44704], ["ft/s", 0.3048], ["kn", 0.514444444]];
  const _FORCE = [["N", 1], ["kN", 1000], ["lbf", 4.4482216153], ["kgf", 9.80665], ["dyn", 1e-5]];
  const _ENERGY = [["J", 1], ["kJ", 1000], ["cal", 4.184], ["kcal", 4184], ["Wh", 3600], ["kWh", 3.6e6], ["ft·lb", 1.3558179483], ["BTU", 1055.05585], ["eV", 1.602176634e-19]];
  const _POWER = [["W", 1], ["kW", 1000], ["MW", 1e6], ["hp", 745.6998716], ["BTU/h", 0.2930710702]];
  const _PRESSURE = [["Pa", 1], ["kPa", 1000], ["bar", 1e5], ["atm", 101325], ["psi", 6894.757293], ["torr", 133.3223684], ["mmHg", 133.322387]];
  const _ANGLE = [["rad", 1], ["°", 0.01745329252], ["grad", 0.01570796327], ["rev", 6.283185307]];
  const _ACCEL = [["m/s²", 1], ["g", 9.80665], ["ft/s²", 0.3048]];
  const _ANGVEL = [["rad/s", 1], ["rpm", 0.104719755], ["°/s", 0.01745329252], ["rev/s", 6.283185307]];
  const _ANGACC = [["rad/s²", 1], ["°/s²", 0.01745329252]];
  const _FREQ = [["Hz", 1], ["kHz", 1e3], ["MHz", 1e6], ["GHz", 1e9], ["rpm", 0.016666667]];
  const _TORQUE = [["N·m", 1], ["kgf·m", 9.80665], ["lbf·ft", 1.3558179483]];
  const _DENSITY = [["kg/m³", 1], ["g/cm³", 1000], ["g/L", 1]];
  const _CHARGE = [["C", 1], ["mC", 1e-3], ["µC", 1e-6], ["mA·h", 3.6], ["A·h", 3600]];
  const _CURRENT = [["A", 1], ["mA", 1e-3], ["µA", 1e-6], ["kA", 1e3]];
  const _VOLT = [["V", 1], ["mV", 1e-3], ["kV", 1e3], ["µV", 1e-6]];
  const _RES = [["Ω", 1], ["mΩ", 1e-3], ["kΩ", 1e3], ["MΩ", 1e6]];
  const _CAP = [["F", 1], ["mF", 1e-3], ["µF", 1e-6], ["nF", 1e-9], ["pF", 1e-12]];
  const _COND = [["S", 1], ["mS", 1e-3], ["µS", 1e-6]];
  const _IND = [["H", 1], ["mH", 1e-3], ["µH", 1e-6]];
  const _MAGFLUX = [["Wb", 1], ["mWb", 1e-3]];
  const _FLUXDEN = [["T", 1], ["mT", 1e-3], ["G", 1e-4]];
  const UNITS = {
    "Force": _FORCE, "Mass": _MASS, "Acceleration": _ACCEL, "Linear Momentum": [["kg·m/s", 1]],
    "Velocity / Speed": _SPEED, "Energy / Work / Heat": _ENERGY, "Length / Distance": _LEN,
    "Power": _POWER, "Time": _TIME, "Jerk / Jolt": [["m/s³", 1]], "Density": _DENSITY, "Volume": _VOL,
    "Pressure / Stress": _PRESSURE, "Impulse": [["N·s", 1], ["kg·m/s", 1]], "Surface Tension": [["N/m", 1]],
    "Area": _AREA, "Angular Velocity": _ANGVEL, "Angular Displacement": _ANGLE,
    "Angular Acceleration": _ANGACC, "Frequency": _FREQ, "Period": _TIME, "Torque": _TORQUE,
    "Moment of Inertia": [["kg·m²", 1]], "Angular Momentum": [["kg·m²/s", 1]],
    "Electric Charge": _CHARGE, "Electric Current": _CURRENT, "Resistance": _RES,
    "Voltage / EMF": _VOLT, "Electric Field": [["V/m", 1]], "Capacitance": _CAP,
    "Conductance": _COND, "Current Density": [["A/m²", 1]], "Magnetic Flux": _MAGFLUX,
    "Magnetic Flux Density": _FLUXDEN, "Inductance": _IND, "Luminous Flux": [["lm", 1]],
    "Luminous Intensity": [["cd", 1]], "Solid Angle": [["sr", 1]], "Illuminance": [["lx", 1]],
  };

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/>' +
    '<line x1="9" y1="12" x2="9" y2="12"/><line x1="12" y1="12" x2="12" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/>' +
    '<line x1="9" y1="16" x2="9" y2="16"/><line x1="12" y1="16" x2="12" y2="16"/><line x1="15" y1="16" x2="15" y2="16"/></svg>';

  // Index: quantity -> equations that mention it (deduped per equation,
  // since one equation can reference a quantity more than once, e.g. the
  // two lengths in A = l·w).
  const index = {};
  for (const eq of EQ) {
    const seen = new Set();
    for (const v of eq[3]) {
      if (seen.has(v[1])) continue;
      seen.add(v[1]);
      (index[v[1]] = index[v[1]] || []).push(eq);
    }
  }

  // Symbol + SI unit per quantity, read from the table (display only).
  const SYM = {}, SI = {};
  document.querySelectorAll(".sheet section").forEach((sec) => {
    const h = sec.querySelector("h2");
    if (h && h.textContent.includes("Prefix")) return;
    sec.querySelectorAll("tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      if (!tds.length) return;
      const key = canon(tds[0].textContent.trim());
      if (key in SYM) return;
      SYM[key] = ((tds[1] && tds[1].textContent) || "").trim().split(/[,\s]/)[0] || key;
      SI[key] = ((tds[2] && tds[2].textContent) || "").trim();
    });
  });

  const sym = (q) => SYM[q] || q;
  const fmt = (n) => {
    if (!isFinite(n)) return "—";
    if (n === 0) return "0";
    const abs = Math.abs(n);
    let s = abs < 1e-4 || abs >= 1e7 ? n.toExponential(4) : n.toPrecision(7);
    if (s.includes("e")) return s.replace(/\.?0+e/, "e");
    return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
  };

  const modal = document.getElementById("convModal");
  const title = document.getElementById("convTitle");
  const sub = document.getElementById("convSub");
  const body = document.getElementById("convBody");
  const closeBtn = document.getElementById("convClose");

  function card(eq) {
    const el = document.createElement("div");
    el.className = "eqn";

    const head = document.createElement("div");
    head.className = "eqn-head";
    const f = document.createElement("span");
    f.className = "eqn-f";
    f.textContent = eq[1];
    const nm = document.createElement("span");
    nm.className = "eqn-name";
    nm.textContent = eq[0];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "eqn-calc";
    btn.title = "Calculator";
    btn.setAttribute("aria-label", "Calculator for " + eq[0]);
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = ICON;
    head.append(f, nm, btn);
    el.appendChild(head);

    const solve = document.createElement("div");
    solve.className = "eqn-solve";
    solve.setAttribute("hidden", "");
    const coeff = eq[2];
    const vlist = eq[3]; // [ [symbol, quantity, exponent], ... ]
    // One field per list entry (by position), so distinct same-quantity
    // variables (e.g. length × width) each get their own box.
    const fields = vlist.map(([s, q]) => ({ sym: s, q }));
    vlist.forEach((v, i) => {
      const [s, q] = v;
      const cell = document.createElement("span");
      cell.className = "eqn-var";
      const name = document.createElement("span");
      name.className = "eqn-var-name";
      name.textContent = q; // full quantity name, e.g. "Force"
      const row = document.createElement("span");
      row.className = "eqn-var-row";
      const link = document.createElement("span");
      link.className = "qlink";
      link.dataset.q = q;
      link.title = q;
      link.textContent = s;
      const inp = document.createElement("input");
      inp.type = "number";
      inp.step = "any";
      inp.setAttribute("aria-label", s + " (" + q + ")");
      inp.title = q;
      row.append(link, inp);
      const us = UNITS[q] || [[sym(q), 1]];
      let getF, getS;
      if (us.length > 1) {
        const sel = document.createElement("select");
        sel.className = "eqn-unit";
        sel.setAttribute("aria-label", s + " unit");
        for (const pair of us) {
          const o = document.createElement("option");
          o.value = String(pair[1]);
          o.textContent = pair[0];
          sel.appendChild(o);
        }
        row.appendChild(sel);
        getF = () => parseFloat(sel.value);
        getS = () => sel.options[sel.selectedIndex].textContent;
      } else {
        const sp = document.createElement("span");
        sp.className = "eqn-unit-fixed";
        sp.textContent = us[0][0];
        row.appendChild(sp);
        getF = () => us[0][1];
        getS = () => us[0][0];
      }
      cell.append(name, row);
      fields[i].inp = inp;
      fields[i].getF = getF;
      fields[i].getS = getS;
      solve.appendChild(cell);
    });
    const out = document.createElement("div");
    out.className = "eqn-out";
    out.textContent = "Fill in all but one value to solve.";
    solve.appendChild(out);
    el.appendChild(solve);

    const update = () => {
      // Each field is one variable (by position). The disabled box, if
      // any, is the current output — ignore its value when deciding what
      // the user has supplied.
      const idx = fields.map((_, i) => i);
      const userFilled = idx.filter(
        (i) => !fields[i].inp.disabled && fields[i].inp.value.trim() !== "",
      );
      if (userFilled.length !== fields.length - 1) {
        // Not uniquely solvable: re-enable every box and clear whatever
        // value we previously computed into the (disabled) output box.
        for (const i of idx) {
          const inp = fields[i].inp;
          if (inp.disabled) {
            inp.disabled = false;
            inp.type = "number";
            inp.value = "";
          }
        }
        out.textContent = "Fill in all but one value to solve.";
        return;
      }
      const X = idx.find((i) => !userFilled.includes(i));
      let denom = coeff;
      for (const i of idx) {
        if (i === X) continue;
        const raw = parseFloat(fields[i].inp.value);
        if (isNaN(raw)) {
          out.textContent = "Enter valid numbers.";
          return;
        }
        denom *= Math.pow(raw * fields[i].getF(), vlist[i][2]);
      }
      const xval = Math.pow(1 / denom, 1 / vlist[X][2]) / fields[X].getF();
      // Show the solution in its own (disabled) box.
      const xi = fields[X].inp;
      xi.type = "text";
      xi.disabled = true;
      xi.value = fmt(xval);
      out.textContent = "";
    };
    solve.addEventListener("input", update);
    solve.addEventListener("change", update);
    btn.addEventListener("click", () => {
      if (solve.hasAttribute("hidden")) {
        solve.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        const first = solve.querySelector("input");
        if (first) first.focus();
      } else {
        solve.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    return el;
  }

  function openModal(key) {
    key = canon(key);
    const eqs = index[key];
    if (!eqs) return;
    title.textContent = key;
    sub.textContent = [sym(key), SI[key]].filter(Boolean).join(" · ");
    body.textContent = "";
    const h = document.createElement("h3");
    h.textContent = "Equations involving " + key;
    body.appendChild(h);
    for (const eq of eqs) body.appendChild(card(eq));
    const note = document.createElement("p");
    note.className = "modal-note";
    note.append(
      "Related = quantities linked to " + key +
        " by an equation; click a symbol to follow it, or ",
    );
    const noteIcon = document.createElement("span");
    noteIcon.innerHTML = ICON; // same icon as the calculator toggle
    note.append(noteIcon, " to calculate.");
    body.appendChild(note);
    modal.hidden = false;
    document.removeEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);
  }
  function closeModal() {
    modal.hidden = true;
    body.textContent = "";
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") closeModal();
  }
  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  body.addEventListener("click", (e) => {
    const link = e.target.closest(".qlink");
    if (link) openModal(link.dataset.q);
  });

  for (const tr of document.querySelectorAll(".sheet section tbody tr")) {
    const cell = tr.querySelector("td");
    if (!cell) continue;
    const key = canon(cell.textContent.trim());
    if (!index[key]) continue;
    tr.classList.add("convertible");
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.addEventListener("click", () => openModal(key));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(key);
      }
    });
  }
})();

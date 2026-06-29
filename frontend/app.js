/* FIFA World Cup 2026 — Model Predictions front-end.
   Sportsbook bet-slip view. Reads predictions live from Supabase (anon key). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const CFG = window.SUPABASE_CFG;

  // team name -> ISO-3166 alpha-2; flag emoji computed at runtime (keeps this
  // file pure-ASCII and avoids fragile emoji escaping).
  const ISO = {
    "Brazil": "BR", "Japan": "JP", "Germany": "DE", "Paraguay": "PY",
    "Netherlands": "NL", "Morocco": "MA", "Ivory Coast": "CI", "Norway": "NO",
    "France": "FR", "Sweden": "SE", "Mexico": "MX", "Ecuador": "EC",
    "England": "GB", "Congo DR": "CD", "Belgium": "BE", "Senegal": "SN",
    "USMNT": "US", "USA": "US", "Bosnia and Herzegovina": "BA", "Spain": "ES",
    "Austria": "AT", "Portugal": "PT", "Croatia": "HR", "Switzerland": "CH",
    "Algeria": "DZ", "Australia": "AU", "Egypt": "EG", "Argentina": "AR",
    "Cape Verde Islands": "CV", "Colombia": "CO", "Ghana": "GH", "Uruguay": "UY",
    "Italy": "IT", "Canada": "CA", "South Korea": "KR", "Saudi Arabia": "SA",
    "Tunisia": "TN", "Iraq": "IQ", "Czechia": "CZ", "South Africa": "ZA",
    "Turkey": "TR", "Portugal Liga NOS": "PT",
  };
  function flag(name) {
    const c = ISO[name];
    if (!c || c.length !== 2) return "⚽";
    return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);

  const state = { rows: [], q: "", conf: "all", sort: "date" };

  async function load() {
    const l = $("#loading"); if (l) l.textContent = "Loading picks…";
    try {
      const res = await fetch(
        `${CFG.url}/rest/v1/${CFG.table}?select=*&order=date.asc`,
        { headers: { apikey: CFG.anonKey, Authorization: `Bearer ${CFG.anonKey}` } }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.rows = await res.json();
      render();
    } catch (e) {
      $("#cards").innerHTML =
        `<p class="empty">Couldn't reach Supabase (${esc(e.message)}). Check the URL / anon key
         in config.js and that the table has a public read policy.</p>`;
    }
  }

  function meta() {
    const rows = state.rows;
    const high = rows.filter((r) => r.confidence_category === "High").length;
    const totals = rows.map((r) => (+r.predicted_home_goals || 0) + (+r.predicted_away_goals || 0));
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    const updated = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), "");
    const when = updated ? new Date(updated).toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    $("#metaBar").innerHTML = `
      <div class="stat stat--live"><span class="stat__n"><span class="dot"></span>Live</span><span class="stat__l">Model feed</span></div>
      <div class="stat"><span class="stat__n">${rows.length}</span><span class="stat__l">Picks</span></div>
      <div class="stat"><span class="stat__n">${high}</span><span class="stat__l">High confidence</span></div>
      <div class="stat"><span class="stat__n">${avg.toFixed(1)}</span><span class="stat__l">Avg goals / game</span></div>
      <div class="stat"><span class="stat__n" style="font-size:15px">${when}</span><span class="stat__l">Updated</span></div>`;
    $("#genFooter").textContent = "Agility Picks · FootyStats → Ridge model → Supabase";
  }

  const winnerSide = (r) =>
    r.predicted_winner === "Home Win" ? "home" :
    r.predicted_winner === "Away Win" ? "away" : "draw";

  function card(r) {
    const side = winnerSide(r);
    const overPick = (r.predicted_outcome || "").toLowerCase().includes("over");
    const g = r.grade || "—";
    const gc = "grade-" + (g[0] === "A" || g[0] === "B" || g[0] === "C" ? g[0] : "D");
    const when = r.date ? new Date(r.date).toLocaleDateString(undefined,
      { weekday: "short", month: "short", day: "numeric" }) : "";
    const conf = r.confidence_category || "—";
    const w = conf === "High" ? 90 : conf === "Medium" ? 62 : 34;
    const pickName = side === "home" ? r.home_team : side === "away" ? r.away_team : "Draw";

    const oddBtn = (lbl, val, sel, mark) =>
      `<div class="odd${sel ? " sel" : ""}${sel && mark ? " pickmark" : ""}">` +
      `<span class="odd__lbl">${lbl}</span><span class="odd__val">${num(val, 2)}</span></div>`;

    const teamRow = (isPick, name, pg) =>
      `<div class="row ${isPick ? "pick" : ""}"><span class="flag">${flag(name)}</span>` +
      `<span class="team">${esc(name)}</span><span class="pg">${num(pg, 1)}</span></div>`;

    let result = "";
    if (r.status && r.status !== "PENDING" && r.actual_winner) {
      const hit = r.actual_winner === r.predicted_winner;
      result = `<div class="result ${hit ? "win" : "loss"}">Result: ${esc(r.actual_winner)} — ` +
        `${hit ? "called it ✓" : "missed"}</div>`;
    }

    return `
    <article class="slip">
      <div class="slip__head"><span class="tag">World Cup</span><span class="when">${esc(when)}</span></div>
      <div class="event">
        ${teamRow(side === "home", r.home_team, r.predicted_home_goals)}
        ${teamRow(side === "away", r.away_team, r.predicted_away_goals)}
      </div>
      <div class="picks">
        ${oddBtn("Home wins", r.home_odds, side === "home", true)}
        ${oddBtn("Draw", r.draw_odds, side === "draw", true)}
        ${oddBtn("Away wins", r.away_odds, side === "away", true)}
      </div>
      <div class="markets">
        <span class="mk-label">Total 2.5</span>
        <div class="ou">
          ${oddBtn("Over", r.over_2_5_odds, overPick, false)}
          ${oddBtn("Under", r.under_2_5_odds, !overPick, false)}
        </div>
        <span class="grade ${gc}">${esc(g)}</span>
      </div>
      <div class="meter">
        <div class="meter__bar"><i class="${g[0] === "A" ? "gold" : ""}" style="width:${w}%"></i></div>
        <div class="meter__txt"><span>${esc(conf)} confidence</span><span>Pick: <b>${esc(pickName)}</b></span></div>
      </div>
      ${result}
    </article>`;
  }

  function render() {
    meta();
    let list = state.rows.slice();
    const q = state.q.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.home_team} ${r.away_team}`.toLowerCase().includes(q));
    if (state.conf === "High") list = list.filter((r) => r.confidence_category === "High");
    if (state.conf === "Medium") list = list.filter((r) => r.confidence_category !== "Low");

    const order = { "A+": 0, "A": 1, "A-": 2, "B+": 3, "B": 4, "B-": 5, "C+": 6, "C": 7, "C-": 8, "D": 9 };
    if (state.sort === "grade") list.sort((a, b) => (order[a.grade] ?? 9) - (order[b.grade] ?? 9));
    else if (state.sort === "confidence") list.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    else list.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    $("#cards").innerHTML = list.length
      ? list.map(card).join("")
      : '<p class="empty">No picks match this filter.</p>';
  }

  $("#search").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#confFilter").addEventListener("change", (e) => { state.conf = e.target.value; render(); });
  $("#sortBy").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#refreshBtn").addEventListener("click", load);
  $("#printBtn").addEventListener("click", () => window.print());

  // ---- basic login gate (hardcoded credentials; NOT real security) ----
  // username (lowercased) -> password
  const USERS = {
    nihar: "Nihar@1234",
    chrisbets: "Chris@1122",
  };
  const AUTH_KEY = "wc_auth";
  const showGate = () => $("#gate").classList.remove("is-hidden");
  const hideGate = () => $("#gate").classList.add("is-hidden");

  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = $("#u").value.trim().toLowerCase();
    const p = $("#p").value;
    if (USERS[u] && USERS[u] === p) {
      sessionStorage.setItem(AUTH_KEY, "1");
      $("#err").hidden = true;
      $("#p").value = "";
      hideGate();
      load();
    } else {
      $("#err").hidden = false;
      $("#p").value = "";
    }
  });
  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    showGate();
    $("#u").focus();
  });

  // gate the app behind the (cosmetic) login
  if (sessionStorage.getItem(AUTH_KEY) === "1") { hideGate(); load(); }
  else { showGate(); $("#u").focus(); }
})();

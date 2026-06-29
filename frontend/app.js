/* FIFA World Cup 2026 — Model Predictions front-end.
   Reads predictions live from Supabase (anon key, read-only) and renders cards. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const CFG = window.SUPABASE_CFG;

  // team name -> flag emoji (fallback: soccer ball)
  const FLAGS = {
    "Brazil": "🇧🇷", "Japan": "🇯🇵", "Germany": "🇩🇪", "Paraguay": "🇵🇾",
    "Netherlands": "🇳🇱", "Morocco": "🇲🇦", "Ivory Coast": "🇨🇮", "Norway": "🇳🇴",
    "France": "🇫🇷", "Sweden": "🇸🇪", "Mexico": "🇲🇽", "Ecuador": "🇪🇨",
    "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Congo DR": "🇨🇩", "Belgium": "🇧🇪", "Senegal": "🇸🇳",
    "USMNT": "🇺🇸", "USA": "🇺🇸", "Bosnia and Herzegovina": "🇧🇦", "Spain": "🇪🇸",
    "Austria": "🇦🇹", "Portugal": "🇵🇹", "Croatia": "🇭🇷", "Switzerland": "🇨🇭",
    "Algeria": "🇩🇿", "Australia": "🇦🇺", "Egypt": "🇪\ud83c\udd ac".replace(/ /g,""), "Argentina": "🇦🇷",
    "Cape Verde Islands": "🇨🇻", "Colombia": "🇨🇴", "Ghana": "\ud83c\udd ac🇭".replace(/ /g,""), "Uruguay": "🇺🇾",
    "Italy": "🇮🇹", "Canada": "🇨🇦", "South Korea": "🇰🇷", "Saudi Arabia": "🇸🇦",
    "Tunisia": "🇹🇳", "Iraq": "🇮🇶", "Czechia": "🇨🇿", "South Africa": "🇿🇦",
  };
  const flag = (name) => FLAGS[name] || "⚽";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const state = { rows: [], q: "", conf: "all", sort: "date" };

  async function load() {
    $("#loading") && ($("#loading").textContent = "Loading predictions from Supabase…");
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
        `<p class="empty">Could not load from Supabase (${esc(e.message)}).<br>
         Check the URL/anon key in config.js and that the table has a public read policy.</p>`;
    }
  }

  function meta() {
    const rows = state.rows;
    const updated = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), "");
    const when = updated ? new Date(updated).toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    $("#metaBar").innerHTML = [
      `<span class="meta-chip"><span class="live"></span> Live from Supabase</span>`,
      `<span class="meta-chip">Predictions <b>${rows.length}</b></span>`,
      `<span class="meta-chip">Model <b>Ridge (FootyStats)</b></span>`,
      `<span class="meta-chip">Updated <b>${when}</b></span>`,
    ].join("");
    $("#genFooter").textContent = "Data source: FootyStats API · stored in Supabase";
  }

  const winnerSide = (r) =>
    r.predicted_winner === "Home Win" ? "home" :
    r.predicted_winner === "Away Win" ? "away" : "draw";

  const gradeClass = (g) => "grade-" + (g ? g[0] : "D");

  function num(v, d = 1) { return (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d); }

  function card(r) {
    const side = winnerSide(r);
    const over = (r.predicted_outcome || "").toLowerCase().includes("over");
    const date = r.date ? new Date(r.date).toLocaleDateString(undefined,
      { weekday: "short", month: "short", day: "numeric" }) : "";
    const odds = (r.home_odds || r.away_odds) ? `
      <div class="odds-row">
        <span>1 <b>${num(r.home_odds, 2)}</b></span>
        <span>X <b>${num(r.draw_odds, 2)}</b></span>
        <span>2 <b>${num(r.away_odds, 2)}</b></span>
        <span>O2.5 <b>${num(r.over_2_5_odds, 2)}</b></span>
      </div>` : "";

    let result = "";
    if (r.status && r.status !== "PENDING" && r.actual_winner) {
      const hit = r.actual_winner === r.predicted_winner;
      result = `<div class="result ${hit ? "win" : "loss"}">
        Result: ${esc(r.actual_winner)} ${hit ? "✓ called it" : "✗ missed"}</div>`;
    }

    return `
    <article class="card">
      <div class="card-top">
        <span class="round-badge">World Cup · ${esc(date)}</span>
        <span class="grade ${gradeClass(r.grade)}">${esc(r.grade || "—")}</span>
      </div>
      <div class="teams">
        <div class="team ${side === "home" ? "win" : ""}">
          <span class="flag">${flag(r.home_team)}</span><span class="nm">${esc(r.home_team)}</span></div>
        <div class="vs">vs</div>
        <div class="team ${side === "away" ? "win" : ""}">
          <span class="flag">${flag(r.away_team)}</span><span class="nm">${esc(r.away_team)}</span></div>
      </div>
      <div class="score">${num(r.predicted_home_goals)} <small>:</small> ${num(r.predicted_away_goals)}</div>
      <div class="outcome">${esc(r.predicted_winner || "")}</div>
      <div class="pills">
        <span class="pill ${over ? "on" : ""}">${esc(r.predicted_outcome || "")}</span>
        <span class="pill conf-${esc(r.confidence_category)}">${esc(r.confidence_category)} confidence</span>
        <span class="pill">CTMCL <b>${num(r.ctmcl, 2)}</b></span>
      </div>
      ${odds}
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
      : '<p class="empty">No predictions match this filter.</p>';
  }

  $("#search").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#confFilter").addEventListener("change", (e) => { state.conf = e.target.value; render(); });
  $("#sortBy").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#refreshBtn").addEventListener("click", load);
  $("#printBtn").addEventListener("click", () => window.print());

  load();
})();

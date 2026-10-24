/*
=========================================================
 MATCHCRAFT — STANDINGS & BRACKETS
 File: bracat.js
 Features:
 - League / Round Robin standings
 - Random group draw
 - Group standings and top-2 qualification
 - Knockout bracket and automatic winner progression
 - League & Knockout combined format
 - Champion display
 - Tournament-wise LocalStorage data isolation
 - MatchCraft Match Center / Fixtures result compatibility
=========================================================
*/

(() => {
  "use strict";

  const STORAGE = {
    tournaments: "matchcraft_tournaments",
    teams: "matchcraft_teams",
    matches: "matchcraft_matches",
    fixtures: "matchcraft_fixtures",
    fixturesAlt: "matchcraft_matches_fixtures",
    scheduled: "matchcraft_scheduled_matches",
    state: "matchcraft_bracat_state"
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  const read = (key, fallback = []) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const asArray = value => Array.isArray(value) ? value : [];

  const text = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const idOf = item =>
    String(item?.id ?? item?.teamId ?? item?.tournamentId ?? "");

  const sameId = (a, b) =>
    String(a ?? "") === String(b ?? "");

  const nameOf = team =>
    String(team?.name ?? team?.teamName ?? team?.shortName ?? "Unknown Team");

  const tournamentName = tournament =>
    String(tournament?.name ?? tournament?.tournamentName ?? "Tournament");

  const tournamentType = tournament =>
    String(tournament?.type ?? tournament?.format ?? "League").toLowerCase();

  const teamIdOfMatch = (match, side) => {
    const team = match?.[side + "Team"] ??
      match?.[side] ??
      match?.[side + "TeamName"] ??
      match?.[side + "Name"];

    if (team && typeof team === "object") {
      return String(team.id ?? team.teamId ?? team.name ?? "");
    }

    const directId = match?.[side + "TeamId"] ??
      match?.[side + "Id"];

    return String(directId ?? team ?? "");
  };

  const teamLabelOfMatch = (match, side) => {
    const team = match?.[side + "Team"] ??
      match?.[side] ??
      match?.[side + "TeamName"] ??
      match?.[side + "Name"];

    if (team && typeof team === "object") {
      return nameOf(team);
    }

    const id = teamIdOfMatch(match, side);
    const found = read(STORAGE.teams).find(teamItem =>
      sameId(idOf(teamItem), id)
    );

    return found ? nameOf(found) : String(team ?? "Unknown Team");
  };

  function getRoot() {
    let root = $("#standings") || $("#bracat");

    if (root) return root;

    const main = $(".dashboard-content") || $("main") || document.body;

    root = document.createElement("section");
    root.id = "standings";
    root.hidden = true;
    main.appendChild(root);

    return root;
  }

  const root = getRoot();

  function getState() {
    return read(STORAGE.state, {});
  }

  function saveState(state) {
    write(STORAGE.state, state);
  }

  function tournamentState(state, tournamentId) {
    const key = String(tournamentId);

    if (!state[key]) {
      state[key] = {
        groups: [],
        drawCreated: false,
        drawCreatedAt: null,
        bracket: [],
        championId: null,
        championName: null
      };
    }

    return state[key];
  }

  function getTournaments() {
    return asArray(read(STORAGE.tournaments));
  }

  function getTeams() {
    return asArray(read(STORAGE.teams));
  }

  function getTournamentTeams(tournament) {
    const teams = getTeams();
    const tournamentId = idOf(tournament);

    const linked = teams.filter(team =>
      sameId(team.tournamentId, tournamentId)
    );

    // If no team is linked to this tournament, show all teams
    // so the organizer can still select teams for the tournament.
    return linked.length ? linked : teams;
  }

  function tournamentIdOfMatch(match) {
    const direct = match?.tournamentId ??
      match?.competitionId ??
      match?.tournament?.id;

    if (direct !== undefined && direct !== null && direct !== "") {
      return String(direct);
    }

    const name = match?.tournamentName ??
      match?.competitionName ??
      match?.tournament?.name;

    if (!name) return "";

    const found = getTournaments().find(tournament =>
      tournamentName(tournament).toLowerCase() ===
      String(name).toLowerCase()
    );

    return found ? idOf(found) : "";
  }

  function isCompleted(match) {
    const status = String(
      match?.status ?? match?.matchStatus ?? ""
    ).toLowerCase();

    return (
      match?.completed === true ||
      match?.isCompleted === true ||
      match?.finished === true ||
      match?.isFinished === true ||
      status === "completed" ||
      status === "complete" ||
      status === "finished" ||
      status === "full-time" ||
      status === "fulltime" ||
      status === "ft"
    );
  }

  function scoreOf(match, side) {
    const direct = match?.[side + "Score"] ??
      match?.[side + "Goals"] ??
      match?.[side + "Total"];

    if (direct !== undefined && direct !== null && direct !== "") {
      const parsed = Number(direct);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const score = match?.score;

    if (score && typeof score === "object") {
      const value = score[side] ??
        score[side + "Score"] ??
        score[side + "Goals"];

      if (value !== undefined && value !== null && value !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }

    return null;
  }

  function getAllMatches() {
    const result = [];
    const seen = new Set();

    [
      STORAGE.matches,
      STORAGE.fixtures,
      STORAGE.fixturesAlt,
      STORAGE.scheduled
    ].forEach(key => {
      asArray(read(key)).forEach(match => {
        const id = String(match?.id ?? match?.matchId ?? "");

        const identity = id
          ? `${key}:${id}`
          : `${key}:${JSON.stringify(match)}`;

        if (!seen.has(identity)) {
          seen.add(identity);
          result.push({ ...match, __storageKey: key });
        }
      });
    });

    return result;
  }

  function isForTournament(match, tournament) {
    const matchTournamentId = tournamentIdOfMatch(match);

    if (matchTournamentId) {
      return sameId(matchTournamentId, idOf(tournament));
    }

    // Legacy match records without tournament metadata are ignored
    // to prevent unrelated matches affecting this tournament.
    return false;
  }

  function getCompletedResults(tournament) {
    return getAllMatches().filter(match => {
      if (!isForTournament(match, tournament)) return false;
      if (!isCompleted(match)) return false;

      const home = scoreOf(match, "home");
      const away = scoreOf(match, "away");

      return home !== null && away !== null;
    });
  }

  function createTableRow(team, groupName = "") {
    return {
      id: idOf(team),
      name: nameOf(team),
      group: groupName,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0
    };
  }

  function calculateStandings(teams, results, groupName = "") {
    const rows = teams.map(team => createTableRow(team, groupName));
    const byId = new Map(rows.map(row => [String(row.id), row]));
    const byName = new Map(rows.map(row => [row.name.toLowerCase(), row]));

    const findRow = (match, side) => {
      const id = teamIdOfMatch(match, side);
      const label = teamLabelOfMatch(match, side);

      return byId.get(String(id)) ||
        byName.get(String(label).toLowerCase()) ||
        null;
    };

    results.forEach(match => {
      const home = findRow(match, "home");
      const away = findRow(match, "away");

      if (!home || !away || home.id === away.id) return;

      const homeScore = scoreOf(match, "home");
      const awayScore = scoreOf(match, "away");

      if (homeScore === null || awayScore === null) return;

      home.played++;
      away.played++;

      home.gf += homeScore;
      home.ga += awayScore;
      away.gf += awayScore;
      away.ga += homeScore;

      if (homeScore > awayScore) {
        home.won++;
        home.points += 3;
        away.lost++;
      } else if (homeScore < awayScore) {
        away.won++;
        away.points += 3;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
        home.points++;
        away.points++;
      }
    });

    rows.forEach(row => {
      row.gd = row.gf - row.ga;
    });

    rows.sort((a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name)
    );

    return rows;
  }

  function shuffle(items) {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  function groupCountFor(tournament, teamCount) {
    const configured = Number(
      tournament?.groupCount ??
      tournament?.groups ??
      tournament?.numberOfGroups ??
      0
    );

    if (configured > 0) {
      return Math.min(teamCount, Math.floor(configured));
    }

    return Math.max(1, Math.ceil(teamCount / 4));
  }

  function makeGroups(teams, count) {
    const groups = Array.from({ length: count }, (_, index) => ({
      id: `group-${index + 1}`,
      name: `Group ${String.fromCharCode(65 + index)}`,
      teams: []
    }));

    shuffle(teams).forEach((team, index) => {
      groups[index % count].teams.push({
        id: idOf(team),
        name: nameOf(team)
      });
    });

    return groups;
  }

  function findTeamById(teams, id) {
    return teams.find(team => sameId(idOf(team), id)) || null;
  }

  function roundName(teamCount) {
    if (teamCount === 2) return "Final";
    if (teamCount === 4) return "Semi-Final";
    if (teamCount === 8) return "Quarter-Final";
    if (teamCount === 16) return "Round of 16";
    if (teamCount === 32) return "Round of 32";

    return `Round of ${teamCount}`;
  }

  function buildBracket(qualifiedTeams) {
    const teams = [...qualifiedTeams];
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, teams.length))));
    const slots = teams.concat(Array(Math.max(0, size - teams.length)).fill(null));
    const rounds = [];

    let currentSlots = slots;
    let roundNumber = 1;

    while (currentSlots.length >= 2) {
      const matches = [];

      for (let i = 0; i < currentSlots.length; i += 2) {
        matches.push({
          id: `r${roundNumber}-m${matches.length + 1}`,
          homeId: currentSlots[i]?.id ?? null,
          homeName: currentSlots[i]?.name ?? null,
          awayId: currentSlots[i + 1]?.id ?? null,
          awayName: currentSlots[i + 1]?.name ?? null,
          homeScore: null,
          awayScore: null,
          winnerId: null,
          winnerName: null
        });
      }

      rounds.push({
        id: `round-${roundNumber}`,
        name: roundName(currentSlots.length),
        matches
      });

      currentSlots = Array(matches.length).fill(null);
      roundNumber++;
    }

    return rounds;
  }

  function findBracketResult(bracketMatch, results) {
    const homeName = String(bracketMatch.homeName ?? "").toLowerCase();
    const awayName = String(bracketMatch.awayName ?? "").toLowerCase();

    if (!homeName || !awayName) return null;

    return results.find(match => {
      const matchHome = teamLabelOfMatch(match, "home").toLowerCase();
      const matchAway = teamLabelOfMatch(match, "away").toLowerCase();

      return (
        (matchHome === homeName && matchAway === awayName) ||
        (matchHome === awayName && matchAway === homeName)
      );
    }) || null;
  }

  function updateBracket(rounds, results) {
    rounds.forEach((round, roundIndex) => {
      round.matches.forEach(match => {
        match.homeScore = null;
        match.awayScore = null;
        match.winnerId = null;
        match.winnerName = null;

        if (!match.homeId && match.awayId) {
          match.winnerId = match.awayId;
          match.winnerName = match.awayName;
          return;
        }

        if (!match.awayId && match.homeId) {
          match.winnerId = match.homeId;
          match.winnerName = match.homeName;
          return;
        }

        if (!match.homeId || !match.awayId) return;

        const result = findBracketResult(match, results);
        if (!result) return;

        const homeScore = scoreOf(result, "home");
        const awayScore = scoreOf(result, "away");

        if (homeScore === null || awayScore === null || homeScore === awayScore) {
          match.homeScore = homeScore;
          match.awayScore = awayScore;
          return;
        }

        const resultHomeName = teamLabelOfMatch(result, "home").toLowerCase();
        const homeIsSame = resultHomeName ===
          String(match.homeName).toLowerCase();

        match.homeScore = homeIsSame ? homeScore : awayScore;
        match.awayScore = homeIsSame ? awayScore : homeScore;

        if (match.homeScore > match.awayScore) {
          match.winnerId = match.homeId;
          match.winnerName = match.homeName;
        } else {
          match.winnerId = match.awayId;
          match.winnerName = match.awayName;
        }
      });

      if (roundIndex < rounds.length - 1) {
        const nextRound = rounds[roundIndex + 1];
        const winners = round.matches.map(match =>
          match.winnerId
            ? { id: match.winnerId, name: match.winnerName }
            : null
        );

        nextRound.matches.forEach((nextMatch, index) => {
          const home = winners[index * 2] || null;
          const away = winners[index * 2 + 1] || null;

          nextMatch.homeId = home?.id ?? null;
          nextMatch.homeName = home?.name ?? null;
          nextMatch.awayId = away?.id ?? null;
          nextMatch.awayName = away?.name ?? null;
        });
      }
    });

    return rounds;
  }

  function formatLabel(type) {
    if (type.includes("knockout")) return "Knockout";
    if (type.includes("group")) return "Group Stage";
    if (type.includes("league")) return "League";
    return "League";
  }

  function hasGroups(type) {
    return type.includes("group") || type.includes("league & knockout") ||
      type.includes("league and knockout") || type.includes("mixed");
  }

  function hasLeague(type) {
    return type.includes("league") || type.includes("group") ||
      type.includes("round robin") || type.includes("round-robin") ||
      type.includes("mixed");
  }

  function hasKnockout(type) {
    return type.includes("knockout") || type.includes("mixed");
  }

  function renderShell() {
    root.innerHTML = `
      <div id="bracat" class="br-page">
        <header class="br-header">
          <div>
            <p class="br-eyebrow">MATCHCRAFT · TOURNAMENT CENTER</p>
            <h1>Standings & Brackets</h1>
            <p class="br-subtitle">
              Track points, group qualification, knockout rounds and the champion.
            </p>
          </div>
          <button type="button" class="br-btn br-btn-primary" id="brRefresh">
            <i class="fa-solid fa-rotate"></i> Refresh Results
          </button>
        </header>

        <section class="br-panel">
          <div class="br-panel-heading">
            <div>
              <h2>Tournament Workspace</h2>
              <p>Select a tournament to view its standings and bracket.</p>
            </div>
          </div>

          <div class="br-controls">
            <label class="br-field">
              <span>Tournament</span>
              <select id="brTournamentSelect"></select>
            </label>
            <label class="br-field">
              <span>Competition Format</span>
              <input id="brFormatDisplay" type="text" readonly>
            </label>
          </div>

          <div class="br-actions">
            <button type="button" class="br-btn br-btn-primary" id="brDrawGroups">
              <i class="fa-solid fa-shuffle"></i> Random Group Draw
            </button>
            <button type="button" class="br-btn" id="brCreateBracket">
              <i class="fa-solid fa-diagram-project"></i> Create / Update Bracket
            </button>
          </div>
          <p class="br-help">
            A draw replaces the selected tournament's existing groups. Confirm before redrawing.
          </p>
        </section>

        <div class="br-stats" id="brStats"></div>

        <section class="br-panel" id="brGroupsPanel">
          <div class="br-panel-heading">
            <div>
              <h2>Group Stage</h2>
              <p>Teams are ranked by points, goal difference and goals scored.</p>
            </div>
          </div>
          <div id="brGroupsContent"></div>
        </section>

        <section class="br-panel" id="brLeaguePanel">
          <div class="br-panel-heading">
            <div>
              <h2>League Standings</h2>
              <p>Win: 3 points · Draw: 1 point · Loss: 0 points</p>
            </div>
          </div>
          <div id="brLeagueContent"></div>
        </section>

        <section class="br-panel" id="brBracketPanel">
          <div class="br-panel-heading">
            <div>
              <h2>Knockout Bracket</h2>
              <p>Winners progress automatically when a completed match has a decisive score.</p>
            </div>
          </div>
          <div id="brBracketContent"></div>
        </section>

        <section class="br-champion" id="brChampionPanel"></section>

        <p class="br-footnote">
          Standings and brackets use completed match results only. Scheduled matches do not count as 0–0.
        </p>
      </div>
    `;

    bindEvents();
  }

  function selectedTournament() {
    const select = $("#brTournamentSelect", root);
    return getTournaments().find(tournament =>
      sameId(idOf(tournament), select?.value)
    ) || null;
  }

  function ensureTournamentOptions() {
    const select = $("#brTournamentSelect", root);
    if (!select) return;

    const previous = select.value;
    const tournaments = getTournaments();

    select.innerHTML = tournaments.length
      ? tournaments.map(tournament => `
          <option value="${text(idOf(tournament))}">
            ${text(tournamentName(tournament))}
          </option>
        `).join("")
      : `<option value="">No tournaments found</option>`;

    if (tournaments.some(tournament => sameId(idOf(tournament), previous))) {
      select.value = previous;
    }
  }

  function renderStats(tournament, teams, results, state) {
    const host = $("#brStats", root);
    const played = results.length;
    const groups = state.groups?.length || 0;
    const champion = state.championName || "Not decided";

    const stats = [
      ["Teams", teams.length, "fa-people-group"],
      ["Completed Matches", played, "fa-futbol"],
      ["Groups", groups, "fa-layer-group"],
      ["Champion", champion, "fa-trophy"]
    ];

    host.innerHTML = stats.map(([label, value, icon]) => `
      <article class="br-stat-card">
        <span class="br-stat-icon"><i class="fa-solid ${icon}"></i></span>
        <div>
          <span class="br-stat-label">${text(label)}</span>
          <strong>${text(value)}</strong>
        </div>
      </article>
    `).join("");
  }

  function tableMarkup(rows, options = {}) {
    const qualify = options.qualify === true;

    if (!rows.length) {
      return `<div class="br-empty">No teams are available for this table.</div>`;
    }

    return `
      <div class="br-table-wrap">
        <table class="br-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GF</th>
              <th>GA</th>
              <th>GD</th>
              <th>Pts</th>
              ${qualify ? "<th>Qualification</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr class="${qualify && index < 2 ? "br-qualified-row" : ""}">
                <td>${index + 1}</td>
                <td>
                  <span class="br-team-name">${text(row.name)}</span>
                </td>
                <td>${row.played}</td>
                <td>${row.won}</td>
                <td>${row.drawn}</td>
                <td>${row.lost}</td>
                <td>${row.gf}</td>
                <td>${row.ga}</td>
                <td>${row.gd > 0 ? "+" : ""}${row.gd}</td>
                <td><strong>${row.points}</strong></td>
                ${qualify ? `
                  <td>
                    ${index < 2
                      ? `<span class="br-qualify-badge">Qualified</span>`
                      : `<span class="br-muted">—</span>`}
                  </td>
                ` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderLeague(tournament, teams, results) {
    const host = $("#brLeagueContent", root);
    const type = tournamentType(tournament);

    if (!hasLeague(type)) {
      $("#brLeaguePanel", root).hidden = true;
      return;
    }

    $("#brLeaguePanel", root).hidden = false;
    host.innerHTML = tableMarkup(calculateStandings(teams, results));
  }

  function renderGroups(tournament, results, state) {
    const host = $("#brGroupsContent", root);
    const type = tournamentType(tournament);
    const shouldShow = hasGroups(type);

    $("#brGroupsPanel", root).hidden = !shouldShow;

    if (!shouldShow) return;

    if (!state.drawCreated || !state.groups?.length) {
      host.innerHTML = `
        <div class="br-empty">
          <i class="fa-solid fa-shuffle"></i>
          <h3>No group draw yet</h3>
          <p>Click “Random Group Draw” to divide this tournament's teams into groups.</p>
        </div>
      `;
      return;
    }

    const teams = getTeams();

    host.innerHTML = state.groups.map(group => {
      const groupTeams = group.teams.map(savedTeam =>
        findTeamById(teams, savedTeam.id) || {
          id: savedTeam.id,
          name: savedTeam.name
        }
      );

      const groupResults = results.filter(match => {
        const homeId = teamIdOfMatch(match, "home");
        const awayId = teamIdOfMatch(match, "away");
        const ids = group.teams.map(team => String(team.id));

        return ids.includes(homeId) && ids.includes(awayId);
      });

      const rows = calculateStandings(groupTeams, groupResults, group.name);

      return `
        <article class="br-group-card">
          <div class="br-group-heading">
            <h3>${text(group.name)}</h3>
            <span>${group.teams.length} teams</span>
          </div>
          ${tableMarkup(rows, { qualify: true })}
        </article>
      `;
    }).join("");

    const qualified = state.groups.flatMap(group => {
      const groupTeams = group.teams.map(savedTeam =>
        findTeamById(teams, savedTeam.id) || {
          id: savedTeam.id,
          name: savedTeam.name
        }
      );

      const ids = group.teams.map(team => String(team.id));
      const groupResults = results.filter(match =>
        ids.includes(teamIdOfMatch(match, "home")) &&
        ids.includes(teamIdOfMatch(match, "away"))
      );

      return calculateStandings(groupTeams, groupResults).slice(0, 2);
    });

    const qualificationInfo = document.createElement("div");
    qualificationInfo.className = "br-qualification-info";
    qualificationInfo.innerHTML = `
      <strong><i class="fa-solid fa-circle-check"></i> Qualification rule</strong>
      <p>Top 2 teams from each group are marked as qualified. A team qualifies for the knockout bracket only after a group draw exists.</p>
      <p><strong>${qualified.length}</strong> potential qualifiers across all groups.</p>
    `;

    host.appendChild(qualificationInfo);
  }

  function renderBracket(tournament, teams, results, state) {
    const host = $("#brBracketContent", root);
    const type = tournamentType(tournament);

    const shouldShow = hasKnockout(type);
    $("#brBracketPanel", root).hidden = !shouldShow;

    if (!shouldShow) {
      $("#brChampionPanel", root).innerHTML = "";
      $("#brChampionPanel", root).hidden = true;
      return;
    }

    if (!state.bracket?.length) {
      host.innerHTML = `
        <div class="br-empty">
          <i class="fa-solid fa-diagram-project"></i>
          <h3>Bracket not created</h3>
          <p>Create a bracket after selecting tournament teams or completing a group draw.</p>
        </div>
      `;
      $("#brChampionPanel", root).hidden = true;
      return;
    }

    const updatedBracket = updateBracket(
      JSON.parse(JSON.stringify(state.bracket)),
      results
    );

    state.bracket = updatedBracket;

    const lastRound = updatedBracket[updatedBracket.length - 1];
    const finalMatch = lastRound?.matches?.[0];

    state.championId = finalMatch?.winnerId ?? null;
    state.championName = finalMatch?.winnerName ?? null;

    host.innerHTML = `
      <div class="br-bracket-scroll">
        <div class="br-bracket">
          ${updatedBracket.map(round => `
            <div class="br-round">
              <div class="br-round-title">${text(round.name)}</div>
              <div class="br-round-matches">
                ${round.matches.map(match => `
                  <article class="br-bracket-match">
                    <div class="br-bracket-team ${match.winnerId && sameId(match.winnerId, match.homeId) ? "br-winner" : ""}">
                      <span>${text(match.homeName || "To be decided")}</span>
                      <strong>${match.homeScore ?? "—"}</strong>
                    </div>
                    <div class="br-bracket-team ${match.winnerId && sameId(match.winnerId, match.awayId) ? "br-winner" : ""}">
                      <span>${text(match.awayName || "To be decided")}</span>
                      <strong>${match.awayScore ?? "—"}</strong>
                    </div>
                    <div class="br-bracket-status">
                      ${match.winnerName
                        ? `<i class="fa-solid fa-check"></i> Winner: ${text(match.winnerName)}`
                        : "Awaiting completed result"}
                    </div>
                  </article>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    const championPanel = $("#brChampionPanel", root);
    championPanel.hidden = false;

    if (state.championName) {
      championPanel.innerHTML = `
        <div class="br-champion-icon"><i class="fa-solid fa-trophy"></i></div>
        <div>
          <p class="br-eyebrow">TOURNAMENT CHAMPION</p>
          <h2>${text(state.championName)}</h2>
          <p>Congratulations to the winning team!</p>
        </div>
      `;
    } else {
      championPanel.innerHTML = `
        <div class="br-champion-icon"><i class="fa-solid fa-trophy"></i></div>
        <div>
          <p class="br-eyebrow">CHAMPION</p>
          <h2>Not decided yet</h2>
          <p>The champion will appear when the final has a completed, decisive result.</p>
        </div>
      `;
    }

    saveState(getState());
  }

  function renderPage() {
    ensureTournamentOptions();

    const tournament = selectedTournament();

    if (!tournament) {
      $("#brFormatDisplay", root).value = "";
      $("#brStats", root).innerHTML = "";
      $("#brGroupsContent", root).innerHTML = `
        <div class="br-empty">
          Create a tournament first in Tournament Management.
        </div>
      `;
      $("#brLeagueContent", root).innerHTML = "";
      $("#brBracketContent", root).innerHTML = "";
      $("#brChampionPanel", root).hidden = true;
      $("#brDrawGroups", root).disabled = true;
      $("#brCreateBracket", root).disabled = true;
      return;
    }

    $("#brDrawGroups", root).disabled = false;
    $("#brCreateBracket", root).disabled = false;

    const type = tournamentType(tournament);
    const teams = getTournamentTeams(tournament);
    const results = getCompletedResults(tournament);

    $("#brFormatDisplay", root).value = formatLabel(type);

    const allState = getState();
    const state = tournamentState(allState, idOf(tournament));

    renderStats(tournament, teams, results, state);
    renderGroups(tournament, results, state);
    renderLeague(tournament, teams, results);
    renderBracket(tournament, teams, results, state);
  }

  function createGroupDraw() {
    const tournament = selectedTournament();

    if (!tournament) {
      alert("প্রথমে একটি টুর্নামেন্ট তৈরি করুন।");
      return;
    }

    const teams = getTournamentTeams(tournament);

    if (teams.length < 2) {
      alert("গ্রুপ ড্র করার জন্য কমপক্ষে ২টি দল থাকতে হবে।");
      return;
    }

    const existingState = getState();
    const previous = tournamentState(existingState, idOf(tournament));

    if (previous.drawCreated) {
      const confirmed = confirm(
        "এই টুর্নামেন্টের আগের গ্রুপ ড্র বদলে যাবে। নতুন ড্র তৈরি করবেন?"
      );

      if (!confirmed) return;
    }

    const count = groupCountFor(tournament, teams.length);

    if (count < 1 || count > teams.length) {
      alert("গ্রুপের সংখ্যা সঠিক নয়। Tournament Setup-এ গ্রুপের সংখ্যা যাচাই করুন।");
      return;
    }

    previous.groups = makeGroups(teams, count);
    previous.drawCreated = true;
    previous.drawCreatedAt = new Date().toISOString();

    // The old bracket is reset because group membership has changed.
    previous.bracket = [];
    previous.championId = null;
    previous.championName = null;

    existingState[idOf(tournament)] = previous;
    saveState(existingState);

    renderPage();
    alert("এই টুর্নামেন্টের গ্রুপ ড্র তৈরি হয়েছে।");
  }

  function createOrUpdateBracket() {
    const tournament = selectedTournament();

    if (!tournament) {
      alert("প্রথমে একটি টুর্নামেন্ট তৈরি করুন।");
      return;
    }

    const teams = getTournamentTeams(tournament);
    const type = tournamentType(tournament);
    const allState = getState();
    const state = tournamentState(allState, idOf(tournament));

    let entrants = [];

    if (hasGroups(type)) {
      if (!state.drawCreated || !state.groups?.length) {
        alert("প্রথমে Random Group Draw তৈরি করুন।");
        return;
      }

      const allTeams = getTeams();

      entrants = state.groups.flatMap(group => {
        const groupTeams = group.teams.map(savedTeam =>
          findTeamById(allTeams, savedTeam.id) || {
            id: savedTeam.id,
            name: savedTeam.name
          }
        );

        const ids = group.teams.map(team => String(team.id));
        const results = getCompletedResults(tournament).filter(match =>
          ids.includes(teamIdOfMatch(match, "home")) &&
          ids.includes(teamIdOfMatch(match, "away"))
        );

        return calculateStandings(groupTeams, results).slice(0, 2);
      });

      if (entrants.length < 2) {
        alert("Knockout bracket তৈরি করতে কমপক্ষে ২ জন qualifier দরকার।");
        return;
      }
    } else {
      entrants = teams.map(team => ({
        id: idOf(team),
        name: nameOf(team)
      }));
    }

    if (entrants.length < 2) {
      alert("Bracket তৈরি করতে কমপক্ষে ২টি দল থাকতে হবে।");
      return;
    }

    if (state.bracket?.length) {
      const confirmed = confirm(
        "নতুন bracket তৈরি করলে এই টুর্নামেন্টের আগের bracket-এর কাঠামো বদলে যাবে। চালিয়ে যাবেন?"
      );

      if (!confirmed) return;
    }

    state.bracket = buildBracket(entrants);
    state.championId = null;
    state.championName = null;

    allState[idOf(tournament)] = state;
    saveState(allState);

    renderPage();
    alert("Knockout bracket তৈরি হয়েছে। ম্যাচ Full-Time হলে বিজয়ী আপডেট হবে।");
  }

  function bindEvents() {
    $("#brTournamentSelect", root)?.addEventListener("change", renderPage);

    $("#brRefresh", root)?.addEventListener("click", () => {
      renderPage();
    });

    $("#brDrawGroups", root)?.addEventListener("click", createGroupDraw);

    $("#brCreateBracket", root)?.addEventListener("click", createOrUpdateBracket);
  }

  function refresh() {
    renderPage();
  }

  function showPage() {
    root.hidden = false;
    root.style.display = "";
    renderPage();
  }

  function hidePage() {
    root.hidden = true;
    root.style.display = "none";
  }

  function init() {
    renderShell();
    renderPage();

    // Public API for navigation and other MatchCraft modules.
    window.MatchCraftBracat = {
      refresh,
      showPage,
      hidePage,
      getStandings(tournamentId) {
        const tournament = getTournaments().find(item =>
          sameId(idOf(item), tournamentId)
        );

        if (!tournament) return [];

        return calculateStandings(
          getTournamentTeams(tournament),
          getCompletedResults(tournament)
        );
      }
    };

    // Re-render when Match Center or player/fixture data changes.
    window.addEventListener("storage", event => {
      if (!event.key || Object.values(STORAGE).includes(event.key)) {
        renderPage();
      }
    });

    window.addEventListener("matchcraft:match-updated", renderPage);
    window.addEventListener("matchcraft:fixtures-updated", renderPage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* =========================================================
   MATCHCRAFT — STATISTICS & AWARDS
   Replacement: status.js
   Frontend / LocalStorage
========================================================= */

(() => {
  "use strict";

  if (window.__MATCHCRAFT_STATISTICS_V2__) return;
  window.__MATCHCRAFT_STATISTICS_V2__ = true;

  const KEYS = {
    tournaments: ["matchcraft_tournaments"],
    teams: ["matchcraft_teams"],
    players: ["matchcraft_players"],
    matches: [
      "matchcraft_matches",
      "matchcraft_fixtures",
      "matchcraft_matches_fixtures",
      "matchcraft_scheduled_matches"
    ],
    sessions: ["matchcraft_match_center_sessions"],
    active: ["matchcraft_match_center_active"]
  };

  const state = {
    tournamentId: "",
    detail: null,
    sharedReport: null
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function readJSON(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function readFirst(keys, fallback = []) {
    for (const key of keys) {
      const value = readJSON(key, null);
      if (value != null) return value;
    }
    return fallback;
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const key of ["items", "data", "matches", "fixtures", "players", "teams"]) {
        if (Array.isArray(value[key])) return value[key];
      }
    }
    return [];
  }

  function getTournaments() {
    return asArray(readFirst(KEYS.tournaments));
  }

  function getTeams() {
    return asArray(readFirst(KEYS.teams));
  }

  function getPlayers() {
    return asArray(readFirst(KEYS.players));
  }

  function idOf(item) {
    return String(
      item?.id ??
      item?._id ??
      item?.matchId ??
      item?.fixtureId ??
      item?.sessionId ??
      ""
    );
  }

  function tournamentIdOf(item) {
    return String(
      item?.tournamentId ??
      item?.competitionId ??
      item?.tournament?.id ??
      item?.competition?.id ??
      ""
    );
  }

  function tournamentNameOf(item) {
    return String(
      item?.tournamentName ??
      item?.competitionName ??
      item?.tournament?.name ??
      item?.competition?.name ??
      ""
    ).trim().toLowerCase();
  }

  function nameOfTeam(team) {
    return String(
      team?.name ??
      team?.teamName ??
      team?.title ??
      "Unknown team"
    );
  }

  function teamIdOf(item, side) {
    const prefix = side === "home" ? "home" : "away";

    return String(
      item?.[`${prefix}TeamId`] ??
      item?.[`${prefix}Id`] ??
      item?.[`${prefix}Team`]?.id ??
      item?.[`${prefix}Team`]?._id ??
      ""
    );
  }

  function teamNameOf(item, side) {
    const prefix = side === "home" ? "home" : "away";

    const value =
      item?.[`${prefix}TeamName`] ??
      item?.[`${prefix}Name`] ??
      item?.[`${prefix}Team`]?.name ??
      item?.[`${prefix}Team`]?.teamName ??
      (typeof item?.[`${prefix}Team`] === "string"
        ? item[`${prefix}Team`]
        : "");

    return String(value ?? "").trim();
  }

  function scoreOf(item, side) {
    const prefix = side === "home" ? "home" : "away";

    const candidates = side === "home"
      ? [item?.homeScore, item?.homeGoals, item?.scoreHome,
         item?.result?.home, item?.score?.home]
      : [item?.awayScore, item?.awayGoals, item?.scoreAway,
         item?.result?.away, item?.score?.away];

    for (const value of candidates) {
      if (value !== "" && value != null && Number.isFinite(Number(value))) {
        return Math.max(0, Number(value));
      }
    }

    return null;
  }

  function isCompleted(match) {
    const status = String(
      match?.status ?? match?.matchStatus ?? ""
    ).toLowerCase();

    const completed =
      match?.completed === true ||
      match?.isCompleted === true ||
      match?.finished === true ||
      match?.isFinished === true ||
      ["completed", "complete", "finished", "full time", "ft", "played"]
        .includes(status);

    return completed &&
      scoreOf(match, "home") !== null &&
      scoreOf(match, "away") !== null;
  }

  function dateOf(match) {
    return (
      match?.date ??
      match?.matchDate ??
      match?.scheduledDate ??
      match?.kickoff ??
      match?.startTime ??
      match?.completedAt ??
      match?.finishedAt ??
      ""
    );
  }

  function getAllMatches() {
    const records = [];

    for (const key of [...KEYS.matches, ...KEYS.sessions, ...KEYS.active]) {
      const raw = readJSON(key, []);
      const list = Array.isArray(raw) ? raw : [raw];

      list.forEach(item => {
        if (item && typeof item === "object") {
          records.push({ ...item });
        }
      });
    }

    const merged = new Map();

    records.forEach((match, index) => {
      const id = idOf(match);
      const key = id
        ? `${id}:${tournamentIdOf(match)}`
        : `anonymous:${index}`;

      const previous = merged.get(key);

      if (!previous || isCompleted(match) || !isCompleted(previous)) {
        merged.set(key, { ...previous, ...match });
      }
    });

    return [...merged.values()];
  }

  function belongsToTournament(match, tournament) {
    const targetId = String(tournament?.id ?? "");
    const matchId = tournamentIdOf(match);

    if (matchId && targetId) return matchId === targetId;

    const matchName = tournamentNameOf(match);
    const targetName = String(tournament?.name ?? "").trim().toLowerCase();

    if (matchName && targetName) return matchName === targetName;

    // Do not assign matches with no tournament information to every tournament.
    return false;
  }

  function getTournamentMatches(tournamentId = state.tournamentId) {
    const tournament = getTournaments().find(
      item => String(item.id) === String(tournamentId)
    );

    if (!tournament) return [];

    return getAllMatches()
      .filter(match => belongsToTournament(match, tournament))
      .sort((a, b) => {
        const da = new Date(dateOf(a) || 0).getTime();
        const db = new Date(dateOf(b) || 0).getTime();
        return da - db;
      });
  }

  function getTournamentTeams(tournament) {
    const allTeams = getTeams();
    const tid = String(tournament?.id ?? "");
    const tname = String(tournament?.name ?? "").trim().toLowerCase();

    return allTeams.filter(team => {
      const teamTournamentId = String(
        team?.tournamentId ?? team?.competitionId ?? ""
      );

      if (teamTournamentId) return teamTournamentId === tid;

      const name = String(
        team?.tournamentName ?? team?.competitionName ?? ""
      ).trim().toLowerCase();

      return Boolean(name && tname && name === tname);
    });
  }

  function makeTeamStats(teams, matches) {
    const stats = new Map();

    teams.forEach(team => {
      const id = String(team.id ?? team._id ?? nameOfTeam(team));

      stats.set(id, {
        id,
        name: nameOfTeam(team),
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0
      });
    });

    function findTeam(match, side) {
      const id = teamIdOf(match, side);
      const name = teamNameOf(match, side).toLowerCase();

      if (id && stats.has(id)) return stats.get(id);

      for (const entry of stats.values()) {
        if (entry.name.trim().toLowerCase() === name && name) {
          return entry;
        }
      }

      return null;
    }

    matches.filter(isCompleted).forEach(match => {
      const home = findTeam(match, "home");
      const away = findTeam(match, "away");

      if (!home || !away || home.id === away.id) return;

      const hs = scoreOf(match, "home");
      const as = scoreOf(match, "away");

      home.played++;
      away.played++;

      home.goalsFor += hs;
      home.goalsAgainst += as;
      away.goalsFor += as;
      away.goalsAgainst += hs;

      if (hs > as) {
        home.won++;
        away.lost++;
        home.points += 3;
      } else if (hs < as) {
        away.won++;
        home.lost++;
        away.points += 3;
      } else {
        home.drawn++;
        away.drawn++;
        home.points++;
        away.points++;
      }
    });

    return [...stats.values()]
      .map(team => ({
        ...team,
        goalDifference: team.goalsFor - team.goalsAgainst
      }))
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.name.localeCompare(b.name)
      );
  }

  function getPlayerStats(tournamentId = state.tournamentId) {
    const matches = getTournamentMatches(tournamentId).filter(isCompleted);
    const players = getPlayers();

    const totals = new Map();

    players.forEach(player => {
      const id = String(player.id ?? player._id ?? player.name ?? "");
      totals.set(id, {
        id,
        name: player.name ?? player.playerName ?? "Unknown player",
        player,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        appearances: 0,
        motm: 0
      });
    });

    matches.forEach(match => {
      const events = asArray(match.events ?? match.matchEvents ?? []);

      const appeared = new Set([
        ...asArray(match.homePlayers),
        ...asArray(match.awayPlayers),
        ...asArray(match.players)
      ].map(player => String(
        player?.playerId ?? player?.id ?? player?.name ?? player
      )));

      appeared.forEach(id => {
        if (totals.has(id)) totals.get(id).appearances++;
      });

      events.forEach(event => {
        const type = String(
          event.type ?? event.eventType ?? event.action ?? ""
        ).toLowerCase();

        const playerId = String(
          event.playerId ?? event.player?.id ?? event.player?.name ?? ""
        );

        const player = totals.get(playerId);
        if (!player) return;

        if (type.includes("goal")) player.goals++;
        if (type.includes("assist")) player.assists++;
        if (type.includes("yellow")) player.yellowCards++;
        if (type.includes("red")) player.redCards++;
      });

      const motmId = String(
        match.motmPlayerId ??
        match.manOfTheMatch?.playerId ??
        match.manOfTheMatch?.id ??
        ""
      );

      if (totals.has(motmId)) totals.get(motmId).motm++;
    });

    return [...totals.values()].sort((a, b) =>
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.name.localeCompare(b.name)
    );
  }

  function getMOTM(tournamentId = state.tournamentId) {
    return getTournamentMatches(tournamentId)
      .filter(isCompleted)
      .filter(match =>
        match.motmPlayerId ||
        match.manOfTheMatch ||
        match.motm
      );
  }

  function formatDate(value) {
    if (!value) return "Date not set";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

 function teamLogo(team) {
  // Team Library থেকে সর্বশেষ সংরক্ষিত দলের তথ্য নেওয়া
  const allTeams = getTeams();

  const teamId = String(
    team?.id ?? team?._id ?? team?.teamId ?? ""
  );

  const teamName = nameOfTeam(team).trim().toLowerCase();

  const latestTeam = allTeams.find(function (item) {
    const itemId = String(
      item?.id ?? item?._id ?? item?.teamId ?? ""
    );

    if (teamId && itemId && teamId === itemId) {
      return true;
    }

    return nameOfTeam(item).trim().toLowerCase() === teamName;
  });

  // teams.js-এ ছবিটি profileImage নামে সংরক্ষিত হয়
  const src =
    latestTeam?.profileImage ||
    latestTeam?.logo ||
    latestTeam?.logoUrl ||
    latestTeam?.image ||
    team?.profileImage ||
    team?.logo ||
    team?.logoUrl ||
    team?.image ||
    "";

  if (src) {
    return `<img src="${esc(src)}" alt="${esc(nameOfTeam(team))}">`;
  }

  return '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>';
}

  function playerPhoto(player) {
    const src = player?.photo ?? player?.photoUrl ??
      player?.image ?? player?.avatar ?? "";

    return src
      ? `<img src="${esc(src)}" alt="${esc(player?.name ?? "Player")}">`
      : `<i class="fa-solid fa-user" aria-hidden="true"></i>`;
  }

  function emptyState(title, description) {
    return `
      <div class="st-empty">
        <div class="st-empty-icon">
          <i class="fa-solid fa-chart-simple" aria-hidden="true"></i>
        </div>
        <h3 class="st-empty-title">${esc(title)}</h3>
        <p class="st-empty-text">${esc(description)}</p>
      </div>`;
  }

  function metric(label, value, icon, tone = "") {
    return `
      <article class="st-summary-card">
        <div class="st-summary-top">
          <span class="st-summary-label">${esc(label)}</span>
          <span class="st-summary-icon ${tone}">
            <i class="${esc(icon)}" aria-hidden="true"></i>
          </span>
        </div>
        <div class="st-summary-value">${esc(value)}</div>
      </article>`;
  }

  function renderTeams(podium) {
    if (!podium.length) {
      return emptyState(
        "No team statistics yet",
        "এই টুর্নামেন্টের দলের সঙ্গে ম্যাচ সংযুক্ত করুন এবং ম্যাচের ফলাফল সংরক্ষণ করুন।"
      );
    }

    return `
      <div class="st-podium-grid">
        ${podium.slice(0, 2).map((team, index) => `
          <article class="st-team-card ${index === 0 ? "champion" : "runner-up"}">
            <div class="st-team-card-top">
              <div class="st-team-rank">${index === 0 ? "1" : "2"}</div>
              <div class="st-team-logo">${teamLogo(team.team)}</div>
              <div class="st-team-identity">
                <div class="st-team-role">
                  ${index === 0 ? "TOP TEAM" : "RUNNER-UP POSITION"}
                </div>
                <h3 class="st-team-name">${esc(team.name)}</h3>
                <p class="st-team-meta">${team.points} points · ${team.played} played</p>
              </div>
            </div>
            <div class="st-team-stat-grid">
              ${[
                ["Won", team.won],
                ["Goals", team.goalsFor],
                ["Goal Difference", team.goalDifference]
              ].map(([label, value]) => `
                <div class="st-team-stat">
                  <strong class="st-team-stat-value">${esc(value)}</strong>
                  <span class="st-team-stat-label">${esc(label)}</span>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>`;
  }

  function renderPlayers(players) {
    const leaders = players.filter(player =>
      player.goals || player.assists || player.appearances || player.motm
    ).slice(0, 12);

    if (!leaders.length) {
      return emptyState(
        "Player statistics are not available yet",
        "ম্যাচের ইভেন্টে খেলোয়াড়ের গোল, অ্যাসিস্ট, কার্ড এবং উপস্থিতির তথ্য সংরক্ষণ করুন।"
      );
    }

    return `
      <div class="st-player-list">
        ${leaders.map(player => `
          <article class="st-player-row">
            <div class="st-player-avatar">${playerPhoto(player.player)}</div>
            <div class="st-player-info">
              <h3 class="st-player-name">${esc(player.name)}</h3>
              <div class="st-player-meta">
                Goals: ${player.goals} · Assists: ${player.assists}
                · Apps: ${player.appearances}
              </div>
            </div>
            <span class="st-jersey">${player.goals}</span>
          </article>
        `).join("")}
      </div>`;
  }

  function renderHistory(matches) {
    const completed = matches.filter(isCompleted);

    if (!completed.length) {
      return emptyState(
        "No completed matches",
        "এই টুর্নামেন্টের কোনো ম্যাচের সম্পূর্ণ ফলাফল এখনো পাওয়া যায়নি।"
      );
    }

    return `
      <div class="st-table-wrap">
        <table class="st-table">
          <thead>
            <tr>
              <th>Date</th><th>Home Team</th><th>Score</th>
              <th>Away Team</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${completed.map(match => `
              <tr>
                <td>${esc(formatDate(dateOf(match)))}</td>
                <td>${esc(teamNameOf(match, "home") || "Home")}</td>
                <td class="st-score-cell">
                  ${scoreOf(match, "home")} - ${scoreOf(match, "away")}
                </td>
                <td>${esc(teamNameOf(match, "away") || "Away")}</td>
                <td><span class="st-result-badge">Completed</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function section(title, subtitle, icon, content) {
    return `
      <section class="st-section">
        <div class="st-section-header">
          <div class="st-section-heading">
            <div class="st-section-icon">
              <i class="${esc(icon)}" aria-hidden="true"></i>
            </div>
            <div>
              <h2 class="st-section-title">${esc(title)}</h2>
              <p class="st-section-subtitle">${esc(subtitle)}</p>
            </div>
          </div>
        </div>
        ${content}
      </section>`;
  }

  function ensureRoot() {
    let root = document.getElementById("statistics");

    if (!root) {
      root = document.createElement("section");
      root.id = "statistics";

      const main = document.querySelector(".main-box") || document.querySelector("main");
      if (main) main.appendChild(root);
      else document.body.appendChild(root);
    }

    return root;
  }

  function renderSelectedTournament() {
    const root = ensureRoot();

    if (state.sharedReport) {
      renderSharedReport(state.sharedReport);
      return;
    }

    const tournaments = getTournaments();

    if (!state.tournamentId ||
        !tournaments.some(t => String(t.id) === state.tournamentId)) {
      state.tournamentId = String(tournaments[0]?.id ?? "");
    }

    const tournament = tournaments.find(
      item => String(item.id) === state.tournamentId
    );

    const matches = tournament ? getTournamentMatches(tournament.id) : [];
    const completed = matches.filter(isCompleted);
    const teams = tournament ? getTournamentTeams(tournament) : [];
    const standings = makeTeamStats(teams, matches);
    const players = getPlayerStats(tournament?.id ?? "");
    const bestPlayer = players.find(player =>
      player.goals || player.assists || player.motm
    );

    const tournamentOptions = tournaments.map(item => `
      <option value="${esc(item.id)}"
        ${String(item.id) === state.tournamentId ? "selected" : ""}>
        ${esc(item.name ?? "Untitled tournament")}
      </option>
    `).join("");

    const content = !tournament
      ? emptyState(
          "No tournaments found",
          "Tournament Management পেজ থেকে প্রথমে একটি টুর্নামেন্ট তৈরি করুন।"
        )
      : `
        <div class="st-page">
          <header class="st-page-header">
            <div class="st-heading-group">
              <div class="st-eyebrow">
                <i class="fa-solid fa-chart-line"></i> MATCHCRAFT ANALYTICS
              </div>
              <h1 class="st-page-title">Statistics & Awards</h1>
              <p class="st-page-description">
                Tournament performance, team standings and player statistics.
              </p>
            </div>
            <div class="st-header-actions">
              <button class="st-btn" data-st-action="refresh">
                <i class="fa-solid fa-rotate"></i> Refresh
              </button>
              <button class="st-btn st-btn-primary" data-st-action="print">
                <i class="fa-solid fa-file-pdf"></i> Print / PDF
              </button>
            </div>
          </header>

          <div class="st-toolbar">
            <div class="st-toolbar-fields">
              <div class="st-field">
                <label for="stTournamentSelect">Select Tournament</label>
                <select id="stTournamentSelect">${tournamentOptions}</select>
              </div>
            </div>
            <div class="st-toolbar-note">
              Statistics are calculated from tournament-linked records saved in this browser.
            </div>
          </div>

          <div class="st-tournament-banner">
            <div class="st-tournament-info">
              <h2 class="st-tournament-name">${esc(tournament.name)}</h2>
              <div class="st-tournament-meta">
                <span><i class="fa-regular fa-calendar"></i>
                  Season: ${esc(tournament.season ?? "—")}
                </span>
                <span><i class="fa-solid fa-shield"></i>
                  ${teams.length} registered teams
                </span>
              </div>
            </div>
            <span class="st-status-badge ${completed.length < matches.length ? "pending" : ""}">
              ${completed.length === matches.length && matches.length
                ? "Results complete"
                : "Results pending"}
            </span>
          </div>

          <div class="st-summary-grid">
            ${metric("Registered Teams", teams.length, "fa-solid fa-shield-halved")}
            ${metric("Total Matches", matches.length, "fa-solid fa-futbol")}
            ${metric("Completed Matches", completed.length, "fa-solid fa-circle-check", "green")}
            ${metric("Pending Matches", Math.max(0, matches.length - completed.length), "fa-solid fa-clock", "gold")}
          </div>

          ${section("Team Performance", "Ranked using points, goal difference and goals scored.", "fa-solid fa-trophy", renderTeams(standings))}

          ${section("Player Statistics", "Player figures calculated from saved match events.", "fa-solid fa-users", renderPlayers(players))}

          ${section("Best Player", "Leading player based on available goals, assists and awards.", "fa-solid fa-award",
            bestPlayer ? `
              <article class="st-award-card">
                <div class="st-award-profile">
                  <div class="st-award-avatar">${playerPhoto(bestPlayer.player)}</div>
                  <h3 class="st-award-name">${esc(bestPlayer.name)}</h3>
                </div>
                <div class="st-award-details">
                  <div class="st-award-label"><i class="fa-solid fa-star"></i> TOP PERFORMER</div>
                  <h3 class="st-award-title">Best Player</h3>
                  <p class="st-award-description">
                    Based on the statistics currently available in this browser.
                  </p>
                  <div class="st-award-stats">
                    <div class="st-award-stat"><strong>${bestPlayer.goals}</strong><span>Goals</span></div>
                    <div class="st-award-stat"><strong>${bestPlayer.assists}</strong><span>Assists</span></div>
                    <div class="st-award-stat"><strong>${bestPlayer.motm}</strong><span>MOTM awards</span></div>
                    <div class="st-award-stat"><strong>${bestPlayer.appearances}</strong><span>Appearances</span></div>
                  </div>
                </div>
                <div class="st-award-art">
                  <div class="st-award-art-placeholder">🏆</div>
                </div>
              </article>
            ` : emptyState("No award leader yet", "সম্পূর্ণ ম্যাচ ও খেলোয়াড়ের ইভেন্ট সংরক্ষিত হলে এখানে তথ্য দেখা যাবে।")
          )}

          ${section("Match History", "Completed results linked to this tournament.", "fa-solid fa-list-check", renderHistory(matches))}

          ${section("Tournament Report", "Share or save a summary of this tournament.", "fa-solid fa-share-nodes", `
            <div class="st-card">
              <div class="st-card-body">
                <div class="st-report-layout">
                  <div class="st-report-content">
                    <h3 class="st-details-title">${esc(tournament.name)} — Report</h3>
                    <p class="st-details-description">
                      ${completed.length} completed matches out of ${matches.length}.
                      ${teams.length} tournament-linked teams.
                    </p>
                    <div class="st-report-actions">
                      <button class="st-btn st-btn-primary" data-st-action="share">
                        <i class="fa-solid fa-share"></i> Share Report
                      </button>
                      <button class="st-btn" data-st-action="copy">
                        <i class="fa-regular fa-copy"></i> Copy Summary
                      </button>
                    </div>
                  </div>
                  <div class="st-qr-panel">
                    <div class="st-qr-title">Tournament Report</div>
                    <p class="st-qr-description">
                      Use Share Report to create a link for this summary.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          `)}
        </div>`;

    root.innerHTML = content;

    // This stylesheet must not be allowed to keep the active page hidden.
    // Navigation remains responsible for hiding inactive pages.
    if (!root.hidden && !root.closest("[hidden]")) {
      root.style.removeProperty("display");
    }
  }

  function getTournamentReport(tournament) {
    const target = tournament ||
      getTournaments().find(item => String(item.id) === state.tournamentId);

    if (!target) return null;

    const matches = getTournamentMatches(target.id);
    const completed = matches.filter(isCompleted);
    const teams = makeTeamStats(getTournamentTeams(target), matches);

    return {
      tournament: target,
      matches,
      completedMatches: completed,
      totalMatches: matches.length,
      completedCount: completed.length,
      teams,
      champion: matches.length && completed.length === matches.length
        ? teams[0] ?? null
        : null,
      runnerUp: matches.length && completed.length === matches.length
        ? teams[1] ?? null
        : null
    };
  }

  function showTeamDetails(teamId) {
    const team = makeTeamStats(
      getTournamentTeams(getTournaments().find(t =>
        String(t.id) === state.tournamentId
      )),
      getTournamentMatches()
    ).find(item => item.id === String(teamId));

    if (!team) return null;

    state.detail = { type: "team", data: team };
    window.alert(
      `${team.name}\nPlayed: ${team.played}\nWon: ${team.won}\nDrawn: ${team.drawn}\nLost: ${team.lost}\nGoals: ${team.goalsFor}\nPoints: ${team.points}`
    );

    return team;
  }

  function showMatchDetails(matchId) {
    const match = getTournamentMatches().find(
      item => idOf(item) === String(matchId)
    );

    if (!match) return null;

    state.detail = { type: "match", data: match };
    window.alert(
      `${teamNameOf(match, "home")} ${scoreOf(match, "home") ?? "—"} - ${scoreOf(match, "away") ?? "—"} ${teamNameOf(match, "away")}\n${formatDate(dateOf(match))}`
    );

    return match;
  }

  function reportText() {
    const tournament = getTournaments().find(
      item => String(item.id) === state.tournamentId
    );
    if (!tournament) return "No tournament selected.";

    const report = getTournamentReport(tournament);

    return [
      `MATCHCRAFT — ${tournament.name}`,
      `Season: ${tournament.season ?? "—"}`,
      `Teams: ${getTournamentTeams(tournament).length}`,
      `Matches: ${report.completedCount}/${report.totalMatches} completed`,
      `Champion: ${report.champion?.name ?? "Not decided"}`,
      `Runner-up: ${report.runnerUp?.name ?? "Not decided"}`
    ].join("\n");
  }

  async function shareReport() {
    const text = reportText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "MATCHCRAFT Tournament Report",
          text
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      window.alert("Report summary copied.");
    } catch {
      window.prompt("Copy this report:", text);
    }
  }

  async function copyReport() {
    const text = reportText();

    try {
      await navigator.clipboard.writeText(text);
      window.alert("Report summary copied.");
    } catch {
      window.prompt("Copy this report:", text);
    }
  }

  function renderSharedReport(report) {
    const root = ensureRoot();
    root.innerHTML = `
      <div class="st-page">
        <header class="st-page-header">
          <div>
            <div class="st-eyebrow">MATCHCRAFT REPORT</div>
            <h1 class="st-page-title">Shared Tournament Report</h1>
          </div>
          <button class="st-btn" data-st-action="refresh">Return to Statistics</button>
        </header>
        <div class="st-card">
          <div class="st-card-body">
            <pre class="st-wrap">${esc(JSON.stringify(report, null, 2))}</pre>
          </div>
        </div>
      </div>`;
  }

  function handleClick(event) {
    const button = event.target.closest("[data-st-action]");
    if (!button) return;

    switch (button.dataset.stAction) {
      case "refresh":
        state.sharedReport = null;
        renderSelectedTournament();
        break;
      case "print":
        window.print();
        break;
      case "share":
        shareReport();
        break;
      case "copy":
        copyReport();
        break;
    }
  }

  function handleChange(event) {
    if (event.target.id === "stTournamentSelect") {
      state.tournamentId = event.target.value;
      state.detail = null;
      renderSelectedTournament();
    }
  }

  function handleNavigation(event) {
    const link = event.target.closest('[data-page="statistics"]');
    if (!link) return;

    window.setTimeout(() => {
      renderSelectedTournament();
    }, 0);
  }

  function refreshIfRelevant(event) {
    const relevant = [
      ...KEYS.tournaments,
      ...KEYS.teams,
      ...KEYS.players,
      ...KEYS.matches,
      ...KEYS.sessions
    ];

    if (!event.key || relevant.includes(event.key)) {
      renderSelectedTournament();
    }
  }

  function init() {
    const root = ensureRoot();

    if (root.dataset.statusInitialized === "true") {
      renderSelectedTournament();
      return;
    }

    root.dataset.statusInitialized = "true";

    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    document.addEventListener("click", handleNavigation);
    window.addEventListener("storage", refreshIfRelevant);

    [
      "matchcraft:match-completed",
      "matchcraft:match-updated",
      "matchcraft:fixtures-updated",
      "matchcraft:result-updated",
      "matchcraft:players-updated"
    ].forEach(eventName => {
      window.addEventListener(eventName, renderSelectedTournament);
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) renderSelectedTournament();
    });

    renderSelectedTournament();
  }

  window.MatchCraftStatistics = {
    refresh: renderSelectedTournament,
    getTournamentReport,
    getTournamentMatches,
    getTeamMatchStats: tournamentId =>
      makeTeamStats(
        getTournamentTeams(getTournaments().find(t =>
          String(t.id) === String(tournamentId)
        )),
        getTournamentMatches(tournamentId)
      ),
    getPlayerStats,
    getMOTM,
    showTeamDetails,
    showMatchDetails,
    showShareReport: shareReport
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        init();
      } catch (error) {
        console.error("MATCHCRAFT Statistics initialization failed:", error);
      }
    }, { once: true });
  } else {
    try {
      init();
    } catch (error) {
      console.error("MATCHCRAFT Statistics initialization failed:", error);
    }
  }
})();
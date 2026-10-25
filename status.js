/* =========================================================
   MATCHCRAFT — STATISTICS & AWARDS
   File: status.js
   Works with the existing #statistics section.
   Reads common LocalStorage tournament/team/player/fixture/
   match keys without changing or deleting existing data.
========================================================= */
(function () {
  "use strict";

  const SECTION_ID = "statistics";
  const STYLE_ID = "matchcraft-statistics-runtime-style";

  const KEY_GROUPS = {
    tournaments: [
      "matchcraft_tournaments", "matchcraftTournaments", "tournaments",
      "MC_TOURNAMENTS", "tournamentData", "tournamentList", "tournamentsData"
    ],
    teams: [
      "matchcraft_teams", "matchcraftTeams", "teams", "MC_TEAMS",
      "teamData", "teamList", "tournamentTeams"
    ],
    players: [
      "matchcraft_players", "matchcraftPlayers", "players", "MC_PLAYERS",
      "playerData", "playerList", "squads"
    ],
    matches: [
      "matchcraft_matches", "matchcraftMatches", "matches", "MC_MATCHES",
      "matchData", "matchList", "fixtures", "matchcraft_fixtures",
      "matchcraftFixtures", "matchcraft_matches_fixtures",
      "matchcraft_scheduled_matches", "matchcraft_match_center_sessions",
      "fixtureData", "fixtureList", "results"
    ]
  };

  const state = {
    selectedTournamentId: "",
    tournaments: [],
    teams: [],
    players: [],
    matches: [],
    sharedReport: null,
    modal: null,
    autoOpenedTeam: ""
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function safeParse(value) {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  function idOf(item) {
    if (!item || typeof item !== "object") return "";
    const value = item.id ?? item._id ?? item.uid ?? item.tournamentId ??
      item.teamId ?? item.playerId ?? item.matchId ?? item.fixtureId ??
      item.code ?? item.key ?? "";
    return String(value);
  }

  function nameOf(item, fallback = "নাম নেই") {
    if (typeof item === "string") return item;
    return String(item?.name ?? item?.title ?? item?.teamName ??
      item?.playerName ?? item?.tournamentName ?? item?.fullName ??
      item?.label ?? fallback);
  }

  function normalizeArray(value) {
    value = safeParse(value);
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const key of [
        "items", "data", "list", "records", "results",
        "tournaments", "teams", "players", "matches", "fixtures"
      ]) {
        if (Array.isArray(value[key])) return value[key];
      }
      return Object.values(value).filter(v => v && typeof v === "object");
    }
    return [];
  }

  function readStorageGroup(group) {
    const found = [];
    const seen = new Set();

    for (const key of KEY_GROUPS[group] || []) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = normalizeArray(raw);
      list.forEach(item => {
        if (!item || typeof item !== "object") return;
        const signature = idOf(item) || JSON.stringify(item).slice(0, 240);
        if (!seen.has(signature)) {
          seen.add(signature);
          found.push(item);
        }
      });
    }

    // Discover likely keys without assuming a particular app schema.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || KEY_GROUPS[group].includes(key)) continue;
      const low = key.toLowerCase();
      const likely = group === "tournaments" ? /tournament/ :
        group === "teams" ? /team|squad/ :
        group === "players" ? /player|squad/ :
        /match|fixture|result|game/;
      if (!likely.test(low)) continue;
      const list = normalizeArray(localStorage.getItem(key));
      list.forEach(item => {
        if (!item || typeof item !== "object") return;
        const signature = idOf(item) || JSON.stringify(item).slice(0, 240);
        if (!seen.has(signature)) {
          seen.add(signature);
          found.push(item);
        }
      });
    }
    return found;
  }

  function loadData() {
    state.tournaments = readStorageGroup("tournaments");
    state.teams = readStorageGroup("teams");
    state.players = readStorageGroup("players");

    const records = readStorageGroup("matches");
    const rawSessions = safeParse(localStorage.getItem("matchcraft_match_center_sessions"));
    const sessions = Array.isArray(rawSessions) ? rawSessions : [];
    const sessionIds = new Set(sessions.map(session => String(session?.id || "")).filter(Boolean));
    const baseRecords = records.filter(record => !sessionIds.has(String(record?.id || "")));

    // Match Center sessions contain the authoritative event timeline. Merge each
    // session into its fixture record so a fixture result and its events remain
    // one match in Statistics instead of appearing as duplicate matches.
    sessions.forEach(session => {
      if (!session || typeof session !== "object") return;
      const fixtureId = String(session.fixtureId || "");
      const fixtureIndex = baseRecords.findIndex(record =>
        String(record?.id || record?.fixtureId || record?.matchId || "") === fixtureId
      );
      if (fixtureIndex >= 0) {
        baseRecords[fixtureIndex] = {
          ...baseRecords[fixtureIndex],
          ...session,
          id: String(baseRecords[fixtureIndex].id || fixtureId || session.id),
          fixtureId,
          events: Array.isArray(session.events) ? session.events : (baseRecords[fixtureIndex].events || []),
          substitutions: Array.isArray(session.substitutions) ? session.substitutions : (baseRecords[fixtureIndex].substitutions || [])
        };
      } else {
        baseRecords.push(session);
      }
    });

    // Keep records without a Match Center session, but collapse repeated fixture
    // copies written under the app's compatibility storage keys.
    const merged = [];
    const seen = new Map();
    baseRecords.forEach(record => {
      const id = String(record?.fixtureId || record?.id || record?.matchId || "");
      if (!id) { merged.push(record); return; }
      if (!seen.has(id)) {
        seen.set(id, merged.length);
        merged.push(record);
      } else {
        const index = seen.get(id);
        const previous = merged[index];
        // Prefer records with a saved final result and keep event-bearing data.
        merged[index] = {
          ...previous,
          ...((isCompleted(record) && !isCompleted(previous)) ? record : {}),
          ...(Array.isArray(record.events) && record.events.length ? { events: record.events } : {}),
          ...(Array.isArray(record.substitutions) && record.substitutions.length ? { substitutions: record.substitutions } : {})
        };
      }
    });
    state.matches = merged;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function numberFrom(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function firstValue(object, keys, fallback = "") {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
  }

  function teamIdFrom(match, side) {
    const names = side === "home"
      ? ["homeTeamId", "teamAId", "team1Id", "homeId", "teamA", "team1", "homeTeam", "team1Name"]
      : ["awayTeamId", "teamBId", "team2Id", "awayId", "teamB", "team2", "awayTeam", "team2Name"];
    const value = firstValue(match, names, "");
    if (value && typeof value === "object") return idOf(value) || nameOf(value, "");
    return String(value);
  }

  function teamNameFromMatch(match, side) {
    const names = side === "home"
      ? ["homeTeamName", "teamAName", "team1Name", "homeName"]
      : ["awayTeamName", "teamBName", "team2Name", "awayName"];
    const direct = firstValue(match, names, "");
    if (direct) return typeof direct === "object" ? nameOf(direct) : String(direct);
    const teamRef = firstValue(match, side === "home"
      ? ["homeTeam", "teamA", "team1"] : ["awayTeam", "teamB", "team2"], "");
    if (teamRef && typeof teamRef === "object") return nameOf(teamRef);
    const teamId = teamIdFrom(match, side);
    const team = state.teams.find(t => idOf(t) === teamId);
    return team ? nameOf(team) : (teamId || (side === "home" ? "Home Team" : "Away Team"));
  }

  function scoreFrom(match, side) {
    const keys = side === "home"
      ? ["homeScore", "teamAScore", "team1Score", "scoreA", "homeGoals", "goalsHome"]
      : ["awayScore", "teamBScore", "team2Score", "scoreB", "awayGoals", "goalsAway"];
    const direct = firstValue(match, keys, null);
    if (direct !== null && direct !== "") return numberFrom(direct);
    const score = match?.score;
    if (Array.isArray(score)) return numberFrom(score[side === "home" ? 0 : 1]);
    if (score && typeof score === "object") {
      return numberFrom(firstValue(score, side === "home"
        ? ["home", "a", "teamA"] : ["away", "b", "teamB"], 0));
    }
    if (typeof score === "string") {
      const parts = score.match(/\d+/g);
      if (parts && parts.length >= 2) return numberFrom(parts[side === "home" ? 0 : 1]);
    }
    return null;
  }

  function isCompleted(match) {
    const status = String(firstValue(match, [
      "status", "state", "matchStatus", "resultStatus"
    ], "")).toLowerCase();

    return Boolean(
      match?.completed === true || match?.isCompleted === true ||
      match?.resultFinal === true || match?.played === true ||
      ["completed", "complete", "finished", "full-time", "fulltime", "ft", "played", "ended", "final"].includes(status) ||
      (scoreFrom(match, "home") !== null && scoreFrom(match, "away") !== null &&
        (match?.winnerId || match?.winner || match?.result || status))
    );
  }

  function tournamentIdFrom(item) {
    return String(firstValue(item, [
      "tournamentId", "tournamentID", "competitionId", "leagueId", "eventId"
    ], item?.tournament && typeof item.tournament === "object" ? idOf(item.tournament) :
      typeof item?.tournament === "string" ? item.tournament : ""));
  }

  function tournamentNameFrom(item) {
    const direct = firstValue(item, ["tournamentName", "competitionName", "leagueName"], "");
    if (direct) return String(direct);
    if (item?.tournament && typeof item.tournament === "object") return nameOf(item.tournament);
    const id = tournamentIdFrom(item);
    return nameOf(state.tournaments.find(t => idOf(t) === id), id || "Tournament");
  }

  function matchesForTournament(tournamentId) {
    if (!tournamentId) return state.matches;
    const selectedId = String(tournamentId);
    const selectedTournament = state.tournaments.find(t => idOf(t) === selectedId);
    const selectedName = selectedTournament ? nameOf(selectedTournament).toLowerCase() : "";
    const tournamentTeams = teamsForTournament(selectedId);
    const teamIds = new Set(tournamentTeams.map(idOf).filter(Boolean));
    const teamNames = new Set(tournamentTeams.map(team => nameOf(team).toLowerCase()));

    return state.matches.filter(match => {
      const tid = tournamentIdFrom(match);
      if (tid) return tid === selectedId;
      const tname = tournamentNameFrom(match).toLowerCase();
      if (selectedName && tname && tname !== "tournament" && tname === selectedName) return true;
      const homeId = teamIdFrom(match, "home");
      const awayId = teamIdFrom(match, "away");
      const homeName = teamNameFromMatch(match, "home").toLowerCase();
      const awayName = teamNameFromMatch(match, "away").toLowerCase();
      return (homeId && teamIds.has(homeId)) || (awayId && teamIds.has(awayId)) ||
        teamNames.has(homeName) || teamNames.has(awayName);
    });
  }

  function teamsForTournament(tournamentId) {
    if (!tournamentId) return state.teams;
    const selectedId = String(tournamentId);
    const selectedTournament = state.tournaments.find(t => idOf(t) === selectedId);
    const selectedName = selectedTournament ? nameOf(selectedTournament).toLowerCase() : "";
    return state.teams.filter(team => {
      const tid = tournamentIdFrom(team);
      if (tid) return tid === selectedId;
      const tname = String(firstValue(team, ["tournamentName", "competitionName"], "")).toLowerCase();
      return Boolean(selectedName && tname === selectedName);
    });
  }

  function playersForTeam(teamId) {
    return state.players.filter(player => {
      const tid = String(firstValue(player, ["teamId", "teamID", "squadId", "clubId"], ""));
      const team = player.team && typeof player.team === "object" ? idOf(player.team) : String(player.team || "");
      return String(teamId) && (tid === String(teamId) || team === String(teamId));
    });
  }

  function completedMatches(matches) {
    return matches.filter(isCompleted);
  }

  function getWinner(match) {
    const homeScore = scoreFrom(match, "home");
    const awayScore = scoreFrom(match, "away");
    const explicit = firstValue(match, ["winnerId", "winnerTeamId", "winner", "winningTeamId"], "");
    if (explicit) {
      const explicitId = typeof explicit === "object" ? idOf(explicit) : String(explicit);
      const homeId = teamIdFrom(match, "home");
      const awayId = teamIdFrom(match, "away");
      if (explicitId === homeId || String(explicit).toLowerCase() === teamNameFromMatch(match, "home").toLowerCase()) {
        return { id: homeId, name: teamNameFromMatch(match, "home"), side: "home" };
      }
      if (explicitId === awayId || String(explicit).toLowerCase() === teamNameFromMatch(match, "away").toLowerCase()) {
        return { id: awayId, name: teamNameFromMatch(match, "away"), side: "away" };
      }
    }
    if (homeScore === null || awayScore === null || homeScore === awayScore) return null;
    return homeScore > awayScore
      ? { id: teamIdFrom(match, "home"), name: teamNameFromMatch(match, "home"), side: "home" }
      : { id: teamIdFrom(match, "away"), name: teamNameFromMatch(match, "away"), side: "away" };
  }

  function getTournamentProgress(matches) {
    const total = matches.length;
    const played = completedMatches(matches).length;
    const finalMatch = matches.find(match =>
      /final/i.test(String(firstValue(match, [
        "round", "stage", "matchType", "phase", "bracketRound", "roundName", "name"
      ], "")))
    );
    const finalCompleted = Boolean(finalMatch && isCompleted(finalMatch));
    return {
      total,
      played,
      percent: total ? Math.round(played / total * 100) : 0,
      finalMatch,
      finalCompleted,
      complete: total > 0 && played === total && finalCompleted
    };
  }

  function matchRound(match, index) {
    return String(firstValue(match, [
      "round", "stage", "matchType", "phase", "bracketRound", "roundName", "name"
    ], `ম্যাচ ${index + 1}`));
  }

  function matchDate(match) {
    const value = firstValue(match, ["date", "matchDate", "kickoff", "scheduledAt", "startTime"], "");
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) :
      date.toLocaleDateString("bn-BD", { year: "numeric", month: "short", day: "numeric" });
  }

  function findTeamById(teamId) {
    return state.teams.find(team => idOf(team) === String(teamId)) || null;
  }

  function teamLogo(team) {
    return firstValue(team, ["profileImage", "logo", "logoUrl", "image", "imageUrl", "badge", "crest"], "");
  }

  function playerPhoto(player) {
    return firstValue(player, ["photo", "photoUrl", "image", "imageUrl", "avatar", "profileImage"], "");
  }

  function teamCard(team, title, stats, extra = "") {
    const logo = teamLogo(team);
    return `<article class="st-team-card">
      <div class="st-team-card__top"><span class="st-eyebrow">${escapeHTML(title)}</span><span class="st-trophy">🏆</span></div>
      <div class="st-team-card__identity">
        ${logo ? `<img class="st-team-logo" src="${escapeHTML(logo)}" alt="" onerror="this.hidden=true">` : `<div class="st-team-logo st-team-logo--placeholder">⚽</div>`}
        <div><h3>${escapeHTML(nameOf(team))}</h3><p>${escapeHTML(firstValue(team, ["shortName", "tagline"], "Tournament team"))}</p></div>
      </div>
      <div class="st-stat-grid">${stats.map(([label, value]) => `<div><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`).join("")}</div>
      ${extra}
      <div class="st-team-card-actions">
        <button class="st-btn st-btn--soft" data-action="team-details" data-team-id="${escapeHTML(idOf(team))}">View Details <span>↗</span></button>
      </div>
    </article>`;
  }

  function teamStats(team, matches) {
    const teamId = idOf(team);
    let played = 0, wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    matches.filter(isCompleted).forEach(match => {
      const homeId = teamIdFrom(match, "home");
      const awayId = teamIdFrom(match, "away");
      const homeName = teamNameFromMatch(match, "home");
      const awayName = teamNameFromMatch(match, "away");
      const isHome = (teamId && homeId === teamId) || nameOf(team).toLowerCase() === homeName.toLowerCase();
      const isAway = (teamId && awayId === teamId) || nameOf(team).toLowerCase() === awayName.toLowerCase();
      if (!isHome && !isAway) return;
      const hs = scoreFrom(match, "home"), as = scoreFrom(match, "away");
      if (hs === null || as === null) return;
      played++;
      goalsFor += isHome ? hs : as;
      goalsAgainst += isHome ? as : hs;
      if (hs === as) draws++;
      else if ((isHome && hs > as) || (isAway && as > hs)) wins++;
      else losses++;
    });
    return { played, wins, draws, losses, goalsFor, goalsAgainst };
  }

  function playerStats(player, matches) {
    // Match Center session events are tournament-scoped. Player-level totals
    // are intentionally not used here because they can include other tournaments
    // and already include Match Center's reconciled event contributions.
    const playerId = idOf(player);
    const playerName = nameOf(player, "").toLowerCase();
    const playerTeamId = String(firstValue(player, ["teamId", "teamID", "squadId", "clubId"], ""));
    const playerTeamName = String(firstValue(player, ["teamName"], "")).toLowerCase();
    const stats = {
      goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      fouls: 0, appearances: 0, corners: 0, freeKicks: 0, eventMinutes: []
    };

    completedMatches(matches).forEach(match => {
      const events = normalizeArray(firstValue(match, ["events", "matchEvents", "timeline", "incidents"], []));
      const substitutions = normalizeArray(match.substitutions);
      const homeId = teamIdFrom(match, "home");
      const awayId = teamIdFrom(match, "away");
      const homeName = teamNameFromMatch(match, "home").toLowerCase();
      const awayName = teamNameFromMatch(match, "away").toLowerCase();
      const belongsHome = (playerTeamId && playerTeamId === homeId) || (playerTeamName && playerTeamName === homeName);
      const belongsAway = (playerTeamId && playerTeamId === awayId) || (playerTeamName && playerTeamName === awayName);
      const side = belongsHome ? "home" : belongsAway ? "away" : "";
      const starting = match.startingXI || {};
      const started = [...(starting.home || []), ...(starting.away || [])].map(String).includes(playerId);
      const substitutedIn = substitutions.some(sub => String(sub.inPlayerId || "") === playerId);
      const substitutedOut = substitutions.some(sub => String(sub.outPlayerId || "") === playerId);
      const playerEvents = events.filter(event => {
        const eventPlayerId = String(firstValue(event, ["playerId", "scorerId", "actorId"], ""));
        const eventPlayerName = String(firstValue(event, ["playerName", "scorer", "actor"], "")).toLowerCase();
        return (playerId && eventPlayerId === playerId) || (playerName && eventPlayerName === playerName);
      });
      const assistedEvents = events.filter(event => String(event.assistPlayerId || "") === playerId ||
        (playerName && String(event.assistPlayerName || "").toLowerCase() === playerName));

      if (started || substitutedIn || substitutedOut || playerEvents.length || assistedEvents.length) stats.appearances++;

      playerEvents.forEach(event => {
        const type = String(firstValue(event, ["type", "eventType", "kind", "label"], "")).toLowerCase();
        if (type === "goal" || (/goal/.test(type) && !/own|against/.test(type))) stats.goals++;
        if (/^assist$/.test(type)) stats.assists++;
        if (/yellow/.test(type)) stats.yellowCards++;
        if (/red/.test(type)) stats.redCards++;
        if (/foul/.test(type)) stats.fouls++;
        if (/corner/.test(type)) stats.corners++;
        if (/free.?kick/.test(type)) stats.freeKicks++;
        const minute = firstValue(event, ["minute", "time", "at"], null);
        if (minute !== null && minute !== "") stats.eventMinutes.push({
          minute: String(minute),
          type: String(event.type || "Event")
        });
      });
      stats.assists += assistedEvents.filter(event => String(event.type || "").toLowerCase() === "goal").length;
      // `side` is intentionally computed from team identity; event ownership
      // itself is taken from saved IDs and never guessed from the score.
      void side;
    });
    return stats;
  }

  function allTournamentPlayerStats(matches) {
    return state.players.map(player => ({ player, stats: playerStats(player, matches) }))
      .sort((a, b) => (b.stats.goals * 4 + b.stats.assists * 3 + b.stats.appearances) -
        (a.stats.goals * 4 + a.stats.assists * 3 + a.stats.appearances));
  }

  function bestPlayerForChampion(champion, matches) {
    if (!champion) return null;
    const championId = idOf(champion);
    const roster = state.players.filter(player => {
      const tid = String(firstValue(player, ["teamId", "teamID", "squadId", "clubId"], ""));
      const tname = String(firstValue(player, ["teamName"], ""));
      return (championId && tid === championId) || tname.toLowerCase() === nameOf(champion).toLowerCase();
    });
    const list = roster.length ? roster : state.players.filter(p =>
      String(p.teamName || "").toLowerCase() === nameOf(champion).toLowerCase()
    );
    if (!list.length) return null;
    return list.map(player => ({ player, stats: playerStats(player, matches) }))
      .sort((a, b) => (b.stats.goals * 4 + b.stats.assists * 3 + b.stats.appearances - b.stats.yellowCards - b.stats.redCards * 3) -
        (a.stats.goals * 4 + a.stats.assists * 3 + a.stats.appearances - a.stats.yellowCards - a.stats.redCards * 3))[0];
  }

  function motmForMatch(match) {
    const explicit = firstValue(match, ["manOfTheMatch", "motm", "playerOfTheMatch", "bestPlayer"], null);
    if (explicit) {
      if (typeof explicit === "object") return explicit;
      return state.players.find(player =>
        idOf(player) === String(explicit) ||
        nameOf(player).toLowerCase() === String(explicit).toLowerCase()
      ) || { name: String(explicit) };
    }
    const motmId = firstValue(match, ["manOfTheMatchId", "motmId", "playerOfTheMatchId", "motmPlayerId"], "");
    if (motmId) return state.players.find(player => idOf(player) === String(motmId)) || null;
    const nested = match?.manOfTheMatch;
    return nested && typeof nested === "object" ? nested : null;
  }

  function reportUrl(tournamentId) {
    const url = new URL(window.location.href);
    url.searchParams.set("mcReport", String(tournamentId || state.selectedTournamentId || ""));
    url.hash = "statistics";
    return url.toString();
  }

  function ensureRoot() {
    let root = document.getElementById(SECTION_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = SECTION_ID;
      const main = document.querySelector("main") || document.querySelector(".main-content") || document.body;
      main.appendChild(root);
    }
    root.classList.add("matchcraft-statistics");
    return root;
  }

  function addRuntimeStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #statistics.matchcraft-statistics{display:block;color:var(--text-color,#edf1ff);font-family:inherit}
      #statistics.matchcraft-statistics[hidden]{display:none!important}
      #statistics .st-page{max-width:1440px;margin:0 auto;padding:clamp(14px,2vw,28px)}
      #statistics .st-hero{position:relative;overflow:hidden;padding:clamp(22px,4vw,42px);border-radius:24px;background:radial-gradient(circle at 90% 15%,rgba(73,220,164,.23),transparent 28%),linear-gradient(130deg,#141b32,#202b48 60%,#152c37);border:1px solid #34435d;margin-bottom:22px}
      #statistics .st-hero h1{font-size:clamp(25px,3vw,38px);margin:8px 0 10px;line-height:1.15;color:#fff}
      #statistics .st-hero p{color:#bac7db;max-width:720px;margin:0;line-height:1.7}
      #statistics .st-eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#62e5b4;font-weight:800}
      #statistics .st-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:20px 0}
      #statistics .st-select{background:#121a2b;border:1px solid #35435c;border-radius:12px;padding:12px 14px;color:#f2f5ff;min-width:min(100%,280px);max-width:100%}
      #statistics .st-actions{display:flex;gap:8px;flex-wrap:wrap}
      #statistics .st-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:11px;padding:11px 15px;font-weight:750;cursor:pointer;background:#65e5b6;color:#10231f;transition:transform .18s,filter .18s}
      #statistics .st-btn:hover{transform:translateY(-2px);filter:brightness(1.05)}
      #statistics .st-btn--soft{background:#202d43;color:#dce8fb;border:1px solid #3a4a63}
      #statistics .st-btn--outline{background:transparent;color:#dce8fb;border:1px solid #52627b}
      #statistics .st-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:18px 0 26px}
      #statistics .st-metric{background:#151e30;border:1px solid #2b3a52;border-radius:17px;padding:18px}
      #statistics .st-metric span{display:block;color:#a9b8cf;font-size:13px}
      #statistics .st-metric strong{display:block;font-size:28px;color:#fff;margin:8px 0}
      #statistics .st-section-title{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:28px 0 15px}
      #statistics .st-section-title h2{margin:0;color:#f5f7ff;font-size:clamp(20px,2.2vw,27px)}
      #statistics .st-section-title p{margin:6px 0 0;color:#9faec5;font-size:13px}
      #statistics .st-team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      #statistics .st-team-card{background:linear-gradient(145deg,#172238,#111a2a);border:1px solid #2e4058;border-radius:20px;padding:21px;min-width:0}
      #statistics .st-team-card__top{display:flex;justify-content:space-between;align-items:center}
      #statistics .st-trophy{font-size:23px}
      #statistics .st-team-card__identity{display:flex;align-items:center;gap:14px;margin:17px 0}
      #statistics .st-team-logo{width:62px;height:62px;object-fit:contain;border-radius:16px;background:#26354c;padding:7px;flex-shrink:0}
      #statistics .st-team-logo--placeholder{display:grid;place-items:center;font-size:29px}
      #statistics .st-team-card h3{font-size:21px;margin:0 0 5px;color:#fff;overflow-wrap:anywhere}
      #statistics .st-team-card p{margin:0;color:#9daec6;font-size:12px}
      #statistics .st-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:18px 0}
      #statistics .st-stat-grid>div{background:#0e1727;border:1px solid #27364d;border-radius:12px;padding:12px 8px;text-align:center}
      #statistics .st-stat-grid strong{display:block;font-size:20px;color:#eafbf5}
      #statistics .st-stat-grid span{display:block;font-size:11px;color:#9cacc3;margin-top:4px}
      #statistics .st-award-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}
      #statistics .st-award{position:relative;overflow:hidden;display:flex;gap:16px;align-items:center;background:linear-gradient(130deg,#1c2941,#111b2c);border:1px solid #354761;border-radius:20px;padding:20px;min-width:0}
      #statistics .st-award__photo{width:86px;height:86px;border-radius:50%;object-fit:cover;background:#2b3b53;border:2px solid #67e5b6;flex-shrink:0}
      #statistics .st-award__photo--placeholder{display:grid;place-items:center;font-size:34px}
      #statistics .st-award h3{margin:6px 0;color:#fff;font-size:18px;overflow-wrap:anywhere}
      #statistics .st-award p{margin:0;color:#a9b8cf;font-size:13px;line-height:1.6}
      #statistics .st-award__stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      #statistics .st-pill{border-radius:99px;padding:5px 9px;background:#24354a;color:#d9e8f9;font-size:11px}
      #statistics .st-match-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #statistics .st-match{background:#151f31;border:1px solid #2e3d55;border-radius:16px;padding:16px;min-width:0}
      #statistics .st-match__head{display:flex;justify-content:space-between;gap:10px;color:#a4b5cd;font-size:12px;margin-bottom:13px}
      #statistics .st-scoreline{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;text-align:center}
      #statistics .st-scoreline strong{font-size:clamp(13px,1.4vw,17px);color:#f2f5ff;overflow-wrap:anywhere}
      #statistics .st-score{font-size:23px;font-weight:900;white-space:nowrap;color:#6be9bb}
      #statistics .st-match__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #2b3b52;color:#a7b7ce;font-size:12px}
      #statistics .st-empty{padding:25px;text-align:center;border:1px dashed #465873;border-radius:17px;background:#121c2d;color:#bac7db;line-height:1.7}
      #statistics .st-progress{height:8px;background:#29364c;border-radius:99px;overflow:hidden;margin:13px 0 6px}
      #statistics .st-progress span{display:block;height:100%;background:linear-gradient(90deg,#42dca8,#88f4cf);border-radius:99px}
      #statistics .st-note{color:#9fadc3;font-size:12px;line-height:1.7}
      #statistics .st-modal{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(4,8,16,.82);padding:16px}
      #statistics .st-modal__panel{width:min(920px,100%);max-height:88vh;overflow:auto;background:#121c2d;border:1px solid #3b4b65;border-radius:20px;padding:22px;color:#eaf0ff;box-shadow:0 24px 90px #0009}
      #statistics .st-modal__head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
      #statistics .st-modal__head h2{margin:0;font-size:22px}
      #statistics .st-icon-btn{border:1px solid #40516b;background:#1d2a40;color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}
      #statistics .st-table-wrap{overflow-x:auto}
      #statistics .st-table{border-collapse:collapse;width:100%;min-width:540px}
      #statistics .st-table th,.st-table td{padding:11px;text-align:left;border-bottom:1px solid #2c3b52;font-size:13px}
      #statistics .st-table th{color:#69e5b8}
      #statistics .st-footer-note{color:#7789a4;text-align:center;font-size:11px;margin:26px 0 6px}
      @media(max-width:850px){#statistics .st-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#statistics .st-team-grid,#statistics .st-award-grid,#statistics .st-match-list{grid-template-columns:1fr}}
      @media(max-width:520px){#statistics .st-page{padding:12px}#statistics .st-hero{border-radius:18px;padding:22px 18px}#statistics .st-toolbar{align-items:stretch}#statistics .st-select{width:100%;min-width:0}#statistics .st-actions{width:100%}#statistics .st-actions .st-btn{flex:1}#statistics .st-grid{gap:8px}#statistics .st-metric{padding:13px}#statistics .st-metric strong{font-size:23px}#statistics .st-team-card{padding:16px}#statistics .st-award{padding:15px;gap:12px}#statistics .st-award__photo{width:66px;height:66px}#statistics .st-stat-grid strong{font-size:17px}}
      @media print{body *{visibility:hidden!important}#statistics,#statistics *{visibility:visible!important}#statistics{display:block!important;position:absolute!important;inset:0!important;width:100%!important;background:#fff!important;color:#111!important}#statistics .st-page{padding:0!important}#statistics .st-hero,#statistics .st-metric,#statistics .st-team-card,#statistics .st-award,#statistics .st-match{background:#fff!important;color:#111!important;border:1px solid #ccc!important;break-inside:avoid}#statistics h1,#statistics h2,#statistics h3,#statistics strong,#statistics .st-team-card h3,#statistics .st-award h3{color:#111!important}#statistics .st-actions,#statistics .st-btn,#statistics .st-select{display:none!important}#statistics .st-grid,#statistics .st-team-grid,#statistics .st-award-grid,#statistics .st-match-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    `;
    document.head.appendChild(style);
  }

  function setActiveTournament(value) {
    state.selectedTournamentId = String(value || "");
    renderSelectedTournament();
  }

  function renderSelectedTournament() {
    loadData();
    const root = ensureRoot();
    addRuntimeStyle();

    const queryId = new URLSearchParams(window.location.search).get("mcReport");
    if (queryId) state.selectedTournamentId = queryId;
    if (!state.selectedTournamentId && state.tournaments.length) {
      state.selectedTournamentId = idOf(state.tournaments[0]);
    }

    const selectedTournament = state.tournaments.find(t => idOf(t) === state.selectedTournamentId) || null;
    let matches = matchesForTournament(state.selectedTournamentId);
    if (!state.selectedTournamentId && state.tournaments.length === 0) matches = state.matches;

    const completed = completedMatches(matches);
    const progress = getTournamentProgress(matches);
    const tournamentTitle = selectedTournament ? nameOf(selectedTournament) :
      (matches.length ? tournamentNameFrom(matches[0]) : "আপনার টুর্নামেন্ট");
    const teams = teamsForTournament(state.selectedTournamentId);
    const champion = progress.complete && progress.finalMatch ? getWinner(progress.finalMatch) : null;
    const championTeam = champion
      ? (findTeamById(champion.id) || teams.find(t => nameOf(t).toLowerCase() === champion.name.toLowerCase()) || { id: champion.id, name: champion.name })
      : null;

    let runnerUpTeam = null;
    if (progress.complete && progress.finalMatch && champion) {
      const final = progress.finalMatch;
      const losingSide = champion.side === "home" ? "away" : "home";
      const losingId = teamIdFrom(final, losingSide);
      const losingName = teamNameFromMatch(final, losingSide);
      runnerUpTeam = findTeamById(losingId) ||
        teams.find(t => nameOf(t).toLowerCase() === losingName.toLowerCase()) ||
        { id: losingId, name: losingName };
    }

    const best = championTeam ? bestPlayerForChampion(championTeam, matches) : null;
    const baseStats = [
      ["মোট ম্যাচ", matches.length],
      ["শেষ হয়েছে", completed.length],
      ["বাকি ম্যাচ", Math.max(0, matches.length - completed.length)],
      ["অগ্রগতি", `${progress.percent}%`]
    ];

    const selectOptions = state.tournaments.length
      ? state.tournaments.map(t =>
          `<option value="${escapeHTML(idOf(t))}" ${idOf(t) === state.selectedTournamentId ? "selected" : ""}>${escapeHTML(nameOf(t))}</option>`
        ).join("")
      : `<option value="">কোনো টুর্নামেন্ট পাওয়া যায়নি</option>`;

    const teamStatsForCard = team => {
      const s = teamStats(team, matches);
      return [
        ["ম্যাচ", s.played], ["জয়", s.wins], ["ড্র", s.draws],
        ["হার", s.losses], ["গোল", s.goalsFor], ["গোল হজম", s.goalsAgainst]
      ];
    };

    const championMarkup = championTeam
      ? teamCard(championTeam, "🏆 Champion", teamStatsForCard(championTeam))
      : `<div class="st-empty"><strong>🏆 Champion এখনো নির্ধারিত হয়নি</strong><br>Final ম্যাচ সম্পন্ন এবং টুর্নামেন্টের সব ম্যাচ শেষ হলে এখানে Champion দেখানো হবে।</div>`;

    const runnerMarkup = runnerUpTeam
      ? teamCard(runnerUpTeam, "🥈 Runner-up", teamStatsForCard(runnerUpTeam))
      : `<div class="st-empty"><strong>🥈 Runner-up এখনো নির্ধারিত হয়নি</strong><br>টুর্নামেন্ট সম্পূর্ণ হওয়ার পর রানার-আপ দেখানো হবে।</div>`;

    const bestMarkup = best
      ? `<article class="st-award"><div>${playerPhoto(best.player)
          ? `<img class="st-award__photo" src="${escapeHTML(playerPhoto(best.player))}" alt="" onerror="this.hidden=true">`
          : `<div class="st-award__photo st-award__photo--placeholder">⚽</div>`}
        </div><div><span class="st-eyebrow">Tournament Best Player</span>
        <h3>${escapeHTML(nameOf(best.player))}</h3>
        <p>${escapeHTML(firstValue(best.player, ["position", "role"], "Player"))} · ${escapeHTML(
          firstValue(best.player, ["jerseyNumber", "number", "shirtNumber"], "—")
            ? "#" + firstValue(best.player, ["jerseyNumber", "number", "shirtNumber"], "—")
            : ""
        )}</p>
        <div class="st-award__stats">
          <span class="st-pill">⚽ ${best.stats.goals} গোল</span>
          <span class="st-pill">🅰️ ${best.stats.assists} অ্যাসিস্ট</span>
          <span class="st-pill">🟨 ${best.stats.yellowCards}</span>
          <span class="st-pill">🟥 ${best.stats.redCards}</span>
          <span class="st-pill">ম্যাচ ${best.stats.appearances}</span>
        </div>
        <div class="st-celebration" aria-hidden="true"><span class="st-footballer"><i></i></span><span class="st-celebration-trophy">🏆</span></div>
        <p class="st-note">চ্যাম্পিয়ন দলের খেলোয়াড়দের মধ্যে সংরক্ষিত ম্যাচভিত্তিক পারফরম্যান্স অনুযায়ী; এটি স্বয়ংক্রিয়ভাবে অফিসিয়াল MOTM নয়।</p></div></article>`
      : `<div class="st-empty">Champion দলের খেলোয়াড় ও পারফরম্যান্সের তথ্য পাওয়া গেলে Best Player দেখানো হবে।</div>`;

    const motmCards = completed.map((match, index) => {
      const motm = motmForMatch(match);
      const hs = scoreFrom(match, "home"), as = scoreFrom(match, "away");
      const label = matchRound(match, index);
      const name = motm ? nameOf(motm, "নাম সংরক্ষিত নেই") : "MOTM নির্বাচন করা হয়নি";
      return `<article class="st-match">
        <div class="st-match__head"><span>${escapeHTML(label)}</span><span>${escapeHTML(matchDate(match))}</span></div>
        <div class="st-scoreline"><strong>${escapeHTML(teamNameFromMatch(match, "home"))}</strong><span class="st-score">${hs === null ? "—" : hs} : ${as === null ? "—" : as}</span><strong>${escapeHTML(teamNameFromMatch(match, "away"))}</strong></div>
        <div class="st-match__foot"><span>⭐ ${escapeHTML(name)}</span><button class="st-btn st-btn--soft" data-action="match-details" data-match-id="${escapeHTML(idOf(match))}">বিস্তারিত</button></div>
      </article>`;
    }).join("");

    const roster = championTeam ? state.players.filter(p => {
      const teamId = String(firstValue(p, ["teamId", "teamID", "squadId", "clubId"], ""));
      const teamName = String(firstValue(p, ["teamName"], ""));
      return (idOf(championTeam) && teamId === idOf(championTeam)) ||
        teamName.toLowerCase() === nameOf(championTeam).toLowerCase();
    }) : [];

    root.innerHTML = `<div class="st-page">
      <header class="st-hero">
        <span class="st-eyebrow">MATCHCRAFT · TOURNAMENT REPORT</span>
        <h1>Statistics &amp; Awards</h1>
        <p>${escapeHTML(tournamentTitle)} — টুর্নামেন্টের ফলাফল, দলীয় পারফরম্যান্স, খেলোয়াড়ের পরিসংখ্যান এবং ম্যাচভিত্তিক পুরস্কার এক জায়গায় দেখুন।</p>
        <div class="st-progress"><span style="width:${progress.percent}%"></span></div>
        <p class="st-note">${progress.played} / ${progress.total} ম্যাচ সম্পন্ন · ${progress.percent}%</p>
      </header>

      <div class="st-toolbar">
        <label><span class="st-eyebrow" style="display:block;margin-bottom:7px">টুর্নামেন্ট নির্বাচন</span>
          <select id="stTournamentSelect" class="st-select">${selectOptions}</select>
        </label>
        <div class="st-actions">
          <button class="st-btn" data-action="print">Print / PDF</button>
          <button class="st-btn st-btn--soft" data-action="share">Share Report</button>
          <button class="st-btn st-btn--outline" data-action="qr-code">QR Code</button>
          <button class="st-btn st-btn--outline" data-action="refresh">Refresh</button>
        </div>
      </div>

      <div class="st-grid">${baseStats.map(([label, value]) =>
        `<div class="st-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><span>${label === "অগ্রগতি" ? "টুর্নামেন্ট অগ্রগতি" : "Tournament overview"}</span></div>`
      ).join("")}</div>

      <div class="st-section-title"><div><h2>Final Result</h2><p>Champion এবং Runner-up</p></div></div>
      <div class="st-team-grid">${championMarkup}${runnerMarkup}</div>

      <div class="st-section-title"><div><h2>Individual Awards</h2><p>খেলোয়াড়ের সংরক্ষিত পারফরম্যান্সের ভিত্তিতে</p></div></div>
      <div class="st-award-grid">${bestMarkup}</div>

      <div class="st-section-title"><div><h2>Match-by-Match Awards</h2><p>সম্পন্ন ম্যাচের ফলাফল; MOTM কেবল সংরক্ষিত থাকলে দেখানো হবে</p></div><span class="st-pill">${completed.length} completed</span></div>
      ${motmCards ? `<div class="st-match-list">${motmCards}</div>` : `<div class="st-empty">এই টুর্নামেন্টের কোনো সম্পন্ন ম্যাচ পাওয়া যায়নি। Fixtures/Matches পেজে ফলাফল সংরক্ষণ করার পর Refresh চাপুন।</div>`}

      <div class="st-section-title"><div><h2>Champion Squad</h2><p>চ্যাম্পিয়ন দলের খেলোয়াড়দের তথ্য</p></div></div>
      ${championTeam ? (roster.length ? `<div class="st-match-list">${roster.map(player => {
        const ps = playerStats(player, matches);
        return `<article class="st-award"><div>${playerPhoto(player)
          ? `<img class="st-award__photo" src="${escapeHTML(playerPhoto(player))}" alt="" onerror="this.hidden=true">`
          : `<div class="st-award__photo st-award__photo--placeholder">⚽</div>`}
          </div><div><span class="st-eyebrow">#${escapeHTML(firstValue(player, ["jerseyNumber", "number", "shirtNumber"], "—"))} · ${escapeHTML(firstValue(player, ["position", "role"], "Player"))}</span>
          <h3>${escapeHTML(nameOf(player))}</h3>
          <div class="st-award__stats"><span class="st-pill">⚽ ${ps.goals} গোল</span><span class="st-pill">🅰️ ${ps.assists} অ্যাসিস্ট</span><span class="st-pill">🟨 ${ps.yellowCards}</span><span class="st-pill">🟥 ${ps.redCards}</span></div></div></article>`;
      }).join("")}</div>` : `<div class="st-empty">Champion দলের সঙ্গে যুক্ত player records পাওয়া যায়নি। Teams/Players ডেটায় teamId বা teamName থাকা প্রয়োজন।</div>`) : `<div class="st-empty">Champion নিশ্চিত হলে এখানে squad দেখানো হবে।</div>`}
      <p class="st-footer-note">MATCHCRAFT · Statistics are calculated only from data available in this browser.</p>
      <div id="stModalHost"></div>
    </div>`;

    if (!state.tournaments.length) {
      const select = $("#stTournamentSelect", root);
      if (select) select.disabled = true;
    }
  }

  function openModal(title, content) {
    const root = ensureRoot();
    const host = $("#stModalHost", root);
    if (!host) return;
    host.innerHTML = `<div class="st-modal" data-action="modal-backdrop"><div class="st-modal__panel" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}"><div class="st-modal__head"><h2>${escapeHTML(title)}</h2><button class="st-icon-btn" data-action="close-modal" aria-label="Close">✕</button></div>${content}</div></div>`;
    state.modal = host.firstElementChild;
  }

  function showTeamDetails(teamId) {
    loadData();
    const team = findTeamById(teamId) || state.teams.find(t => nameOf(t).toLowerCase() === String(teamId).toLowerCase());
    if (!team) return openModal("Team Details", `<div class="st-empty">এই দলের বিস্তারিত তথ্য পাওয়া যায়নি।</div>`);
    const tournamentMatches = matchesForTournament(state.selectedTournamentId);
    const matches = completedMatches(tournamentMatches);
    const teamName = nameOf(team);
    const teamIdValue = idOf(team);
    const relevant = matches.filter(match => {
      return teamIdFrom(match, "home") === teamIdValue || teamIdFrom(match, "away") === teamIdValue ||
        teamNameFromMatch(match, "home").toLowerCase() === teamName.toLowerCase() ||
        teamNameFromMatch(match, "away").toLowerCase() === teamName.toLowerCase();
    }).sort((a, b) => String(firstValue(a, ["date", "matchDate", "createdAt", "updatedAt"], "")).localeCompare(String(firstValue(b, ["date", "matchDate", "createdAt", "updatedAt"], ""))));
    const s = teamStats(team, tournamentMatches);
    const rows = relevant.map((match, index) => {
      const home = teamNameFromMatch(match, "home"), away = teamNameFromMatch(match, "away");
      const hs = scoreFrom(match, "home"), as = scoreFrom(match, "away");
      const isHome = (teamIdValue && teamIdFrom(match, "home") === teamIdValue) || home.toLowerCase() === teamName.toLowerCase();
      const own = isHome ? hs : as, opponentScore = isHome ? as : hs;
      const opponent = isHome ? away : home;
      const result = own === null || opponentScore === null ? "স্কোর নেই" : own > opponentScore ? "জয়" : own < opponentScore ? "হার" : "ড্র";
      const events = normalizeArray(match.events);
      const eventSummary = events.length ? `${events.length} event` : "ইভেন্ট নেই";
      return `<tr><td>${escapeHTML(matchRound(match, index))}</td><td>${escapeHTML(opponent)}</td><td>${own ?? "—"} : ${opponentScore ?? "—"}</td><td>${escapeHTML(result)}</td><td>${escapeHTML(matchDate(match) || "—")}</td><td>${escapeHTML(eventSummary)}</td><td><button class="st-btn st-btn--soft" data-action="match-details" data-match-id="${escapeHTML(idOf(match))}">বিস্তারিত</button></td></tr>`;
    }).join("");
    const players = state.players.filter(player => {
      const pid = String(firstValue(player, ["teamId", "teamID", "squadId", "clubId"], ""));
      const pname = String(firstValue(player, ["teamName"], "")).toLowerCase();
      return (teamIdValue && pid === teamIdValue) || pname === teamName.toLowerCase();
    });
    const squadRows = players.map(player => {
      const ps = playerStats(player, tournamentMatches);
      return `<tr><td>${escapeHTML(nameOf(player))}</td><td>${escapeHTML(firstValue(player,["jerseyNumber","number","shirtNumber"],"—"))}</td><td>${escapeHTML(firstValue(player,["position","role"],"—"))}</td><td>${ps.goals}</td><td>${ps.assists}</td><td>${ps.yellowCards}</td><td>${ps.redCards}</td><td>${ps.appearances}</td></tr>`;
    }).join("");
    openModal(`${teamName} — Tournament Journey`, `<div class="st-detail-hero"><div class="st-detail-hero__badge">${teamLogo(team) ? `<img class="st-team-logo" src="${escapeHTML(teamLogo(team))}" alt="">` : "⚽"}</div><div><span class="st-eyebrow">TEAM PERFORMANCE REPORT</span><h3>${escapeHTML(teamName)}</h3><p>প্রথম ম্যাচ থেকে শেষ সম্পন্ন ম্যাচ পর্যন্ত প্রতিপক্ষ, স্কোর, ফলাফল এবং সংরক্ষিত ইভেন্ট।</p></div></div><div class="st-grid">${[["ম্যাচ",s.played],["জয়",s.wins],["ড্র",s.draws],["হার",s.losses],["গোল",s.goalsFor],["গোল হজম",s.goalsAgainst]].map(([l,v])=>`<div class="st-metric"><span>${l}</span><strong>${v}</strong></div>`).join("")}</div><h3>Match-by-Match Journey</h3><div class="st-table-wrap"><table class="st-table"><thead><tr><th>Round</th><th>Opponent</th><th>Score</th><th>Result</th><th>Date</th><th>Events</th><th>Details</th></tr></thead><tbody>${rows || `<tr><td colspan="7">এই দলের কোনো সম্পন্ন ম্যাচের তথ্য নেই।</td></tr>`}</tbody></table></div><h3>Squad & Tournament Stats (${players.length})</h3><div class="st-table-wrap"><table class="st-table"><thead><tr><th>Player</th><th>Jersey</th><th>Position</th><th>Goals</th><th>Assists</th><th>YC</th><th>RC</th><th>Apps</th></tr></thead><tbody>${squadRows || `<tr><td colspan="8">Squad data পাওয়া যায়নি</td></tr>`}</tbody></table></div>`);
  }

  function showMatchDetails(matchId) {
    loadData();
    const match = state.matches.find(m => idOf(m) === String(matchId));
    if (!match) return openModal("Match Details", `<div class="st-empty">ম্যাচের বিস্তারিত তথ্য পাওয়া যায়নি।</div>`);
    const events = normalizeArray(firstValue(match, ["events", "matchEvents", "timeline", "incidents"], []));
    const eventRows = events.map(event => `<tr><td>${escapeHTML(firstValue(event, ["minute", "time", "at"], "—"))}${firstValue(event, ["minute", "time", "at"], "") !== "" ? "′" : ""}</td><td>${escapeHTML(firstValue(event, ["type", "eventType", "kind", "label"], "Event"))}</td><td>${escapeHTML(firstValue(event, ["playerName", "scorer", "actor", "name"], "—"))}${firstValue(event, ["playerId"], "") ? ` <small>(${escapeHTML(firstValue(event, ["playerId"], ""))})</small>` : ""}</td><td>${escapeHTML(firstValue(event, ["assistPlayerName", "assistName", "assistPlayerId", "assist"], "—"))}</td><td>${escapeHTML(firstValue(event, ["teamName", "teamSide"], "—"))}</td></tr>`).join("");
    const hs = scoreFrom(match, "home"), as = scoreFrom(match, "away");
    openModal(`${matchRound(match, 0)} — Match Details`, `<div class="st-empty"><strong>${escapeHTML(teamNameFromMatch(match,"home"))} ${hs ?? "—"} : ${as ?? "—"} ${escapeHTML(teamNameFromMatch(match,"away"))}</strong><br>${escapeHTML(matchDate(match))}</div><h3>Recorded Events</h3><div class="st-table-wrap"><table class="st-table"><thead><tr><th>Minute</th><th>Event</th><th>Player</th><th>Assist</th><th>Team</th></tr></thead><tbody>${eventRows || `<tr><td colspan="5">এই ম্যাচের জন্য কোনো event/scorer/assist তথ্য সংরক্ষিত নেই।</td></tr>`}</tbody></table></div><p class="st-note">এই বিবরণে শুধু ম্যাচ ডেটায় সংরক্ষিত event দেখানো হচ্ছে।</p>`);
  }

  function handleAction(actionElement) {
    const action = actionElement.dataset.action;
    if (action === "refresh") renderSelectedTournament();
    if (action === "print") window.print();
    if (action === "share") shareReport();
    if (action === "qr-code") showQrCode();
    if (action === "copy-report-link") copyReportLink();
    if (action === "team-details") showTeamDetails(actionElement.dataset.teamId);
    if (action === "match-details") showMatchDetails(actionElement.dataset.matchId);
    if (action === "close-modal") {
      const host = $("#stModalHost", ensureRoot());
      if (host) host.innerHTML = "";
      state.modal = null;
    }
    if (action === "modal-backdrop" && actionElement === state.modal) {
      const host = $("#stModalHost", ensureRoot());
      if (host) host.innerHTML = "";
      state.modal = null;
    }
  }

  function copyReportLink() {
    const link = reportUrl(state.selectedTournamentId);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => alert("Report link কপি হয়েছে।"))
        .catch(() => fallbackCopy(link));
    } else {
      fallbackCopy(link);
    }
  }

  function fallbackCopy(value) {
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand("copy");
      alert("Report link কপি হয়েছে।");
    } catch (_) {
      prompt("এই লিংকটি কপি করুন:", value);
    }
    field.remove();
  }

  function shareReport() {
    const link = reportUrl(state.selectedTournamentId);
    const title = "MATCHCRAFT Statistics & Awards";
    if (navigator.share) {
      navigator.share({ title, text: "Tournament report", url: link }).catch(() => {});
    } else copyReportLink();
  }

  function showQrCode() {
    const link = reportUrl(state.selectedTournamentId);
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=" + encodeURIComponent(link);
    openModal("Tournament Report QR Code", `
      <div class="st-qr-panel">
        <p>এই QR Code স্ক্যান করলে Statistics &amp; Awards পেজের URL খুলবে।</p>
        <div class="st-qr-image-wrap"><img class="st-qr-image" src="${escapeHTML(qrUrl)}" alt="Tournament report QR Code" loading="lazy"></div>
        <p class="st-qr-url">${escapeHTML(link)}</p>
        <div class="st-qr-actions">
          <button class="st-btn" data-action="copy-report-link">Copy Report URL</button>
          <button class="st-btn st-btn--soft" data-action="share">Share Report</button>
        </div>
        <p class="st-note">গুরুত্বপূর্ণ: QR Code শুধু URL খুলবে। অন্য ডিভাইসে এই ব্রাউজারের LocalStorage ডেটা স্বয়ংক্রিয়ভাবে যাবে না। রিপোর্ট অন্য ডিভাইসে দেখাতে হলে ডেটা শেয়ার করার জন্য পাবলিক ডেটা/ব্যাকএন্ড বা আলাদা export/import ব্যবস্থা লাগবে।</p>
      </div>`);
  }

  function handleChange(event) {
    if (event.target && event.target.id === "stTournamentSelect") {
      setActiveTournament(event.target.value);
    }
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionElement = target.closest("[data-action]");
    if (actionElement && ensureRoot().contains(actionElement)) {
      handleAction(actionElement);
    }
  }

  function init() {
    const root = ensureRoot();
    addRuntimeStyle();
    if (root.dataset.statusInitialized === "true") {
      renderSelectedTournament();
      return;
    }
    root.dataset.statusInitialized = "true";
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    window.addEventListener("storage", () => renderSelectedTournament());
    [
      "matchcraft:match-completed", "matchcraft:match-updated",
      "matchcraft:fixtures-updated", "matchcraft:result-updated",
      "matchcraft:players-updated", "matchcraft:teams-updated",
      "matchcraft:tournaments-updated"
    ].forEach(name => window.addEventListener(name, () => renderSelectedTournament()));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) renderSelectedTournament();
    });
    renderSelectedTournament();
  }

  window.MatchCraftStatistics = {
    refresh: renderSelectedTournament,
    showTeamDetails,
    showMatchDetails,
    getTournamentMatches: matchesForTournament,
    getPlayerStats: playerStats
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
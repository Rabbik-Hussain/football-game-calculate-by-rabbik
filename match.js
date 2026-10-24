/* ============================================================
   MATCHCRAFT — MATCH CENTER & LIVE SCORE
   File: match.js
   Frontend-only | LocalStorage | Responsive UI

   Existing storage:
   matchcraft_teams
   matchcraft_players
   matchcraft_tournaments
   matchcraft_matches

   Match Center storage:
   matchcraft_match_center_sessions
   matchcraft_match_center_active
   matchcraft_match_center_stat_ledger
============================================================ */

(() => {
    "use strict";

    /* -------------------- Storage Keys -------------------- */

    const KEYS = {
        teams: "matchcraft_teams",
        players: "matchcraft_players",
        tournaments: "matchcraft_tournaments",
        fixtures: "matchcraft_fixtures",
        sessions: "matchcraft_match_center_sessions",
        active: "matchcraft_match_center_active",
        ledger: "matchcraft_match_center_stat_ledger"
    };

    const $ = (selector, root = document) =>
        root.querySelector(selector);

    const $$ = (selector, root = document) =>
        Array.from(root.querySelectorAll(selector));

    const readJSON = (key, fallback = []) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            console.error(`MATCHCRAFT: Could not read ${key}`, error);
            return fallback;
        }
    };

    const writeJSON = (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    };

    const makeId = (prefix = "mc") => {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID()}`;
        }

        return `${prefix}_${Date.now()}_${Math.random()
            .toString(36).slice(2, 10)}`;
    };

    const escapeHTML = (value = "") =>
        String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);

    const safeImage = (value) => {
        if (typeof value !== "string") return "";

        const image = value.trim();

        if (
            image.startsWith("data:image/") ||
            /^https?:\/\//i.test(image) ||
            image.startsWith("./") ||
            image.startsWith("../") ||
            image.startsWith("image/")
        ) {
            return image;
        }

        return "";
    };

    const imageHTML = (source, alt, className = "") => {
        const src = safeImage(source);

        if (!src) return "";

        return `
            <img
                class="${escapeHTML(className)}"
                src="${escapeHTML(src)}"
                alt="${escapeHTML(alt)}"
                loading="lazy"
                onerror="this.style.display='none'"
            >
        `;
    };

    const teamIdOf = team =>
        String(team?.id ?? team?.teamId ?? "");

    const playerIdOf = player =>
        String(player?.id ?? player?.playerId ?? "");

    const tournamentIdOf = tournament =>
        String(tournament?.id ?? tournament?.tournamentId ?? "");

    const fixtureIdOf = fixture =>
        String(fixture?.id ?? fixture?.matchId ?? fixture?.fixtureId ?? "");

    const playerTeamIdOf = player =>
        String(player?.teamId ?? player?.team ?? "");

    const teamNameOf = team =>
        team?.name ?? team?.teamName ?? "Unknown Team";

    const playerNameOf = player =>
        player?.name ?? player?.playerName ?? "Unknown Player";

    const jerseyOf = player =>
        player?.jerseyNumber ?? player?.jersey ?? "";

    const teamLogoOf = team =>
        team?.profileImage ?? team?.logo ?? team?.image ?? "";

    const tournamentNameOf = tournament =>
        tournament?.name ??
        tournament?.tournamentName ??
        tournament?.title ??
        "Tournament";

    const normalizeStatus = value =>
        String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

    const isCompletedStatus = value =>
        ["completed", "finished", "fulltime", "ft", "complete"]
            .includes(normalizeStatus(value));

    const isCancelledStatus = value =>
        ["cancelled", "canceled", "abandoned"]
            .includes(normalizeStatus(value));

    /* -------------------- Runtime State -------------------- */

    let activeFixtureId = "";
    let selectedFixtureId = "";
    let selectedEventType = "goal";
    let timerHandle = null;
    let lastRenderedSessionId = "";

    /* -------------------- Read Existing Data -------------------- */

    function getTeams() {
        return readJSON(KEYS.teams, []);
    }

    function getPlayers() {
        return readJSON(KEYS.players, []);
    }

    function getTournaments() {
        return readJSON(KEYS.tournaments, []);
    }

    function getFixtures() {
        return readJSON(KEYS.fixtures, []);
    }

    function getSessions() {
        return readJSON(KEYS.sessions, []);
    }

    function saveSessions(sessions) {
        writeJSON(KEYS.sessions, sessions);
    }

    function getSessionByFixture(fixtureId) {
        return getSessions().find(session =>
            String(session.fixtureId) === String(fixtureId)
        ) || null;
    }

    function getActiveSession() {
        const activeId = readJSON(KEYS.active, "");
        const sessions = getSessions();

        return sessions.find(session =>
            session.id === activeId &&
            session.status !== "full-time" &&
            session.status !== "cancelled"
        ) || null;
    }

    function saveSession(session) {
        const sessions = getSessions();
        const index = sessions.findIndex(item => item.id === session.id);

        session.updatedAt = new Date().toISOString();

        if (index >= 0) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }

        saveSessions(sessions);

        if (session.status !== "full-time" &&
            session.status !== "cancelled") {
            writeJSON(KEYS.active, session.id);
        } else if (readJSON(KEYS.active, "") === session.id) {
            writeJSON(KEYS.active, "");
        }

        return session;
    }

    function findTournament(id) {
        return getTournaments().find(tournament =>
            tournamentIdOf(tournament) === String(id)
        ) || null;
    }

    function findTeam(id) {
        return getTeams().find(team =>
            teamIdOf(team) === String(id)
        ) || null;
    }

    function findPlayer(id) {
        return getPlayers().find(player =>
            playerIdOf(player) === String(id)
        ) || null;
    }

    function findFixture(id) {
        return getFixtures().find(fixture =>
            fixtureIdOf(fixture) === String(id)
        ) || null;
    }

    function teamPlayers(teamId) {
        return getPlayers().filter(player =>
            playerTeamIdOf(player) === String(teamId)
        );
    }

    /* -------------------- Fixture Compatibility -------------------- */

    function fixtureTeamId(fixture, side) {
        const candidates = side === "home"
            ? [
                fixture.homeTeamId,
                fixture.homeTeam?.id,
                fixture.home?.id,
                fixture.teamAId,
                fixture.team1Id
            ]
            : [
                fixture.awayTeamId,
                fixture.awayTeam?.id,
                fixture.away?.id,
                fixture.teamBId,
                fixture.team2Id
            ];

        const id = candidates.find(value =>
            value !== undefined && value !== null && value !== ""
        );

        if (id !== undefined) return String(id);

        const nameCandidates = side === "home"
            ? [
                fixture.homeTeamName,
                typeof fixture.homeTeam === "string"
                    ? fixture.homeTeam : "",
                fixture.home,
                fixture.teamA,
                fixture.team1
            ]
            : [
                fixture.awayTeamName,
                typeof fixture.awayTeam === "string"
                    ? fixture.awayTeam : "",
                fixture.away,
                fixture.teamB,
                fixture.team2
            ];

        const name = nameCandidates.find(value =>
            typeof value === "string" && value.trim()
        );

        if (!name) return "";

        const matchingTeam = getTeams().find(team =>
            teamNameOf(team).toLowerCase() === name.trim().toLowerCase()
        );

        return matchingTeam ? teamIdOf(matchingTeam) : "";
    }

    function fixtureTournamentId(fixture) {
        const direct =
            fixture.tournamentId ??
            fixture.tournament?.id ??
            fixture.competitionId ??
            "";

        if (direct !== "") return String(direct);

        const tournamentName =
            fixture.tournamentName ??
            (typeof fixture.tournament === "string"
                ? fixture.tournament : "");

        if (!tournamentName) return "";

        const tournament = getTournaments().find(item =>
            tournamentNameOf(item).toLowerCase() ===
            tournamentName.toLowerCase()
        );

        return tournament ? tournamentIdOf(tournament) : "";
    }

    function fixtureDate(fixture) {
        return fixture.date ??
            fixture.matchDate ??
            fixture.startDate ??
            "";
    }

    function fixtureTime(fixture) {
        return fixture.time ??
            fixture.matchTime ??
            "";
    }

    function fixtureVenue(fixture) {
        return fixture.venue ??
            fixture.groundName ??
            fixture.ground ??
            fixture.location ??
            "";
    }

    function fixtureStatus(fixture) {
        return fixture.status ??
            fixture.matchStatus ??
            "upcoming";
    }

    function fixtureScore(fixture, side) {
        if (side === "home") {
            return Number(
                fixture.homeScore ??
                fixture.homeGoals ??
                fixture.scoreHome ??
                fixture.score?.home ??
                0
            );
        }

        return Number(
            fixture.awayScore ??
            fixture.awayGoals ??
            fixture.scoreAway ??
            fixture.score?.away ??
            0
        );
    }

    function getFixtureInfo(fixture) {
        const homeId = fixtureTeamId(fixture, "home");
        const awayId = fixtureTeamId(fixture, "away");

        const home = findTeam(homeId);
        const away = findTeam(awayId);
        const tournament = findTournament(fixtureTournamentId(fixture));

        return {
            homeId,
            awayId,
            home,
            away,
            tournament,
            homeName: home
                ? teamNameOf(home)
                : fixture.homeTeamName ??
                    (typeof fixture.homeTeam === "string"
                        ? fixture.homeTeam : "") ??
                    "Home Team",
            awayName: away
                ? teamNameOf(away)
                : fixture.awayTeamName ??
                    (typeof fixture.awayTeam === "string"
                        ? fixture.awayTeam : "") ??
                    "Away Team"
        };
    }

    function isFixtureEligible(fixture) {
        if (!fixture) return false;
        if (isCancelledStatus(fixtureStatus(fixture))) return false;

        const status = normalizeStatus(fixtureStatus(fixture));
        const existing = getSessionByFixture(fixtureIdOf(fixture));

        if (existing) {
            return existing.status !== "full-time" &&
                existing.status !== "cancelled";
        }

        return !isCompletedStatus(status);
    }

    /* -------------------- Build Page UI -------------------- */

    function buildPage() {
        const root = $("#matches");

        if (!root) {
            console.error(
                "MATCHCRAFT: #matches section was not found in index.html."
            );
            return;
        }

        if ($(".mc-match-app", root)) return;

        root.innerHTML = `
            <div class="mc-match-app">

                <header class="mc-match-page-header">
                    <div class="mc-match-header-copy">
                        <p class="mc-match-eyebrow">
                            MATCHCRAFT / MATCH MANAGEMENT
                        </p>

                        <h1 class="mc-match-page-title">
                            Match Center
                        </h1>

                        <p class="mc-match-page-subtitle">
                            Select a scheduled fixture, manage your lineup,
                            record match events and save the final result.
                        </p>
                    </div>

                    <div class="mc-match-header-icon" aria-hidden="true">
                        <i class="fa-solid fa-futbol"></i>
                    </div>
                </header>

                <div id="mcMatchNotice" aria-live="polite"></div>

                <div class="mc-match-summary-grid">
                    <article class="mc-match-summary-card">
                        <div class="mc-match-summary-icon">
                            <i class="fa-solid fa-calendar-check"></i>
                        </div>
                        <div class="mc-match-summary-copy">
                            <p class="mc-match-summary-label">
                                Available Fixtures
                            </p>
                            <p class="mc-match-summary-value"
                               id="mcAvailableCount">0</p>
                            <span class="mc-match-summary-note">
                                Scheduled matches
                            </span>
                        </div>
                    </article>

                    <article class="mc-match-summary-card">
                        <div class="mc-match-summary-icon mc-match-summary-icon--red">
                            <i class="fa-solid fa-tower-broadcast"></i>
                        </div>
                        <div class="mc-match-summary-copy">
                            <p class="mc-match-summary-label">Live Matches</p>
                            <p class="mc-match-summary-value"
                               id="mcLiveCount">0</p>
                            <span class="mc-match-summary-note">
                                In progress
                            </span>
                        </div>
                    </article>

                    <article class="mc-match-summary-card">
                        <div class="mc-match-summary-icon mc-match-summary-icon--blue">
                            <i class="fa-solid fa-flag-checkered"></i>
                        </div>
                        <div class="mc-match-summary-copy">
                            <p class="mc-match-summary-label">
                                Completed Matches
                            </p>
                            <p class="mc-match-summary-value"
                               id="mcCompletedCount">0</p>
                            <span class="mc-match-summary-note">
                                Full-time saved
                            </span>
                        </div>
                    </article>

                    <article class="mc-match-summary-card">
                        <div class="mc-match-summary-icon mc-match-summary-icon--orange">
                            <i class="fa-solid fa-bullseye"></i>
                        </div>
                        <div class="mc-match-summary-copy">
                            <p class="mc-match-summary-label">Goals Recorded</p>
                            <p class="mc-match-summary-value"
                               id="mcGoalsCount">0</p>
                            <span class="mc-match-summary-note">
                                From saved goal events
                            </span>
                        </div>
                    </article>
                </div>

                <section class="mc-match-panel" id="mcFixturePanel">
                    <div class="mc-match-panel-header">
                        <div class="mc-match-panel-heading">
                            <h2 class="mc-match-panel-title">
                                <i class="fa-solid fa-calendar-days"></i>
                                Select Fixture
                            </h2>
                            <p class="mc-match-panel-description">
                                Choose a scheduled match from Fixtures & Results.
                            </p>
                        </div>

                        <button type="button"
                                class="mc-match-btn mc-match-btn--secondary mc-match-btn--small"
                                id="mcRefreshFixtures">
                            <i class="fa-solid fa-rotate"></i>
                            Refresh
                        </button>
                    </div>

                    <div class="mc-match-field mc-match-field--full"
                         style="margin-bottom:18px">
                        <label class="mc-match-label" for="mcFixtureSelect">
                            Scheduled Fixture
                        </label>
                        <select class="mc-match-select" id="mcFixtureSelect">
                            <option value="">Loading fixtures...</option>
                        </select>
                    </div>

                    <div id="mcSelectedFixture"></div>
                    <div id="mcFixtureList" class="mc-match-fixture-list"></div>
                </section>

                <section class="mc-match-panel" id="mcSetupPanel">
                    <div class="mc-match-panel-header">
                        <div class="mc-match-panel-heading">
                            <h2 class="mc-match-panel-title">
                                <i class="fa-solid fa-people-group"></i>
                                Match Lineup
                            </h2>
                            <p class="mc-match-panel-description">
                                Select exactly 11 starting players for each team.
                                The remaining squad members will be substitutes.
                            </p>
                        </div>
                    </div>

                    <div id="mcLineupNotice"></div>

                    <div class="mc-match-squad-grid">
                        <section class="mc-match-squad-panel">
                            <div class="mc-match-squad-header">
                                <div class="mc-match-squad-logo"
                                     id="mcHomeSquadLogo">
                                    <i class="fa-solid fa-shield-halved"></i>
                                </div>
                                <div class="mc-match-squad-heading">
                                    <h3 class="mc-match-squad-name"
                                        id="mcHomeSquadName">Home Team</h3>
                                    <p class="mc-match-squad-count"
                                       id="mcHomeSquadCount">0 players</p>
                                </div>
                                <span class="mc-match-selection-counter"
                                      id="mcHomeSelectedCount">0 / 11</span>
                            </div>
                            <div class="mc-match-squad-body">
                                <div class="mc-match-squad-toolbar">
                                    <span class="mc-match-squad-toolbar-label">
                                        Starting XI
                                    </span>
                                    <button type="button"
                                            class="mc-match-btn mc-match-btn--secondary mc-match-btn--small"
                                            data-select-all="home">
                                        Clear Selection
                                    </button>
                                </div>
                                <div class="mc-match-player-list"
                                     id="mcHomePlayerList"></div>
                            </div>
                        </section>

                        <section class="mc-match-squad-panel">
                            <div class="mc-match-squad-header">
                                <div class="mc-match-squad-logo"
                                     id="mcAwaySquadLogo">
                                    <i class="fa-solid fa-shield-halved"></i>
                                </div>
                                <div class="mc-match-squad-heading">
                                    <h3 class="mc-match-squad-name"
                                        id="mcAwaySquadName">Away Team</h3>
                                    <p class="mc-match-squad-count"
                                       id="mcAwaySquadCount">0 players</p>
                                </div>
                                <span class="mc-match-selection-counter"
                                      id="mcAwaySelectedCount">0 / 11</span>
                            </div>
                            <div class="mc-match-squad-body">
                                <div class="mc-match-squad-toolbar">
                                    <span class="mc-match-squad-toolbar-label">
                                        Starting XI
                                    </span>
                                    <button type="button"
                                            class="mc-match-btn mc-match-btn--secondary mc-match-btn--small"
                                            data-select-all="away">
                                        Clear Selection
                                    </button>
                                </div>
                                <div class="mc-match-player-list"
                                     id="mcAwayPlayerList"></div>
                            </div>
                        </section>
                    </div>

                    <div class="mc-match-panel" style="margin-top:18px">
                        <div class="mc-match-panel-header">
                            <div class="mc-match-panel-heading">
                                <h3 class="mc-match-panel-title">
                                    <i class="fa-solid fa-sliders"></i>
                                    Match Settings
                                </h3>
                                <p class="mc-match-panel-description">
                                    Set the duration before starting the match.
                                </p>
                            </div>
                        </div>

                        <div class="mc-match-settings-grid">
                            <div class="mc-match-setting-card">
                                <p class="mc-match-setting-title">
                                    First Half (minutes)
                                </p>
                                <input class="mc-match-input"
                                       id="mcFirstHalfMinutes"
                                       type="number"
                                       min="1"
                                       max="120"
                                       value="45">
                                <p class="mc-match-setting-note">
                                    Default: 45 minutes.
                                </p>
                            </div>

                            <div class="mc-match-setting-card">
                                <p class="mc-match-setting-title">
                                    Second Half (minutes)
                                </p>
                                <input class="mc-match-input"
                                       id="mcSecondHalfMinutes"
                                       type="number"
                                       min="1"
                                       max="120"
                                       value="45">
                                <p class="mc-match-setting-note">
                                    Default: 45 minutes.
                                </p>
                            </div>

                            <div class="mc-match-setting-card">
                                <p class="mc-match-setting-title">
                                    Half-Time Break (minutes)
                                </p>
                                <input class="mc-match-input"
                                       id="mcBreakMinutes"
                                       type="number"
                                       min="0"
                                       max="60"
                                       value="15">
                                <p class="mc-match-setting-note">
                                    Display setting for the break between halves.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="mc-match-actions">
                        <button type="button"
                                class="mc-match-btn mc-match-btn--primary"
                                id="mcStartMatch">
                            <i class="fa-solid fa-play"></i>
                            Start Match
                        </button>

                        <button type="button"
                                class="mc-match-btn mc-match-btn--secondary"
                                id="mcResetLineup">
                            <i class="fa-solid fa-rotate-left"></i>
                            Reset Lineup
                        </button>
                    </div>
                </section>

                <section id="mcLiveSection" hidden>
                    <div class="mc-match-live-card">
                        <div class="mc-match-live-top">
                            <span class="mc-match-live-tournament"
                                  id="mcLiveTournament">Tournament</span>
                            <span class="mc-match-badge mc-match-badge--live"
                                  id="mcLiveStatus">LIVE</span>
                        </div>

                        <div class="mc-match-live-teams">
                            <div class="mc-match-live-team">
                                <div class="mc-match-live-logo"
                                     id="mcLiveHomeLogo">
                                    <i class="fa-solid fa-shield-halved"></i>
                                </div>
                                <h2 class="mc-match-live-team-name"
                                    id="mcLiveHomeName">Home Team</h2>
                                <p class="mc-match-live-team-short">HOME</p>
                            </div>

                            <div class="mc-match-score-center">
                                <div class="mc-match-scoreline">
                                    <span id="mcLiveHomeScore">0</span>
                                    <span class="mc-match-score-separator">:</span>
                                    <span id="mcLiveAwayScore">0</span>
                                </div>
                                <div class="mc-match-clock" id="mcLiveClock">
                                    00:00
                                </div>
                                <div class="mc-match-period-label"
                                     id="mcLivePeriod">First Half</div>
                            </div>

                            <div class="mc-match-live-team">
                                <div class="mc-match-live-logo"
                                     id="mcLiveAwayLogo">
                                    <i class="fa-solid fa-shield-halved"></i>
                                </div>
                                <h2 class="mc-match-live-team-name"
                                    id="mcLiveAwayName">Away Team</h2>
                                <p class="mc-match-live-team-short">AWAY</p>
                            </div>
                        </div>

                        <div class="mc-match-live-meta">
                            <span>
                                <i class="fa-solid fa-calendar"></i>
                                <span id="mcLiveDate">Date not set</span>
                            </span>
                            <span>
                                <i class="fa-solid fa-clock"></i>
                                <span id="mcLiveTime">Time not set</span>
                            </span>
                            <span>
                                <i class="fa-solid fa-location-dot"></i>
                                <span id="mcLiveVenue">Venue not set</span>
                            </span>
                        </div>

                        <div class="mc-match-phase-bar">
                            <button type="button"
                                    class="mc-match-phase-button"
                                    id="mcStartFirstHalf">
                                <i class="fa-solid fa-play"></i>
                                Resume / Start
                            </button>
                            <button type="button"
                                    class="mc-match-phase-button"
                                    id="mcPauseMatch">
                                <i class="fa-solid fa-pause"></i>
                                Pause
                            </button>
                            <button type="button"
                                    class="mc-match-phase-button"
                                    id="mcHalfTime">
                                <i class="fa-solid fa-mug-hot"></i>
                                Half-Time
                            </button>
                            <button type="button"
                                    class="mc-match-phase-button"
                                    id="mcSecondHalf">
                                <i class="fa-solid fa-forward"></i>
                                Second Half
                            </button>
                            <button type="button"
                                    class="mc-match-phase-button"
                                    id="mcAddedTime">
                                <i class="fa-solid fa-plus"></i>
                                Added Time
                            </button>
                            <button type="button"
                                    class="mc-match-phase-button"
                                    id="mcFullTime">
                                <i class="fa-solid fa-flag-checkered"></i>
                                Full-Time
                            </button>
                        </div>
                    </div>

                    <div class="mc-match-center-grid">
                        <div class="mc-match-main-column">

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-sliders"></i>
                                            Manual Score Update
                                        </h2>
                                        <p class="mc-match-panel-description">
                                            Use only for an administrator's score correction.
                                            Goal events should be recorded separately.
                                        </p>
                                    </div>
                                </div>

                                <form id="mcScoreForm">
                                    <div class="mc-match-score-edit-grid">
                                        <div class="mc-match-score-edit-team">
                                            <label for="mcManualHomeScore"
                                                   id="mcManualHomeLabel">
                                                Home Team
                                            </label>
                                            <input class="mc-match-score-edit-input"
                                                   id="mcManualHomeScore"
                                                   type="number"
                                                   min="0"
                                                   max="99"
                                                   step="1"
                                                   value="0"
                                                   required>
                                        </div>

                                        <div class="mc-match-score-edit-team">
                                            <label for="mcManualAwayScore"
                                                   id="mcManualAwayLabel">
                                                Away Team
                                            </label>
                                            <input class="mc-match-score-edit-input"
                                                   id="mcManualAwayScore"
                                                   type="number"
                                                   min="0"
                                                   max="99"
                                                   step="1"
                                                   value="0"
                                                   required>
                                        </div>
                                    </div>

                                    <div class="mc-match-actions">
                                        <button type="submit"
                                                class="mc-match-btn mc-match-btn--blue"
                                                id="mcSaveManualScore">
                                            <i class="fa-solid fa-floppy-disk"></i>
                                            Save Score Correction
                                        </button>
                                    </div>
                                </form>
                            </section>

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-bolt"></i>
                                            Record Match Event
                                        </h2>
                                        <p class="mc-match-panel-description">
                                            Each event is saved separately with its minute.
                                        </p>
                                    </div>
                                </div>

                                <div class="mc-match-event-type-grid">
                                    <button type="button"
                                            class="mc-match-event-type is-selected"
                                            data-event-type="goal">
                                        <i class="fa-solid fa-futbol"></i>
                                        Goal
                                    </button>

                                    <button type="button"
                                            class="mc-match-event-type"
                                            data-event-type="assist">
                                        <i class="fa-solid fa-hands-helping"></i>
                                        Assist
                                    </button>

                                    <button type="button"
                                            class="mc-match-event-type"
                                            data-event-type="foul">
                                        <i class="fa-solid fa-hand"></i>
                                        Foul
                                    </button>

                                    <button type="button"
                                            class="mc-match-event-type"
                                            data-event-type="yellow-card">
                                        <i class="fa-solid fa-square"></i>
                                        Yellow Card
                                    </button>

                                    <button type="button"
                                            class="mc-match-event-type"
                                            data-event-type="red-card">
                                        <i class="fa-solid fa-square"></i>
                                        Red Card
                                    </button>

                                    <button type="button"
                                            class="mc-match-event-type"
                                            data-event-type="corner">
                                        <i class="fa-solid fa-flag"></i>
                                        Corner
                                    </button>

                                    <button type="button"
                                            class="mc-match-event-type"
                                            data-event-type="free-kick">
                                        <i class="fa-solid fa-bullseye"></i>
                                        Free Kick
                                    </button>
                                </div>

                                <form id="mcEventForm">
                                    <div class="mc-match-event-form-fields">
                                        <div class="mc-match-field">
                                            <label class="mc-match-label"
                                                   for="mcEventTeam">
                                                Team
                                            </label>
                                            <select class="mc-match-select"
                                                    id="mcEventTeam"
                                                    required>
                                                <option value="home">Home Team</option>
                                                <option value="away">Away Team</option>
                                            </select>
                                        </div>

                                        <div class="mc-match-field">
                                            <label class="mc-match-label"
                                                   for="mcEventMinute">
                                                Match Minute
                                            </label>
                                            <input class="mc-match-input mc-match-event-minute"
                                                   id="mcEventMinute"
                                                   type="number"
                                                   min="0"
                                                   max="300"
                                                   value="1"
                                                   required>
                                        </div>

                                        <div class="mc-match-field mc-match-field--full">
                                            <label class="mc-match-label"
                                                   for="mcEventPlayer">
                                                Player
                                            </label>
                                            <select class="mc-match-select"
                                                    id="mcEventPlayer"
                                                    required>
                                                <option value="">Select player</option>
                                            </select>
                                        </div>

                                        <div class="mc-match-field mc-match-field--full"
                                             id="mcAssistField" hidden>
                                            <label class="mc-match-label"
                                                   for="mcAssistPlayer">
                                                Assister
                                            </label>
                                            <select class="mc-match-select"
                                                    id="mcAssistPlayer">
                                                <option value="">No assist / Select assister</option>
                                            </select>
                                        </div>

                                        <div class="mc-match-field mc-match-field--full">
                                            <label class="mc-match-label"
                                                   for="mcEventNotes">
                                                Notes (optional)
                                            </label>
                                            <input class="mc-match-input"
                                                   id="mcEventNotes"
                                                   type="text"
                                                   maxlength="250"
                                                   placeholder="Event details...">
                                        </div>
                                    </div>

                                    <div class="mc-match-actions">
                                        <button type="submit"
                                                class="mc-match-btn mc-match-btn--primary"
                                                id="mcSaveEvent">
                                            <i class="fa-solid fa-plus"></i>
                                            Save Event
                                        </button>
                                    </div>
                                </form>
                            </section>

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-repeat"></i>
                                            Player Substitution
                                        </h2>
                                        <p class="mc-match-panel-description">
                                            Record the outgoing and incoming player,
                                            including the match minute.
                                        </p>
                                    </div>
                                </div>

                                <form id="mcSubstitutionForm">
                                    <div class="mc-match-form-grid">
                                        <div class="mc-match-field">
                                            <label class="mc-match-label"
                                                   for="mcSubTeam">
                                                Team
                                            </label>
                                            <select class="mc-match-select"
                                                    id="mcSubTeam" required>
                                                <option value="home">Home Team</option>
                                                <option value="away">Away Team</option>
                                            </select>
                                        </div>

                                        <div class="mc-match-field">
                                            <label class="mc-match-label"
                                                   for="mcSubMinute">
                                                Minute
                                            </label>
                                            <input class="mc-match-input"
                                                   id="mcSubMinute"
                                                   type="number"
                                                   min="0"
                                                   max="300"
                                                   value="60"
                                                   required>
                                        </div>

                                        <div class="mc-match-field">
                                            <label class="mc-match-label"
                                                   for="mcSubOut">
                                                Player Leaving
                                            </label>
                                            <select class="mc-match-select"
                                                    id="mcSubOut" required>
                                                <option value="">Select outgoing player</option>
                                            </select>
                                        </div>

                                        <div class="mc-match-field">
                                            <label class="mc-match-label"
                                                   for="mcSubIn">
                                                Substitute Entering
                                            </label>
                                            <select class="mc-match-select"
                                                    id="mcSubIn" required>
                                                <option value="">Select substitute</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="mc-match-actions">
                                        <button type="submit"
                                                class="mc-match-btn mc-match-btn--blue"
                                                id="mcSaveSubstitution">
                                            <i class="fa-solid fa-right-left"></i>
                                            Save Substitution
                                        </button>
                                    </div>
                                </form>
                            </section>

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-timeline"></i>
                                            Match Events
                                        </h2>
                                        <p class="mc-match-panel-description">
                                            Saved events for the selected match.
                                        </p>
                                    </div>
                                    <span class="mc-match-selection-counter"
                                          id="mcEventCount">0 events</span>
                                </div>

                                <div class="mc-match-event-list"
                                     id="mcEventList"></div>
                            </section>
                        </div>

                        <aside class="mc-match-side-column">

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-location-dot"></i>
                                            Match Venue
                                        </h2>
                                    </div>
                                </div>
                                <div id="mcVenueCard"></div>
                            </section>

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-chart-simple"></i>
                                            Match Summary
                                        </h2>
                                    </div>
                                </div>

                                <div class="mc-match-stat-list"
                                     id="mcMatchStats"></div>
                            </section>

                            <section class="mc-match-panel">
                                <div class="mc-match-panel-header">
                                    <div class="mc-match-panel-heading">
                                        <h2 class="mc-match-panel-title">
                                            <i class="fa-solid fa-clipboard-check"></i>
                                            Full-Time Result
                                        </h2>
                                        <p class="mc-match-panel-description">
                                            The result is saved when Full-Time is confirmed.
                                        </p>
                                    </div>
                                </div>

                                <div id="mcFullTimeResult">
                                    <div class="mc-match-empty">
                                        <div class="mc-match-empty-icon">
                                            <i class="fa-solid fa-hourglass-half"></i>
                                        </div>
                                        <h3 class="mc-match-empty-title">
                                            Match in Progress
                                        </h3>
                                        <p class="mc-match-empty-text">
                                            The result will be finalized after
                                            the administrator confirms Full-Time.
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                </section>

                <section class="mc-match-panel" id="mcRecentPanel">
                    <div class="mc-match-panel-header">
                        <div class="mc-match-panel-heading">
                            <h2 class="mc-match-panel-title">
                                <i class="fa-solid fa-clock-rotate-left"></i>
                                Match Center History
                            </h2>
                            <p class="mc-match-panel-description">
                                Previously started and completed Match Center sessions.
                            </p>
                        </div>
                    </div>
                    <div class="mc-match-history-list" id="mcHistoryList"></div>
                </section>

            </div>
        `;

        bindEvents();
        renderAll();
        restoreActiveSession();
        startTicker();
    }

    /* -------------------- Notices -------------------- */

    function showNotice(message, type = "info") {
        const container = $("#mcMatchNotice");
        if (!container) return;

        const icon = {
            info: "fa-circle-info",
            success: "fa-circle-check",
            warning: "fa-triangle-exclamation",
            error: "fa-circle-exclamation"
        }[type] || "fa-circle-info";

        const className = {
            info: "",
            success: "mc-match-notice--success",
            warning: "mc-match-notice--warning",
            error: "mc-match-notice--error"
        }[type] || "";

        container.innerHTML = `
            <div class="mc-match-notice ${className}">
                <i class="fa-solid ${icon}"></i>
                <span>${escapeHTML(message)}</span>
            </div>
        `;

        if (type === "success") {
            window.setTimeout(() => {
                if (container.textContent.includes(message)) {
                    container.innerHTML = "";
                }
            }, 4500);
        }
    }

    function clearNotice() {
        const container = $("#mcMatchNotice");
        if (container) container.innerHTML = "";
    }

    /* -------------------- Rendering: Summary -------------------- */

    function renderSummary() {
        const fixtures = getFixtures();
        const sessions = getSessions();

        const completedFixtureIds = new Set(
            fixtures.filter(fixture =>
                isCompletedStatus(fixtureStatus(fixture))
            ).map(fixtureIdOf)
        );

        const liveSessions = sessions.filter(session =>
            session.status !== "full-time" &&
            session.status !== "cancelled"
        );

        const completedSessions = sessions.filter(session =>
            session.status === "full-time"
        );

        const allGoalEvents = sessions.reduce((total, session) =>
            total + (session.events || []).filter(event =>
                event.type === "goal"
            ).length, 0
        );

        $("#mcAvailableCount").textContent = fixtures.filter(fixture =>
            isFixtureEligible(fixture)
        ).length;

        $("#mcLiveCount").textContent = liveSessions.length;

        $("#mcCompletedCount").textContent = new Set([
            ...Array.from(completedFixtureIds),
            ...completedSessions.map(session => String(session.fixtureId))
        ]).size;

        $("#mcGoalsCount").textContent = allGoalEvents;
    }

    /* -------------------- Rendering: Fixtures -------------------- */

    function renderFixtures() {
        const fixtures = getFixtures();
        const select = $("#mcFixtureSelect");
        const list = $("#mcFixtureList");

        if (!select || !list) return;

        const eligible = fixtures.filter(fixture => {
            const id = fixtureIdOf(fixture);
            return id && isFixtureEligible(fixture);
        });

        const previousValue = selectedFixtureId || select.value;

        select.innerHTML = `
            <option value="">Select a scheduled fixture</option>
            ${eligible.map(fixture => {
                const info = getFixtureInfo(fixture);
                const label =
                    `${info.homeName} vs ${info.awayName}` +
                    ` — ${fixtureDate(fixture) || "Date not set"}`;

                return `
                    <option value="${escapeHTML(fixtureIdOf(fixture))}">
                        ${escapeHTML(label)}
                    </option>
                `;
            }).join("")}
        `;

        if (eligible.some(fixture =>
            fixtureIdOf(fixture) === previousValue
        )) {
            select.value = previousValue;
        } else if (activeFixtureId &&
            eligible.some(fixture =>
                fixtureIdOf(fixture) === activeFixtureId
            )) {
            select.value = activeFixtureId;
        } else {
            select.value = "";
        }

        list.innerHTML = eligible.length
            ? eligible.map(fixture => renderFixtureCard(fixture)).join("")
            : `
                <div class="mc-match-empty"
                     style="grid-column:1/-1">
                    <div class="mc-match-empty-icon">
                        <i class="fa-solid fa-calendar-xmark"></i>
                    </div>
                    <h3 class="mc-match-empty-title">
                        No Available Fixtures
                    </h3>
                    <p class="mc-match-empty-text">
                        Create a match schedule in Fixtures & Results,
                        then refresh this page.
                    </p>
                </div>
            `;

        renderSelectedFixture();
    }

    function renderFixtureCard(fixture) {
        const info = getFixtureInfo(fixture);
        const id = fixtureIdOf(fixture);
        const selected = id === selectedFixtureId;
        const session = getSessionByFixture(id);

        const homeLogo = info.home
            ? teamLogoOf(info.home) : "";

        const awayLogo = info.away
            ? teamLogoOf(info.away) : "";

        return `
            <article class="mc-match-fixture-card ${selected ? "is-selected" : ""}"
                     data-fixture-card="${escapeHTML(id)}">

                <div class="mc-match-fixture-top">
                    <span class="mc-match-fixture-tournament">
                        ${escapeHTML(
                            tournamentNameOf(info.tournament || {
                                name: fixture.tournamentName ||
                                    fixture.tournament ||
                                    "Tournament"
                            })
                        )}
                    </span>
                    <span class="mc-match-badge ${
                        session ? "mc-match-badge--live" :
                        "mc-match-badge--upcoming"
                    }">
                        ${escapeHTML(session ? statusLabel(session.status) :
                            fixtureStatus(fixture))}
                    </span>
                </div>

                <div class="mc-match-fixture-teams">
                    <div class="mc-match-fixture-team">
                        <div class="mc-match-team-logo">
                            ${imageHTML(homeLogo, info.homeName)}
                            ${homeLogo ? "" :
                                '<i class="fa-solid fa-shield-halved"></i>'}
                        </div>
                        <p class="mc-match-fixture-team-name">
                            ${escapeHTML(info.homeName)}
                        </p>
                    </div>

                    <span class="mc-match-fixture-vs">VS</span>

                    <div class="mc-match-fixture-team">
                        <div class="mc-match-team-logo">
                            ${imageHTML(awayLogo, info.awayName)}
                            ${awayLogo ? "" :
                                '<i class="fa-solid fa-shield-halved"></i>'}
                        </div>
                        <p class="mc-match-fixture-team-name">
                            ${escapeHTML(info.awayName)}
                        </p>
                    </div>
                </div>

                <div class="mc-match-fixture-meta">
                    <span>
                        <i class="fa-solid fa-calendar"></i>
                        ${escapeHTML(fixtureDate(fixture) || "Date not set")}
                    </span>
                    <span>
                        <i class="fa-solid fa-clock"></i>
                        ${escapeHTML(fixtureTime(fixture) || "Time not set")}
                    </span>
                    <span>
                        <i class="fa-solid fa-location-dot"></i>
                        ${escapeHTML(fixtureVenue(fixture) || "Venue not set")}
                    </span>
                </div>

                <div class="mc-match-actions">
                    <button type="button"
                            class="mc-match-btn ${
                                selected
                                    ? "mc-match-btn--primary"
                                    : "mc-match-btn--secondary"
                            } mc-match-btn--block"
                            data-choose-fixture="${escapeHTML(id)}">
                        <i class="fa-solid fa-futbol"></i>
                        ${selected ? "Selected Fixture" : "Select Fixture"}
                    </button>
                </div>
            </article>
        `;
    }

    function renderSelectedFixture() {
        const container = $("#mcSelectedFixture");
        if (!container) return;

        const fixture = findFixture(selectedFixtureId);

        if (!fixture) {
            container.innerHTML = "";
            return;
        }

        const info = getFixtureInfo(fixture);

        container.innerHTML = `
            <div class="mc-match-notice mc-match-notice--success">
                <i class="fa-solid fa-check-circle"></i>
                <span>
                    Selected: <strong>${escapeHTML(info.homeName)}</strong>
                    vs <strong>${escapeHTML(info.awayName)}</strong>.
                    Confirm both teams' starting lineups below.
                </span>
            </div>
        `;
    }

    /* -------------------- Player Lineup -------------------- */

 function renderLineup() {
    const fixture = findFixture(selectedFixtureId);

    const foundSession = fixture
        ? getSessionByFixture(selectedFixtureId)
        : null;

    // A lineup draft is not a started match.
    const session = foundSession &&
        foundSession.status !== "lineup"
        ? foundSession
        : null;

    const info = fixture ? getFixtureInfo(fixture) : null;

    const draft = fixture && !session
        ? getSessions().find(item =>
            item.fixtureId === selectedFixtureId &&
            item.status === "lineup"
        )
        : null;

    const homeId =
        session?.homeTeamId ||
        draft?.homeTeamId ||
        info?.homeId ||
        "";

    const awayId =
        session?.awayTeamId ||
        draft?.awayTeamId ||
        info?.awayId ||
        "";

    const homeTeam = findTeam(homeId);
    const awayTeam = findTeam(awayId);

    $("#mcHomeSquadName").textContent =
        homeTeam ? teamNameOf(homeTeam) : "Home Team";

    $("#mcAwaySquadName").textContent =
        awayTeam ? teamNameOf(awayTeam) : "Away Team";

    renderTeamLogo($("#mcHomeSquadLogo"), homeTeam);
    renderTeamLogo($("#mcAwaySquadLogo"), awayTeam);

    const homePlayers = teamPlayers(homeId);
    const awayPlayers = teamPlayers(awayId);

    $("#mcHomeSquadCount").textContent =
        `${homePlayers.length} squad players`;

    $("#mcAwaySquadCount").textContent =
        `${awayPlayers.length} squad players`;

    const homeSelected = (
        session?.startingXI?.home ||
        draft?.startingXI?.home ||
        []
    ).map(String);

    const awaySelected = (
        session?.startingXI?.away ||
        draft?.startingXI?.away ||
        []
    ).map(String);

    $("#mcHomeSelectedCount").textContent =
        `${homeSelected.length} selected`;

    $("#mcAwaySelectedCount").textContent =
        `${awaySelected.length} selected`;

    $("#mcHomeSelectedCount").classList.toggle(
        "is-complete",
        homeSelected.length > 0
    );

    $("#mcAwaySelectedCount").classList.toggle(
        "is-complete",
        awaySelected.length > 0
    );

    $("#mcHomeSelectedCount").classList.remove("is-invalid");
    $("#mcAwaySelectedCount").classList.remove("is-invalid");

    $("#mcHomePlayerList").innerHTML =
        renderPlayerChoices(homePlayers, homeSelected, "home");

    $("#mcAwayPlayerList").innerHTML =
        renderPlayerChoices(awayPlayers, awaySelected, "away");

    const isExistingSession = Boolean(session);

    const hasValidTeams = Boolean(
        fixture &&
        homeId &&
        awayId &&
        homeId !== awayId
    );

    const hasEqualSelections =
        homeSelected.length > 0 &&
        awaySelected.length > 0 &&
        homeSelected.length === awaySelected.length;

    // Start Match requires equal, non-zero selections for both teams.
    $("#mcStartMatch").disabled =
        !hasValidTeams ||
        isExistingSession ||
        !hasEqualSelections;

    $("#mcResetLineup").disabled = isExistingSession;

    const notice = $("#mcLineupNotice");

    if (!fixture) {
        notice.innerHTML = `
            <div class="mc-match-notice">
                <i class="fa-solid fa-circle-info"></i>
                <span>Select a fixture first to load the two teams.</span>
            </div>
        `;
    } else if (!hasValidTeams) {
        notice.innerHTML = `
            <div class="mc-match-notice mc-match-notice--warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>
                    The selected fixture's team IDs could not be matched
                    to two different teams in the Team Library.
                </span>
            </div>
        `;
    } else if (isExistingSession) {
        notice.innerHTML = `
            <div class="mc-match-notice mc-match-notice--warning">
                <i class="fa-solid fa-lock"></i>
                <span>
                    A Match Center session already exists for this fixture.
                    Resume it from Match Center History or select another fixture.
                </span>
            </div>
        `;
    } else if (homeSelected.length !== awaySelected.length) {
        notice.innerHTML = `
            <div class="mc-match-notice mc-match-notice--warning">
                <i class="fa-solid fa-scale-balanced"></i>
                <span>
                    দুই দলে সমান সংখ্যক খেলোয়াড় নির্বাচন করুন।
                    Home: ${homeSelected.length} জন, Away: ${awaySelected.length} জন।
                </span>
            </div>
        `;
    } else if (homeSelected.length === 0) {
        notice.innerHTML = `
            <div class="mc-match-notice">
                <i class="fa-solid fa-circle-info"></i>
                <span>
                    ম্যাচ শুরু করতে Home ও Away—দুই দল থেকেই সমান সংখ্যক
                    খেলোয়াড় নির্বাচন করুন। অন্তত একজন করে নির্বাচন করতে হবে।
                </span>
            </div>
        `;
    } else {
        notice.innerHTML = `
            <div class="mc-match-notice">
                <i class="fa-solid fa-circle-check"></i>
                <span>
                    দুই দলে ${homeSelected.length} জন করে নির্বাচিত।
                    এখন Start Match চাপতে পারবেন।
                </span>
            </div>
        `;
    }
}

    function renderTeamLogo(container, team) {
        if (!container) return;

        const source = team ? teamLogoOf(team) : "";

        container.innerHTML = source
            ? imageHTML(source, teamNameOf(team))
            : '<i class="fa-solid fa-shield-halved"></i>';
    }

    function renderPlayerChoices(players, selectedIds, side) {
    if (!players.length) {
        return `
            <div class="mc-match-empty">
                <div class="mc-match-empty-icon">
                    <i class="fa-solid fa-user-slash"></i>
                </div>
                <h3 class="mc-match-empty-title">No Players Found</h3>
                <p class="mc-match-empty-text">
                    Add players to this team in the Players page.
                </p>
            </div>
        `;
    }

    const selected = (selectedIds || []).map(String);

    // A lineup draft does not lock player selection.
    // Only an actual match session locks the checkboxes.
    const session = getSessionByFixture(selectedFixtureId);
    const isLocked = Boolean(
        session && session.status !== "lineup"
    );

    return players.map(player => {
        const id = String(playerIdOf(player));
        const isSelected = selected.includes(id);
        const photo = player.photo ?? player.profileImage ?? "";

        return `
            <label class="mc-match-player-row ${
                isSelected ? "is-selected" : ""
            }">
                <input
                    class="mc-match-player-check"
                    type="checkbox"
                    data-lineup-side="${escapeHTML(side)}"
                    data-player-id="${escapeHTML(id)}"
                    ${isSelected ? "checked" : ""}
                    ${isLocked ? "disabled" : ""}
                >

                <div class="mc-match-player-avatar">
                    ${imageHTML(photo, playerNameOf(player))}
                    ${photo ? "" :
                        escapeHTML(
                            playerNameOf(player).slice(0, 1).toUpperCase()
                        )}
                </div>

                <div class="mc-match-player-copy">
                    <p class="mc-match-player-name">
                        ${escapeHTML(playerNameOf(player))}
                    </p>
                    <div class="mc-match-player-meta">
                        <span>
                            ${escapeHTML(player.position || "Position N/A")}
                        </span>
                    </div>
                </div>

                <span class="mc-match-jersey">
                    ${escapeHTML(jerseyOf(player) || "—")}
                </span>
            </label>
        `;
    }).join("");
}

    function updateLineupSelection(side, playerId, checked) {
    const fixture = findFixture(selectedFixtureId);

    if (!fixture) {
        showNotice("Select a fixture first.", "warning");
        return;
    }

    const existingSession = getSessionByFixture(selectedFixtureId);

    if (existingSession && existingSession.status !== "lineup") {
        showNotice("A match has already started for this fixture.", "warning");
        renderLineup();
        return;
    }

    const info = getFixtureInfo(fixture);
    const teamId = side === "home" ? info.homeId : info.awayId;
    const player = findPlayer(playerId);

    if (!player || playerTeamIdOf(player) !== String(teamId)) {
        showNotice("This player does not belong to the selected team.", "error");
        renderLineup();
        return;
    }

    const sessions = getSessions();
    let draft = sessions.find(session =>
        session.fixtureId === selectedFixtureId &&
        session.status === "lineup"
    );

    if (!draft) {
        draft = {
            id: makeId("draft"),
            fixtureId: selectedFixtureId,
            status: "lineup",
            startingXI: { home: [], away: [] },
            events: [],
            createdAt: new Date().toISOString()
        };

        sessions.push(draft);
    }

    if (!draft.startingXI) {
        draft.startingXI = { home: [], away: [] };
    }

    if (!Array.isArray(draft.startingXI[side])) {
        draft.startingXI[side] = [];
    }

    const list = draft.startingXI[side];
    const id = String(playerId);

    if (checked) {
        if (!list.includes(id)) {
            list.push(id);
        }
    } else {
        draft.startingXI[side] = list.filter(item => item !== id);
    }

    draft.homeTeamId = info.homeId;
    draft.awayTeamId = info.awayId;
    draft.homeTeamName = info.homeName;
    draft.awayTeamName = info.awayName;

    saveSessions(sessions);
    renderLineup();
}

    function resetLineup() {
        if (!selectedFixtureId) return;

        if (getSessionByFixture(selectedFixtureId)) {
            showNotice("Started match lineup cannot be reset here.", "warning");
            return;
        }

        const sessions = getSessions().filter(session =>
            !(session.fixtureId === selectedFixtureId &&
              session.status === "lineup")
        );

        saveSessions(sessions);
        renderLineup();
        showNotice("Lineup selection cleared.", "success");
    }

    /* -------------------- Start Match -------------------- */

 function startMatch() {
    const fixture = findFixture(selectedFixtureId);

    if (!fixture) {
        showNotice("Please select a scheduled fixture first.", "warning");
        return;
    }

    if (!isFixtureEligible(fixture)) {
        showNotice("This fixture is already completed or cancelled.", "warning");
        return;
    }

    const existing = getSessionByFixture(selectedFixtureId);

    // A lineup draft is editable and is not a started match.
    if (existing && existing.status !== "lineup") {
        showNotice(
            "A match session already exists for this fixture. Duplicate sessions are blocked.",
            "warning"
        );
        return;
    }

    const info = getFixtureInfo(fixture);

    if (
        !info.homeId ||
        !info.awayId ||
        info.homeId === info.awayId
    ) {
        showNotice(
            "The fixture must have two different teams from the Team Library.",
            "error"
        );
        return;
    }

    const homePlayers = teamPlayers(info.homeId);
    const awayPlayers = teamPlayers(info.awayId);

    const draft = getSessions().find(session =>
        session.fixtureId === selectedFixtureId &&
        session.status === "lineup"
    );

    const homeXI = (draft?.startingXI?.home || []).map(String);
    const awayXI = (draft?.startingXI?.away || []).map(String);

    // Both teams must have at least one selected player.
    if (homeXI.length === 0 || awayXI.length === 0) {
        showNotice(
            "ম্যাচ শুরু করতে Home ও Away—দুই দল থেকেই অন্তত একজন খেলোয়াড় নির্বাচন করুন।",
            "warning"
        );
        return;
    }

    // Both teams must have exactly the same number of selected players.
    if (homeXI.length !== awayXI.length) {
        showNotice(
            `দুই দলে সমান সংখ্যক খেলোয়াড় নির্বাচন করুন। Home: ${homeXI.length} জন, Away: ${awayXI.length} জন।`,
            "warning"
        );
        return;
    }

    if (
        new Set(homeXI).size !== homeXI.length ||
        new Set(awayXI).size !== awayXI.length
    ) {
        showNotice("Duplicate players were found in the lineup.", "error");
        return;
    }

    const firstHalfMinutes = Number($("#mcFirstHalfMinutes").value);
    const secondHalfMinutes = Number($("#mcSecondHalfMinutes").value);
    const breakMinutes = Number($("#mcBreakMinutes").value);

    if (
        !Number.isInteger(firstHalfMinutes) ||
        firstHalfMinutes < 1 || firstHalfMinutes > 120 ||
        !Number.isInteger(secondHalfMinutes) ||
        secondHalfMinutes < 1 || secondHalfMinutes > 120 ||
        !Number.isInteger(breakMinutes) ||
        breakMinutes < 0 || breakMinutes > 60
    ) {
        showNotice("Enter valid match durations.", "error");
        return;
    }

    const homeSet = new Set(
        homePlayers.map(player => String(playerIdOf(player)))
    );

    const awaySet = new Set(
        awayPlayers.map(player => String(playerIdOf(player)))
    );

    if (
        homeXI.some(id => !homeSet.has(id)) ||
        awayXI.some(id => !awaySet.has(id))
    ) {
        showNotice(
            "A selected player no longer belongs to the team.",
            "error"
        );
        return;
    }

    const now = Date.now();

    const session = {
        id: makeId("match"),
        fixtureId: selectedFixtureId,
        tournamentId: fixtureTournamentId(fixture),
        tournamentName: tournamentNameOf(
            findTournament(fixtureTournamentId(fixture)) || {
                name: fixture.tournamentName || "Tournament"
            }
        ),

        homeTeamId: info.homeId,
        awayTeamId: info.awayId,
        homeTeamName: info.homeName,
        awayTeamName: info.awayName,

        homeScore: 0,
        awayScore: 0,

        status: "first-half",
        period: "first-half",
        paused: false,

        startedAt: now,
        phaseStartedAt: now,
        phaseElapsedSeconds: 0,

        firstHalfMinutes,
        secondHalfMinutes,
        breakMinutes,

        firstHalfAddedMinutes: 0,
secondHalfAddedMinutes: 0,

firstHalfSeconds: 0,
secondHalfSeconds: 0,

firstHalfAddedSeconds: 0,
secondHalfAddedSeconds: 0,

addedTimeFor: null,
addedTimeMinutes: 0,
phaseExpiryHandled: false,

        startingXI: {
            home: [...homeXI],
            away: [...awayXI]
        },

        activePlayers: {
            home: [...homeXI],
            away: [...awayXI]
        },

        substitutions: [],
        events: [],

        venue: fixtureVenue(fixture),
        date: fixtureDate(fixture),
        time: fixtureTime(fixture),

        createdAt: new Date().toISOString(),
        resultSaved: false
    };

    // Replace the saved lineup draft with the actual match session.
    const sessions = getSessions();
    const draftIndex = sessions.findIndex(session =>
        session.fixtureId === selectedFixtureId &&
        session.status === "lineup"
    );

    if (draftIndex !== -1) {
        sessions[draftIndex] = session;
        saveSessions(sessions);
    } else {
        saveSession(session);
    }

    activeFixtureId = selectedFixtureId;
    lastRenderedSessionId = session.id;

    renderAll();
    renderActiveSession(session);

    showNotice(
        "Match started successfully. Score begins at 0–0.",
        "success"
    );
}

    /* -------------------- Clock & Match Phases -------------------- */

    function statusLabel(status) {
        return ({
            lineup: "Lineup",
            "first-half": "First Half",
            halftime: "Half-Time",
            "second-half": "Second Half",
            "added-time": "Added Time",
            paused: "Paused",
            "full-time": "Full-Time",
            cancelled: "Cancelled"
        })[status] || status || "Upcoming";
    }

    function phaseElapsedSeconds(session) {
        let elapsed = Number(session.phaseElapsedSeconds || 0);

        if (!session.paused &&
            ["first-half", "second-half", "added-time"].includes(session.status) &&
            session.phaseStartedAt) {
            elapsed += Math.max(
                0,
                Math.floor((Date.now() - session.phaseStartedAt) / 1000)
            );
        }

        return elapsed;
    }

    function phaseDurationSeconds(session) {
    if (session.status === "first-half") {
        return Number(session.firstHalfMinutes || 1) * 60;
    }

    if (session.status === "second-half") {
        return Number(session.secondHalfMinutes || 1) * 60;
    }

    if (session.status === "added-time") {
        return Number(session.addedTimeMinutes || 0) * 60;
    }

    return 0;
}

function phaseRemainingSeconds(session) {
    return Math.max(
        0,
        phaseDurationSeconds(session) - phaseElapsedSeconds(session)
    );
}

 function totalMatchSeconds(session) {
    const firstHalfSeconds =
        Number(session.firstHalfSeconds || 0);

    const firstHalfAddedSeconds =
        Number(session.firstHalfAddedSeconds || 0);

    const secondHalfSeconds =
        Number(session.secondHalfSeconds || 0);

    const secondHalfAddedSeconds =
        Number(session.secondHalfAddedSeconds || 0);

    const elapsed = phaseElapsedSeconds(session);

    switch (session.status) {
        case "first-half":
            return elapsed;

        case "added-time":
            if (session.addedTimeFor === "first-half") {
                return firstHalfSeconds + elapsed;
            }

            return firstHalfSeconds +
                firstHalfAddedSeconds +
                secondHalfSeconds +
                elapsed;

        case "halftime":
            return firstHalfSeconds + firstHalfAddedSeconds;

        case "second-half":
            return firstHalfSeconds +
                firstHalfAddedSeconds +
                elapsed;

        case "full-time":
            return firstHalfSeconds +
                firstHalfAddedSeconds +
                secondHalfSeconds +
                secondHalfAddedSeconds;

        default:
            return elapsed;
    }
}

function displayMinute(session) {
    const seconds = totalMatchSeconds(session);
    return Math.max(1, Math.floor(seconds / 60));
}

    function clockText(seconds) {
        const minutes = Math.floor(Math.max(0, seconds) / 60);
        const remaining = Math.max(0, seconds) % 60;

        return `${String(minutes).padStart(2, "0")}:` +
            `${String(remaining).padStart(2, "0")}`;
    }

    

  function freezeCurrentPhase(session) {
    const elapsed = phaseElapsedSeconds(session);

    if (session.status === "first-half") {
        session.firstHalfSeconds = elapsed;
    } else if (session.status === "second-half") {
        session.secondHalfSeconds = elapsed;
    } else if (session.status === "added-time") {
        if (session.addedTimeFor === "first-half") {
            session.firstHalfAddedSeconds = elapsed;
        } else if (session.addedTimeFor === "second-half") {
            session.secondHalfAddedSeconds = elapsed;
        }
    }

    // Preserve the elapsed time of the current phase for Resume.
    session.phaseElapsedSeconds = elapsed;
    session.phaseStartedAt = null;
}

    function resumeCurrentPhase(session) {
        if (!["first-half", "second-half", "added-time"].includes(session.status)) {
            return;
        }

        if (session.paused) {
            session.paused = false;
            session.phaseStartedAt = Date.now();
            session.updatedAt = new Date().toISOString();
            saveSession(session);
        }
    }

    function pauseMatch() {
        const session = getActiveSession();

        if (!session) {
            showNotice("No active match to pause.", "warning");
            return;
        }

        if (session.paused) {
            showNotice("This match is already paused.", "warning");
            return;
        }

        freezeCurrentPhase(session);
        session.paused = true;
        session.statusBeforePause = session.status;
        saveSession(session);

        renderActiveSession(session);
        showNotice("Match timer paused.", "success");
    }

    function resumeMatch() {
    const session = getActiveSession();

    if (!session) {
        showNotice("No active match found.", "warning");
        return;
    }

    if (session.status === "halftime") {
        showNotice(
            "Half-Time চলছে। দ্বিতীয়ার্ধ শুরু করতে Second Half বাটনে ক্লিক করুন।",
            "info"
        );
        return;
    }

    if (!["first-half", "second-half", "added-time"]
        .includes(session.status)) {
        showNotice(
            "এই ম্যাচের বর্তমান অবস্থায় Timer Resume করা যাবে না।",
            "warning"
        );
        return;
    }

    if (!session.paused) {
        showNotice("The match is already running.", "info");
        return;
    }

    session.paused = false;
    session.phaseStartedAt = Date.now();

    saveSession(session);
    renderActiveSession(session);

    showNotice("Match timer resumed.", "success");
}

    function setHalfTime() {
        const session = getActiveSession();

        if (!session || session.status !== "first-half") {
            showNotice("Half-Time is available during the First Half.", "warning");
            return;
        }

        freezeCurrentPhase(session);
        session.status = "halftime";
        session.paused = true;
        session.phaseStartedAt = null;

        saveSession(session);
        renderActiveSession(session);

        showNotice("Half-Time recorded. Start the Second Half when ready.", "success");
    }

    function startSecondHalf() {
        const session = getActiveSession();

        if (!session || session.status !== "halftime") {
            showNotice("Record Half-Time before starting the Second Half.", "warning");
            return;
        }

        session.status = "second-half";
        session.period = "second-half";
        session.paused = false;
        session.phaseElapsedSeconds = 0;
        session.phaseStartedAt = Date.now();

        saveSession(session);
        renderActiveSession(session);

        showNotice("Second Half started.", "success");
    }

    function enableAddedTime() {
        const session = getActiveSession();

        if (!session ||
            !["first-half", "second-half"].includes(session.status)) {
            showNotice("Added Time can be enabled during a playing half.", "warning");
            return;
        }

        const answer = window.prompt(
            "Enter added time in minutes (0–30):",
            "3"
        );

        if (answer === null) return;

        const minutes = Number(answer);

        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 30) {
            showNotice("Added time must be a whole number from 0 to 30.", "error");
            return;
        }

        if (session.status === "first-half") {
            session.firstHalfAddedMinutes = minutes;
        } else {
            session.secondHalfAddedMinutes = minutes;
        }

        session.period = session.status;
        saveSession(session);

        renderActiveSession(session);

        showNotice(
            `Added time set to ${minutes} minute(s). The administrator controls the final whistle.`,
            "success"
        );
    }

    function finishMatch(automatic = false) {
    const session = getActiveSession();

    if (!session) {
        showNotice("No active match to finish.", "warning");
        return;
    }

    if (session.status === "full-time") return;

    if (!automatic) {
        const confirmed = window.confirm(
            `Confirm Full-Time?\n\n` +
            `${session.homeTeamName} ${session.homeScore} - ` +
            `${session.awayScore} ${session.awayTeamName}\n\n` +
            `This will save the final result.`
        );

        if (!confirmed) return;
    }

    freezeCurrentPhase(session);

    session.status = "full-time";
    session.period = "full-time";
    session.paused = true;
    session.phaseStartedAt = null;
    session.phaseExpiryHandled = true;
    session.finishedAt = new Date().toISOString();
    session.resultSaved = true;

    saveSession(session);
    syncFixtureResult(session);
    reconcilePlayerStats();

    renderAll();
    renderActiveSession(session);

    showNotice(
        automatic
            ? "সময় শেষ। ম্যাচ স্বয়ংক্রিয়ভাবে Full-Time হয়েছে।"
            : "Full-Time result saved.",
        "success"
    );
}

    function startTicker() {
        if (timerHandle) window.clearInterval(timerHandle);

        timerHandle = window.setInterval(() => {
            const session = getActiveSession();

            if (session && !session.paused) {
                updateLiveClock(session);
            }
        }, 1000);
    }

 function updateLiveClock(session) {
    const clock = $("#mcLiveClock");
    if (!clock || !session) return;

    const activePhases = [
        "first-half",
        "second-half",
        "added-time"
    ];

    if (!activePhases.includes(session.status)) {
        clock.textContent = "00:00";

        const phase = $("#mcLivePeriod");
        if (phase) {
            phase.textContent = session.paused
                ? `${statusLabel(session.status)} · Paused`
                : statusLabel(session.status);
        }

        return;
    }

    const remaining = phaseRemainingSeconds(session);

    clock.textContent = clockText(remaining);

    const phase = $("#mcLivePeriod");
    if (phase) {
        phase.textContent = session.paused
            ? `${statusLabel(session.status)} · Paused`
            : statusLabel(session.status);
    }

    if (
        remaining > 0 ||
        session.paused ||
        session.phaseExpiryHandled
    ) {
        return;
    }

    // Mark expiry before saving or changing phase.
    session.phaseExpiryHandled = true;

    // Preserve the exact duration of the expired phase.
    session.phaseElapsedSeconds =
        phaseDurationSeconds(session);
    session.phaseStartedAt = null;

    freezeCurrentPhase(session);
    saveSession(session);

    handlePhaseExpiry(session);
}


function handlePhaseExpiry(session) {
    if (!session || session.status === "full-time") return;

    // First Half timer expired
    if (session.status === "first-half") {
        const addTime = window.confirm(
            "প্রথমার্ধের নির্ধারিত সময় শেষ হয়েছে।\n\n" +
            "আপনি কি Added Time যোগ করতে চান?"
        );

        if (!addTime) {
            session.status = "halftime";
            session.period = "halftime";
            session.paused = true;
            session.phaseStartedAt = null;
            session.phaseElapsedSeconds = 0;
            session.phaseExpiryHandled = false;

            saveSession(session);
            renderActiveSession(session);

            showNotice(
                "First Half শেষ। প্রস্তুত হলে Second Half শুরু করুন।",
                "success"
            );
            return;
        }

        let minutes;

        while (true) {
            const answer = window.prompt(
                "প্রথমার্ধে কত মিনিট Added Time দেবেন? (১–৩০)",
                String(session.firstHalfAddedMinutes || 1)
            );

            // Cancel করলে Added Time বাদ দিয়ে Half-Time।
            if (answer === null) {
                minutes = 0;
                break;
            }

            const value = Number(answer.trim());

            if (
                Number.isInteger(value) &&
                value >= 1 &&
                value <= 30
            ) {
                minutes = value;
                break;
            }

            window.alert(
                "সঠিক পূর্ণসংখ্যা দিন: ১ থেকে ৩০ মিনিট।"
            );
        }

        if (minutes === 0) {
            session.status = "halftime";
            session.period = "halftime";
            session.paused = true;
            session.phaseStartedAt = null;
            session.phaseElapsedSeconds = 0;
            session.phaseExpiryHandled = false;

            saveSession(session);
            renderActiveSession(session);

            showNotice(
                "First Half শেষ। এখন Half-Time।",
                "success"
            );
            return;
        }

        session.firstHalfAddedMinutes = minutes;
        session.addedTimeFor = "first-half";
        session.addedTimeMinutes = minutes;
        session.status = "added-time";
        session.period = "first-half-added-time";
        session.phaseElapsedSeconds = 0;
        session.phaseStartedAt = Date.now();
        session.paused = false;
        session.phaseExpiryHandled = false;

        saveSession(session);
        renderActiveSession(session);

        showNotice(
            `First Half Added Time: ${minutes} minute(s).`,
            "success"
        );
        return;
    }

    // Second Half timer expired
    if (session.status === "second-half") {
        const addTime = window.confirm(
            "দ্বিতীয়ার্ধের নির্ধারিত সময় শেষ হয়েছে।\n\n" +
            "আপনি কি Added Time যোগ করতে চান?"
        );

        if (!addTime) {
            finishMatch(true);
            return;
        }

        let minutes;

        while (true) {
            const answer = window.prompt(
                "দ্বিতীয়ার্ধে কত মিনিট Added Time দেবেন? (১–৩০)",
                String(session.secondHalfAddedMinutes || 1)
            );

            // Cancel করলে Added Time বাদ দিয়ে Full-Time।
            if (answer === null) {
                minutes = 0;
                break;
            }

            const value = Number(answer.trim());

            if (
                Number.isInteger(value) &&
                value >= 1 &&
                value <= 30
            ) {
                minutes = value;
                break;
            }

            window.alert(
                "সঠিক পূর্ণসংখ্যা দিন: ১ থেকে ৩০ মিনিট।"
            );
        }

        if (minutes === 0) {
            finishMatch(true);
            return;
        }

        session.secondHalfAddedMinutes = minutes;
        session.addedTimeFor = "second-half";
        session.addedTimeMinutes = minutes;
        session.status = "added-time";
        session.period = "second-half-added-time";
        session.phaseElapsedSeconds = 0;
        session.phaseStartedAt = Date.now();
        session.paused = false;
        session.phaseExpiryHandled = false;

        saveSession(session);
        renderActiveSession(session);

        showNotice(
            `Second Half Added Time: ${minutes} minute(s).`,
            "success"
        );
        return;
    }

    // Added Time timer expired
    if (session.status === "added-time") {
        if (session.addedTimeFor === "first-half") {
            session.firstHalfAddedSeconds =
                Number(session.addedTimeMinutes || 0) * 60;

            session.status = "halftime";
            session.period = "halftime";
            session.paused = true;
            session.phaseStartedAt = null;
            session.phaseElapsedSeconds = 0;
            session.phaseExpiryHandled = false;

            saveSession(session);
            renderActiveSession(session);

            showNotice(
                "First Half Added Time শেষ। এখন Half-Time।",
                "success"
            );
            return;
        }

        if (session.addedTimeFor === "second-half") {
            finishMatch(true);
        }
    }
}

    /* -------------------- Manual Score Correction -------------------- */

    function saveManualScore(event) {
        event.preventDefault();

        const session = getActiveSession();

        if (!session) {
            showNotice("Start a match before updating its score.", "warning");
            return;
        }

        const homeScore = Number($("#mcManualHomeScore").value);
        const awayScore = Number($("#mcManualAwayScore").value);

        if (
            !Number.isInteger(homeScore) || homeScore < 0 || homeScore > 99 ||
            !Number.isInteger(awayScore) || awayScore < 0 || awayScore > 99
        ) {
            showNotice("Scores must be whole numbers from 0 to 99.", "error");
            return;
        }

        const confirmed = window.confirm(
            `Correct score to ${homeScore} - ${awayScore}?\n\n` +
            `This is a score correction only; it will not create goal events ` +
            `or automatically assign goals to players.`
        );

        if (!confirmed) return;

        session.homeScore = homeScore;
        session.awayScore = awayScore;
        session.scoreCorrectedAt = new Date().toISOString();

        saveSession(session);

        if (session.status === "full-time") {
            syncFixtureResult(session);
        }

        renderActiveSession(session);
        showNotice("Score correction saved.", "success");
    }

    /* -------------------- Event Management -------------------- */

    const EVENT_LABELS = {
        goal: "Goal",
        assist: "Assist",
        foul: "Foul",
        "yellow-card": "Yellow Card",
        "red-card": "Red Card",
        corner: "Corner",
        "free-kick": "Free Kick",
        substitution: "Substitution"
    };

    const EVENT_ICONS = {
        goal: "fa-futbol",
        assist: "fa-hands-helping",
        foul: "fa-hand",
        "yellow-card": "fa-square",
        "red-card": "fa-square",
        corner: "fa-flag",
        "free-kick": "fa-bullseye",
        substitution: "fa-right-left"
    };

    function selectEventType(type) {
        if (!EVENT_LABELS[type] || type === "substitution") return;

        selectedEventType = type;

        $$(".mc-match-event-type").forEach(button => {
            button.classList.toggle(
                "is-selected",
                button.dataset.eventType === type
            );
        });

        $("#mcAssistField").hidden = type !== "goal";

        renderEventPlayerOptions();
    }

    function renderEventPlayerOptions() {
    const session = getActiveSession();
    const teamSide = $("#mcEventTeam")?.value || "home";

    const playerSelect = $("#mcEventPlayer");
    const assistSelect = $("#mcAssistPlayer");

    if (!playerSelect || !assistSelect) return;

    if (!session) {
        playerSelect.innerHTML =
            '<option value="">Start a match first</option>';
        assistSelect.innerHTML =
            '<option value="">No assist</option>';
        return;
    }

    const activeIds = (session.activePlayers?.[teamSide] || [])
        .map(String);

    const activePlayers = activeIds
        .map(id => findPlayer(id))
        .filter(Boolean);

    playerSelect.innerHTML = `
        <option value="">Select on-field player</option>
        ${activePlayers.map(player => `
            <option value="${escapeHTML(String(playerIdOf(player)))}">
                #${escapeHTML(jerseyOf(player) || "—")}
                ${escapeHTML(playerNameOf(player))}
            </option>
        `).join("")}
    `;

    assistSelect.innerHTML = `
        <option value="">No assist</option>
        ${activePlayers.map(player => `
            <option value="${escapeHTML(String(playerIdOf(player)))}">
                #${escapeHTML(jerseyOf(player) || "—")}
                ${escapeHTML(playerNameOf(player))}
            </option>
        `).join("")}
    `;
}

    function saveEvent(event) {
        event.preventDefault();

        const session = getActiveSession();

        if (!session) {
            showNotice("Start a match before recording events.", "warning");
            return;
        }

        if (!["first-half", "second-half", "added-time"].includes(session.status)) {
            showNotice("Events can only be added while a half is in progress.", "warning");
            return;
        }

        const side = $("#mcEventTeam").value;
        const playerId = $("#mcEventPlayer").value;
        const assistId = $("#mcAssistPlayer").value;
        const minute = Number($("#mcEventMinute").value);
        const notes = $("#mcEventNotes").value.trim();

        if (!playerId) {
            showNotice("Select a player for this event.", "warning");
            return;
        }

        if (!Number.isInteger(minute) || minute < 0 || minute > 300) {
            showNotice("Enter a valid match minute.", "error");
            return;
        }

        const teamId = side === "home"
            ? session.homeTeamId
            : session.awayTeamId;

       const player = findPlayer(playerId);

const activeIds = (
    session.activePlayers?.[side] || []
).map(String);

if (!player || playerTeamIdOf(player) !== String(teamId)) {
    showNotice(
        "The selected player does not belong to this team.",
        "error"
    );
    return;
}

if (!activeIds.includes(String(playerId))) {
    showNotice(
        "এই খেলোয়াড় বর্তমানে মাঠে নেই। শুধু মাঠে থাকা খেলোয়াড় নির্বাচন করুন।",
        "warning"
    );
    renderEventPlayerOptions();
    return;
}

        if (selectedEventType === "goal") {
            if (session.events.some(eventItem =>
                eventItem.type === "goal" &&
                eventItem.playerId === String(playerId) &&
                eventItem.minute === minute &&
                eventItem.teamSide === side &&
                eventItem.notes === notes
            )) {
                showNotice(
                    "A matching goal event already exists. Check the event list before saving again.",
                    "warning"
                );
                return;
            }
        }

        let assister = null;

        if (selectedEventType === "goal" && assistId) {
            if (assistId === playerId) {
                showNotice("A player cannot assist their own goal.", "warning");
                return;
            }

            assister = findPlayer(assistId);

if (!assister ||
    playerTeamIdOf(assister) !== String(teamId)) {
    showNotice(
        "The selected assister does not belong to this team.",
        "error"
    );
    return;
}

if (!activeIds.includes(String(assistId))) {
    showNotice(
        "Assist-এর খেলোয়াড় বর্তমানে মাঠে নেই। মাঠে থাকা খেলোয়াড় নির্বাচন করুন।",
        "warning"
    );
    renderEventPlayerOptions();
    return;
}
        }

        const eventItem = {
            id: makeId("event"),
            type: selectedEventType,
            teamSide: side,
            teamId,
            teamName: side === "home"
                ? session.homeTeamName
                : session.awayTeamName,
            playerId: String(playerId),
            playerName: playerNameOf(player),
            minute,
            notes,
            createdAt: new Date().toISOString()
        };

        if (assister) {
            eventItem.assistPlayerId = playerIdOf(assister);
            eventItem.assistPlayerName = playerNameOf(assister);
        }

        session.events.push(eventItem);

        if (selectedEventType === "goal") {
            if (side === "home") {
                session.homeScore += 1;
            } else {
                session.awayScore += 1;
            }
        }

        saveSession(session);
        reconcilePlayerStats();

        $("#mcEventNotes").value = "";
        $("#mcAssistPlayer").value = "";

        renderActiveSession(session);
        renderSummary();

        showNotice(
            `${EVENT_LABELS[selectedEventType]} event saved.`,
            "success"
        );
    }

    function deleteEvent(eventId) {
        const session = getActiveSession();

        if (!session) {
            showNotice("No active match found.", "warning");
            return;
        }

        const eventItem = session.events.find(item => item.id === eventId);

        if (!eventItem) return;

        const confirmed = window.confirm(
            `Delete this ${EVENT_LABELS[eventItem.type] || "match"} event?\n\n` +
            `Player statistics will be recalculated from saved events.`
        );

        if (!confirmed) return;

        session.events = session.events.filter(item => item.id !== eventId);

        if (eventItem.type === "goal") {
            if (eventItem.teamSide === "home") {
                session.homeScore = Math.max(0, session.homeScore - 1);
            } else {
                session.awayScore = Math.max(0, session.awayScore - 1);
            }
        }

        saveSession(session);
        reconcilePlayerStats();

        renderActiveSession(session);
        showNotice("Event deleted and event-based statistics recalculated.", "success");
    }

    /* -------------------- Substitutions -------------------- */

    function renderSubstitutionOptions() {
        const session = getActiveSession();

        const teamSelect = $("#mcSubTeam");
        const outSelect = $("#mcSubOut");
        const inSelect = $("#mcSubIn");

        if (!teamSelect || !outSelect || !inSelect) return;

        if (!session) {
            outSelect.innerHTML = '<option value="">Start a match first</option>';
            inSelect.innerHTML = '<option value="">Start a match first</option>';
            return;
        }

        const side = teamSelect.value;
        const teamId = side === "home"
            ? session.homeTeamId
            : session.awayTeamId;

        const activeIds = session.activePlayers[side] || [];
        const startingIds = session.startingXI[side] || [];

        const onPitch = activeIds
            .map(id => findPlayer(id))
            .filter(Boolean);

        const availableSubstitutes = teamPlayers(teamId).filter(player => {
            const id = playerIdOf(player);

            return !activeIds.includes(id) &&
                !session.substitutions.some(sub =>
                    sub.teamSide === side &&
                    sub.inPlayerId === id
                );
        });

        outSelect.innerHTML = `
            <option value="">Select outgoing player</option>
            ${onPitch.map(player => `
                <option value="${escapeHTML(playerIdOf(player))}">
                    #${escapeHTML(jerseyOf(player) || "—")}
                    ${escapeHTML(playerNameOf(player))}
                </option>
            `).join("")}
        `;

        inSelect.innerHTML = `
            <option value="">Select substitute</option>
            ${availableSubstitutes.map(player => `
                <option value="${escapeHTML(playerIdOf(player))}">
                    #${escapeHTML(jerseyOf(player) || "—")}
                    ${escapeHTML(playerNameOf(player))}
                </option>
            `).join("")}
        `;

        void startingIds;
    }

    function saveSubstitution(event) {
        event.preventDefault();

        const session = getActiveSession();

        if (!session) {
            showNotice("Start a match before recording substitutions.", "warning");
            return;
        }

        if (!["first-half", "second-half", "added-time"].includes(session.status)) {
            showNotice("Substitutions can only be recorded while the match is in progress.", "warning");
            return;
        }

        const side = $("#mcSubTeam").value;
        const outgoingId = $("#mcSubOut").value;
        const incomingId = $("#mcSubIn").value;
        const minute = Number($("#mcSubMinute").value);

        if (!outgoingId || !incomingId) {
            showNotice("Select both the outgoing player and the substitute.", "warning");
            return;
        }

        if (outgoingId === incomingId) {
            showNotice("The incoming and outgoing players must be different.", "error");
            return;
        }

        if (!Number.isInteger(minute) || minute < 0 || minute > 300) {
            showNotice("Enter a valid substitution minute.", "error");
            return;
        }

        const teamId = side === "home"
            ? session.homeTeamId
            : session.awayTeamId;

        const outgoing = findPlayer(outgoingId);
        const incoming = findPlayer(incomingId);

        if (!outgoing || !incoming ||
            playerTeamIdOf(outgoing) !== String(teamId) ||
            playerTeamIdOf(incoming) !== String(teamId)) {
            showNotice("Both players must belong to the same selected team.", "error");
            return;
        }

        const active = session.activePlayers[side];

        if (!active.includes(String(outgoingId))) {
            showNotice("The outgoing player is not currently on the pitch.", "error");
            return;
        }

        if (active.includes(String(incomingId))) {
            showNotice("The incoming player is already on the pitch.", "error");
            return;
        }

        const previouslyEntered = session.substitutions.some(sub =>
            sub.teamSide === side &&
            sub.inPlayerId === String(incomingId)
        );

        if (previouslyEntered) {
            showNotice("This player has already entered as a substitute.", "error");
            return;
        }

        session.activePlayers[side] = active
            .filter(id => id !== String(outgoingId));

        session.activePlayers[side].push(String(incomingId));

        const substitution = {
            id: makeId("sub"),
            type: "substitution",
            teamSide: side,
            teamId,
            teamName: side === "home"
                ? session.homeTeamName
                : session.awayTeamName,
            outPlayerId: String(outgoingId),
            outPlayerName: playerNameOf(outgoing),
            inPlayerId: String(incomingId),
            inPlayerName: playerNameOf(incoming),
            minute,
            createdAt: new Date().toISOString()
        };

        session.substitutions.push(substitution);
        session.events.push({
            ...substitution,
            playerId: String(incomingId),
            playerName: playerNameOf(incoming)
        });

        saveSession(session);

        renderActiveSession(session);
        showNotice(
            `${playerNameOf(outgoing)} replaced by ${playerNameOf(incoming)}.`,
            "success"
        );
    }

    /* -------------------- Event-Based Player Statistics -------------------- */

    /*
      Stats are reconciled against our own ledger.

      This prevents repeated refreshes or repeated Full-Time actions
      from adding the same Match Center events to player totals again.

      Existing stats not created by Match Center are preserved.
    */

    function reconcilePlayerStats() {
        const players = getPlayers();
        const sessions = getSessions();

        const oldLedger = readJSON(KEYS.ledger, {});
        const newLedger = {};

        players.forEach(player => {
            const id = playerIdOf(player);
            if (!id) return;

            newLedger[id] = {
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                matchesPlayed: 0
            };
        });

        sessions.forEach(session => {
            const events = session.events || [];

            events.forEach(eventItem => {
                const playerId = String(eventItem.playerId || "");

                if (newLedger[playerId]) {
                    if (eventItem.type === "goal") {
                        newLedger[playerId].goals += 1;
                    }

                    if (eventItem.type === "yellow-card") {
                        newLedger[playerId].yellowCards += 1;
                    }

                    if (eventItem.type === "red-card") {
                        newLedger[playerId].redCards += 1;
                    }
                }

                const assistPlayerId = String(eventItem.assistPlayerId || "");

                if (eventItem.type === "goal" &&
                    assistPlayerId &&
                    newLedger[assistPlayerId]) {
                    newLedger[assistPlayerId].assists += 1;
                }
            });

            if (session.status === "full-time") {
                const appeared = new Set([
                    ...(session.startingXI?.home || []),
                    ...(session.startingXI?.away || [])
                ]);

                (session.substitutions || []).forEach(sub => {
                    appeared.add(String(sub.inPlayerId));
                });

                appeared.forEach(playerId => {
                    if (newLedger[playerId]) {
                        newLedger[playerId].matchesPlayed += 1;
                    }
                });
            }
        });

        let changed = false;

        players.forEach(player => {
            const id = playerIdOf(player);
            const current = newLedger[id];

            if (!id || !current) return;

            const old = oldLedger[id] || {
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                matchesPlayed: 0
            };

            [
                "goals",
                "assists",
                "yellowCards",
                "redCards",
                "matchesPlayed"
            ].forEach(stat => {
                const previousContribution = Number(old[stat] || 0);
                const nextContribution = Number(current[stat] || 0);

                const existingValue = Number(player[stat] || 0);

                player[stat] = Math.max(
                    0,
                    existingValue +
                    nextContribution -
                    previousContribution
                );
            });

            changed = true;
        });

        if (changed) {
            writeJSON(KEYS.players, players);
            writeJSON(KEYS.ledger, newLedger);

            try {
                window.dispatchEvent(new CustomEvent("matchcraft:players-updated"));
            } catch (error) {
                console.warn("MATCHCRAFT: Could not dispatch player update event.", error);
            }
        }
    }

    /* -------------------- Fixture Result Synchronization -------------------- */

    function syncFixtureResult(session) {
        const fixtures = getFixtures();

        const index = fixtures.findIndex(fixture =>
            fixtureIdOf(fixture) === String(session.fixtureId)
        );

        if (index < 0) {
            console.warn(
                "MATCHCRAFT: The matching fixture was not found. " +
                "The Full-Time result is preserved in Match Center storage."
            );
            return false;
        }

        const fixture = fixtures[index];

        /*
          Preserve the original fixture object and its existing fields.
          The final fixtures.js integration should standardize these
          field names and any tournament standings notifications.
        */

        fixture.homeScore = Number(session.homeScore);
        fixture.awayScore = Number(session.awayScore);
        fixture.status = "completed";
        fixture.matchStatus = "Full-Time";
        fixture.resultSaved = true;
        fixture.resultSource = "matchcraft_match_center";
        fixture.resultSessionId = session.id;
        fixture.completedAt = session.finishedAt ||
            new Date().toISOString();

        try {
            writeJSON(KEYS.fixtures, fixtures);

            window.dispatchEvent(new CustomEvent(
                "matchcraft:result-updated",
                {
                    detail: {
                        fixtureId: session.fixtureId,
                        sessionId: session.id,
                        homeScore: session.homeScore,
                        awayScore: session.awayScore,
                        tournamentId: session.tournamentId
                    }
                }
            ));

            return true;
        } catch (error) {
            console.error("MATCHCRAFT: Could not sync fixture result.", error);
            showNotice(
                "Full-Time is saved in Match Center, but fixture synchronization failed.",
                "error"
            );
            return false;
        }
    }

    /* -------------------- Render: Live Session -------------------- */

    function restoreActiveSession() {
        const active = getActiveSession();

        if (active) {
            activeFixtureId = String(active.fixtureId);
            selectedFixtureId = String(active.fixtureId);

            const select = $("#mcFixtureSelect");

            if (select) select.value = selectedFixtureId;

            renderAll();
            renderActiveSession(active);
            return;
        }

        const selected = getSessionByFixture(selectedFixtureId);

        if (selected && selected.status === "full-time") {
            renderActiveSession(selected);
        }
    }

    function renderActiveSession(session) {
        if (!session) return;

        activeFixtureId = String(session.fixtureId);
        lastRenderedSessionId = session.id;

        $("#mcLiveSection").hidden = false;
        $("#mcSetupPanel").hidden = true;

        $("#mcLiveTournament").textContent =
            session.tournamentName || "Tournament";

        $("#mcLiveHomeName").textContent = session.homeTeamName;
        $("#mcLiveAwayName").textContent = session.awayTeamName;

        $("#mcLiveHomeScore").textContent = session.homeScore;
        $("#mcLiveAwayScore").textContent = session.awayScore;

        $("#mcManualHomeLabel").textContent = session.homeTeamName;
        $("#mcManualAwayLabel").textContent = session.awayTeamName;

        $("#mcManualHomeScore").value = session.homeScore;
        $("#mcManualAwayScore").value = session.awayScore;

        $("#mcLiveDate").textContent = session.date || "Date not set";
        $("#mcLiveTime").textContent = session.time || "Time not set";
        $("#mcLiveVenue").textContent = session.venue || "Venue not set";

        renderTeamLogo($("#mcLiveHomeLogo"), findTeam(session.homeTeamId));
        renderTeamLogo($("#mcLiveAwayLogo"), findTeam(session.awayTeamId));

        const status = $("#mcLiveStatus");

        status.textContent = session.paused
            ? "PAUSED"
            : statusLabel(session.status).toUpperCase();

        status.className = "mc-match-badge " +
            (session.status === "full-time"
                ? "mc-match-badge--completed"
                : session.status === "halftime"
                    ? "mc-match-badge--halftime"
                    : session.status === "cancelled"
                        ? "mc-match-badge--cancelled"
                        : "mc-match-badge--live");

        $("#mcLivePeriod").textContent =
            session.paused
                ? `${statusLabel(session.status)} · Paused`
                : statusLabel(session.status);

        updateLiveClock(session);
        updatePhaseButtons(session);
        renderEventList(session);
        renderMatchStats(session);
        renderVenue(session);
        renderFullTimeResult(session);
        renderSubstitutionOptions();
        renderEventPlayerOptions();

        $("#mcEventForm").querySelectorAll("input, select, button")
            .forEach(control => {
                control.disabled = session.status === "full-time" ||
                    session.status === "cancelled";
            });

        $("#mcSubstitutionForm").querySelectorAll("input, select, button")
            .forEach(control => {
                control.disabled = session.status === "full-time" ||
                    session.status === "cancelled";
            });

        $("#mcSaveManualScore").disabled =
            session.status === "full-time" ||
            session.status === "cancelled";

        $("#mcFullTime").disabled =
            session.status === "full-time" ||
            session.status === "cancelled";

        $("#mcPauseMatch").disabled =
            session.paused ||
            session.status === "full-time" ||
            session.status === "cancelled" ||
            session.status === "halftime";

        $("#mcStartFirstHalf").disabled =
            !session.paused ||
            session.status === "full-time" ||
            session.status === "cancelled" ||
            session.status === "halftime";

        $("#mcHalfTime").disabled = session.status !== "first-half";

        $("#mcSecondHalf").disabled = session.status !== "halftime";

        $("#mcAddedTime").disabled =
            !["first-half", "second-half"].includes(session.status);

        if (session.status === "full-time") {
            $("#mcLiveSection").hidden = false;
            $("#mcSetupPanel").hidden = true;
        }
    }

    function updatePhaseButtons(session) {
        const startButton = $("#mcStartFirstHalf");

        if (session.status === "first-half") {
            startButton.innerHTML =
                '<i class="fa-solid fa-play"></i> Resume / Start';
        } else if (session.status === "second-half" ||
                   session.status === "added-time") {
            startButton.innerHTML =
                '<i class="fa-solid fa-play"></i> Resume Match';
        } else {
            startButton.innerHTML =
                '<i class="fa-solid fa-play"></i> Resume / Start';
        }
    }

    /* -------------------- Render: Event List -------------------- */

    function renderEventList(session) {
        const container = $("#mcEventList");

        const events = [...(session.events || [])].sort((a, b) =>
            Number(b.minute || 0) - Number(a.minute || 0)
        );

        $("#mcEventCount").textContent =
            `${events.length} event${events.length === 1 ? "" : "s"}`;

        if (!events.length) {
            container.innerHTML = `
                <div class="mc-match-empty">
                    <div class="mc-match-empty-icon">
                        <i class="fa-solid fa-list"></i>
                    </div>
                    <h3 class="mc-match-empty-title">No Events Yet</h3>
                    <p class="mc-match-empty-text">
                        Goals, assists, cards and other events will appear here.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = events.map(eventItem => {
            const type = eventItem.type || "goal";
            const icon = EVENT_ICONS[type] || "fa-futbol";

            const iconClass = type === "yellow-card"
                ? "mc-match-event-icon--yellow"
                : type === "red-card"
                    ? "mc-match-event-icon--red"
                    : type === "substitution"
                        ? "mc-match-event-icon--substitution"
                        : "";

            const title = type === "substitution"
                ? "Substitution"
                : EVENT_LABELS[type] || type;

            const description = type === "substitution"
                ? `${eventItem.outPlayerName || "Player"} → ${eventItem.inPlayerName || eventItem.playerName || "Substitute"}`
                : eventItem.playerName || "Player";

            const assistText = eventItem.assistPlayerName
                ? `Assist: ${eventItem.assistPlayerName}`
                : "";

            return `
                <article class="mc-match-event-item">
                    <div class="mc-match-event-minute-badge">
                        ${escapeHTML(eventItem.minute ?? 0)}'
                    </div>

                    <div class="mc-match-event-icon ${iconClass}">
                        <i class="fa-solid ${icon}"></i>
                    </div>

                    <div class="mc-match-event-copy">
                        <h3 class="mc-match-event-title">
                            ${escapeHTML(title)} — ${escapeHTML(description)}
                        </h3>
                        <p class="mc-match-event-description">
                            ${escapeHTML(
                                [assistText, eventItem.notes]
                                    .filter(Boolean).join(" · ") ||
                                "Match event saved"
                            )}
                        </p>
                        <span class="mc-match-event-team">
                            ${escapeHTML(eventItem.teamName || "")}
                        </span>
                    </div>

                    ${session.status === "full-time"
                        ? ""
                        : `
                            <button type="button"
                                    class="mc-match-event-delete"
                                    data-delete-event="${escapeHTML(eventItem.id)}"
                                    aria-label="Delete event"
                                    title="Delete event">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        `}
                </article>
            `;
        }).join("");
    }

    /* -------------------- Render: Statistics -------------------- */

    function renderMatchStats(session) {
        const events = session.events || [];

        const homeEvents = events.filter(event =>
            event.teamSide === "home"
        );

        const awayEvents = events.filter(event =>
            event.teamSide === "away"
        );

        const statItems = [
            {
                label: "Goals",
                home: homeEvents.filter(event => event.type === "goal").length,
                away: awayEvents.filter(event => event.type === "goal").length
            },
            {
                label: "Assists",
                home: homeEvents.filter(event =>
                    event.type === "goal" && event.assistPlayerId
                ).length,
                away: awayEvents.filter(event =>
                    event.type === "goal" && event.assistPlayerId
                ).length
            },
            {
                label: "Fouls",
                home: homeEvents.filter(event => event.type === "foul").length,
                away: awayEvents.filter(event => event.type === "foul").length
            },
            {
                label: "Yellow Cards",
                home: homeEvents.filter(event => event.type === "yellow-card").length,
                away: awayEvents.filter(event => event.type === "yellow-card").length
            },
            {
                label: "Red Cards",
                home: homeEvents.filter(event => event.type === "red-card").length,
                away: awayEvents.filter(event => event.type === "red-card").length
            },
            {
                label: "Corners",
                home: homeEvents.filter(event => event.type === "corner").length,
                away: awayEvents.filter(event => event.type === "corner").length
            },
            {
                label: "Free Kicks",
                home: homeEvents.filter(event => event.type === "free-kick").length,
                away: awayEvents.filter(event => event.type === "free-kick").length
            }
        ];

        $("#mcMatchStats").innerHTML = statItems.map(item => {
            const total = item.home + item.away;
            const homePercent = total ? (item.home / total) * 100 : 50;
            const awayPercent = total ? (item.away / total) * 100 : 50;

            return `
                <div class="mc-match-stat-item">
                    <div class="mc-match-stat-heading">
                        <span>${escapeHTML(item.label)}</span>
                        <span class="mc-match-stat-value">
                            ${item.home} - ${item.away}
                        </span>
                    </div>

                    <div class="mc-match-stat-track">
                        <div class="mc-match-stat-bar"
                             style="width:${homePercent}%"></div>
                    </div>

                    <div class="mc-match-stat-track">
                        <div class="mc-match-stat-bar mc-match-stat-bar--away"
                             style="width:${awayPercent}%"></div>
                    </div>
                </div>
            `;
        }).join("");
    }

    /* -------------------- Render: Venue -------------------- */

    function renderVenue(session) {
        const container = $("#mcVenueCard");
if (!container || !session) return;

const fixture = findFixture(session.fixtureId);

        const venueImage =
            fixture?.venueImage ??
            fixture?.groundImage ??
            fixture?.groundPhoto ??
            fixture?.image ??
            "";

        const image = safeImage(venueImage);

        const liveCard = $(".mc-match-live-card");

if (liveCard) {
    if (image) {
        liveCard.style.setProperty(
            "--mc-venue-background",
            `url("${image}")`
        );
        liveCard.classList.add("has-venue-background");
    } else {
        liveCard.style.removeProperty("--mc-venue-background");
        liveCard.classList.remove("has-venue-background");
    }
}

        container.innerHTML = image
            ? `
                <div class="mc-match-venue-card">
                    ${imageHTML(image, session.venue, "mc-match-venue-image")}
                    <div class="mc-match-venue-overlay">
                        <h3 class="mc-match-venue-name">
                            ${escapeHTML(session.venue || "Match Venue")}
                        </h3>
                        <div class="mc-match-venue-details">
                            <span>${escapeHTML(session.date || "Date not set")}</span>
                            <span>${escapeHTML(session.time || "Time not set")}</span>
                        </div>
                    </div>
                </div>
            `
            : `
                <div class="mc-match-venue-card">
                    <div class="mc-match-venue-placeholder">
                        <i class="fa-solid fa-stadium"></i>
                        <strong>${escapeHTML(session.venue || "Venue not set")}</strong>
                        <span>
                            Add a ground photo in the venue data to display it here.
                        </span>
                    </div>
                </div>
            `;
    }

    /* -------------------- Render: Full-Time Result -------------------- */

    function renderFullTimeResult(session) {
        const container = $("#mcFullTimeResult");

        if (session.status !== "full-time") {
            container.innerHTML = `
                <div class="mc-match-empty">
                    <div class="mc-match-empty-icon">
                        <i class="fa-solid fa-hourglass-half"></i>
                    </div>
                    <h3 class="mc-match-empty-title">
                        ${escapeHTML(statusLabel(session.status))}
                    </h3>
                    <p class="mc-match-empty-text">
                        The result will be finalized after the administrator
                        confirms Full-Time.
                    </p>
                </div>
            `;
            return;
        }

        let outcome = "Match Drawn";

        if (session.homeScore > session.awayScore) {
            outcome = `${session.homeTeamName} Win`;
        } else if (session.awayScore > session.homeScore) {
            outcome = `${session.awayTeamName} Win`;
        }

        container.innerHTML = `
            <div class="mc-match-fulltime-result">
                <p class="mc-match-fulltime-label">FULL-TIME</p>

                <div class="mc-match-fulltime-score">
                    <span>${Number(session.homeScore)}</span>
                    <span class="mc-match-fulltime-separator">-</span>
                    <span>${Number(session.awayScore)}</span>
                </div>

                <p class="mc-match-fulltime-winner">
                    ${escapeHTML(outcome)}
                </p>

                <div class="mc-match-champion-label">
                    <i class="fa-solid fa-flag-checkered"></i>
                    Final result saved
                </div>

                <div class="mc-match-actions" style="justify-content:center">
                    <button type="button"
                            class="mc-match-btn mc-match-btn--secondary"
                            id="mcShowLineup">
                        <i class="fa-solid fa-people-group"></i>
                        View Lineups
                    </button>
                </div>
            </div>
        `;
    }

    /* -------------------- Render: History -------------------- */

    function renderHistory() {
        const container = $("#mcHistoryList");
        if (!container) return;

        const sessions = [...getSessions()]
            .filter(session => session.status !== "lineup")
            .sort((a, b) =>
                String(b.updatedAt || b.createdAt || "")
                    .localeCompare(String(a.updatedAt || a.createdAt || ""))
            );

        if (!sessions.length) {
            container.innerHTML = `
                <div class="mc-match-empty">
                    <div class="mc-match-empty-icon">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </div>
                    <h3 class="mc-match-empty-title">No Match History</h3>
                    <p class="mc-match-empty-text">
                        Started matches and saved results will appear here.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => `
            <article class="mc-match-history-item">
                <div class="mc-match-history-copy">
                    <h3 class="mc-match-history-title">
                        ${escapeHTML(session.homeTeamName)} vs
                        ${escapeHTML(session.awayTeamName)}
                    </h3>
                    <p class="mc-match-history-meta">
                        ${escapeHTML(session.date || "Date not set")}
                        · ${escapeHTML(session.venue || "Venue not set")}
                        · ${escapeHTML(statusLabel(session.status))}
                    </p>
                </div>

                <div class="mc-match-history-score">
                    ${Number(session.homeScore || 0)} -
                    ${Number(session.awayScore || 0)}
                </div>

                <button type="button"
                        class="mc-match-btn mc-match-btn--secondary mc-match-btn--small"
                        data-open-session="${escapeHTML(session.id)}">
                    Open
                </button>
            </article>
        `).join("");
    }

    /* -------------------- Main Render -------------------- */

    function renderAll() {
        renderSummary();
        renderFixtures();
        renderLineup();
        renderHistory();
    }

    /* -------------------- Open Existing Session -------------------- */

    function openSession(sessionId) {
        const session = getSessions().find(item => item.id === sessionId);

        if (!session) {
            showNotice("Match session not found.", "error");
            return;
        }

        selectedFixtureId = String(session.fixtureId);
        activeFixtureId = String(session.fixtureId);

        const select = $("#mcFixtureSelect");

        if (select) select.value = selectedFixtureId;

        renderAll();

        if (session.status === "full-time") {
            $("#mcLiveSection").hidden = false;
            $("#mcSetupPanel").hidden = true;
            renderActiveSession(session);
        } else if (session.status === "cancelled") {
            showNotice("This match has been cancelled.", "warning");
        } else if (session.status === "lineup") {
            $("#mcLiveSection").hidden = true;
            $("#mcSetupPanel").hidden = false;
        } else {
            writeJSON(KEYS.active, session.id);
            renderActiveSession(session);
        }

        $("#mcLiveSection").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    /* -------------------- Event Bindings -------------------- */

    function bindEvents() {
        const root = $("#matches");

        root.addEventListener("change", event => {
            const target = event.target;

            if (target.id === "mcFixtureSelect") {
                selectedFixtureId = target.value;

                const session = getSessionByFixture(selectedFixtureId);

                if (session && session.status !== "lineup") {
                    openSession(session.id);
                } else {
                    $("#mcLiveSection").hidden = true;
                    $("#mcSetupPanel").hidden = false;

                    renderAll();
                }
            }

            if (target.matches("[data-lineup-side]")) {
                updateLineupSelection(
                    target.dataset.lineupSide,
                    target.dataset.playerId,
                    target.checked
                );
            }

            if (target.id === "mcEventTeam") {
                renderEventPlayerOptions();
            }

            if (target.id === "mcSubTeam") {
                renderSubstitutionOptions();
            }
        });

        root.addEventListener("click", event => {
            const target = event.target.closest("button");

            if (!target) return;

            if (target.id === "mcRefreshFixtures") {
                renderAll();
                showNotice("Fixture list refreshed from LocalStorage.", "success");
                return;
            }

            if (target.dataset.chooseFixture) {
                selectedFixtureId = target.dataset.chooseFixture;

                const fixture = findFixture(selectedFixtureId);

                if (!fixture) {
                    showNotice("Fixture not found.", "error");
                    return;
                }

                const session = getSessionByFixture(selectedFixtureId);

                if (session && session.status !== "lineup") {
                    openSession(session.id);
                    return;
                }

                $("#mcFixtureSelect").value = selectedFixtureId;
                $("#mcLiveSection").hidden = true;
                $("#mcSetupPanel").hidden = false;

                renderAll();
                return;
            }

            if (target.dataset.selectAll) {
    const side = target.dataset.selectAll;

    if (side !== "home" && side !== "away") {
        return;
    }

    const session = getSessionByFixture(selectedFixtureId);

    // Do not change a lineup after the match has started.
    if (session && session.status !== "lineup") {
        showNotice(
            "Started match lineups cannot be changed here.",
            "warning"
        );
        return;
    }

    const sessions = getSessions();

    let draft = sessions.find(item =>
        item.fixtureId === selectedFixtureId &&
        item.status === "lineup"
    );

    // Nothing is selected yet, so there is nothing to clear.
    if (!draft) {
        renderLineup();
        return;
    }

    if (!draft.startingXI) {
        draft.startingXI = {
            home: [],
            away: []
        };
    }

    // Clear only the selected team's players.
    draft.startingXI[side] = [];

    saveSessions(sessions);
    renderLineup();

    showNotice(
        side === "home"
            ? "Home Team selection cleared."
            : "Away Team selection cleared.",
        "success"
    );

    return;
}

            if (target.id === "mcStartMatch") {
                startMatch();
                return;
            }

            if (target.id === "mcResetLineup") {
                resetLineup();
                return;
            }

            if (target.id === "mcStartFirstHalf") {
                resumeMatch();
                return;
            }

            if (target.id === "mcPauseMatch") {
                pauseMatch();
                return;
            }

            if (target.id === "mcHalfTime") {
                setHalfTime();
                return;
            }

            if (target.id === "mcSecondHalf") {
                startSecondHalf();
                return;
            }

            if (target.id === "mcAddedTime") {
                enableAddedTime();
                return;
            }

            if (target.id === "mcFullTime") {
                finishMatch();
                return;
            }

            if (target.dataset.eventType) {
                selectEventType(target.dataset.eventType);
                return;
            }

            if (target.dataset.deleteEvent) {
                deleteEvent(target.dataset.deleteEvent);
                return;
            }

            if (target.dataset.openSession) {
                openSession(target.dataset.openSession);
                return;
            }

            if (target.id === "mcShowLineup") {
                $("#mcSetupPanel").hidden = false;
                $("#mcSetupPanel").scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
                return;
            }
        });

        $("#mcScoreForm").addEventListener("submit", saveManualScore);
        $("#mcEventForm").addEventListener("submit", saveEvent);
        $("#mcSubstitutionForm").addEventListener("submit", saveSubstitution);

        window.addEventListener("storage", event => {
            if (!event.key ||
                Object.values(KEYS).includes(event.key)) {
                renderAll();

                const active = getActiveSession();

                if (active) renderActiveSession(active);
            }
        });

        window.addEventListener("matchcraft:result-updated", () => {
            renderAll();
        });

        window.addEventListener("matchcraft:players-updated", () => {
            renderLineup();

            const session = getActiveSession();
            if (session) renderActiveSession(session);
        });
    }

    /* -------------------- Initialization -------------------- */

    function init() {
        const root = $("#matches");

        if (!root) return;

        buildPage();

        // Restore a previously saved event-based stats ledger.
        // Existing player statistics are not reset.
        if (!localStorage.getItem(KEYS.ledger)) {
            writeJSON(KEYS.ledger, {});
        }

        const active = getActiveSession();

        if (active) {
            reconcilePlayerStats();
            renderActiveSession(active);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();

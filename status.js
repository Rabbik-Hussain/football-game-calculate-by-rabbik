// ============================================================
// MATCHCRAFT — STATISTICS & AWARDS
// File: status.js
// Data source: Existing MatchCraft LocalStorage records
// ============================================================

(function () {
    "use strict";

    const ROOT_ID = "statistics";

    const KEYS = {
        tournaments: "matchcraft_tournaments",
        teams: "matchcraft_teams",
        players: "matchcraft_players",
        fixtures: "matchcraft_fixtures",
        matches: "matchcraft_matches",
        fixtureAliases: [
            "matchcraft_matches_fixtures",
            "matchcraft_scheduled_matches"
        ],
        sessions: "matchcraft_match_center_sessions",
        active: "matchcraft_match_center_active",
        brackets: "matchcraft_bracat_state"
    };

    const state = {
        selectedTournamentId: "",
        details: null,
        sharedReport: null,
        refreshTimer: null
    };

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        Array.from(parent.querySelectorAll(selector));

    function readJSON(key, fallback = []) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return fallback;
            return JSON.parse(value);
        } catch (error) {
            console.warn("[MATCHCRAFT Statistics] Cannot read:", key, error);
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn("[MATCHCRAFT Statistics] Cannot save:", key, error);
            return false;
        }
    }

    function arrayFrom(value) {
        if (Array.isArray(value)) return value;
        if (value && Array.isArray(value.items)) return value.items;
        if (value && Array.isArray(value.data)) return value.data;
        return [];
    }

    function getId(value) {
        return String(
            value?.id ??
            value?.tournamentId ??
            value?.teamId ??
            value?.playerId ??
            value?.fixtureId ??
            ""
        );
    }

    function normalize(value) {
        return String(value ?? "").trim().toLowerCase();
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatDate(value) {
        if (!value) return "তারিখ নেই";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return escapeHTML(value);
        }

        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function getTournaments() {
        return arrayFrom(readJSON(KEYS.tournaments));
    }

    function getTeams() {
        return arrayFrom(readJSON(KEYS.teams));
    }

    function getPlayers() {
        return arrayFrom(readJSON(KEYS.players));
    }

    function getFixtures() {
        const all = [
            ...arrayFrom(readJSON(KEYS.fixtures)),
            ...KEYS.fixtureAliases.flatMap(key =>
                arrayFrom(readJSON(key))
            )
        ];

        const unique = new Map();

        all.forEach(item => {
            if (!item || !getId(item)) return;

            const id = getId(item);
            const previous = unique.get(id);

            if (!previous) {
                unique.set(id, item);
                return;
            }

            // Prefer a record that has a score or completion status.
            const oldComplete = isCompleted(previous);
            const newComplete = isCompleted(item);

            if ((!oldComplete && newComplete) ||
                (!hasScore(previous) && hasScore(item))) {
                unique.set(id, { ...previous, ...item });
            }
        });

        return Array.from(unique.values());
    }

    function getSessions() {
        return arrayFrom(readJSON(KEYS.sessions));
    }

    function getAllMatches() {
        const records = [
            ...getFixtures(),
            ...arrayFrom(readJSON(KEYS.matches)),
            ...getSessions()
        ];

        const unique = new Map();

        records.forEach(item => {
            if (!item) return;

            const id = getId(item);
            if (!id) return;

            const existing = unique.get(id);

            if (!existing) {
                unique.set(id, item);
            } else {
                unique.set(id, {
                    ...existing,
                    ...item,
                    events: Array.isArray(item.events)
                        ? item.events
                        : existing.events
                });
            }
        });

        return Array.from(unique.values());
    }

    function getTournamentId(item) {
        return String(
            item?.tournamentId ??
            item?.tournament?.id ??
            item?.tournament ??
            ""
        );
    }

    function getTeamId(item, side) {
        if (side === "home") {
            return String(
                item?.homeTeamId ??
                item?.homeId ??
                item?.homeTeam?.id ??
                item?.homeTeam ??
                item?.teamAId ??
                ""
            );
        }

        return String(
            item?.awayTeamId ??
            item?.awayId ??
            item?.awayTeam?.id ??
            item?.awayTeam ??
            item?.teamBId ??
            ""
        );
    }

    function getTeamName(item, side) {
        if (side === "home") {
            return String(
                item?.homeTeamName ??
                item?.homeName ??
                item?.homeTeam?.name ??
                (typeof item?.homeTeam === "string"
                    ? item.homeTeam
                    : "") ??
                item?.teamAName ??
                "Home Team"
            );
        }

        return String(
            item?.awayTeamName ??
            item?.awayName ??
            item?.awayTeam?.name ??
            (typeof item?.awayTeam === "string"
                ? item.awayTeam
                : "") ??
            item?.teamBName ??
            "Away Team"
        );
    }

    function getScore(item, side) {
        const direct = side === "home"
            ? [
                item?.homeScore,
                item?.scoreHome,
                item?.homeGoals,
                item?.teamAScore
            ]
            : [
                item?.awayScore,
                item?.scoreAway,
                item?.awayGoals,
                item?.teamBScore
            ];

        for (const value of direct) {
            if (value !== undefined && value !== null && value !== "") {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) return parsed;
            }
        }

        const score = item?.score;

        if (typeof score === "object" && score !== null) {
            const value = side === "home"
                ? score.home ?? score.homeScore
                : score.away ?? score.awayScore;

            if (value !== undefined && value !== null) {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) return parsed;
            }
        }

        if (typeof score === "string") {
            const match = score.match(/(\d+)\s*[-:–]\s*(\d+)/);
            if (match) return Number(side === "home" ? match[1] : match[2]);
        }

        return null;
    }

    function hasScore(item) {
        return getScore(item, "home") !== null &&
            getScore(item, "away") !== null;
    }

    function isCompleted(item) {
        const status = normalize(
            item?.status ??
            item?.matchStatus ??
            item?.state ??
            item?.phase ??
            ""
        );

        return [
            "completed",
            "complete",
            "finished",
            "full-time",
            "fulltime",
            "ft",
            "final"
        ].includes(status) ||
            item?.completed === true ||
            item?.isCompleted === true ||
            item?.finished === true ||
            item?.matchCompleted === true;
    }

    function getStage(item) {
        return String(
            item?.roundName ??
            item?.round ??
            item?.stage ??
            item?.phaseName ??
            item?.matchType ??
            ""
        );
    }

    function isFinalMatch(item) {
        const stage = normalize(getStage(item));

        return /\bfinal\b/.test(stage) &&
            !/\bsemi[\s-]?final\b/.test(stage) &&
            !/\bquarter[\s-]?final\b/.test(stage);
    }

    function getDate(item) {
        return item?.date ??
            item?.matchDate ??
            item?.scheduledDate ??
            item?.createdAt ??
            item?.updatedAt ??
            "";
    }

    function getTournamentById(id) {
        return getTournaments().find(tournament =>
            getId(tournament) === String(id)
        ) || null;
    }

    function getTeamById(id) {
        return getTeams().find(team =>
            getId(team) === String(id)
        ) || null;
    }

    function getPlayerById(id) {
        return getPlayers().find(player =>
            getId(player) === String(id)
        ) || null;
    }

    function getPlayerName(player) {
        return String(
            player?.name ??
            player?.playerName ??
            player?.fullName ??
            "Unknown Player"
        );
    }

    function getPlayerPhoto(player) {
        return String(
            player?.photo ??
            player?.profileImage ??
            player?.image ??
            ""
        );
    }

    function getTeamLogo(team) {
        return String(
            team?.profileImage ??
            team?.logo ??
            team?.photo ??
            team?.image ??
            ""
        );
    }

    function getPlayerJersey(player) {
        return player?.jerseyNumber ??
            player?.jersey ??
            player?.number ??
            "—";
    }

    function getPlayerTeamId(player) {
        return String(player?.teamId ?? player?.team ?? "");
    }

    function matchBelongsToTournament(match, tournament) {
        const matchTournamentId = getTournamentId(match);
        const tournamentId = getId(tournament);

        if (matchTournamentId && tournamentId &&
            matchTournamentId === tournamentId) {
            return true;
        }

        const matchName = normalize(
            match?.tournamentName ??
            (typeof match?.tournament === "string"
                ? match.tournament
                : "")
        );

        return !matchTournamentId &&
            matchName !== "" &&
            matchName === normalize(tournament?.name);
    }

    function getTournamentMatches(tournament) {
        const all = getAllMatches().filter(match =>
            matchBelongsToTournament(match, tournament)
        );

        // Prefer records with Match Center events for event detail.
        const sessions = getSessions();
        const sessionByFixture = new Map();

        sessions.forEach(session => {
            const fixtureId = String(
                session?.fixtureId ??
                session?.scheduledFixtureId ??
                session?.sourceFixtureId ??
                ""
            );

            if (fixtureId) sessionByFixture.set(fixtureId, session);
        });

        return all.map(match => {
            const id = getId(match);
            const session = sessionByFixture.get(id);

            return session
                ? { ...match, ...session, events: session.events ?? match.events }
                : match;
        });
    }

    function getEvents(match) {
        if (Array.isArray(match?.events)) return match.events;
        if (Array.isArray(match?.matchEvents)) return match.matchEvents;
        if (Array.isArray(match?.eventHistory)) return match.eventHistory;
        return [];
    }

    function getEventType(event) {
        return normalize(
            event?.type ??
            event?.eventType ??
            event?.action ??
            event?.name ??
            ""
        );
    }

    function isGoalEvent(event) {
        const type = getEventType(event);

        return type === "goal" ||
            type === "penalty goal" ||
            type === "penalty-goal" ||
            type === "own goal" ||
            type === "own-goal" ||
            type.includes("goal");
    }

    function getEventPlayerId(event) {
        return String(
            event?.playerId ??
            event?.scorerId ??
            event?.player?.id ??
            ""
        );
    }

    function getEventPlayerName(event) {
        const id = getEventPlayerId(event);
        const player = id ? getPlayerById(id) : null;

        return String(
            event?.playerName ??
            event?.scorerName ??
            event?.player?.name ??
            (player ? getPlayerName(player) : "") ??
            "Unknown Player"
        );
    }

    function getEventTeamId(event) {
        return String(
            event?.teamId ??
            event?.team?.id ??
            event?.sideTeamId ??
            ""
        );
    }

    function getEventMinute(event) {
        const minute = event?.minute ??
            event?.matchMinute ??
            event?.time ??
            event?.elapsedMinute;

        return minute === undefined || minute === null || minute === ""
            ? "—"
            : String(minute).replace(/['′]/g, "") + "'";
    }

    function getEventDescription(event) {
        const type = getEventType(event);

        const labels = {
            goal: "Goal",
            "penalty goal": "Penalty Goal",
            "penalty-goal": "Penalty Goal",
            "own goal": "Own Goal",
            "own-goal": "Own Goal",
            assist: "Assist",
            foul: "Foul",
            "yellow card": "Yellow Card",
            yellow_card: "Yellow Card",
            "red card": "Red Card",
            red_card: "Red Card",
            substitution: "Substitution",
            corner: "Corner",
            "free kick": "Free Kick",
            freekick: "Free Kick",
            offside: "Offside",
            save: "Save",
            shot: "Shot"
        };

        return labels[type] ||
    String(event?.label ?? event?.eventName ?? (type || "Match Event"));
    }

    function getAssistName(event) {
        const id = String(
            event?.assistPlayerId ??
            event?.assisterId ??
            event?.assistId ??
            ""
        );

        const player = id ? getPlayerById(id) : null;

        return String(
            event?.assistPlayerName ??
            event?.assisterName ??
            event?.assistName ??
            player?.name ??
            ""
        );
    }

    function getTeamPlayerList(teamId) {
        return getPlayers().filter(player =>
            getPlayerTeamId(player) === String(teamId)
        );
    }

    function getMatchWinner(match) {
        if (!isCompleted(match) || !hasScore(match)) return null;

        const homeScore = getScore(match, "home");
        const awayScore = getScore(match, "away");

        if (homeScore === awayScore) {
            const winnerId = String(
                match?.winnerTeamId ??
                match?.winnerId ??
                match?.penaltyWinnerTeamId ??
                ""
            );

            if (!winnerId) return null;

            return {
                teamId: winnerId,
                side: winnerId === getTeamId(match, "home")
                    ? "home"
                    : "away",
                reason: "winner"
            };
        }

        const side = homeScore > awayScore ? "home" : "away";

        return {
            teamId: getTeamId(match, side),
            side,
            reason: "score"
        };
    }

    function getFinalWinner(matches) {
        const finals = matches.filter(match =>
            isFinalMatch(match) && isCompleted(match) && hasScore(match)
        );

        if (!finals.length) return null;

        finals.sort((a, b) =>
            new Date(getDate(b) || 0) - new Date(getDate(a) || 0)
        );

        const finalMatch = finals[0];
        const winner = getMatchWinner(finalMatch);

        if (!winner) return null;

        return {
            match: finalMatch,
            winnerId: winner.teamId,
            runnerUpId: winner.teamId === getTeamId(finalMatch, "home")
                ? getTeamId(finalMatch, "away")
                : getTeamId(finalMatch, "home")
        };
    }

    function getCompletion(matches) {
        const total = matches.length;
        const completed = matches.filter(match =>
            isCompleted(match) && hasScore(match)
        ).length;

        const final = matches.find(match =>
            isFinalMatch(match) && isCompleted(match) && hasScore(match)
        );

        return {
            total,
            completed,
            percent: total ? Math.round(completed / total * 100) : 0,
            final
        };
    }

    function getTeamMatchStats(teamId, matches) {
        const stats = {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
            fouls: 0,
            cleanSheets: 0
        };

        matches.forEach(match => {
            if (!isCompleted(match) || !hasScore(match)) return;

            const homeId = getTeamId(match, "home");
            const awayId = getTeamId(match, "away");

            if (String(teamId) !== homeId && String(teamId) !== awayId) {
                return;
            }

            const homeScore = getScore(match, "home");
            const awayScore = getScore(match, "away");

            const isHome = String(teamId) === homeId;
            const goalsFor = isHome ? homeScore : awayScore;
            const goalsAgainst = isHome ? awayScore : homeScore;

            stats.played++;
            stats.goalsFor += goalsFor;
            stats.goalsAgainst += goalsAgainst;

            if (goalsFor > goalsAgainst) stats.wins++;
            else if (goalsFor === goalsAgainst) stats.draws++;
            else stats.losses++;

            if (goalsAgainst === 0) stats.cleanSheets++;

            getEvents(match).forEach(event => {
                const eventTeamId = getEventTeamId(event);
                if (eventTeamId && eventTeamId !== String(teamId)) return;

                const type = getEventType(event);

                if (isGoalEvent(event)) stats.goals++;
                if (type.includes("assist")) stats.assists++;
                if (type.includes("yellow")) stats.yellowCards++;
                if (type.includes("red")) stats.redCards++;
                if (type.includes("foul")) stats.fouls++;
            });
        });

        return stats;
    }

    function getPlayerStats(player, matches) {
        const playerId = getId(player);
        const teamId = getPlayerTeamId(player);

        const stats = {
            matches: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
            fouls: 0,
            saves: 0,
            score: 0
        };

        matches.forEach(match => {
            if (!isCompleted(match) || !hasScore(match)) return;

            const homeId = getTeamId(match, "home");
            const awayId = getTeamId(match, "away");

            if (teamId !== homeId && teamId !== awayId) return;

            const appearsInMatch = getEvents(match).some(event =>
                getEventPlayerId(event) === playerId
            );

            const homeLineup = match?.homeLineup ??
                match?.lineups?.home ??
                [];
            const awayLineup = match?.awayLineup ??
                match?.lineups?.away ??
                [];

            const inLineup = [...arrayFrom(homeLineup), ...arrayFrom(awayLineup)]
                .some(entry =>
                    String(entry?.playerId ?? entry?.id ?? entry) === playerId
                );

            if (appearsInMatch || inLineup) stats.matches++;

            getEvents(match).forEach(event => {
                if (getEventPlayerId(event) !== playerId) return;

                const type = getEventType(event);

                if (isGoalEvent(event)) stats.goals++;
                if (type.includes("assist")) stats.assists++;
                if (type.includes("yellow")) stats.yellowCards++;
                if (type.includes("red")) stats.redCards++;
                if (type.includes("foul")) stats.fouls++;
                if (type.includes("save")) stats.saves++;
            });
        });

        // These are transparent app scoring weights, not an official award formula.
        stats.score =
            stats.goals * 5 +
            stats.assists * 3 +
            stats.saves * 2 -
            stats.yellowCards * 1.5 -
            stats.redCards * 4 -
            stats.fouls * 0.5;

        return stats;
    }

    function getBestPlayer(players, matches, allowedTeamId) {
        const candidates = players.filter(player =>
            getPlayerTeamId(player) === String(allowedTeamId)
        );

        if (!candidates.length) return null;

        const ranked = candidates.map(player => ({
            player,
            stats: getPlayerStats(player, matches)
        }));

        ranked.sort((a, b) =>
            b.stats.score - a.stats.score ||
            b.stats.goals - a.stats.goals ||
            b.stats.assists - a.stats.assists ||
            a.stats.redCards - b.stats.redCards ||
            a.stats.yellowCards - b.stats.yellowCards
        );

        return ranked[0];
    }

    function getMOTM(match) {
        const winner = getMatchWinner(match);
        if (!winner || !winner.teamId) return null;

        const winnerPlayers = getTeamPlayerList(winner.teamId);
        if (!winnerPlayers.length) return null;

        const events = getEvents(match);

        const appearances = new Set();

        events.forEach(event => {
            const playerId = getEventPlayerId(event);
            const eventTeamId = getEventTeamId(event);

            if (playerId &&
                (!eventTeamId || eventTeamId === winner.teamId)) {
                appearances.add(playerId);
            }

            const assistId = String(
                event?.assistPlayerId ??
                event?.assisterId ??
                event?.assistId ??
                ""
            );

            if (assistId) appearances.add(assistId);
        });

        const lineups = [
            ...arrayFrom(match?.homeLineup ?? match?.lineups?.home),
            ...arrayFrom(match?.awayLineup ?? match?.lineups?.away)
        ];

        lineups.forEach(entry => {
            const playerId = String(entry?.playerId ?? entry?.id ?? entry);
            if (playerId) appearances.add(playerId);
        });

        // Do not invent a MOTM if there is no saved performance evidence.
        const candidates = winnerPlayers
            .filter(player => appearances.has(getId(player)))
            .map(player => ({
                player,
                stats: getPlayerStats(player, [match])
            }));

        if (!candidates.length) return null;

        candidates.sort((a, b) =>
            b.stats.score - a.stats.score ||
            b.stats.goals - a.stats.goals ||
            b.stats.assists - a.stats.assists ||
            a.stats.redCards - b.stats.redCards ||
            a.stats.yellowCards - b.stats.yellowCards
        );

        return {
            ...candidates[0],
            teamId: winner.teamId,
            match
        };
    }

    function getTournamentReport(tournament) {
        const matches = getTournamentMatches(tournament);
        const completion = getCompletion(matches);
        const finalResult = getFinalWinner(matches);

        const finalExists = matches.some(isFinalMatch);

        const allCompleted =
            matches.length > 0 &&
            completion.completed === completion.total;

        const ready =
            allCompleted &&
            Boolean(finalResult) &&
            finalExists;

        if (!ready) {
            return {
                tournament,
                matches,
                completion,
                ready: false,
                finalResult: null,
                champion: null,
                runnerUp: null,
                bestPlayer: null,
                motm: []
            };
        }

        const champion = getTeamById(finalResult.winnerId);
        const runnerUp = getTeamById(finalResult.runnerUpId);

        const bestPlayer = champion
            ? getBestPlayer(
                getPlayers(),
                matches,
                finalResult.winnerId
            )
            : null;

        const motm = matches
            .filter(match => isCompleted(match) && hasScore(match))
            .map(match => getMOTM(match))
            .filter(Boolean);

        return {
            tournament,
            matches,
            completion,
            ready: Boolean(champion && runnerUp),
            finalResult,
            champion,
            runnerUp,
            bestPlayer,
            motm
        };
    }

    // --------------------------------------------------------
    // PAGE CREATION
    // --------------------------------------------------------

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID);
        if (root) return root;

        root = document.createElement("section");
        root.id = ROOT_ID;
        root.setAttribute("aria-label", "Statistics and Awards");

        const footer = document.querySelector("footer");

        if (footer && footer.parentNode) {
            footer.parentNode.insertBefore(root, footer);
        } else {
            document.body.appendChild(root);
        }

        return root;
    }

    function pageHeader() {
        return `
            <div class="st-page-header">
                <div class="st-heading-group">
                    <div class="st-eyebrow">
                        <i class="fas fa-chart-column"></i>
                        MATCHCRAFT REPORT CENTER
                    </div>
                    <h1 class="st-page-title">Statistics &amp; Awards</h1>
                    <p class="st-page-description">
                        টুর্নামেন্টের চূড়ান্ত ফলাফল, দলের পরিসংখ্যান,
                        সেরা খেলোয়াড় এবং প্রতিটি ম্যাচের বিস্তারিত রিপোর্ট।
                    </p>
                </div>
                <div class="st-header-actions">
                    <button class="st-btn" type="button" data-action="refresh">
                        <i class="fas fa-rotate"></i> Refresh
                    </button>
                    <button class="st-btn st-btn-primary" type="button"
                        data-action="print">
                        <i class="fas fa-print"></i> Print / PDF
                    </button>
                </div>
            </div>
        `;
    }

    function tournamentSelector(tournaments) {
        const options = tournaments.map(tournament => {
            const id = getId(tournament);
            const name = tournament?.name ?? "Unnamed Tournament";
            const selected = id === state.selectedTournamentId
                ? "selected"
                : "";

            return `
                <option value="${escapeHTML(id)}" ${selected}>
                    ${escapeHTML(name)}
                    ${tournament?.season
                        ? " — " + escapeHTML(tournament.season)
                        : ""}
                </option>
            `;
        }).join("");

        return `
            <div class="st-toolbar">
                <div class="st-toolbar-fields">
                    <div class="st-field">
                        <label for="stTournamentSelect">Select Tournament</label>
                        <select id="stTournamentSelect">
                            <option value="">টুর্নামেন্ট নির্বাচন করুন</option>
                            ${options}
                        </select>
                    </div>
                </div>
                <div class="st-toolbar-note">
                    চূড়ান্ত রিপোর্ট প্রকাশের জন্য টুর্নামেন্টের সব ম্যাচ
                    সম্পন্ন এবং ফাইনালের ফলাফল সংরক্ষিত থাকতে হবে।
                </div>
            </div>
        `;
    }

    function emptyState(title, description, icon = "fa-trophy") {
        return `
            <div class="st-empty">
                <div class="st-empty-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <h3 class="st-empty-title">${escapeHTML(title)}</h3>
                <p class="st-empty-text">${escapeHTML(description)}</p>
            </div>
        `;
    }

    function sectionHeader(icon, title, subtitle, count = null) {
        return `
            <div class="st-section-header">
                <div class="st-section-heading">
                    <div class="st-section-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div>
                        <h2 class="st-section-title">${escapeHTML(title)}</h2>
                        <p class="st-section-subtitle">${escapeHTML(subtitle)}</p>
                    </div>
                </div>
                ${count === null ? "" : `
                    <span class="st-section-count">${count}</span>
                `}
            </div>
        `;
    }

    function tournamentBanner(report) {
        const tournament = report.tournament;
        const completion = report.completion;

        const statusText = report.ready
            ? "Tournament Completed"
            : "Results Pending";

        return `
            <div class="st-tournament-banner">
                <div class="st-tournament-info">
                    <h2 class="st-tournament-name">
                        ${escapeHTML(tournament?.name ?? "Tournament")}
                    </h2>
                    <div class="st-tournament-meta">
                        <span><i class="fas fa-calendar"></i>
                            ${escapeHTML(formatDate(tournament?.startDate))}
                        </span>
                        <span><i class="fas fa-futbol"></i>
                            ${completion.completed}/${completion.total} ম্যাচ সম্পন্ন
                        </span>
                        <span><i class="fas fa-chart-pie"></i>
                            ${completion.percent}% সম্পন্ন
                        </span>
                    </div>
                </div>
                <span class="st-status-badge ${report.ready ? "" : "pending"}">
                    <i class="fas ${report.ready ? "fa-circle-check" : "fa-clock"}"></i>
                    ${statusText}
                </span>
            </div>
            <div style="margin-top:12px" class="st-progress-track"
                role="progressbar"
                aria-valuenow="${completion.percent}"
                aria-valuemin="0"
                aria-valuemax="100">
                <div class="st-progress-fill"
                    style="width:${completion.percent}%"></div>
            </div>
        `;
    }

    function summaryCards(report) {
        const matches = report.matches;
        const completion = report.completion;

        const goals = matches.reduce((total, match) => {
            if (!isCompleted(match) || !hasScore(match)) return total;

            return total +
                getScore(match, "home") +
                getScore(match, "away");
        }, 0);

        const events = matches.reduce((total, match) =>
            total + getEvents(match).length, 0
        );

        const data = [
            {
                label: "Total Matches",
                value: completion.total,
                note: "টুর্নামেন্টের ম্যাচ",
                icon: "fa-calendar-check",
                color: ""
            },
            {
                label: "Completed Matches",
                value: completion.completed,
                note: `${completion.percent}% সম্পন্ন`,
                icon: "fa-circle-check",
                color: "green"
            },
            {
                label: "Total Goals",
                value: goals,
                note: "সম্পন্ন ম্যাচের স্কোর থেকে",
                icon: "fa-futbol",
                color: "gold"
            },
            {
                label: "Recorded Events",
                value: events,
                note: "সংরক্ষিত Match Center events",
                icon: "fa-list-check",
                color: "red"
            }
        ];

        return `
            <div class="st-summary-grid">
                ${data.map(item => `
                    <div class="st-summary-card">
                        <div class="st-summary-top">
                            <span class="st-summary-label">
                                ${escapeHTML(item.label)}
                            </span>
                            <span class="st-summary-icon ${item.color}">
                                <i class="fas ${item.icon}"></i>
                            </span>
                        </div>
                        <div class="st-summary-value">${item.value}</div>
                        <div class="st-summary-footnote">
                            ${escapeHTML(item.note)}
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function teamCard(team, role, rank, matches) {
        if (!team) {
            return emptyState(
                `${role} তথ্য পাওয়া যায়নি`,
                "টুর্নামেন্টের ফাইনাল ফলাফল এবং দলের ID যাচাই করুন।"
            );
        }

        const teamId = getId(team);
        const stats = getTeamMatchStats(teamId, matches);
        const logo = getTeamLogo(team);

        const players = getTeamPlayerList(teamId);

        return `
            <article class="st-team-card ${rank === 1 ? "champion" : "runner-up"}">
                <div class="st-team-card-top">
                    <div class="st-team-rank">${rank}</div>
                    <div class="st-team-logo">
                        ${logo
                            ? `<img src="${escapeHTML(logo)}"
                                alt="${escapeHTML(team.name)} logo">`
                            : `<i class="fas fa-shield-halved"></i>`
                        }
                    </div>
                    <div class="st-team-identity">
                        <p class="st-team-role">${escapeHTML(role)}</p>
                        <h3 class="st-team-name">
                            ${escapeHTML(team.name ?? "Unknown Team")}
                        </h3>
                        <div class="st-team-meta">
                            ${players.length} জন খেলোয়াড়
                            ${team.city ? " · " + escapeHTML(team.city) : ""}
                        </div>
                    </div>
                </div>

                <div class="st-team-stat-grid">
                    <div class="st-team-stat">
                        <span class="st-team-stat-value">${stats.played}</span>
                        <span class="st-team-stat-label">Matches</span>
                    </div>
                    <div class="st-team-stat">
                        <span class="st-team-stat-value">${stats.wins}</span>
                        <span class="st-team-stat-label">Wins</span>
                    </div>
                    <div class="st-team-stat">
                        <span class="st-team-stat-value">${stats.draws}</span>
                        <span class="st-team-stat-label">Draws</span>
                    </div>
                    <div class="st-team-stat">
                        <span class="st-team-stat-value">${stats.losses}</span>
                        <span class="st-team-stat-label">Losses</span>
                    </div>
                    <div class="st-team-stat">
                        <span class="st-team-stat-value">${stats.goalsFor}</span>
                        <span class="st-team-stat-label">Goals For</span>
                    </div>
                    <div class="st-team-stat">
                        <span class="st-team-stat-value">${stats.goalsAgainst}</span>
                        <span class="st-team-stat-label">Goals Against</span>
                    </div>
                </div>

                <div class="st-team-card-actions">
                    <button class="st-btn st-btn-primary"
                        type="button"
                        data-action="team-details"
                        data-team-id="${escapeHTML(teamId)}">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="st-btn"
                        type="button"
                        data-action="team-report"
                        data-team-id="${escapeHTML(teamId)}">
                        <i class="fas fa-qrcode"></i> Report / QR
                    </button>
                </div>
            </article>
        `;
    }

    function renderPodium(report) {
        return `
            <section class="st-section">
                ${sectionHeader(
                    "fa-trophy",
                    "Champion & Runner-up",
                    "ফাইনালের সংরক্ষিত ফলাফল অনুযায়ী"
                )}
                <div class="st-podium-grid">
                    ${teamCard(
                        report.champion,
                        "Tournament Champion",
                        1,
                        report.matches
                    )}
                    ${teamCard(
                        report.runnerUp,
                        "Runner-up",
                        2,
                        report.matches
                    )}
                </div>
            </section>
        `;
    }

    function renderPlayers(team) {
        if (!team) {
            return emptyState(
                "দলের তথ্য পাওয়া যায়নি",
                "সংশ্লিষ্ট দলের সংরক্ষিত তথ্য পাওয়া যায়নি।"
            );
        }

        const players = getTeamPlayerList(getId(team));

        if (!players.length) {
            return emptyState(
                "খেলোয়াড় পাওয়া যায়নি",
                "এই দলের জন্য কোনো খেলোয়াড়ের রেকর্ড পাওয়া যায়নি।"
            );
        }

        return `
            <div class="st-player-list">
                ${players.map(player => {
                    const photo = getPlayerPhoto(player);

                    return `
                        <div class="st-player-row">
                            <div class="st-player-avatar">
                                ${photo
                                    ? `<img src="${escapeHTML(photo)}"
                                        alt="${escapeHTML(getPlayerName(player))}">`
                                    : `<i class="fas fa-user"></i>`
                                }
                            </div>
                            <div class="st-player-info">
                                <h4 class="st-player-name">
                                    ${escapeHTML(getPlayerName(player))}
                                </h4>
                                <div class="st-player-meta">
                                    ${escapeHTML(player.position ?? "Position not recorded")}
                                </div>
                            </div>
                            <span class="st-jersey">
                                ${escapeHTML(getPlayerJersey(player))}
                            </span>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderBestPlayer(report) {
        const award = report.bestPlayer;

        if (!award) {
            return `
                <section class="st-section">
                    ${sectionHeader(
                        "fa-award",
                        "Tournament Best Player",
                        "Champion Team-এর খেলোয়াড়দের মধ্যে সংরক্ষিত পারফরম্যান্স"
                    )}
                    ${emptyState(
                        "Best Player নির্ধারণ করা যায়নি",
                        "Champion দলের খেলোয়াড় এবং ম্যাচ ইভেন্টের তথ্য যাচাই করুন।"
                    )}
                </section>
            `;
        }

        const player = award.player;
        const stats = award.stats;
        const photo = getPlayerPhoto(player);
        const team = getTeamById(getPlayerTeamId(player));

        return `
            <section class="st-section">
                ${sectionHeader(
                    "fa-award",
                    "Tournament Best Player",
                    "Champion Team-এর খেলোয়াড়দের মধ্যে সংরক্ষিত পারফরম্যান্স"
                )}

                <article class="st-award-card">
                    <div class="st-award-profile">
                        <div class="st-award-avatar">
                            ${photo
                                ? `<img src="${escapeHTML(photo)}"
                                    alt="${escapeHTML(getPlayerName(player))}">`
                                : `<i class="fas fa-user-astronaut"></i>`
                            }
                        </div>
                        <h3 class="st-award-name">
                            ${escapeHTML(getPlayerName(player))}
                        </h3>
                        <div class="st-award-team">
                            ${escapeHTML(team?.name ?? "Champion Team")}
                            <br>
                            Jersey ${escapeHTML(getPlayerJersey(player))}
                        </div>
                    </div>

                    <div class="st-award-details">
                        <div class="st-award-label">
                            <i class="fas fa-crown"></i>
                            TOURNAMENT AWARD
                        </div>
                        <h3 class="st-award-title">Best Player</h3>
                        <p class="st-award-description">
                            চ্যাম্পিয়ন দলের খেলোয়াড়দের সংরক্ষিত গোল,
                            অ্যাসিস্ট, কার্ড ও অন্যান্য পারফরম্যান্সের
                            ভিত্তিতে অ্যাপের স্কোরিং নিয়মে নির্বাচন করা হয়েছে।
                        </p>
                        <div class="st-award-stats">
                            <div class="st-award-stat">
                                <strong>${stats.goals}</strong>
                                <span>Goals</span>
                            </div>
                            <div class="st-award-stat">
                                <strong>${stats.assists}</strong>
                                <span>Assists</span>
                            </div>
                            <div class="st-award-stat">
                                <strong>${stats.yellowCards}</strong>
                                <span>Yellow Cards</span>
                            </div>
                            <div class="st-award-stat">
                                <strong>${stats.redCards}</strong>
                                <span>Red Cards</span>
                            </div>
                        </div>
                        <div class="st-report-actions">
                            <button class="st-btn st-btn-gold"
                                type="button" data-action="player-report"
                                data-player-id="${escapeHTML(getId(player))}">
                                <i class="fas fa-qrcode"></i> Player Report
                            </button>
                        </div>
                    </div>

                    <div class="st-award-art" aria-hidden="true">
                        <div class="st-award-art-placeholder">
                            <i class="fas fa-person"></i>
                        </div>
                    </div>
                </article>
            </section>
        `;
    }

    function renderMOTMCard(award) {
        const match = award.match;
        const player = award.player;
        const stats = award.stats;
        const photo = getPlayerPhoto(player);

        return `
            <article class="st-motm-card">
                <div class="st-motm-card-top">
                    <span class="st-motm-round">
                        ${escapeHTML(getStage(match) || "Match")}
                    </span>
                    <span class="st-motm-medal">
                        <i class="fas fa-medal"></i> MOTM
                    </span>
                </div>

                <div class="st-motm-score">
                    <div class="st-motm-team">
                        ${escapeHTML(getTeamName(match, "home"))}
                    </div>
                    <div class="st-motm-numbers">
                        ${getScore(match, "home")}
                        <span>:</span>
                        ${getScore(match, "away")}
                    </div>
                    <div class="st-motm-team">
                        ${escapeHTML(getTeamName(match, "away"))}
                    </div>
                </div>

                <div class="st-motm-player">
                    <div class="st-motm-avatar">
                        ${photo
                            ? `<img src="${escapeHTML(photo)}"
                                alt="${escapeHTML(getPlayerName(player))}">`
                            : `<i class="fas fa-user"></i>`
                        }
                    </div>
                    <div class="st-motm-player-info">
                        <h4 class="st-motm-player-name">
                            ${escapeHTML(getPlayerName(player))}
                        </h4>
                        <div class="st-motm-player-team">
                            ${escapeHTML(getTeamById(award.teamId)?.name ?? "Winning Team")}
                            · #${escapeHTML(getPlayerJersey(player))}
                        </div>
                    </div>
                </div>

                <div class="st-motm-stats">
                    <span class="st-stat-chip">
                        <i class="fas fa-futbol"></i> ${stats.goals} Goals
                    </span>
                    <span class="st-stat-chip">
                        <i class="fas fa-hands-helping"></i> ${stats.assists} Assists
                    </span>
                    <span class="st-stat-chip">
                        <i class="fas fa-square"></i> ${stats.yellowCards} Yellow
                    </span>
                </div>

                <div class="st-motm-actions">
                    <button class="st-btn st-btn-primary st-btn-small"
                        type="button" data-action="match-details"
                        data-match-id="${escapeHTML(getId(match))}">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="st-btn st-btn-small"
                        type="button" data-action="match-report"
                        data-match-id="${escapeHTML(getId(match))}">
                        <i class="fas fa-qrcode"></i> QR / Share
                    </button>
                </div>
            </article>
        `;
    }

    function renderMOTM(report) {
        return `
            <section class="st-section">
                ${sectionHeader(
                    "fa-medal",
                    "Man of the Match",
                    "প্রতিটি সম্পন্ন ম্যাচের বিজয়ী দলের খেলোয়াড়দের মধ্য থেকে",
                    report.motm.length
                )}
                ${report.motm.length
                    ? `<div class="st-motm-grid">
                        ${report.motm.map(renderMOTMCard).join("")}
                    </div>`
                    : emptyState(
                        "MOTM তথ্য পাওয়া যায়নি",
                        "ম্যাচের বিজয়ী দল, খেলোয়াড়ের তালিকা এবং ম্যাচ ইভেন্ট সংরক্ষিত আছে কি না যাচাই করুন।",
                        "fa-medal"
                    )
                }
            </section>
        `;
    }

    function renderTournamentPlayers(report) {
        return `
            <section class="st-section">
                ${sectionHeader(
                    "fa-users",
                    "Champion Squad",
                    "চ্যাম্পিয়ন দলের খেলোয়াড়দের তালিকা"
                )}
                ${renderPlayers(report.champion)}
            </section>
        `;
    }

    function renderPending(report) {
        return `
            <section class="st-section">
                ${sectionHeader(
                    "fa-clock",
                    "Final Results",
                    "চূড়ান্ত ফলাফল প্রকাশের শর্ত"
                )}
                <div class="st-notice warning">
                    <i class="fas fa-triangle-exclamation"></i>
                    <div>
                        <strong>টুর্নামেন্টের চূড়ান্ত ফলাফল এখনো প্রকাশযোগ্য নয়।</strong>
                        <br>
                        ম্যাচ সম্পন্ন: ${report.completion.completed}
                        / ${report.completion.total}.
                        সব ম্যাচের স্কোর ও completion status যাচাই করুন।
                        ফাইনাল ম্যাচের সংরক্ষিত ফলাফল এবং Champion ও Runner-up
                        দলের তথ্য না পাওয়া পর্যন্ত চূড়ান্ত Award Card প্রকাশ হবে না।
                    </div>
                </div>
            </section>
        `;
    }

    function renderSelectedTournament() {
        const root = ensureRoot();
        const tournaments = getTournaments();

        if (!tournaments.length) {
            root.innerHTML = `
                <div class="st-page">
                    ${pageHeader()}
                    ${emptyState(
                        "কোনো টুর্নামেন্ট পাওয়া যায়নি",
                        "প্রথমে Tournaments পেজে একটি টুর্নামেন্ট তৈরি করুন।"
                    )}
                </div>
            `;
            return;
        }

        if (!state.selectedTournamentId ||
            !tournaments.some(t => getId(t) === state.selectedTournamentId)) {
            state.selectedTournamentId = getId(tournaments[0]);
        }

        const tournament = tournaments.find(t =>
            getId(t) === state.selectedTournamentId
        );

        if (!tournament) {
            root.innerHTML = `<div class="st-page">${pageHeader()}</div>`;
            return;
        }

        const report = getTournamentReport(tournament);

        root.innerHTML = `
            <div class="st-page">
                ${pageHeader()}
                ${tournamentSelector(tournaments)}
                ${tournamentBanner(report)}
                ${summaryCards(report)}
                ${report.ready
                    ? `
                        ${renderPodium(report)}
                        ${renderTournamentPlayers(report)}
                        ${renderBestPlayer(report)}
                        ${renderMOTM(report)}
                    `
                    : renderPending(report)
                }
            </div>
        `;
    }

    // --------------------------------------------------------
    // DETAIL REPORTS
    // --------------------------------------------------------

    function getTeamHistory(teamId, matches) {
        return matches
            .filter(match =>
                getTeamId(match, "home") === String(teamId) ||
                getTeamId(match, "away") === String(teamId)
            )
            .filter(match => isCompleted(match) && hasScore(match))
            .sort((a, b) =>
                new Date(getDate(a) || 0) - new Date(getDate(b) || 0)
            );
    }

    function getTeamResult(match, teamId) {
        const home = getTeamId(match, "home") === String(teamId);
        const own = getScore(match, home ? "home" : "away");
        const opponent = getScore(match, home ? "away" : "home");

        if (own > opponent) return "Win";
        if (own < opponent) return "Loss";
        return "Draw";
    }

    function getTeamEventSummary(match, teamId) {
        return getEvents(match).map(event => {
            const eventTeamId = getEventTeamId(event);
            if (eventTeamId && eventTeamId !== String(teamId)) return "";

            const player = getEventPlayerName(event);
            const minute = getEventMinute(event);
            const type = getEventDescription(event);
            const assist = getAssistName(event);

            return `${escapeHTML(minute)} ${escapeHTML(type)}: ${escapeHTML(player)}` +
                (assist && isGoalEvent(event)
                    ? ` (Assist: ${escapeHTML(assist)})`
                    : "");
        }).filter(Boolean);
    }

    function renderTeamHistory(teamId, report) {
        const team = getTeamById(teamId);
        const history = getTeamHistory(teamId, report.matches);
        const stats = getTeamMatchStats(teamId, report.matches);

        if (!team) {
            return emptyState(
                "দলের তথ্য পাওয়া যায়নি",
                "দলের রেকর্ড আর টুর্নামেন্টের ID মিলিয়ে দেখুন।"
            );
        }

        const rows = history.map(match => {
            const isHome = getTeamId(match, "home") === String(teamId);
            const opponent = getTeamName(match, isHome ? "away" : "home");
            const ownScore = getScore(match, isHome ? "home" : "away");
            const otherScore = getScore(match, isHome ? "away" : "home");
            const result = getTeamResult(match, teamId);
            const events = getTeamEventSummary(match, teamId);

            return `
                <tr>
                    <td>${escapeHTML(getStage(match) || "—")}</td>
                    <td>${escapeHTML(formatDate(getDate(match)))}</td>
                    <td>${escapeHTML(opponent)}</td>
                    <td class="st-score-cell">${ownScore} - ${otherScore}</td>
                    <td>
                        <span class="st-result-badge ${
                            result === "Draw" ? "draw" :
                            result === "Loss" ? "loss" : ""
                        }">${result}</span>
                    </td>
                    <td>${events.length
                        ? events.join("<br>")
                        : "কোনো ইভেন্ট সংরক্ষিত নেই"
                    }</td>
                </tr>
            `;
        }).join("");

        return `
            <div class="st-details-grid">
                ${[
                    ["Matches", stats.played],
                    ["Wins", stats.wins],
                    ["Draws", stats.draws],
                    ["Losses", stats.losses],
                    ["Goals For", stats.goalsFor],
                    ["Goals Against", stats.goalsAgainst],
                    ["Assists", stats.assists],
                    ["Yellow Cards", stats.yellowCards],
                    ["Red Cards", stats.redCards]
                ].map(([label, value]) => `
                    <div class="st-detail-metric">
                        <div class="st-detail-metric-label">${label}</div>
                        <div class="st-detail-metric-value">${value}</div>
                    </div>
                `).join("")}
            </div>

            <h3 class="st-detail-subheading">Full Match History</h3>

            ${history.length ? `
                <div class="st-table-wrap">
                    <table class="st-table">
                        <thead>
                            <tr>
                                <th>Round</th>
                                <th>Date</th>
                                <th>Opponent</th>
                                <th>Score</th>
                                <th>Result</th>
                                <th>Recorded Events</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            ` : emptyState(
                "ম্যাচ হিস্ট্রি পাওয়া যায়নি",
                "এই দলের সম্পন্ন ম্যাচের রেকর্ড পাওয়া যায়নি।"
            )}

            <h3 class="st-detail-subheading">Squad</h3>
            ${renderPlayers(team)}
        `;
    }

    function renderMatchEvents(match) {
        const events = getEvents(match);

        if (!events.length) {
            return emptyState(
                "ম্যাচ ইভেন্ট নেই",
                "এই ম্যাচের জন্য কোনো event history সংরক্ষিত নেই।",
                "fa-list"
            );
        }

        return `
            <div class="st-timeline">
                ${events.map(event => `
                    <div class="st-timeline-item">
                        <div class="st-timeline-minute">
                            ${escapeHTML(getEventMinute(event))}
                        </div>
                        <div class="st-timeline-content">
                            <h4 class="st-timeline-title">
                                ${escapeHTML(getEventDescription(event))}
                                — ${escapeHTML(getEventPlayerName(event))}
                            </h4>
                            <div class="st-timeline-description">
                                ${escapeHTML(
                                    event?.notes ??
                                    event?.description ??
                                    event?.details ??
                                    ""
                                )}
                                ${getAssistName(event)
                                    ? " · Assist: " + escapeHTML(getAssistName(event))
                                    : ""
                                }
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function showDetailsModal(title, body) {
        closeDetailsModal();

        const root = ensureRoot();
        const backdrop = document.createElement("div");

        backdrop.className = "st-modal-backdrop";
        backdrop.id = "stModalBackdrop";

        backdrop.innerHTML = `
            <div class="st-modal" role="dialog"
                aria-modal="true" aria-label="${escapeHTML(title)}">
                <div class="st-modal-header">
                    <h2 class="st-modal-title">${escapeHTML(title)}</h2>
                    <button type="button" class="st-modal-close"
                        data-action="close-modal"
                        aria-label="Close">
                        <i class="fas fa-xmark"></i>
                    </button>
                </div>
                <div class="st-modal-body">${body}</div>
            </div>
        `;

        root.appendChild(backdrop);

        backdrop.addEventListener("click", event => {
            if (event.target === backdrop) closeDetailsModal();
        });

        const closeButton = $(".st-modal-close", backdrop);
        if (closeButton) closeButton.focus();
    }

    function closeDetailsModal() {
        const backdrop = document.getElementById("stModalBackdrop");
        if (backdrop) backdrop.remove();
    }

    function showTeamDetails(teamId) {
        const tournament = getTournamentById(state.selectedTournamentId);
        if (!tournament) return;

        const report = getTournamentReport(tournament);
        const team = getTeamById(teamId);

        if (!report.ready || !team) {
            showDetailsModal(
                "Team Details",
                emptyState(
                    "রিপোর্ট প্রস্তুত নয়",
                    "টুর্নামেন্টের চূড়ান্ত ফলাফল এবং দলের তথ্য যাচাই করুন।"
                )
            );
            return;
        }

        showDetailsModal(
            `${team.name} — Full Report`,
            renderTeamHistory(teamId, report)
        );
    }

    function showMatchDetails(matchId) {
        const tournament = getTournamentById(state.selectedTournamentId);
        if (!tournament) return;

        const report = getTournamentReport(tournament);
        const match = report.matches.find(item =>
            getId(item) === String(matchId)
        );

        if (!match) return;

        const home = getScore(match, "home");
        const away = getScore(match, "away");

        showDetailsModal(
            "Match Report",
            `
                <div class="st-tournament-banner">
                    <div class="st-tournament-info">
                        <h2 class="st-tournament-name">
                            ${escapeHTML(getTeamName(match, "home"))}
                            ${home} - ${away}
                            ${escapeHTML(getTeamName(match, "away"))}
                        </h2>
                        <div class="st-tournament-meta">
                            <span>${escapeHTML(getStage(match) || "Match")}</span>
                            <span>${escapeHTML(formatDate(getDate(match)))}</span>
                        </div>
                    </div>
                </div>
                <h3 class="st-detail-subheading">Match Event Timeline</h3>
                ${renderMatchEvents(match)}
            `
        );
    }

    // --------------------------------------------------------
    // SHAREABLE REPORTS & QR
    // --------------------------------------------------------

    function encodeBase64URL(value) {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        let binary = "";

        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });

        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }

    function decodeBase64URL(value) {
        const padded = value
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(value.length / 4) * 4, "=");

        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, char =>
            char.charCodeAt(0)
        );

        return JSON.parse(new TextDecoder().decode(bytes));
    }

    function getShareBaseURL() {
        return window.location.href.split("#")[0];
    }

    function createShareURL(reportData) {
        const payload = {
            version: 1,
            createdAt: new Date().toISOString(),
            report: reportData
        };

        const encoded = encodeBase64URL(payload);
        return `${getShareBaseURL()}#mc-report=${encoded}`;
    }

    function getSharedReportFromURL() {
        const match = window.location.hash.match(/^#mc-report=(.+)$/);

        if (!match) return null;

        try {
            const payload = decodeBase64URL(match[1]);

            if (payload?.version !== 1 || !payload?.report) return null;

            return payload.report;
        } catch (error) {
            console.warn("[MATCHCRAFT Statistics] Invalid shared report.", error);
            return null;
        }
    }

    function getReportSnapshot(tournament, report, kind, id) {
        if (kind === "team") {
            const team = getTeamById(id);
            if (!team) return null;

            return {
                kind,
                title: team.name,
                tournament: tournament.name,
                team: {
                    id: getId(team),
                    name: team.name,
                    logo: getTeamLogo(team)
                },
                matches: getTeamHistory(id, report.matches).map(match => ({
                    id: getId(match),
                    round: getStage(match),
                    date: getDate(match),
                    homeTeam: getTeamName(match, "home"),
                    awayTeam: getTeamName(match, "away"),
                    homeScore: getScore(match, "home"),
                    awayScore: getScore(match, "away"),
                    events: getEvents(match).map(event => ({
                        type: getEventDescription(event),
                        player: getEventPlayerName(event),
                        minute: getEventMinute(event),
                        assist: getAssistName(event),
                        notes: event?.notes ?? ""
                    }))
                }))
            };
        }

        if (kind === "player") {
            const player = getPlayerById(id);
            if (!player) return null;

            const stats = getPlayerStats(player, report.matches);

            return {
                kind,
                title: getPlayerName(player),
                tournament: tournament.name,
                player: {
                    id: getId(player),
                    name: getPlayerName(player),
                    photo: getPlayerPhoto(player),
                    jersey: getPlayerJersey(player),
                    team: getTeamById(getPlayerTeamId(player))?.name ?? ""
                },
                stats
            };
        }

        if (kind === "match") {
            const match = report.matches.find(item => getId(item) === String(id));
            if (!match) return null;

            const motm = getMOTM(match);

            return {
                kind,
                title: "Match Report",
                tournament: tournament.name,
                match: {
                    id: getId(match),
                    round: getStage(match),
                    date: getDate(match),
                    homeTeam: getTeamName(match, "home"),
                    awayTeam: getTeamName(match, "away"),
                    homeScore: getScore(match, "home"),
                    awayScore: getScore(match, "away"),
                    motm: motm ? {
                        name: getPlayerName(motm.player),
                        jersey: getPlayerJersey(motm.player),
                        team: getTeamById(motm.teamId)?.name ?? "",
                        stats: motm.stats
                    } : null,
                    events: getEvents(match).map(event => ({
                        type: getEventDescription(event),
                        player: getEventPlayerName(event),
                        minute: getEventMinute(event),
                        assist: getAssistName(event),
                        notes: event?.notes ?? ""
                    }))
                }
            };
        }

        return {
            kind: "tournament",
            title: tournament.name,
            tournament: tournament.name,
            champion: report.champion?.name ?? "",
            runnerUp: report.runnerUp?.name ?? "",
            matchesCompleted: report.completion.completed,
            totalMatches: report.completion.total,
            motmCount: report.motm.length
        };
    }

    function showShareReport(kind, id = "") {
        const tournament = getTournamentById(state.selectedTournamentId);
        if (!tournament) return;

        const report = getTournamentReport(tournament);

        if (!report.ready) {
            showDetailsModal(
                "Report Not Ready",
                emptyState(
                    "চূড়ান্ত রিপোর্ট প্রস্তুত নয়",
                    "টুর্নামেন্ট সম্পূর্ণ হলে রিপোর্ট শেয়ার করতে পারবেন।"
                )
            );
            return;
        }

        const snapshot = getReportSnapshot(tournament, report, kind, id);

        if (!snapshot) {
            showDetailsModal(
                "Report Not Available",
                emptyState(
                    "রিপোর্ট তৈরি করা যায়নি",
                    "সংশ্লিষ্ট ডেটা পাওয়া যায়নি।"
                )
            );
            return;
        }

        let url;

        try {
            url = createShareURL(snapshot);
        } catch (error) {
            showDetailsModal(
                "Share Report",
                emptyState(
                    "শেয়ারযোগ্য রিপোর্ট তৈরি করা যায়নি",
                    "রিপোর্টের ডেটা খুব বড় হতে পারে।"
                )
            );
            return;
        }

        const qrURL =
            "https://api.qrserver.com/v1/create-qr-code/" +
            "?size=220x220&data=" + encodeURIComponent(url);

        showDetailsModal(
            "Shareable Report",
            `
                <div class="st-report-layout">
                    <div class="st-report-content">
                        <h3 class="st-details-title">
                            ${escapeHTML(snapshot.title ?? "Report")}
                        </h3>
                        <p class="st-details-description">
                            ${escapeHTML(tournament.name)}
                        </p>
                        <div class="st-report-actions">
                            <button class="st-btn st-btn-primary"
                                type="button" data-action="copy-url"
                                data-url="${escapeHTML(url)}">
                                <i class="fas fa-copy"></i> Copy Link
                            </button>
                            <button class="st-btn"
                                type="button" data-action="share-url"
                                data-url="${escapeHTML(url)}">
                                <i class="fas fa-share-nodes"></i> Share
                            </button>
                            <button class="st-btn"
                                type="button" data-action="print">
                                <i class="fas fa-print"></i> Print / PDF
                            </button>
                        </div>
                        <h3 class="st-detail-subheading">Shareable URL</h3>
                        <div class="st-share-url">${escapeHTML(url)}</div>
                        <div class="st-notice warning" style="margin-top:14px">
                            <i class="fas fa-circle-info"></i>
                            <div>
                                এই লিংকে রিপোর্টের একটি snapshot থাকে।
                                রিপোর্টের আকার বেশি হলে লিংক দীর্ঘ হতে পারে।
                                QR ছবিটি তৈরি করতে বাইরের QR service ব্যবহার করা হচ্ছে।
                                অন্য ডিভাইসে দেখার জন্য মূল ওয়েবসাইটটি অনলাইনে
                                প্রকাশিত থাকতে হবে।
                            </div>
                        </div>
                    </div>
                    <div class="st-qr-panel">
                        <h4 class="st-qr-title">Scan to Open</h4>
                        <img src="${escapeHTML(qrURL)}"
                            alt="Share report QR code"
                            loading="lazy">
                        <p class="st-qr-description">
                            মোবাইল দিয়ে স্ক্যান করে রিপোর্ট খুলুন।
                        </p>
                    </div>
                </div>
            `
        );
    }

    function renderSharedReport(snapshot) {
        const root = ensureRoot();

        const safeJSON = JSON.stringify(snapshot)
            .replace(/</g, "\\u003c");

        root.innerHTML = `
            <div class="st-page">
                ${pageHeader()}
                <section class="st-section">
                    ${sectionHeader(
                        "fa-share-nodes",
                        "Shared Report",
                        "শেয়ার করা রিপোর্টের snapshot"
                    )}
                    <div id="stSharedReportBody"></div>
                </section>
            </div>
        `;

        const target = document.getElementById("stSharedReportBody");
        if (!target) return;

        let body = "";

        if (snapshot.kind === "team") {
            body = `
                <div class="st-card">
                    <div class="st-card-body">
                        <h2 class="st-details-title">
                            ${escapeHTML(snapshot.title)}
                        </h2>
                        <p class="st-details-description">
                            ${escapeHTML(snapshot.tournament)}
                        </p>
                        <h3 class="st-detail-subheading">Match History</h3>
                        <div class="st-table-wrap">
                            <table class="st-table">
                                <thead>
                                    <tr>
                                        <th>Round</th>
                                        <th>Date</th>
                                        <th>Home</th>
                                        <th>Score</th>
                                        <th>Away</th>
                                        <th>Events</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(snapshot.matches || []).map(match => `
                                        <tr>
                                            <td>${escapeHTML(match.round)}</td>
                                            <td>${escapeHTML(formatDate(match.date))}</td>
                                            <td>${escapeHTML(match.homeTeam)}</td>
                                            <td class="st-score-cell">
                                                ${match.homeScore} - ${match.awayScore}
                                            </td>
                                            <td>${escapeHTML(match.awayTeam)}</td>
                                            <td>
                                                ${(match.events || []).map(event =>
                                                    `${escapeHTML(event.minute)} ${escapeHTML(event.type)}: ${escapeHTML(event.player)}`
                                                ).join("<br>") || "No recorded events"}
                                            </td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (snapshot.kind === "player") {
            const stats = snapshot.stats || {};

            body = `
                <div class="st-card">
                    <div class="st-card-body">
                        <h2 class="st-details-title">
                            ${escapeHTML(snapshot.player?.name)}
                        </h2>
                        <p class="st-details-description">
                            ${escapeHTML(snapshot.tournament)} ·
                            ${escapeHTML(snapshot.player?.team)}
                            · #${escapeHTML(snapshot.player?.jersey)}
                        </p>
                        <div class="st-details-grid">
                            ${[
                                ["Matches", stats.matches],
                                ["Goals", stats.goals],
                                ["Assists", stats.assists],
                                ["Yellow Cards", stats.yellowCards],
                                ["Red Cards", stats.redCards],
                                ["Fouls", stats.fouls]
                            ].map(([label, value]) => `
                                <div class="st-detail-metric">
                                    <div class="st-detail-metric-label">${label}</div>
                                    <div class="st-detail-metric-value">${number(value)}</div>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                </div>
            `;
        } else if (snapshot.kind === "match") {
            const match = snapshot.match || {};

            body = `
                <div class="st-card">
                    <div class="st-card-body">
                        <h2 class="st-details-title">
                            ${escapeHTML(match.homeTeam)}
                            ${match.homeScore} - ${match.awayScore}
                            ${escapeHTML(match.awayTeam)}
                        </h2>
                        <p class="st-details-description">
                            ${escapeHTML(snapshot.tournament)}
                            · ${escapeHTML(match.round)}
                            · ${escapeHTML(formatDate(match.date))}
                        </p>
                        ${match.motm ? `
                            <h3 class="st-detail-subheading">Man of the Match</h3>
                            <p>${escapeHTML(match.motm.name)}
                                · ${escapeHTML(match.motm.team)}
                                · #${escapeHTML(match.motm.jersey)}
                            </p>
                        ` : ""}
                        <h3 class="st-detail-subheading">Recorded Match Events</h3>
                        ${renderSnapshotEvents(match.events || [])}
                    </div>
                </div>
            `;
        } else {
            body = `
                <div class="st-card">
                    <div class="st-card-body">
                        <h2 class="st-details-title">
                            ${escapeHTML(snapshot.tournament ?? snapshot.title)}
                        </h2>
                        <div class="st-details-grid">
                            <div class="st-detail-metric">
                                <div class="st-detail-metric-label">Champion</div>
                                <div class="st-detail-metric-value">
                                    ${escapeHTML(snapshot.champion)}
                                </div>
                            </div>
                            <div class="st-detail-metric">
                                <div class="st-detail-metric-label">Runner-up</div>
                                <div class="st-detail-metric-value">
                                    ${escapeHTML(snapshot.runnerUp)}
                                </div>
                            </div>
                            <div class="st-detail-metric">
                                <div class="st-detail-metric-label">Completed Matches</div>
                                <div class="st-detail-metric-value">
                                    ${number(snapshot.matchesCompleted)}
                                    / ${number(snapshot.totalMatches)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        target.innerHTML = body;
    }

    function renderSnapshotEvents(events) {
        if (!events.length) {
            return emptyState(
                "No recorded events",
                "এই রিপোর্টে কোনো match event সংরক্ষিত নেই।"
            );
        }

        return `
            <div class="st-timeline">
                ${events.map(event => `
                    <div class="st-timeline-item">
                        <div class="st-timeline-minute">
                            ${escapeHTML(event.minute)}
                        </div>
                        <div class="st-timeline-content">
                            <h4 class="st-timeline-title">
                                ${escapeHTML(event.type)}:
                                ${escapeHTML(event.player)}
                            </h4>
                            <div class="st-timeline-description">
                                ${event.assist
                                    ? "Assist: " + escapeHTML(event.assist)
                                    : ""}
                                ${event.notes
                                    ? " · " + escapeHTML(event.notes)
                                    : ""}
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    // --------------------------------------------------------
    // EVENTS
    // --------------------------------------------------------

    async function copyText(value) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(value);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = value;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();

                const copied = document.execCommand("copy");
                textarea.remove();

                if (!copied) throw new Error("Copy command failed");
            }

            alert("লিংক কপি হয়েছে।");
        } catch (error) {
            console.warn("[MATCHCRAFT Statistics] Copy failed:", error);
            alert("লিংক কপি করা যায়নি। অনুগ্রহ করে লিংকটি নির্বাচন করে কপি করুন।");
        }
    }

    async function shareURL(value) {
        try {
            if (navigator.share) {
                await navigator.share({
                    title: "MATCHCRAFT Report",
                    url: value
                });
            } else {
                await copyText(value);
            }
        } catch (error) {
            if (error?.name !== "AbortError") {
                console.warn("[MATCHCRAFT Statistics] Share failed:", error);
            }
        }
    }

    function printReport() {
        window.print();
    }

    function handleClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const action = button.dataset.action;
        const teamId = button.dataset.teamId;
        const playerId = button.dataset.playerId;
        const matchId = button.dataset.matchId;

        switch (action) {
            case "refresh":
                renderSelectedTournament();
                break;

            case "print":
                printReport();
                break;

            case "close-modal":
                closeDetailsModal();
                break;

            case "team-details":
                showTeamDetails(teamId);
                break;

            case "match-details":
                showMatchDetails(matchId);
                break;

            case "team-report":
                showShareReport("team", teamId);
                break;

            case "player-report":
                showShareReport("player", playerId);
                break;

            case "match-report":
                showShareReport("match", matchId);
                break;

            case "copy-url":
                copyText(button.dataset.url || "");
                break;

            case "share-url":
                shareURL(button.dataset.url || "");
                break;
        }
    }

    function handleChange(event) {
        if (event.target.id !== "stTournamentSelect") return;

        state.selectedTournamentId = event.target.value;
        renderSelectedTournament();
    }

    function handleKeydown(event) {
        if (event.key === "Escape") closeDetailsModal();
    }

    function handleNavigation(event) {
        const link = event.target.closest('[data-page="statistics"]');
        if (!link) return;

        window.setTimeout(() => {
            renderSelectedTournament();
        }, 0);
    }

    function init() {
        const root = ensureRoot();

        if (root.dataset.statusInitialized === "true") {
            renderSelectedTournament();
            return;
        }

        root.dataset.statusInitialized = "true";

        document.addEventListener("click", event => {
            if (root.contains(event.target)) handleClick(event);
        });

        document.addEventListener("change", handleChange);
        document.addEventListener("keydown", handleKeydown);
        document.addEventListener("click", handleNavigation);

        state.sharedReport = getSharedReportFromURL();

        if (state.sharedReport) {
            renderSharedReport(state.sharedReport);
        } else {
            renderSelectedTournament();
        }

        window.addEventListener("storage", event => {
            if (!event.key || Object.values(KEYS).flat().includes(event.key)) {
                if (!getSharedReportFromURL()) renderSelectedTournament();
            }
        });

        [
            "matchcraft:match-completed",
            "matchcraft:match-updated",
            "matchcraft:fixtures-updated",
            "matchcraft:result-updated",
            "matchcraft:players-updated"
        ].forEach(eventName => {
            window.addEventListener(eventName, () => {
                if (!getSharedReportFromURL()) renderSelectedTournament();
            });
        });

        // Refresh the view when returning to the tab.
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && !getSharedReportFromURL()) {
                renderSelectedTournament();
            }
        });
    }

    // Public API for manual refresh and report integration.
    window.MatchCraftStatistics = {
        refresh: renderSelectedTournament,
        getTournamentReport,
        getTournamentMatches,
        getTeamMatchStats,
        getPlayerStats,
        getMOTM,
        showTeamDetails,
        showMatchDetails,
        showShareReport
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
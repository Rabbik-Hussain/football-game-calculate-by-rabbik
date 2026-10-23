/* =========================================
   MATCHCRAFT - TEAMS & SQUADS
   Team Management System
   Storage: LocalStorage
   Added: View Positions Football Pitch
========================================= */

(function () {
    "use strict";

    // -------------------------------------
    // LocalStorage Keys
    // -------------------------------------

    const TEAM_STORAGE_KEY = "matchcraft_teams";
    const TOURNAMENT_STORAGE_KEY = "matchcraft_tournaments";
    const PLAYER_STORAGE_KEY = "matchcraft_players";

    // -------------------------------------
    // HTML Elements
    // -------------------------------------

    const teamsSection = document.getElementById("teams");
    const dashboardSection = document.getElementById("dashboard");
    const tournamentsSection = document.getElementById("tournaments");

    const showTeamFormBtn = document.getElementById("showTeamForm");
    const teamFormPanel = document.getElementById("teamFormPanel");
    const teamForm = document.getElementById("teamForm");
    const teamFormTitle = document.getElementById("teamFormTitle");

    const teamNameInput = document.getElementById("teamName");
    const teamShortNameInput = document.getElementById("teamShortName");
    const teamCityInput = document.getElementById("teamCity");
    const teamCoachInput = document.getElementById("teamCoach");
    const teamProfileImageInput = document.getElementById("teamProfileImage");
    const teamPlayerLimitInput = document.getElementById("teamPlayerLimit");
    const teamTournamentSelect = document.getElementById("teamTournament");

    const cancelTeamFormBtn = document.getElementById("cancelTeamForm");
    const teamCountElement = document.getElementById("teamCount");
    const teamListElement = document.getElementById("teamList");

    if (
        !teamsSection ||
        !showTeamFormBtn ||
        !teamFormPanel ||
        !teamForm ||
        !teamNameInput ||
        !teamShortNameInput ||
        !teamCityInput ||
        !teamCoachInput ||
        !teamProfileImageInput ||
        !teamPlayerLimitInput ||
        !teamTournamentSelect ||
        !cancelTeamFormBtn ||
        !teamCountElement ||
        !teamListElement
    ) {
        console.error(
            "MATCHCRAFT: Teams section-এর প্রয়োজনীয় HTML element পাওয়া যায়নি।"
        );
        return;
    }

    let editingTeamId = null;
    let activePitchTeamId = null;

    // -------------------------------------
    // Utility Functions
    // -------------------------------------

    function createId() {
        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return crypto.randomUUID();
        }

        return (
            "team_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 10)
        );
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (character) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[character];
        });
    }

    function readStorage(key) {
        try {
            const savedData = localStorage.getItem(key);

            if (!savedData) {
                return [];
            }

            const parsedData = JSON.parse(savedData);

            return Array.isArray(parsedData) ? parsedData : [];
        } catch (error) {
            console.error("LocalStorage data পড়তে সমস্যা হয়েছে:", error);
            return [];
        }
    }

    function getTeams() {
        return readStorage(TEAM_STORAGE_KEY);
    }

    function getTournaments() {
        return readStorage(TOURNAMENT_STORAGE_KEY);
    }

    function getPlayers() {
        return readStorage(PLAYER_STORAGE_KEY);
    }

    function saveTeams(teams) {
        try {
            localStorage.setItem(
                TEAM_STORAGE_KEY,
                JSON.stringify(teams)
            );

            return true;
        } catch (error) {
            console.error("Team data সংরক্ষণ করা যায়নি:", error);

            alert(
                "টিমের তথ্য সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ খালি আছে কি না পরীক্ষা করুন।"
            );

            return false;
        }
    }

    function readTeamProfileImage(file) {
        return new Promise(function (resolve, reject) {
            if (!file) {
                resolve("");
                return;
            }

            if (!file.type.startsWith("image/")) {
                reject(new Error("অনুগ্রহ করে একটি ছবি নির্বাচন করুন।"));
                return;
            }

            const reader = new FileReader();

            reader.onload = function () {
                resolve(reader.result);
            };

            reader.onerror = function () {
                reject(new Error("ছবিটি পড়া যায়নি। আবার চেষ্টা করুন।"));
            };

            reader.readAsDataURL(file);
        });
    }

    // -------------------------------------
    // Player Limit Helpers
    // -------------------------------------

    function getTeamId(team) {
        return String(team.id ?? team.teamId ?? "");
    }

    function getPlayerTeamId(player) {
        return String(player.teamId ?? player.team ?? "");
    }

    function getTeamPlayerCount(teamId) {
        return getPlayers().filter(function (player) {
            return getPlayerTeamId(player) === String(teamId);
        }).length;
    }

    function getPlayerLimit(team) {
        const limit = Number(team.playerLimit);

        return Number.isInteger(limit) && limit >= 1
            ? limit
            : null;
    }

    // -------------------------------------
    // Tournament Helpers
    // -------------------------------------

    function getTournamentId(tournament) {
        return String(
            tournament.id ??
            tournament.tournamentId ??
            ""
        );
    }

    function getTournamentName(tournament) {
        return String(
            tournament.name ??
            tournament.tournamentName ??
            tournament.title ??
            "Unnamed Tournament"
        );
    }

    function getTournamentSeason(tournament) {
        return String(tournament.season ?? "");
    }

    function getTournamentLabel(tournament) {
        const name = getTournamentName(tournament);
        const season = getTournamentSeason(tournament);

        return season ? name + " (" + season + ")" : name;
    }

    function renderTournamentOptions(selectedId = "") {
        const tournaments = getTournaments();

        teamTournamentSelect.innerHTML =
            '<option value="">No tournament selected</option>';

        tournaments.forEach(function (tournament, index) {
            const id = getTournamentId(tournament) || String(index);

            const option = document.createElement("option");
            option.value = id;
            option.textContent = getTournamentLabel(tournament);

            if (String(selectedId) === id) {
                option.selected = true;
            }

            teamTournamentSelect.appendChild(option);
        });
    }

    function findTournament(tournamentId) {
        if (!tournamentId) {
            return null;
        }

        const tournaments = getTournaments();

        return tournaments.find(function (tournament, index) {
            const id = getTournamentId(tournament) || String(index);

            return id === String(tournamentId);
        }) || null;
    }

    function getTeamTournamentId(team) {
        return String(
            team.tournamentId ??
            team.tournament ??
            ""
        );
    }

    function getTeamTournamentName(team) {
        const tournamentId = getTeamTournamentId(team);

        if (!tournamentId) {
            return "No tournament selected";
        }

        const tournament = findTournament(tournamentId);

        if (tournament) {
            return getTournamentLabel(tournament);
        }

        return String(
            team.tournamentName ||
            "Tournament unavailable"
        );
    }

    // -------------------------------------
    // Form Helpers
    // -------------------------------------

    function openTeamForm(team = null) {
        teamForm.reset();

        renderTournamentOptions(
            team ? getTeamTournamentId(team) : ""
        );

        if (team) {
            editingTeamId = getTeamId(team);

            teamFormTitle.textContent = "Edit Team";
            teamNameInput.value = team.name || "";
            teamShortNameInput.value = team.shortName || "";
            teamCityInput.value = team.city || "";
            teamCoachInput.value = team.coach || "";

            teamPlayerLimitInput.value =
                team.playerLimit === undefined ||
                team.playerLimit === null
                    ? ""
                    : String(team.playerLimit);

            teamTournamentSelect.value = getTeamTournamentId(team);
        } else {
            editingTeamId = null;

            teamFormTitle.textContent = "Register New Team";
            teamPlayerLimitInput.value = "";
            teamTournamentSelect.value = "";
        }

        teamFormPanel.hidden = false;

        teamFormPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        teamNameInput.focus();
    }

    function closeTeamForm() {
        teamForm.reset();
        teamFormPanel.hidden = true;
        editingTeamId = null;
        teamFormTitle.textContent = "Register New Team";
    }

    // -------------------------------------
    // Duplicate Team Validation
    // -------------------------------------

    function isDuplicateTeam(teamName, tournamentId, excludeId = null) {
        const normalizedName = teamName.trim().toLowerCase();

        return getTeams().some(function (team) {
            if (
                excludeId !== null &&
                getTeamId(team) === String(excludeId)
            ) {
                return false;
            }

            const existingName = String(team.name || "")
                .trim()
                .toLowerCase();

            const existingTournamentId = getTeamTournamentId(team);

            return (
                existingName === normalizedName &&
                existingTournamentId === String(tournamentId || "")
            );
        });
    }

    // -------------------------------------
    // Football Pitch Styles
    // CSS is injected automatically
    // -------------------------------------

    function installPitchStyles() {
        if (document.getElementById("matchcraft-pitch-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "matchcraft-pitch-styles";

        style.textContent = `
            .mc-pitch-overlay {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(5, 12, 24, .82);
                backdrop-filter: blur(7px);
                overflow-y: auto;
            }

            .mc-pitch-overlay.mc-pitch-open {
                display: flex;
            }

            .mc-pitch-dialog {
                width: min(1100px, 100%);
                max-height: 94vh;
                overflow-y: auto;
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 20px;
                padding: 22px;
                background: #111b2a;
                color: #f8fafc;
                box-shadow: 0 24px 80px rgba(0,0,0,.45);
            }

            .mc-pitch-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 18px;
            }

            .mc-pitch-heading {
                min-width: 0;
            }

            .mc-pitch-heading h2 {
                margin: 0 0 5px;
                font-size: clamp(20px, 3vw, 28px);
                color: #fff;
                overflow-wrap: anywhere;
            }

            .mc-pitch-heading p {
                margin: 0;
                color: #aab8ca;
                font-size: 13px;
            }

            .mc-pitch-close {
                flex: 0 0 auto;
                width: 42px;
                height: 42px;
                border: 1px solid rgba(255,255,255,.16);
                border-radius: 12px;
                background: #243247;
                color: #fff;
                font-size: 25px;
                cursor: pointer;
            }

            .mc-pitch-close:hover {
                background: #e5484d;
            }

            .mc-pitch-wrap {
                position: relative;
                width: 100%;
                overflow: hidden;
                border: 3px solid rgba(255,255,255,.75);
                border-radius: 8px;
                background: #167746;
                isolation: isolate;
            }

            .mc-pitch-field {
                position: relative;
                width: 100%;
                aspect-ratio: 1.58 / 1;
                min-height: 310px;
                overflow: hidden;
                background:
                    repeating-linear-gradient(
                        90deg,
                        #18804a 0%,
                        #18804a 12.5%,
                        #147341 12.5%,
                        #147341 25%
                    );
            }

            .mc-pitch-line {
                position: absolute;
                z-index: 1;
                border: 2px solid rgba(255,255,255,.78);
                pointer-events: none;
            }

            .mc-pitch-halfway {
                top: 50%;
                left: 0;
                width: 100%;
                border-width: 2px 0 0;
            }

            .mc-pitch-centre-circle {
                top: 50%;
                left: 50%;
                width: 16%;
                aspect-ratio: 1;
                border-radius: 50%;
                transform: translate(-50%, -50%);
            }

            .mc-pitch-centre-dot {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: #fff;
                transform: translate(-50%, -50%);
            }

            .mc-pitch-penalty-area {
                left: 30%;
                width: 40%;
                height: 17%;
            }

            .mc-pitch-penalty-area.mc-pitch-top {
                top: 0;
                border-top: 0;
            }

            .mc-pitch-penalty-area.mc-pitch-bottom {
                bottom: 0;
                border-bottom: 0;
            }

            .mc-pitch-six-yard {
                left: 40%;
                width: 20%;
                height: 7%;
            }

            .mc-pitch-six-yard.mc-pitch-top {
                top: 0;
                border-top: 0;
            }

            .mc-pitch-six-yard.mc-pitch-bottom {
                bottom: 0;
                border-bottom: 0;
            }

            .mc-pitch-goal {
                position: absolute;
                z-index: 2;
                left: 43%;
                width: 14%;
                height: 2.5%;
                border: 3px solid #fff;
                background: rgba(255,255,255,.15);
            }

            .mc-pitch-goal.mc-pitch-top {
                top: -1px;
                border-top: 0;
            }

            .mc-pitch-goal.mc-pitch-bottom {
                bottom: -1px;
                border-bottom: 0;
            }

            .mc-pitch-position {
                position: absolute;
                z-index: 5;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                gap: 4px;
                width: 14%;
                min-width: 0;
                transform: translate(-50%, -50%);
            }

            .mc-pitch-position[data-position="Goalkeeper"] {
                left: 50%;
                top: 91%;
            }

            .mc-pitch-position[data-position="Centre-Back"] {
                left: 50%;
                top: 72%;
            }

            .mc-pitch-position[data-position="Left-Back"] {
                left: 15%;
                top: 67%;
            }

            .mc-pitch-position[data-position="Right-Back"] {
                left: 85%;
                top: 67%;
            }

            .mc-pitch-position[data-position="Defensive Midfielder"] {
                left: 50%;
                top: 59%;
            }

            .mc-pitch-position[data-position="Central Midfielder"] {
                left: 50%;
                top: 45%;
            }

            .mc-pitch-position[data-position="Attacking Midfielder"] {
                left: 50%;
                top: 31%;
            }

            .mc-pitch-position[data-position="Left Winger"] {
                left: 17%;
                top: 26%;
            }

            .mc-pitch-position[data-position="Striker"] {
                left: 50%;
                top: 14%;
            }

            .mc-pitch-position[data-position="Right Winger"] {
                left: 83%;
                top: 26%;
            }

            .mc-pitch-player {
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
                max-width: 105px;
                min-width: 0;
                text-align: center;
            }

            .mc-pitch-avatar {
                display: flex;
                align-items: center;
                justify-content: center;
                width: clamp(29px, 4.6vw, 49px);
                height: clamp(29px, 4.6vw, 49px);
                overflow: hidden;
                border: 2px solid #fff;
                border-radius: 50%;
                background: #fbbf24;
                color: #172033;
                box-shadow: 0 2px 8px rgba(0,0,0,.3);
                font-size: clamp(10px, 1.5vw, 15px);
                font-weight: 800;
            }

            .mc-pitch-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .mc-pitch-player-name {
                max-width: 100%;
                margin-top: 3px;
                padding: 3px 5px;
                border-radius: 5px;
                background: rgba(7, 18, 29, .87);
                color: #fff;
                font-size: clamp(8px, 1.15vw, 12px);
                line-height: 1.25;
                overflow-wrap: anywhere;
            }

            .mc-pitch-player-position {
                margin-top: 2px;
                color: #fff;
                font-size: clamp(7px, .95vw, 10px);
                font-weight: 700;
                text-shadow: 0 1px 3px #000;
            }

            .mc-pitch-empty {
                position: absolute;
                z-index: 6;
                top: 50%;
                left: 50%;
                width: 75%;
                padding: 12px;
                border-radius: 10px;
                background: rgba(6, 24, 15, .85);
                color: #fff;
                text-align: center;
                transform: translate(-50%, -50%);
            }

            .mc-pitch-legend {
                display: flex;
                flex-wrap: wrap;
                gap: 8px 16px;
                margin-top: 15px;
                color: #c3cede;
                font-size: 12px;
            }

            .mc-pitch-legend span {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .mc-pitch-legend i {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #fbbf24;
            }

            .mc-pitch-footer {
                margin-top: 12px;
                color: #aab8ca;
                font-size: 12px;
                line-height: 1.6;
            }

            .team-card-actions .team-view-positions-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 9px 12px;
                border: 1px solid #23875b;
                border-radius: 8px;
                background: #167746;
                color: #fff;
                font: inherit;
                font-size: 13px;
                cursor: pointer;
                transition: background .2s ease, transform .2s ease;
            }

            .team-card-actions .team-view-positions-btn:hover {
                background: #11643b;
                transform: translateY(-1px);
            }

            @media (max-width: 600px) {
                .mc-pitch-overlay {
                    padding: 8px;
                }

                .mc-pitch-dialog {
                    padding: 12px;
                    border-radius: 14px;
                    max-height: 96vh;
                }

                .mc-pitch-field {
                    min-height: 285px;
                    aspect-ratio: 1 / 1.05;
                }

                .mc-pitch-position {
                    width: 19%;
                }

                .mc-pitch-position[data-position="Left-Back"] {
                    left: 13%;
                }

                .mc-pitch-position[data-position="Right-Back"] {
                    left: 87%;
                }

                .mc-pitch-position[data-position="Left Winger"] {
                    left: 16%;
                }

                .mc-pitch-position[data-position="Right Winger"] {
                    left: 84%;
                }

                .mc-pitch-player {
                    max-width: 76px;
                }

                .mc-pitch-avatar {
                    width: 31px;
                    height: 31px;
                }

                .mc-pitch-player-name {
                    font-size: 9px;
                    padding: 2px 4px;
                }

                .mc-pitch-player-position {
                    font-size: 8px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // -------------------------------------
    // Football Pitch Modal
    // -------------------------------------

    function createPitchModal() {
        installPitchStyles();

        let modal = document.getElementById("matchcraftPitchOverlay");

        if (modal) {
            return modal;
        }

        modal = document.createElement("div");
        modal.id = "matchcraftPitchOverlay";
        modal.className = "mc-pitch-overlay";
        modal.setAttribute("aria-hidden", "true");

        modal.innerHTML = `
            <section
                class="mc-pitch-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mcPitchTitle"
            >
                <header class="mc-pitch-header">
                    <div class="mc-pitch-heading">
                        <h2 id="mcPitchTitle">Team Positions</h2>
                        <p id="mcPitchSubtitle">Players on the football pitch</p>
                    </div>

                    <button
                        type="button"
                        class="mc-pitch-close"
                        aria-label="Close football pitch"
                        title="Close"
                    >&times;</button>
                </header>

                <div class="mc-pitch-wrap">
                    <div class="mc-pitch-field">
                        <div class="mc-pitch-line mc-pitch-halfway"></div>
                        <div class="mc-pitch-line mc-pitch-centre-circle"></div>
                        <div class="mc-pitch-centre-dot"></div>

                        <div class="mc-pitch-line mc-pitch-penalty-area mc-pitch-top"></div>
                        <div class="mc-pitch-line mc-pitch-penalty-area mc-pitch-bottom"></div>

                        <div class="mc-pitch-line mc-pitch-six-yard mc-pitch-top"></div>
                        <div class="mc-pitch-line mc-pitch-six-yard mc-pitch-bottom"></div>

                        <div class="mc-pitch-goal mc-pitch-top"></div>
                        <div class="mc-pitch-goal mc-pitch-bottom"></div>

                        <div id="mcPitchPlayers"></div>
                    </div>
                </div>

                <div class="mc-pitch-legend">
                    <span><i></i> Player profile</span>
                    <span>GK · Goalkeeper</span>
                    <span>DEF · Defence</span>
                    <span>MID · Midfield</span>
                    <span>ATT · Attack</span>
                </div>

                <p class="mc-pitch-footer">
                    Player positions are based on the position saved in each player's profile.
                    Multiple players with the same position are displayed together.
                </p>
            </section>
        `;

        document.body.appendChild(modal);

        modal.querySelector(".mc-pitch-close").addEventListener(
            "click",
            closePitch
        );

        modal.addEventListener("click", function (event) {
            if (event.target === modal) {
                closePitch();
            }
        });

        return modal;
    }

    function getPositionLabel(position) {
        const labels = {
            "Goalkeeper": "GK",
            "Centre-Back": "CB",
            "Left-Back": "LB",
            "Right-Back": "RB",
            "Defensive Midfielder": "CDM",
            "Central Midfielder": "CM",
            "Attacking Midfielder": "CAM",
            "Left Winger": "LW",
            "Right Winger": "RW",
            "Striker": "ST"
        };

        return labels[position] || position || "Position not set";
    }

    function getPositionGroup(position) {
        if (position === "Goalkeeper") {
            return "GK";
        }

        if (
            position === "Centre-Back" ||
            position === "Left-Back" ||
            position === "Right-Back"
        ) {
            return "DEF";
        }

        if (
            position === "Defensive Midfielder" ||
            position === "Central Midfielder" ||
            position === "Attacking Midfielder"
        ) {
            return "MID";
        }

        if (
            position === "Left Winger" ||
            position === "Right Winger" ||
            position === "Striker"
        ) {
            return "ATT";
        }

        return "OTHER";
    }

    function getPlayerInitials(name) {
        const words = String(name || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!words.length) {
            return "PL";
        }

        return words
            .slice(0, 2)
            .map(function (word) {
                return Array.from(word)[0] || "";
            })
            .join("")
            .toUpperCase();
    }

    function renderPitchPlayer(player) {
        const name = escapeHTML(player.name || "Unnamed Player");
        const position = String(player.position || "");
        const safePosition = escapeHTML(position);
        const photo = String(player.photo || "");
        const initials = escapeHTML(getPlayerInitials(player.name));

        const avatar = photo
            ? `
                <img
                    src="${escapeHTML(photo)}"
                    alt="${name}"
                    loading="lazy"
                >
            `
            : initials;

        return `
            <div class="mc-pitch-player">
                <div class="mc-pitch-avatar">${avatar}</div>
                <div class="mc-pitch-player-name">${name}</div>
                <div class="mc-pitch-player-position">
                    ${escapeHTML(getPositionLabel(position))}
                </div>
            </div>
        `;
    }

    function renderPitch(team) {
        const modal = createPitchModal();
        const pitchPlayers = modal.querySelector("#mcPitchPlayers");
        const title = modal.querySelector("#mcPitchTitle");
        const subtitle = modal.querySelector("#mcPitchSubtitle");

        const teamId = getTeamId(team);

        const players = getPlayers().filter(function (player) {
            return getPlayerTeamId(player) === teamId;
        });

        title.textContent = (team.name || "Unnamed Team") + " — Positions";
        subtitle.textContent =
            players.length +
            (players.length === 1 ? " player" : " players") +
            " · " +
            (team.shortName || "TEAM");

        const positions = [
            "Goalkeeper",
            "Centre-Back",
            "Left-Back",
            "Right-Back",
            "Defensive Midfielder",
            "Central Midfielder",
            "Attacking Midfielder",
            "Left Winger",
            "Right Winger",
            "Striker"
        ];

        let markup = "";

        positions.forEach(function (position) {
            const matchingPlayers = players.filter(function (player) {
                return String(player.position || "") === position;
            });

            if (!matchingPlayers.length) {
                return;
            }

            markup += `
                <div
                    class="mc-pitch-position"
                    data-position="${escapeHTML(position)}"
                    aria-label="${escapeHTML(position)}"
                >
                    ${matchingPlayers.map(renderPitchPlayer).join("")}
                </div>
            `;
        });

        const unplacedPlayers = players.filter(function (player) {
            return !positions.includes(String(player.position || ""));
        });

        if (unplacedPlayers.length) {
            markup += `
                <div
                    class="mc-pitch-position"
                    style="left:50%;top:50%;width:20%;"
                    data-position="Other"
                >
                    ${unplacedPlayers.map(renderPitchPlayer).join("")}
                </div>
            `;
        }

        if (!players.length) {
            markup += `
                <div class="mc-pitch-empty">
                    <strong>No Players Yet</strong>
                    <div style="margin-top:5px;font-size:12px;">
                        Add players to this team to see them on the pitch.
                    </div>
                </div>
            `;
        }

        pitchPlayers.innerHTML = markup;

        modal.classList.add("mc-pitch-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        activePitchTeamId = teamId;

        const closeButton = modal.querySelector(".mc-pitch-close");
        closeButton.focus();
    }

    function closePitch() {
        const modal = document.getElementById("matchcraftPitchOverlay");

        if (!modal) {
            return;
        }

        modal.classList.remove("mc-pitch-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";

        activePitchTeamId = null;
    }

    function refreshOpenPitch() {
        if (activePitchTeamId === null) {
            return;
        }

        const team = getTeams().find(function (item) {
            return getTeamId(item) === String(activePitchTeamId);
        });

        if (!team) {
            closePitch();
            return;
        }

        const modal = document.getElementById("matchcraftPitchOverlay");

        if (modal && modal.classList.contains("mc-pitch-open")) {
            renderPitch(team);
        }
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closePitch();
        }
    });

    // -------------------------------------
    // Render Team Cards
    // -------------------------------------

    function renderTeams() {
        const teams = getTeams();

        teamCountElement.textContent =
            teams.length + (teams.length === 1 ? " TEAM" : " TEAMS");

        if (teams.length === 0) {
            teamListElement.innerHTML = `
                <div class="team-empty-state">
                    <i class="fas fa-shield-halved"></i>
                    <h3>No Teams Yet</h3>
                    <p>Add your first team to get started.</p>
                </div>
            `;

            return;
        }

        teamListElement.innerHTML = teams.map(function (team) {
            const id = escapeHTML(getTeamId(team));
            const name = escapeHTML(team.name || "Unnamed Team");
            const shortName = escapeHTML(team.shortName || "TEAM");
            const city = escapeHTML(team.city || "Not provided");
            const coach = escapeHTML(team.coach || "Not assigned");

            const tournamentName = escapeHTML(
                getTeamTournamentName(team)
            );

            const playerLimit = getPlayerLimit(team);
            const playerCount = getTeamPlayerCount(getTeamId(team));

            const playerLimitText = playerLimit === null
                ? "Not set"
                : playerCount + " / " + playerLimit;

            return `
                <article class="team-card" data-team-id="${id}">

                    <div class="team-card-header">

                        <div class="team-logo">
                            ${
                                team.profileImage
                                    ? `<img src="${escapeHTML(team.profileImage)}" alt="${name} profile">`
                                    : '<i class="fas fa-shield-halved"></i>'
                            }
                        </div>

                        <div class="team-card-title">
                            <h3>${name}</h3>
                            <span class="team-badge">${shortName}</span>
                        </div>

                    </div>

                    <div class="team-card-details">

                        <div class="team-detail-row">
                            <span class="team-detail-label">
                                <i class="fas fa-location-dot"></i>
                                City
                            </span>

                            <span class="team-detail-value">${city}</span>
                        </div>

                        <div class="team-detail-row">
                            <span class="team-detail-label">
                                <i class="fas fa-user-tie"></i>
                                Coach
                            </span>

                            <span class="team-detail-value">${coach}</span>
                        </div>

                        <div class="team-detail-row">
                            <span class="team-detail-label">
                                <i class="fas fa-trophy"></i>
                                Tournament
                            </span>

                            <span class="team-detail-value">${tournamentName}</span>
                        </div>

                        <div class="team-detail-row">
                            <span class="team-detail-label">
                                <i class="fas fa-users"></i>
                                Players / Limit
                            </span>

                            <span class="team-detail-value">${playerLimitText}</span>
                        </div>

                    </div>

                    <div class="team-card-actions">

                        <button
                            type="button"
                            class="team-edit-btn"
                            data-action="edit"
                            data-id="${id}"
                        >
                            <i class="fas fa-pen"></i>
                            Edit
                        </button>

                        <button
                            type="button"
                            class="team-delete-btn"
                            data-action="delete"
                            data-id="${id}"
                        >
                            <i class="fas fa-trash"></i>
                            Delete
                        </button>

                        <button
                            type="button"
                            class="team-view-positions-btn"
                            data-action="view-positions"
                            data-id="${id}"
                        >
                            <i class="fas fa-futbol"></i>
                            View Positions
                        </button>

                    </div>

                </article>
            `;
        }).join("");
    }

    // -------------------------------------
    // Create / Update Team
    // -------------------------------------

    teamForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = teamNameInput.value.trim();
        const shortName = teamShortNameInput.value.trim();
        const city = teamCityInput.value.trim();
        const coach = teamCoachInput.value.trim();
        const tournamentId = teamTournamentSelect.value;
        const playerLimitValue = teamPlayerLimitInput.value.trim();

        if (!name) {
            alert("অনুগ্রহ করে টিমের নাম লিখুন।");
            teamNameInput.focus();
            return;
        }

        if (
            playerLimitValue === "" ||
            !Number.isInteger(Number(playerLimitValue)) ||
            Number(playerLimitValue) < 1
        ) {
            alert(
                "অনুগ্রহ করে Player Limit-এ ১ বা তার বেশি পূর্ণসংখ্যা লিখুন।"
            );
            teamPlayerLimitInput.focus();
            return;
        }

        const playerLimit = Number(playerLimitValue);

        if (isDuplicateTeam(name, tournamentId, editingTeamId)) {
            alert(
                "এই নামের টিম নির্বাচিত Tournament-এ আগে থেকেই রয়েছে।"
            );
            teamNameInput.focus();
            return;
        }

        const teams = getTeams();
        const selectedTournament = findTournament(tournamentId);

        let profileImage = "";

        try {
            const selectedFile = teamProfileImageInput.files[0];

            if (selectedFile) {
                if (selectedFile.size > 5 * 1024 * 1024) {
                    alert("ছবির আকার সর্বোচ্চ ৫ MB হতে পারবে।");
                    return;
                }

                profileImage = await readTeamProfileImage(selectedFile);
            }
        } catch (error) {
            alert(error.message || "ছবি পড়তে সমস্যা হয়েছে।");
            return;
        }

        if (editingTeamId !== null) {
            const teamIndex = teams.findIndex(function (team) {
                return getTeamId(team) === String(editingTeamId);
            });

            if (teamIndex === -1) {
                alert(
                    "সম্পাদনার জন্য টিমটি পাওয়া যায়নি। তালিকাটি আবার পরীক্ষা করুন।"
                );

                closeTeamForm();
                renderTeams();
                return;
            }

            const oldTeam = teams[teamIndex];
            const currentPlayerCount = getTeamPlayerCount(
                getTeamId(oldTeam)
            );

            if (playerLimit < currentPlayerCount) {
                alert(
                    "এই Team-এ বর্তমানে " +
                    currentPlayerCount +
                    " জন Player রয়েছে। Player Limit এর চেয়ে কম করা যাবে না।"
                );

                teamPlayerLimitInput.focus();
                return;
            }

            teams[teamIndex] = {
                ...oldTeam,
                name: name,
                shortName: shortName,
                city: city,
                coach: coach,
                playerLimit: playerLimit,
                tournamentId: tournamentId,
                tournamentName: selectedTournament
                    ? getTournamentLabel(selectedTournament)
                    : "",
                profileImage: profileImage || oldTeam.profileImage || ""
            };

            if (!saveTeams(teams)) {
                return;
            }

            closeTeamForm();
            renderTeams();
            refreshOpenPitch();

            alert("টিমের তথ্য সফলভাবে আপডেট হয়েছে।");
            return;
        }

        const newTeam = {
            id: createId(),
            name: name,
            shortName: shortName,
            city: city,
            coach: coach,
            playerLimit: playerLimit,
            tournamentId: tournamentId,
            tournamentName: selectedTournament
                ? getTournamentLabel(selectedTournament)
                : "",
            profileImage: profileImage,
            createdAt: new Date().toISOString()
        };

        teams.push(newTeam);

        if (!saveTeams(teams)) {
            return;
        }

        closeTeamForm();
        renderTeams();

        alert("নতুন টিম সফলভাবে যোগ হয়েছে।");
    });

    // -------------------------------------
    // Add Team Button
    // -------------------------------------

    showTeamFormBtn.addEventListener("click", function () {
        openTeamForm();
    });

    // -------------------------------------
    // Cancel Form Button
    // -------------------------------------

    cancelTeamFormBtn.addEventListener("click", function () {
        closeTeamForm();
    });

    // -------------------------------------
    // Team Actions: Edit / Delete / View
    // -------------------------------------

    teamListElement.addEventListener("click", function (event) {
        const actionButton = event.target.closest("[data-action]");

        if (!actionButton || !teamListElement.contains(actionButton)) {
            return;
        }

        const action = actionButton.dataset.action;
        const teamId = actionButton.dataset.id;

        const teams = getTeams();

        const team = teams.find(function (item) {
            return getTeamId(item) === String(teamId);
        });

        if (!team) {
            alert("টিমটি খুঁজে পাওয়া যায়নি। তালিকাটি আবার পরীক্ষা করুন।");
            renderTeams();
            return;
        }

        if (action === "view-positions") {
            renderPitch(team);
            return;
        }

        if (action === "edit") {
            openTeamForm(team);
            return;
        }

        if (action === "delete") {
            const confirmed = confirm(
                '"' +
                team.name +
                '" টিমটি মুছে ফেলতে চান কি? এই কাজটি পূর্বাবস্থায় ফিরিয়ে আনা যাবে না।'
            );

            if (!confirmed) {
                return;
            }

            const updatedTeams = teams.filter(function (item) {
                return getTeamId(item) !== String(teamId);
            });

            if (!saveTeams(updatedTeams)) {
                return;
            }

            if (String(editingTeamId) === String(teamId)) {
                closeTeamForm();
            }

            if (String(activePitchTeamId) === String(teamId)) {
                closePitch();
            }

            renderTeams();

            alert("টিমটি সফলভাবে মুছে ফেলা হয়েছে।");
        }
    });

    // -------------------------------------
    // Navigation
    // -------------------------------------

    function showTeamsPage() {
        if (dashboardSection) {
            dashboardSection.hidden = true;
        }

        if (tournamentsSection) {
            tournamentsSection.hidden = true;
        }

        teamsSection.hidden = false;

        renderTournamentOptions(
            teamTournamentSelect.value
        );

        renderTeams();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    function hideTeamsPage() {
        teamsSection.hidden = true;
        closePitch();
    }

    document
        .querySelectorAll(".sidebar_menu .menu a[data-page]")
        .forEach(function (link) {
            link.addEventListener("click", function (event) {
                const pageName = link.dataset.page;

                if (pageName === "teams") {
                    event.preventDefault();
                    showTeamsPage();
                } else if (
                    pageName === "dashboard" ||
                    pageName === "tournaments"
                ) {
                    hideTeamsPage();
                }
            });
        });

    // -------------------------------------
    // Refresh when storage changes
    // -------------------------------------

    window.addEventListener("storage", function (event) {
        if (
            event.key === TOURNAMENT_STORAGE_KEY ||
            event.key === TEAM_STORAGE_KEY ||
            event.key === PLAYER_STORAGE_KEY
        ) {
            renderTournamentOptions(
                teamTournamentSelect.value
            );

            renderTeams();
            refreshOpenPitch();
        }
    });

    // Players updated in the same browser tab
    window.addEventListener("matchcraft:players-updated", function () {
        renderTeams();
        refreshOpenPitch();
    });

    // -------------------------------------
    // Initial Setup
    // -------------------------------------

    renderTournamentOptions();
    renderTeams();

})();
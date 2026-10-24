(function () {
    "use strict";

    // ==========================================
    // MATCHCRAFT - PLAYER MANAGEMENT
    // ==========================================

    const STORAGE_KEY = "matchcraft_players";
    const TEAM_STORAGE_KEY = "matchcraft_teams";

    const $ = (id) => document.getElementById(id);

    const section = $("players");
    const playerForm = $("playerForm");
    const formPanel = $("playerFormPanel");
    const showFormBtn = $("showPlayerForm");
    const cancelFormBtn = $("cancelPlayerForm");
    const playerList = $("playerList");
    const playerCount = $("playerCount");
    const playerTeam = $("playerTeam");
    const playerPhoto = $("playerPhoto");
    const playerIdInput = $("playerId");

    if (
        !section ||
        !playerForm ||
        !formPanel ||
        !showFormBtn ||
        !cancelFormBtn ||
        !playerList ||
        !playerCount ||
        !playerTeam
    ) {
        console.error(
            "MATCHCRAFT: Player section-এর প্রয়োজনীয় HTML elements পাওয়া যায়নি।"
        );
        return;
    }

    let editingPlayerId = null;
    let currentPhoto = "";
    let searchText = "";
    let selectedTeamFilter = "all";
    let currentDetailsPlayerId = null;
    let lastListScrollY = 0;

    // ==========================================
    // LOCALSTORAGE HELPERS
    // ==========================================

    function readStorage(key) {
        try {
            const data = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error("Storage read error:", error);
            return [];
        }
    }

    function savePlayers(players) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
            return true;
        } catch (error) {
            if (
                error.name === "QuotaExceededError" ||
                error.name === "NS_ERROR_DOM_QUOTA_REACHED"
            ) {
                alert(
                    "আপনার ব্রাউজারের Storage পূর্ণ হয়ে গেছে। " +
                    "ছবির সাইজ কমিয়ে আবার চেষ্টা করুন অথবা কিছু পুরোনো ছবি মুছে দিন।"
                );
            } else {
                alert("Player-এর তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।");
            }

            console.error("Player save error:", error);
            return false;
        }
    }

    function getTeams() {
        return readStorage(TEAM_STORAGE_KEY);
    }

    function getPlayers() {
        return readStorage(STORAGE_KEY);
    }

    // ==========================================
    // TEAM PLAYER LIMIT VALIDATION
    // ==========================================

    function getTeamId(team) {
        return String(team.id ?? team.teamId ?? "");
    }

    function getTeamName(team) {
        return team.name || team.teamName || "Unnamed Team";
    }

    function getTeamById(teamId) {
        return getTeams().find(
            team => getTeamId(team) === String(teamId)
        );
    }

    function getPlayerTeamId(player) {
        return String(player.teamId ?? player.team ?? "");
    }

    function getTeamPlayerCount(teamId, players = getPlayers()) {
        return players.filter(function (player) {
            return getPlayerTeamId(player) === String(teamId);
        }).length;
    }

    function validateTeamPlayerLimit(teamId, players, playerBeingEditedId = null) {
        const team = getTeamById(teamId);

        if (!team) {
            alert("নির্বাচিত Team পাওয়া যায়নি। আবার Team নির্বাচন করুন।");
            return false;
        }

        const limit = Number(team.playerLimit);

        if (
            team.playerLimit === undefined ||
            team.playerLimit === null ||
            String(team.playerLimit).trim() === "" ||
            !Number.isInteger(limit) ||
            limit < 1
        ) {
            alert(
                "এই Team-এর Player Limit নির্ধারণ করা নেই। " +
                "Teams বিভাগে গিয়ে Team Edit করে একটি বৈধ Player Limit সেট করুন।"
            );
            return false;
        }

        // যে Player-কে Edit করা হচ্ছে, তাঁকে নতুন Player হিসেবে গণনা করা হবে না।
        const currentCount = players.filter(function (player) {
            const isSameTeam =
                getPlayerTeamId(player) === String(teamId);

            const isEditedPlayer =
                playerBeingEditedId !== null &&
                String(player.id) === String(playerBeingEditedId);

            return isSameTeam && !isEditedPlayer;
        }).length;

        if (currentCount >= limit) {
            alert(
                '"' + getTeamName(team) + '" Team-এর Player Limit পূর্ণ হয়েছে।\n\n' +
                "বর্তমান Player: " + currentCount + "\n" +
                "সর্বোচ্চ Limit: " + limit + "\n\n" +
                "আরও Player যোগ করতে Teams বিভাগে গিয়ে Player Limit বাড়ান।"
            );

            return false;
        }

        return true;
    }

    function getPlayerTeamName(player) {
        const team = getTeamById(player.teamId);
        return team ? getTeamName(team) : (player.teamName || "Team unavailable");
    }

    // ==========================================
    // SAFE HTML HELPERS
    // ==========================================

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[char];
        });
    }

    function getInitials(name) {
        const words = String(name || "").trim().split(/\s+/);

        if (!words[0]) return "P";

        return words
            .slice(0, 2)
            .map(word => word.charAt(0))
            .join("")
            .toUpperCase();
    }

    // ==========================================
    // TEAM DROPDOWN
    // ==========================================

    function renderTeamOptions(selectedId = "") {
        const teams = getTeams();

        playerTeam.innerHTML =
            '<option value="">Select team</option>';

        teams.forEach(team => {
            const id = getTeamId(team);

            if (!id) return;

            const option = document.createElement("option");
            option.value = id;

            const shortName = team.shortName
                ? " (" + team.shortName + ")"
                : "";

            option.textContent = getTeamName(team) + shortName;
            option.selected = id === String(selectedId);

            playerTeam.appendChild(option);
        });

        renderTeamFilter();
    }

    // ==========================================
    // SEARCH AND TEAM FILTER
    // ==========================================

    function createSearchAndFilter() {
        const panel = playerList.closest(".player-list-panel");

        if (!panel || $("playerSearch")) return;

        const controls = document.createElement("div");

        controls.className = "player-search-controls";

        controls.style.cssText = [
            "display:flex",
            "flex-wrap:wrap",
            "gap:12px",
            "margin:18px 0",
            "align-items:center"
        ].join(";");

        controls.innerHTML = `
            <input
                type="search"
                id="playerSearch"
                placeholder="Search ID, name, jersey or team..."
                aria-label="Search players"
                style="flex:1;min-width:180px;padding:12px 14px;
                border-radius:10px;border:1px solid #34394d;
                background:#171b2a;color:#fff;"
            >

            <select
                id="playerTeamFilter"
                aria-label="Filter players by team"
                style="flex:0 1 220px;min-width:160px;padding:12px;
                border-radius:10px;border:1px solid #34394d;
                background:#171b2a;color:#fff;"
            >
                <option value="all">All Teams</option>
            </select>
        `;

        playerList.parentNode.insertBefore(controls, playerList);

        $("playerSearch").addEventListener("input", function () {
            searchText = this.value.trim().toLowerCase();
            renderPlayers();
        });

        $("playerTeamFilter").addEventListener("change", function () {
            selectedTeamFilter = this.value;
            renderPlayers();
        });

        renderTeamFilter();
    }

    function renderTeamFilter() {
        const filter = $("playerTeamFilter");
        if (!filter) return;

        const previousValue = selectedTeamFilter;
        const teams = getTeams();

        filter.innerHTML = '<option value="all">All Teams</option>';

        teams.forEach(team => {
            const id = getTeamId(team);
            if (!id) return;

            const option = document.createElement("option");
            option.value = id;
            option.textContent = getTeamName(team);
            filter.appendChild(option);
        });

        const optionExists = Array.from(filter.options).some(
            option => option.value === previousValue
        );

        selectedTeamFilter = optionExists ? previousValue : "all";
        filter.value = selectedTeamFilter;
    }

    // ==========================================
    // PROFILE PHOTO PREVIEW
    // ==========================================

    function createPhotoPreview() {
        if (!playerPhoto) return;

        let preview = $("playerPhotoPreview");

        if (!preview) {
            preview = document.createElement("img");
            preview.id = "playerPhotoPreview";
            preview.alt = "Player profile photo preview";

            preview.style.cssText = [
                "display:none",
                "width:100px",
                "height:100px",
                "object-fit:cover",
                "border-radius:50%",
                "margin-top:12px",
                "border:2px solid #635bff"
            ].join(";");

            playerPhoto.insertAdjacentElement("afterend", preview);
        }

        playerPhoto.addEventListener("change", function () {
            const file = this.files && this.files[0];

            if (!file) return;

            if (!file.type.startsWith("image/")) {
                alert("অনুগ্রহ করে একটি ছবির ফাইল নির্বাচন করুন।");
                this.value = "";
                return;
            }

            // Original upload limit: 8 MB
            if (file.size > 8 * 1024 * 1024) {
                alert("ছবির সাইজ ৮ MB-এর কম রাখুন।");
                this.value = "";
                return;
            }

            const reader = new FileReader();

            reader.onload = function (event) {
                preview.src = event.target.result;
                preview.style.display = "block";
            };

            reader.onerror = function () {
                alert("ছবিটি খোলা যায়নি। অন্য ছবি চেষ্টা করুন।");
            };

            reader.readAsDataURL(file);
        });
    }

    // Resize and compress the photo before saving it.
    function compressPhoto(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                resolve(currentPhoto);
                return;
            }

            const reader = new FileReader();

            reader.onerror = () => reject(
                new Error("ছবিটি পড়া যায়নি।")
            );

            reader.onload = function (event) {
                const image = new Image();

                image.onerror = () => reject(
                    new Error("ছবিটি প্রসেস করা যায়নি।")
                );

                image.onload = function () {
                    const maxSize = 400;
                    const scale = Math.min(
                        1,
                        maxSize / Math.max(image.width, image.height)
                    );

                    const canvas = document.createElement("canvas");

                    canvas.width = Math.max(
                        1,
                        Math.round(image.width * scale)
                    );

                    canvas.height = Math.max(
                        1,
                        Math.round(image.height * scale)
                    );

                    const context = canvas.getContext("2d");

                    if (!context) {
                        reject(new Error("ছবি প্রসেস করার সুবিধা পাওয়া যায়নি।"));
                        return;
                    }

                    context.drawImage(
                        image,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );

                    try {
                        resolve(
                            canvas.toDataURL("image/jpeg", 0.75)
                        );
                    } catch (error) {
                        reject(error);
                    }
                };

                image.src = event.target.result;
            };

            reader.readAsDataURL(file);
        });
    }

    // ==========================================
    // FORM HELPERS
    // ==========================================

    function getNumber(id, optional = false) {
        const input = $(id);

        if (!input) return 0;

        const raw = input.value.trim();

        if (optional && raw === "") return null;

        return Number(raw);
    }

    function validateNumbers() {
        const numericFields = [
            ["playerJersey", "Jersey Number", 1, 99, false],
            ["playerAge", "Age", 1, 100, true],
            ["playerMatches", "Matches Played", 0, 1000000, false],
            ["playerGoals", "Goals", 0, 1000000, false],
            ["playerAssists", "Assists", 0, 1000000, false],
            ["playerYellowCards", "Yellow Cards", 0, 1000000, false],
            ["playerRedCards", "Red Cards", 0, 1000000, false],
            ["playerCleanSheets", "Clean Sheets", 0, 1000000, false],
            ["playerSaves", "Goalkeeper Saves", 0, 1000000, false]
        ];

        for (const [id, label, min, max, optional] of numericFields) {
            const input = $(id);
            if (!input) continue;

            const raw = input.value.trim();

            if (optional && raw === "") continue;

            const value = Number(raw);

            if (
                raw === "" ||
                !Number.isInteger(value) ||
                value < min ||
                value > max
            ) {
                alert(
                    label + " সঠিকভাবে লিখুন। অনুমোদিত মান: " +
                    min + " থেকে " + max + "।"
                );

                input.focus();
                return false;
            }
        }

        return true;
    }

    function resetPlayerForm() {
        playerForm.reset();

        editingPlayerId = null;
        currentPhoto = "";

        // নতুন Player-এর জন্য ID ম্যানুয়ালি লিখতে হবে।
        if (playerIdInput) {
            playerIdInput.readOnly = false;
            playerIdInput.value = "";
        }

        if (playerPhoto) playerPhoto.value = "";

        const preview = $("playerPhotoPreview");

        if (preview) {
            preview.removeAttribute("src");
            preview.style.display = "none";
        }

        const title = $("playerFormTitle");
        if (title) title.textContent = "Register New Player";

        const submitBtn = playerForm.querySelector('[type="submit"]');

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Player";
        }

        formPanel.hidden = true;
        renderTeamOptions();
    }

    function openPlayerForm() {
        renderTeamOptions();

        if (getTeams().length === 0) {
            alert("Player যোগ করার আগে Teams বিভাগে অন্তত একটি Team তৈরি করুন।");
            return;
        }

        if (!editingPlayerId && playerIdInput) {
            playerIdInput.readOnly = false;
        }

        formPanel.hidden = false;

        formPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    // ==========================================
    // ADD / UPDATE PLAYER
    // ==========================================

    playerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!playerForm.reportValidity()) return;
        if (!validateNumbers()) return;

        const name = $("playerName").value.trim();
        const jerseyNumber = getNumber("playerJersey");
        const position = $("playerPosition").value;
        const teamId = playerTeam.value;

        const team = getTeamById(teamId);

        if (!team) {
            alert("একটি বৈধ Team নির্বাচন করুন।");
            return;
        }

        const players = getPlayers();

        const enteredPlayerId = playerIdInput
            ? playerIdInput.value.trim()
            : "";

        if (!enteredPlayerId) {
            alert("Player ID লিখুন।");
            if (playerIdInput) playerIdInput.focus();
            return;
        }

        // Player ID সব Team মিলিয়ে ইউনিক হবে।
        const duplicatePlayerId = players.some(player =>
            String(player.id ?? "").trim().toLowerCase() ===
                enteredPlayerId.toLowerCase() &&
            String(player.id ?? "") !== String(editingPlayerId ?? "")
        );

        if (duplicatePlayerId) {
            alert(
                "এই Player ID ইতোমধ্যে ব্যবহার করা হয়েছে। " +
                "অন্য একটি ID দিন।"
            );

            if (playerIdInput) playerIdInput.focus();
            return;
        }

        // একই Team-এ Jersey Number ইউনিক হবে।
        const duplicateJersey = players.some(player =>
            getPlayerTeamId(player) === String(teamId) &&
            Number(player.jerseyNumber ?? player.jersey) === jerseyNumber &&
            String(player.id ?? "") !== String(editingPlayerId ?? "")
        );

        if (duplicateJersey) {
            alert(
                "এই Team-এ Jersey Number " + jerseyNumber +
                " ইতোমধ্যে ব্যবহার করা হয়েছে। অন্য নম্বর দিন।"
            );

            $("playerJersey").focus();
            return;
        }

        const submitBtn = playerForm.querySelector('[type="submit"]');

        const originalButtonText = submitBtn
            ? submitBtn.textContent
            : "Save Player";

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving...";
        }

        try {
            const photoFile = playerPhoto &&
                playerPhoto.files &&
                playerPhoto.files[0];

            const photo = await compressPhoto(photoFile);

            // ছবি প্রসেস হওয়ার পরে সর্বশেষ Storage থেকে Player নেওয়া।
            const latestPlayers = getPlayers();

            const oldPlayer = editingPlayerId
                ? latestPlayers.find(
                    player =>
                        String(player.id) === String(editingPlayerId)
                )
                : null;

            if (editingPlayerId && !oldPlayer) {
                alert(
                    "আপডেট করার Player-কে Storage-এ পাওয়া যায়নি। " +
                    "Player List আবার দেখুন।"
                );
                return;
            }

            // Player Limit যাচাই:
            // নতুন Player হলে সম্পূর্ণ বর্তমান roster গণনা হবে।
            // Edit করলে একই Player-কে গণনা থেকে বাদ দেওয়া হবে।
            // অন্য Team-এ স্থানান্তর করলেও গন্তব্য Team-এর Limit যাচাই হবে।
            if (
                !validateTeamPlayerLimit(
                    teamId,
                    latestPlayers,
                    oldPlayer ? oldPlayer.id : null
                )
            ) {
                return;
            }

            // পুরোনো ID অপরিবর্তিত থাকবে।
            const finalPlayerId = oldPlayer
                ? oldPlayer.id
                : enteredPlayerId;

            // সর্বশেষ Storage-এ ID সংঘর্ষ আবার যাচাই।
            const idConflict = latestPlayers.some(player =>
                String(player.id ?? "").trim().toLowerCase() ===
                    String(finalPlayerId).trim().toLowerCase() &&
                String(player.id ?? "") !== String(editingPlayerId ?? "")
            );

            if (idConflict) {
                alert("এই Player ID ইতোমধ্যে ব্যবহার করা হয়েছে। অন্য ID দিন।");
                if (playerIdInput) playerIdInput.focus();
                return;
            }

            // Jersey Number-এর সর্বশেষ যাচাই।
            const latestDuplicateJersey = latestPlayers.some(player =>
                getPlayerTeamId(player) === String(teamId) &&
                Number(player.jerseyNumber ?? player.jersey) === jerseyNumber &&
                String(player.id ?? "") !== String(editingPlayerId ?? "")
            );

            if (latestDuplicateJersey) {
                alert(
                    "এই Team-এ Jersey Number " + jerseyNumber +
                    " ইতোমধ্যে ব্যবহার করা হয়েছে। অন্য নম্বর দিন।"
                );

                $("playerJersey").focus();
                return;
            }

            const now = new Date().toISOString();

            const playerData = {
                id: finalPlayerId,

                name: name,
                jerseyNumber: jerseyNumber,
                position: position,

                teamId: String(teamId),
                teamName: getTeamName(team),

                nationality: $("playerNationality").value.trim(),
                age: getNumber("playerAge", true),

                photo: photo || "",

                matchesPlayed: oldPlayer?.matchesPlayed ?? 0,
                goals: oldPlayer?.goals ?? 0,
                assists: oldPlayer?.assists ?? 0,
                yellowCards: oldPlayer?.yellowCards ?? 0,
                redCards: oldPlayer?.redCards ?? 0,
                cleanSheets: oldPlayer?.cleanSheets ?? 0,
                saves: oldPlayer?.saves ?? 0,

                createdAt: oldPlayer
                    ? oldPlayer.createdAt
                    : now,

                updatedAt: now
            };

            let updatedPlayers;

            if (oldPlayer) {
                updatedPlayers = latestPlayers.map(player =>
                    String(player.id) === String(editingPlayerId)
                        ? playerData
                        : player
                );
            } else {
                updatedPlayers = [...latestPlayers, playerData];
            }

            if (!savePlayers(updatedPlayers)) return;

            resetPlayerForm();
            renderPlayers();
            updateDashboardPlayerCount();

            // একই ব্রাউজারের Team Card-এ Player count আপডেট।
            window.dispatchEvent(
                new CustomEvent("matchcraft:players-updated")
            );

            alert(
                oldPlayer
                    ? "Player-এর তথ্য সফলভাবে আপডেট হয়েছে।"
                    : "নতুন Player সফলভাবে যোগ হয়েছে।"
            );

        } catch (error) {
            console.error("Player processing error:", error);

            alert(
                "Player সংরক্ষণ করার সময় সমস্যা হয়েছে। " +
                "অন্য একটি ছবি দিয়ে আবার চেষ্টা করুন।"
            );
       } finally {
            if (submitBtn) {
                submitBtn.disabled = false;

                submitBtn.textContent = editingPlayerId
                    ? "Update Player"
                    : "Save Player";
            }
        }
    });

    // ==========================================
    // PLAYER PROFILE / DETAILS STYLES
    // ==========================================

    function addPlayerProfileStyles() {
        if ($("matchcraftPlayerProfileStyles")) return;

        const style = document.createElement("style");
        style.id = "matchcraftPlayerProfileStyles";

        style.textContent = `
            .player-profile-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 18px;
                margin-top: 18px;
            }

            .player-profile-tile {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 10px;
                min-width: 0;
                padding: 22px 12px;
                color: #fff;
                text-align: center;
                background: #171b2a;
                border: 1px solid #34394d;
                border-radius: 16px;
                cursor: pointer;
                transition: transform .2s, border-color .2s,
                            background .2s;
            }

            .player-profile-tile:hover,
            .player-profile-tile:focus-visible {
                transform: translateY(-3px);
                border-color: #8075ff;
                background: #20243a;
                outline: none;
            }

            .player-profile-photo {
                width: 92px;
                height: 92px;
                object-fit: cover;
                border-radius: 50%;
                border: 3px solid #635bff;
                background: #252343;
            }

            .player-profile-name {
                width: 100%;
                margin: 0;
                overflow-wrap: anywhere;
                font-size: 15px;
                font-weight: 700;
            }

            .player-profile-id {
                margin: 0;
                color: #b8b9d3;
                font-size: 12px;
                overflow-wrap: anywhere;
            }

            .player-details-page {
                padding: 22px;
                color: #f5f5ff;
                background: #171b2a;
                border: 1px solid #34394d;
                border-radius: 18px;
            }

            .player-details-header {
                display: flex;
                align-items: center;
                gap: 20px;
                flex-wrap: wrap;
                padding-bottom: 22px;
                border-bottom: 1px solid #34394d;
            }

            .player-details-photo {
                width: 112px;
                height: 112px;
                flex-shrink: 0;
                object-fit: cover;
                border: 3px solid #635bff;
                border-radius: 50%;
                background: #252343;
            }

            .player-details-heading {
                flex: 1;
                min-width: 160px;
            }

            .player-details-heading h2 {
                margin: 0 0 8px;
                overflow-wrap: anywhere;
            }

            .player-details-heading p {
                margin: 5px 0;
                color: #b8b9d3;
                overflow-wrap: anywhere;
            }

            .player-details-section-title {
                margin: 24px 0 12px;
                font-size: 16px;
            }

            .player-details-info-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
                gap: 12px;
            }

            .player-details-info-item {
                min-width: 0;
                padding: 14px;
                background: #20243a;
                border: 1px solid #34394d;
                border-radius: 12px;
            }

            .player-details-info-item small {
                display: block;
                margin-bottom: 7px;
                color: #b8b9d3;
            }

            .player-details-info-item strong {
                overflow-wrap: anywhere;
            }

            .player-details-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                gap: 12px;
            }

            .player-details-stat {
                padding: 16px 10px;
                text-align: center;
                background: #252343;
                border: 1px solid #45406e;
                border-radius: 12px;
            }

            .player-details-stat strong {
                display: block;
                margin-bottom: 6px;
                font-size: 24px;
                color: #c7c2ff;
            }

            .player-details-stat span {
                color: #d1d1e5;
                font-size: 12px;
            }

            .player-details-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 24px;
            }

            .player-details-actions button {
                padding: 11px 18px;
                color: #fff;
                border: 1px solid #454b63;
                border-radius: 9px;
                background: #292e42;
                cursor: pointer;
            }

            .player-details-actions .player-details-edit {
                background: #635bff;
                border-color: #635bff;
            }

            .player-details-actions .player-details-delete {
                background: #922f45;
                border-color: #922f45;
            }

            .player-details-actions button:hover {
                filter: brightness(1.15);
            }

            @media (max-width: 480px) {
                .player-profile-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px;
                }

                .player-profile-tile {
                    padding: 16px 8px;
                }

                .player-profile-photo {
                    width: 76px;
                    height: 76px;
                }

                .player-details-page {
                    padding: 14px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ==========================================
    // RENDER PLAYER PROFILES
    // ==========================================

    function renderPlayers() {
        const players = getPlayers();

        // Details Page খোলা থাকলে Player List আবার আঁকা হবে না।
        if (currentDetailsPlayerId !== null) {
            const currentPlayer = players.find(
                player =>
                    String(player.id) === String(currentDetailsPlayerId)
            );

            if (currentPlayer) {
                renderPlayerDetails(currentPlayer);
                return;
            }

            currentDetailsPlayerId = null;
            showPlayerListControls(true);
        }

        const filteredPlayers = players.filter(player => {
            const id = String(player.id || "").toLowerCase();
            const name = String(player.name || "").toLowerCase();

            const jersey = String(
                player.jerseyNumber ?? player.jersey ?? ""
            ).toLowerCase();

            const teamName = String(
                getPlayerTeamName(player)
            ).toLowerCase();

            const matchesSearch =
                !searchText ||
                id.includes(searchText) ||
                name.includes(searchText) ||
                jersey.includes(searchText) ||
                teamName.includes(searchText);

            const matchesTeam =
                selectedTeamFilter === "all" ||
                getPlayerTeamId(player) === selectedTeamFilter;

            return matchesSearch && matchesTeam;
        });

        playerCount.textContent = filteredPlayers.length + " PLAYERS";

        if (filteredPlayers.length === 0) {
            playerList.innerHTML = `
                <div class="player-empty-state">
                    <i class="fas fa-users"></i>
                    <h3>${players.length ? "No Matching Players" : "No Players Yet"}</h3>
                    <p>${
                        players.length
                            ? "Try a different search or team filter."
                            : "Add your first player to get started."
                    }</p>
                </div>
            `;
            return;
        }

        playerList.innerHTML = `
            <div class="player-profile-grid">
                ${filteredPlayers.map(player => {
                    const id = escapeHTML(player.id);
                    const name = escapeHTML(player.name || "Unnamed Player");

                    const photoMarkup = player.photo
                        ? `
                            <img
                                src="${escapeHTML(player.photo)}"
                                alt="${name}"
                                class="player-profile-photo"
                            >
                        `
                        : `
                            <div
                                class="player-profile-photo"
                                style="display:flex;align-items:center;
                                justify-content:center;font-size:26px;
                                font-weight:700;color:#c7c2ff;"
                                aria-hidden="true"
                            >${escapeHTML(getInitials(player.name))}</div>
                        `;

                    return `
                        <button
                            type="button"
                            class="player-profile-tile"
                            data-action="details"
                            data-id="${id}"
                            aria-label="View details for ${name}, Player ID ${id}"
                        >
                            ${photoMarkup}
                            <h3 class="player-profile-name">${name}</h3>
                            <p class="player-profile-id">Player ID: ${id}</p>
                        </button>
                    `;
                }).join("")}
            </div>
        `;
    }

    // ==========================================
    // SHOW / HIDE PLAYER LIST CONTROLS
    // ==========================================

    function showPlayerListControls(show) {
        const controls = document.querySelector(".player-search-controls");

        if (controls) {
            controls.hidden = !show;
        }

        playerCount.hidden = !show;
    }

    // ==========================================
    // OPEN PLAYER DETAILS PAGE
    // ==========================================

    function openPlayerDetails(player) {
        lastListScrollY = window.scrollY;
        currentDetailsPlayerId = player.id;

        formPanel.hidden = true;

        showPlayerListControls(false);
        renderPlayerDetails(player);

        playerList.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    // ==========================================
    // RENDER PLAYER DETAILS PAGE
    // ==========================================

    function renderPlayerDetails(player) {
        const name = escapeHTML(player.name || "Unnamed Player");
        const id = escapeHTML(player.id);
        const jersey = escapeHTML(
            player.jerseyNumber ?? player.jersey ?? "—"
        );
        const position = escapeHTML(player.position || "—");
        const teamName = escapeHTML(getPlayerTeamName(player));
        const nationality = escapeHTML(player.nationality || "Not specified");

        const age =
            player.age == null || player.age === ""
                ? "—"
                : escapeHTML(player.age);

        const photoMarkup = player.photo
            ? `
                <img
                    src="${escapeHTML(player.photo)}"
                    alt="${name}"
                    class="player-details-photo"
                >
            `
            : `
                <div
                    class="player-details-photo"
                    style="display:flex;align-items:center;
                    justify-content:center;font-size:32px;
                    font-weight:700;color:#c7c2ff;"
                    aria-hidden="true"
                >${escapeHTML(getInitials(player.name))}</div>
            `;

        const stats = [
            ["Matches Played", player.matchesPlayed],
            ["Goals", player.goals],
            ["Assists", player.assists],
            ["Yellow Cards", player.yellowCards],
            ["Red Cards", player.redCards],
            ["Clean Sheets", player.cleanSheets],
            ["Goalkeeper Saves", player.saves]
        ];

        playerList.innerHTML = `
            <section class="player-details-page" aria-label="Player details">

                <div class="player-details-header">
                    ${photoMarkup}

                    <div class="player-details-heading">
                        <h2>${name}</h2>
                        <p>Player ID: ${id}</p>
                        <p>${teamName}</p>
                    </div>
                </div>

                <h3 class="player-details-section-title">Player Information</h3>

                <div class="player-details-info-grid">
                    <div class="player-details-info-item">
                        <small>Full Name</small>
                        <strong>${name}</strong>
                    </div>

                    <div class="player-details-info-item">
                        <small>Player ID</small>
                        <strong>${id}</strong>
                    </div>

                    <div class="player-details-info-item">
                        <small>Jersey Number</small>
                        <strong>${jersey}</strong>
                    </div>

                    <div class="player-details-info-item">
                        <small>Position</small>
                        <strong>${position}</strong>
                    </div>

                    <div class="player-details-info-item">
                        <small>Team</small>
                        <strong>${teamName}</strong>
                    </div>

                    <div class="player-details-info-item">
                        <small>Nationality</small>
                        <strong>${nationality}</strong>
                    </div>

                    <div class="player-details-info-item">
                        <small>Age</small>
                        <strong>${age}</strong>
                    </div>
                </div>

                <h3 class="player-details-section-title">Player Statistics</h3>

                <div class="player-details-stats-grid">
                    ${stats.map(([label, value]) => `
                        <div class="player-details-stat">
                            <strong>${escapeHTML(value ?? 0)}</strong>
                            <span>${label}</span>
                        </div>
                    `).join("")}
                </div>

                <div class="player-details-actions">
                    <button
                        type="button"
                        data-action="edit"
                        data-id="${id}"
                        class="player-details-edit"
                    >
                        <i class="fas fa-edit"></i> Edit Player
                    </button>

                    <button
                        type="button"
                        data-action="delete"
                        data-id="${id}"
                        class="player-details-delete"
                    >
                        <i class="fas fa-trash"></i> Delete Player
                    </button>

                    <button
                        type="button"
                        data-action="close-details"
                    >
                        <i class="fas fa-arrow-left"></i> Close
                    </button>
                </div>
            </section>
        `;
    }

    // ==========================================
    // PROFILE / EDIT / DELETE ACTIONS
    // ==========================================

    playerList.addEventListener("click", function (event) {
        const button = event.target.closest("button[data-action]");

        if (!button || !playerList.contains(button)) return;

        const action = button.dataset.action;

        if (action === "close-details") {
            currentDetailsPlayerId = null;

            showPlayerListControls(true);
            renderPlayers();

            window.scrollTo({
                top: lastListScrollY,
                behavior: "smooth"
            });

            return;
        }

        const id = button.dataset.id;

        const player = getPlayers().find(
            item => String(item.id) === String(id)
        );

        if (!player) {
            alert("Player-এর তথ্য পাওয়া যায়নি।");

            currentDetailsPlayerId = null;
            showPlayerListControls(true);
            renderPlayers();

            return;
        }

        if (action === "details") {
            openPlayerDetails(player);
            return;
        }

        if (action === "edit") {
            currentDetailsPlayerId = null;

            showPlayerListControls(true);
            renderPlayers();

            editingPlayerId = player.id;
            currentPhoto = player.photo || "";

            if (playerIdInput) {
                playerIdInput.value = player.id;
                playerIdInput.readOnly = true;
            }

            $("playerName").value = player.name || "";

            $("playerJersey").value =
                player.jerseyNumber ?? player.jersey ?? "";

            $("playerPosition").value = player.position || "";

            renderTeamOptions(player.teamId || "");

            $("playerNationality").value = player.nationality || "";
            $("playerAge").value = player.age ?? "";

            if (playerPhoto) playerPhoto.value = "";

            const preview = $("playerPhotoPreview");

            if (preview) {
                if (currentPhoto) {
                    preview.src = currentPhoto;
                    preview.style.display = "block";
                } else {
                    preview.removeAttribute("src");
                    preview.style.display = "none";
                }
            }

            const title = $("playerFormTitle");

            if (title) {
                title.textContent = "Edit Player";
            }

            const submitBtn = playerForm.querySelector('[type="submit"]');

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Update Player";
            }

            formPanel.hidden = false;

            formPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            return;
        }

        if (action === "delete") {
            const confirmed = confirm(
                "আপনি কি " + player.name +
                " Player-কে মুছে ফেলতে চান? " +
                "এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।"
            );

            if (!confirmed) return;

            const updatedPlayers = getPlayers().filter(
                item => String(item.id) !== String(id)
            );

            if (!savePlayers(updatedPlayers)) return;

            if (String(editingPlayerId) === String(id)) {
                resetPlayerForm();
            }

            currentDetailsPlayerId = null;

            showPlayerListControls(true);
            renderPlayers();
            updateDashboardPlayerCount();

            window.dispatchEvent(
                new CustomEvent("matchcraft:players-updated")
            );

            window.scrollTo({
                top: lastListScrollY,
                behavior: "smooth"
            });
        }
    });

    // ==========================================
    // DASHBOARD PLAYER COUNT
    // ==========================================

    function updateDashboardPlayerCount() {
        if (typeof window.updateDashboardStats === "function") {
            window.updateDashboardStats();
        } else {
            const totalPlayers = $("totalPlayers");

            if (totalPlayers) {
                totalPlayers.textContent = getPlayers().length;
            }
        }
    }

    // ==========================================
    // BUTTONS
    // ==========================================

    showFormBtn.addEventListener("click", openPlayerForm);

    cancelFormBtn.addEventListener("click", resetPlayerForm);

    // ==========================================
    // SIDEBAR NAVIGATION
    // ==========================================

    document.querySelectorAll('[data-page="players"]').forEach(link => {
        link.addEventListener("click", function () {
            currentDetailsPlayerId = null;
            showPlayerListControls(true);

            const pageIds = [
                "dashboard",
                "tournaments",
                "teams",
                "players",
                "matches",
                "fixtures",
                "standings",
                "statistics",
                "help"
            ];

            pageIds.forEach(id => {
                const page = $(id);
                if (page) page.hidden = id !== "players";
            });

            section.hidden = false;

            const mobileTitle = document.querySelector(".mobile-page-title");

            if (mobileTitle) {
                mobileTitle.textContent = "Players";
            }

            const checkbox = $("check");
            if (checkbox) checkbox.checked = false;

            renderTeamOptions();
            renderPlayers();
            updateDashboardPlayerCount();
        });
    });

    // ==========================================
    // INITIALIZE
    // ==========================================

    // Player ID আর স্বয়ংক্রিয়ভাবে তৈরি হবে না।
    if (playerIdInput) {
        playerIdInput.value = "";
        playerIdInput.readOnly = false;
    }

    addPlayerProfileStyles();
    createSearchAndFilter();
    createPhotoPreview();
    renderTeamOptions();
    renderPlayers();
    updateDashboardPlayerCount();

})();
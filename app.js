/* ==========================================
   MATCHCRAFT - Sidebar & Mobile Navigation
========================================== */

const menuCheckbox = document.getElementById("check");
const mobilePageTitle = document.querySelector(".mobile-page-title");
const menuLinks = document.querySelectorAll(".sidebar_menu .menu a");

menuLinks.forEach(function (link) {
    link.addEventListener("click", function () {
        const pageNameElement = link.querySelector("span");
        const pageName = pageNameElement
            ? pageNameElement.textContent.trim()
            : link.textContent.trim();

        if (mobilePageTitle) {
            mobilePageTitle.textContent = pageName;
        }

        if (menuCheckbox) {
            menuCheckbox.checked = false;
        }
    });
});


/* ==========================================
   MATCHCRAFT - Dashboard Statistics
========================================== */

function getStoredCount(storageKey) {
    try {
        const storedData = localStorage.getItem(storageKey);

        if (!storedData) {
            return 0;
        }

        const data = JSON.parse(storedData);

        if (Array.isArray(data)) {
            return data.length;
        }

        if (data && typeof data === "object") {
            return Object.keys(data).length;
        }

        return 0;
    } catch (error) {
        console.error("Statistics read error:", storageKey, error);
        return 0;
    }
}

function updateDashboardStats() {
    const statistics = [
        {
            id: "totalTournaments",
            key: "matchcraft_tournaments"
        },
        {
            id: "totalTeams",
            key: "matchcraft_teams"
        },
        {
            id: "totalPlayers",
            key: "matchcraft_players"
        },
        {
            id: "totalMatches",
            key: "matchcraft_matches"
        }
    ];

    statistics.forEach(function (item) {
        const element = document.getElementById(item.id);

        if (element) {
            const count = getStoredCount(item.key);
            element.textContent = String(count).padStart(2, "0");
        }
    });
}


/* ==========================================
   MATCHCRAFT - Tournament Management
========================================== */

(function () {
    "use strict";

    const STORAGE_KEY = "matchcraft_tournaments";

    let editingTournamentId = null;

    /* ---------- HTML Elements ---------- */

    const tournamentList = document.getElementById("tournamentList");
    const tournamentCount = document.getElementById("tournamentCount");

    const tournamentFormPanel = document.getElementById(
        "tournamentFormPanel"
    );

    const tournamentForm = document.getElementById("tournamentForm");

    const showFormButton = document.getElementById("showTournamentForm");
    const cancelFormButton = document.getElementById("cancelTournamentForm");

    const tournamentNameInput = document.getElementById("tournamentName");
    const tournamentTypeInput = document.getElementById("tournamentType");

    const totalTeamsInput = document.getElementById(
        "tournamentTotalTeams"
    );

    const groupsField = document.getElementById(
        "tournamentGroupsField"
    );

    const groupCountInput = document.getElementById(
        "tournamentGroupCount"
    );

    const seasonInput = document.getElementById("tournamentSeason");
    const startDateInput = document.getElementById("tournamentStartDate");
    const endDateInput = document.getElementById("tournamentEndDate");
    const statusInput = document.getElementById("tournamentStatus");


    /* ---------- Read Tournament Data ---------- */

    function getTournaments() {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);

            if (!storedData) {
                return [];
            }

            const tournaments = JSON.parse(storedData);

            return Array.isArray(tournaments) ? tournaments : [];
        } catch (error) {
            console.error("Could not read tournaments:", error);
            return [];
        }
    }


    /* ---------- Save Tournament Data ---------- */

    function saveTournaments(tournaments) {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(tournaments)
            );

            return true;
        } catch (error) {
            console.error("Could not save tournaments:", error);
            alert(
                "Tournament সংরক্ষণ করা যায়নি। আপনার ব্রাউজারের LocalStorage পরীক্ষা করুন।"
            );

            return false;
        }
    }


    /* ---------- Update Tournament Statistics ---------- */

    function updateTournamentStats() {
        const tournaments = getTournaments();

        if (tournamentCount) {
            tournamentCount.textContent = String(tournaments.length);
        }

        updateDashboardStats();
    }


    /* ---------- Group Count Show / Hide ---------- */

    function updateGroupField() {
        if (!tournamentTypeInput || !groupsField || !groupCountInput) {
            return;
        }

        const isGroupStage =
            tournamentTypeInput.value === "Group Stage";

        groupsField.hidden = !isGroupStage;

        /*
         * The !important display rule prevents the label's
         * CSS display:flex from overriding the hidden attribute.
         */
        if (isGroupStage) {
            groupsField.style.removeProperty("display");
        } else {
            groupsField.style.setProperty(
                "display",
                "none",
                "important"
            );

            groupCountInput.value = "";
        }

        groupCountInput.required = isGroupStage;
    }

    if (tournamentTypeInput) {
        tournamentTypeInput.addEventListener(
            "change",
            updateGroupField
        );
    }


    /* ---------- Tournament Details Modal ---------- */

function showTournamentDetails(tournament) {
    const teams = (function () {
        try {
            const saved = JSON.parse(
                localStorage.getItem("matchcraft_teams") || "[]"
            );

            return Array.isArray(saved) ? saved : [];
        } catch (error) {
            return [];
        }
    })();

    const tournamentId = String(tournament.id);

    const assignedTeams = teams.filter(function (team) {
        return String(
            team.tournamentId ?? team.tournament ?? ""
        ) === tournamentId;
    });

    const escapeText = function (value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char];
        });
    };

    let modal = document.getElementById("tournamentDetailsModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "tournamentDetailsModal";
        modal.className = "tournament-details-overlay";

        document.body.appendChild(modal);
    }

    const teamRows = assignedTeams.length
        ? assignedTeams.map(function (team, index) {
            return `
                <div class="tournament-details-team">
                    <span class="tournament-details-team-number">
                        ${index + 1}
                    </span>

                    <div class="tournament-details-team-info">
                        <strong>${escapeText(team.name || "Unnamed Team")}</strong>
                        <span>
                            ${escapeText(team.shortName || "TEAM")}
                            · ${escapeText(team.city || "Location not provided")}
                        </span>
                    </div>
                </div>
            `;
        }).join("")
        : `
            <div class="tournament-details-empty">
                <i class="fas fa-shield-halved"></i>
                <p>No Teams Assigned</p>
                <span>এই টুর্নামেন্টে এখনো কোনো টিম যুক্ত নেই।</span>
            </div>
        `;

    const capacity = Number(tournament.totalTeams);
    const validCapacity = Number.isFinite(capacity) && capacity >= 0;
    const remaining = validCapacity
        ? Math.max(0, capacity - assignedTeams.length)
        : null;

    modal.innerHTML = `
        <div class="tournament-details-dialog"
             role="dialog"
             aria-modal="true"
             aria-labelledby="tournamentDetailsTitle">

            <div class="tournament-details-header">
                <div>
                    <span class="tournament-details-eyebrow">
                        MATCHCRAFT · TOURNAMENT
                    </span>

                    <h2 id="tournamentDetailsTitle">
                        ${escapeText(tournament.name || "Tournament Details")}
                    </h2>

                    <p>
                        ${escapeText(tournament.season || "Season not specified")}
                    </p>
                </div>

                <button
                    type="button"
                    class="tournament-details-close"
                    data-close-details
                    aria-label="Close details"
                >&times;</button>
            </div>

            <div class="tournament-details-stats">
                <div class="tournament-details-stat">
                    <span>Registered Teams</span>
                    <strong>${assignedTeams.length}</strong>
                </div>

                <div class="tournament-details-stat">
                    <span>Team Capacity</span>
                    <strong>${validCapacity ? capacity : "—"}</strong>
                </div>

                <div class="tournament-details-stat">
                    <span>Available Slots</span>
                    <strong>${remaining === null ? "—" : remaining}</strong>
                </div>
            </div>

            <div class="tournament-details-information">
                <h3>Tournament Information</h3>

                <div class="tournament-details-info-grid">
                    <div>
                        <span>Type</span>
                        <strong>${escapeText(tournament.type || "—")}</strong>
                    </div>

                    <div>
                        <span>Status</span>
                        <strong>${escapeText(tournament.status || "Upcoming")}</strong>
                    </div>

                    <div>
                        <span>Start Date</span>
                        <strong>${escapeText(tournament.startDate || "—")}</strong>
                    </div>

                    <div>
                        <span>End Date</span>
                        <strong>${escapeText(tournament.endDate || "—")}</strong>
                    </div>
                </div>
            </div>

            <div class="tournament-details-team-section">
                <div class="tournament-details-team-heading">
                    <h3>Participating Teams</h3>
                    <span>${assignedTeams.length} Teams</span>
                </div>

                <div class="tournament-details-team-list">
                    ${teamRows}
                </div>
            </div>

            <div class="tournament-details-footer">
                <button type="button"
                        class="tournament-details-done"
                        data-close-details>
                    Close
                </button>
            </div>
        </div>
    `;

    modal.hidden = false;

    modal.querySelectorAll("[data-close-details]").forEach(function (button) {
        button.addEventListener("click", function () {
            modal.hidden = true;
        });
    });

    modal.onclick = function (event) {
        if (event.target === modal) {
            modal.hidden = true;
        }
    };

    function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
            modal.hidden = true;
            document.removeEventListener("keydown", handleEscape);
        }
    }

    document.addEventListener("keydown", handleEscape);
}

    /* ---------- Render Tournament Cards ---------- */

    function renderTournaments() {
        if (!tournamentList) {
            updateTournamentStats();
            return;
        }

        const tournaments = getTournaments();

        tournamentList.replaceChildren();

        if (tournaments.length === 0) {
            const emptyMessage = document.createElement("p");

            emptyMessage.className = "tournament-empty";
            emptyMessage.textContent =
                "এখনো কোনো Tournament তৈরি করা হয়নি।";

            tournamentList.appendChild(emptyMessage);

            updateTournamentStats();
            return;
        }

        tournaments.forEach(function (tournament) {
            const card = document.createElement("div");
            card.className = "tournament-card";

            const heading = document.createElement("h3");
            heading.textContent = tournament.name || "Untitled Tournament";

            const type = document.createElement("p");
            type.textContent = "Type: " + (tournament.type || "—");

            const season = document.createElement("p");
            season.textContent = "Season: " + (tournament.season || "—");

            const teams = document.createElement("p");
            teams.textContent =
                "Total Teams: " +
                (tournament.totalTeams ?? "—");

            const dates = document.createElement("p");
            dates.textContent =
                "Start: " +
                (tournament.startDate || "—") +
                " | End: " +
                (tournament.endDate || "—");

            const status = document.createElement("p");
            status.textContent =
                "Status: " + (tournament.status || "Upcoming");

            let groups = null;

            if (tournament.type === "Group Stage") {
                groups = document.createElement("p");

                groups.textContent =
                    "Number of Groups: " +
                    (tournament.groupCount ?? "—");
            }

            card.append(
                heading,
                type,
                season,
                teams,
                dates
            );

            if (groups) {
                card.appendChild(groups);
            }

            card.appendChild(status);

            /* View Details, Edit & Delete Buttons */

const actions = document.createElement("div");
actions.className = "tournament-card-actions";

const detailsButton = document.createElement("button");
detailsButton.type = "button";
detailsButton.className = "tournament-details-btn";
detailsButton.textContent = "View Details";
detailsButton.dataset.action = "details";
detailsButton.dataset.id = String(tournament.id);

const editButton = document.createElement("button");
editButton.type = "button";
editButton.className = "tournament-edit-btn";
editButton.textContent = "Edit";
editButton.dataset.action = "edit";
editButton.dataset.id = String(tournament.id);

const deleteButton = document.createElement("button");
deleteButton.type = "button";
deleteButton.className = "tournament-delete-btn";
deleteButton.textContent = "Delete";
deleteButton.dataset.action = "delete";
deleteButton.dataset.id = String(tournament.id);

actions.append(detailsButton, editButton, deleteButton);
card.appendChild(actions);

            tournamentList.appendChild(card);
        });

        updateTournamentStats();
    }


    /* ---------- Form State Helpers ---------- */

    function getSubmitButton() {
        if (!tournamentForm) {
            return null;
        }

        return tournamentForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );
    }

    function resetEditState() {
        editingTournamentId = null;

        const submitButton = getSubmitButton();

        if (submitButton) {
            if (submitButton.tagName === "INPUT") {
                submitButton.value = "Save Tournament";
            } else {
                submitButton.textContent = "Save Tournament";
            }
        }
    }

    function setSubmitButtonText(text) {
        const submitButton = getSubmitButton();

        if (!submitButton) {
            return;
        }

        if (submitButton.tagName === "INPUT") {
            submitButton.value = text;
        } else {
            submitButton.textContent = text;
        }
    }

    function resetTournamentForm() {
        if (tournamentForm) {
            tournamentForm.reset();
        }

        resetEditState();
        updateGroupField();
    }


    /* ---------- Page Navigation ---------- */

    function showTournamentPage() {
        const dashboardPage = document.getElementById("dashboard");
        const tournamentsPage = document.getElementById("tournaments");

        if (dashboardPage) {
            dashboardPage.hidden = true;
            dashboardPage.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        if (tournamentsPage) {
            tournamentsPage.hidden = false;
            tournamentsPage.style.removeProperty("display");
        }

        renderTournaments();
    }

    function showDashboardPage() {
        const dashboardPage = document.getElementById("dashboard");
        const tournamentsPage = document.getElementById("tournaments");

        if (tournamentsPage) {
            tournamentsPage.hidden = true;
            tournamentsPage.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        if (dashboardPage) {
            dashboardPage.hidden = false;
            dashboardPage.style.removeProperty("display");
        }

        updateDashboardStats();
    }

    /* ---------- Dashboard Quick Actions Navigation ---------- */

document.querySelectorAll(".quick-action[data-page]").forEach(function (button) {
    button.addEventListener("click", function () {
        const pageName = button.dataset.page;

        const pageLinks = document.querySelectorAll(
            ".sidebar_menu .menu a[data-page]"
        );

        const matchingLink = Array.from(pageLinks).find(function (link) {
            return link.dataset.page === pageName;
        });

        if (matchingLink) {
            matchingLink.click();
            return;
        }

        alert(
            "এই পেজটি এখনো তৈরি করা হয়নি।"
        );
    });
});

   /* ---------- Navigation for All Pages ---------- */

const pageLinks = document.querySelectorAll(
    ".sidebar_menu .menu a[data-page]"
);

const pageSectionIds = [
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

pageLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
        event.preventDefault();

        const pageName = link.dataset.page;
        const selectedPage = document.getElementById(pageName);

        // পেজ তৈরি না থাকলে অন্য পেজ লুকাবেন না
        if (!selectedPage) {
            alert("এই পেজটি এখনো তৈরি করা হয়নি।");
            return;
        }

        // সব পেজ লুকান
        pageSectionIds.forEach(function (id) {
            const section = document.getElementById(id);

            if (section) {
                section.hidden = true;
                section.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }
        });

        // শুধু নির্বাচিত পেজ দেখান
        selectedPage.hidden = false;
        selectedPage.style.removeProperty("display");

        // নির্বাচিত পেজের তথ্য আপডেট করুন
        if (pageName === "dashboard") {
            updateDashboardStats();
        }

        if (pageName === "tournaments") {
            renderTournaments();
        }
    });
});


    /* ---------- Open Tournament Form ---------- */

    if (showFormButton && tournamentFormPanel) {
        showFormButton.addEventListener("click", function () {
            tournamentFormPanel.hidden = false;
            tournamentFormPanel.style.removeProperty("display");

            updateGroupField();

            tournamentFormPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }


    /* ---------- Cancel Form / Cancel Editing ---------- */

    if (cancelFormButton && tournamentFormPanel) {
        cancelFormButton.addEventListener("click", function () {
            resetTournamentForm();

            tournamentFormPanel.hidden = true;
            tournamentFormPanel.style.setProperty(
                "display",
                "none",
                "important"
            );
        });
    }


    /* ---------- Edit & Delete Tournament Actions ---------- */

    if (tournamentList) {
        tournamentList.addEventListener("click", function (event) {
            const target = event.target;

            if (!target || typeof target.closest !== "function") {
                return;
            }

            const button = target.closest("button[data-action]");

            if (!button || !tournamentList.contains(button)) {
                return;
            }

            const tournamentId = button.dataset.id;
            const action = button.dataset.action;

            const tournaments = getTournaments();

            const tournament = tournaments.find(function (item) {
                return String(item.id) === String(tournamentId);
            });

            if (!tournament) {
                alert("আপনার নির্বাচিত Tournament খুঁজে পাওয়া যায়নি।");
                renderTournaments();
                return;
            }

            /* View Tournament Details */

if (action === "details") {
    showTournamentDetails(tournament);
    return;
}

            /* Edit Tournament */

            if (action === "edit") {
                if (
                    !tournamentForm ||
                    !tournamentFormPanel ||
                    !tournamentNameInput ||
                    !tournamentTypeInput ||
                    !totalTeamsInput ||
                    !seasonInput ||
                    !startDateInput ||
                    !endDateInput ||
                    !statusInput
                ) {
                    alert(
                        "Tournament সম্পাদনার ফর্ম পাওয়া যায়নি।"
                    );
                    return;
                }

                editingTournamentId = tournament.id;

                tournamentNameInput.value = tournament.name || "";
                tournamentTypeInput.value = tournament.type || "";

                totalTeamsInput.value =
                    tournament.totalTeams ?? "";

                if (groupCountInput) {
                    groupCountInput.value =
                        tournament.groupCount ?? "";
                }

                seasonInput.value = tournament.season || "";
                startDateInput.value = tournament.startDate || "";
                endDateInput.value = tournament.endDate || "";

                statusInput.value =
                    tournament.status || "Upcoming";

                updateGroupField();

                tournamentFormPanel.hidden = false;
                tournamentFormPanel.style.removeProperty("display");

                setSubmitButtonText("Update Tournament");

                tournamentFormPanel.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                return;
            }

            /* Delete Tournament */

            if (action === "delete") {
                const confirmed = confirm(
                    "আপনি কি এই Tournament মুছে ফেলতে চান? এই কাজটি ফিরিয়ে আনা যাবে না।"
                );

                if (!confirmed) {
                    return;
                }

                const updatedTournaments = tournaments.filter(
                    function (item) {
                        return (
                            String(item.id) !== String(tournamentId)
                        );
                    }
                );

                if (!saveTournaments(updatedTournaments)) {
                    return;
                }

                if (
                    editingTournamentId !== null &&
                    String(editingTournamentId) ===
                        String(tournamentId)
                ) {
                    resetTournamentForm();

                    if (tournamentFormPanel) {
                        tournamentFormPanel.hidden = true;
                        tournamentFormPanel.style.setProperty(
                            "display",
                            "none",
                            "important"
                        );
                    }
                }

                renderTournaments();

                alert("Tournament সফলভাবে মুছে ফেলা হয়েছে।");
            }
        });
    }


    /* ---------- Save / Update Tournament ---------- */

    if (tournamentForm) {
        tournamentForm.addEventListener(
            "submit",
            function (event) {
                event.preventDefault();

                const name = tournamentNameInput
                    ? tournamentNameInput.value.trim()
                    : "";

                const type = tournamentTypeInput
                    ? tournamentTypeInput.value
                    : "";

                const totalTeams = totalTeamsInput
                    ? Number(totalTeamsInput.value)
                    : NaN;

                const groupCount = groupCountInput
                    ? Number(groupCountInput.value)
                    : NaN;

                const season = seasonInput
                    ? seasonInput.value.trim()
                    : "";

                const startDate = startDateInput
                    ? startDateInput.value
                    : "";

                const endDate = endDateInput
                    ? endDateInput.value
                    : "";

                const status = statusInput
                    ? statusInput.value
                    : "Upcoming";


                /* Required Fields */

                if (
                    !name ||
                    !type ||
                    !season ||
                    !startDate ||
                    !endDate ||
                    !status
                ) {
                    alert(
                        "অনুগ্রহ করে সব প্রয়োজনীয় তথ্য পূরণ করুন।"
                    );
                    return;
                }


                /* Validate Total Teams */

                if (
                    !Number.isInteger(totalTeams) ||
                    totalTeams < 2 ||
                    totalTeams > 128
                ) {
                    alert(
                        "Total Teams অবশ্যই ২ থেকে ১২৮-এর মধ্যে পূর্ণসংখ্যা হতে হবে।"
                    );

                    if (totalTeamsInput) {
                        totalTeamsInput.focus();
                    }

                    return;
                }


                /* Validate Group Count for Group Stage */

                let savedGroupCount = null;

                if (type === "Group Stage") {
                    if (
                        !Number.isInteger(groupCount) ||
                        groupCount < 2 ||
                        groupCount > 32
                    ) {
                        alert(
                            "Group Count অবশ্যই ২ থেকে ৩২-এর মধ্যে পূর্ণসংখ্যা হতে হবে।"
                        );

                        if (groupCountInput) {
                            groupCountInput.focus();
                        }

                        return;
                    }

                    if (groupCount > totalTeams) {
                        alert(
                            "Group Count, Total Teams-এর চেয়ে বেশি হতে পারবে না।"
                        );

                        if (groupCountInput) {
                            groupCountInput.focus();
                        }

                        return;
                    }

                    savedGroupCount = groupCount;
                }


                /* Validate Dates */

                if (endDate < startDate) {
                    alert(
                        "End Date, Start Date-এর আগের তারিখ হতে পারবে না।"
                    );

                    if (endDateInput) {
                        endDateInput.focus();
                    }

                    return;
                }


                /* Prevent Duplicate Name + Season */

                const tournaments = getTournaments();

                const duplicate = tournaments.some(
                    function (tournament) {
                        const sameId =
                            String(tournament.id) ===
                            String(editingTournamentId);

                        return (
                            !sameId &&
                            typeof tournament.name === "string" &&
                            typeof tournament.season === "string" &&
                            tournament.name.trim().toLowerCase() ===
                                name.toLowerCase() &&
                            tournament.season.trim().toLowerCase() ===
                                season.toLowerCase()
                        );
                    }
                );

                if (duplicate) {
                    alert(
                        "এই নাম ও Season-এর Tournament আগে থেকেই রয়েছে।"
                    );
                    return;
                }

                /* Validate Tournament Team Capacity */

const assignedTeams = JSON.parse(
    localStorage.getItem("matchcraft_teams") || "[]"
);

const currentTournamentId = editingTournamentId !== null
    ? String(editingTournamentId)
    : null;

if (currentTournamentId !== null) {
    const assignedTeamCount = assignedTeams.filter(function (team) {
        return String(
            team.tournamentId ?? team.tournament ?? ""
        ) === currentTournamentId;
    }).length;

    if (totalTeams < assignedTeamCount) {
        alert(
            "এই Tournament-এ ইতিমধ্যে " +
            assignedTeamCount +
            "টি টিম যুক্ত রয়েছে। Total Teams এর সংখ্যা " +
            assignedTeamCount +
            "-এর কম করা যাবে না।"
        );
        return;
    }
}


                /* Create Tournament Object */

                const wasEditing = editingTournamentId !== null;

                const tournamentData = {
                    id: wasEditing
                        ? editingTournamentId
                        : Date.now().toString(),

                    name: name,
                    type: type,
                    totalTeams: totalTeams,
                    groupCount: savedGroupCount,
                    season: season,
                    startDate: startDate,
                    endDate: endDate,
                    status: status
                };


                /* Update Existing Tournament or Add New */

                if (wasEditing) {
                    const index = tournaments.findIndex(
                        function (item) {
                            return (
                                String(item.id) ===
                                String(editingTournamentId)
                            );
                        }
                    );

                    if (index === -1) {
                        alert(
                            "আপডেট করার Tournament খুঁজে পাওয়া যায়নি।"
                        );
                        return;
                    }

                    tournaments[index] = tournamentData;
                } else {
                    tournaments.push(tournamentData);
                }


                /* Save to LocalStorage */

                if (!saveTournaments(tournaments)) {
                    return;
                }


                /* Reset Form and Refresh */

                resetTournamentForm();

                if (tournamentFormPanel) {
                    tournamentFormPanel.hidden = true;
                    tournamentFormPanel.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );
                }

                renderTournaments();

                if (wasEditing) {
                    alert("Tournament সফলভাবে আপডেট হয়েছে।");
                } else {
                    alert("নতুন Tournament সফলভাবে তৈরি হয়েছে।");
                }
            }
        );
    }


    /* ---------- Initialize Tournament Management ---------- */

    updateGroupField();
    updateDashboardStats();
    renderTournaments();

})();
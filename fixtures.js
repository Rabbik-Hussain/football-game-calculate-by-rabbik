/* ==========================================================
   MATCHCRAFT — FIXTURES & RESULTS
   File: fixtures.js
   Storage: LocalStorage
   ========================================================== */

(() => {
  "use strict";

  const KEYS = {
    fixtures: "matchcraft_fixtures",
    grounds: "matchcraft_grounds",
    teams: "matchcraft_teams",
    players: "matchcraft_players",
    tournaments: "matchcraft_tournaments",
    matches: "matchcraft_matches"
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  const getJSON = (key, fallback = []) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (error) {
      console.warn(`MatchCraft: Could not read ${key}`, error);
      return fallback;
    }
  };

  const saveJSON = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const makeId = () =>
    `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const normalise = value =>
    String(value ?? "").trim().toLocaleLowerCase();

  const valueOf = (element, fallback = "") =>
    element ? element.value.trim() : fallback;

  const getId = item => String(item?.id ?? item?.teamId ?? "");

  const getTeamName = team =>
    team?.name ?? team?.teamName ?? "Unknown Team";

  const getTournamentName = tournament =>
    tournament?.name ?? tournament?.tournamentName ?? "Unknown Tournament";

  const getTeamTournamentId = team =>
    String(team?.tournamentId ?? "");

  const getTournamentId = tournament =>
    String(tournament?.id ?? tournament?.tournamentId ?? "");

  const formatDate = date => {
    if (!date) return "Date not set";

    const parts = String(date).split("-");
    if (parts.length !== 3) return escapeHTML(date);

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatTime = time => {
    if (!time) return "Time not set";

    const parts = String(time).split(":");
    if (parts.length < 2) return escapeHTML(time);

    let hour = Number(parts[0]);
    const minute = parts[1];
    const period = hour >= 12 ? "PM" : "AM";

    hour = hour % 12 || 12;

    return `${hour}:${minute} ${period}`;
  };

  const statusLabel = status => ({
    upcoming: "Upcoming",
    completed: "Completed",
    cancelled: "Cancelled",
    live: "Live"
  })[String(status).toLowerCase()] || "Upcoming";

  const statusClass = status => {
    const allowed = ["upcoming", "completed", "cancelled", "live"];
    const value = String(status || "upcoming").toLowerCase();

    return allowed.includes(value) ? value : "upcoming";
  };

  let editingFixtureId = null;
  let currentGroundEditingId = null;
  let currentModal = null;

  /* ========================================================
     DOM REFERENCES
     ======================================================== */

  const el = {
    page: $("#fixtures"),
    tournament: $("#fixturesTournament"),
    venue: $("#fixturesMatchVenue"),
    homeTeam: $("#fixturesHomeTeam"),
    awayTeam: $("#fixturesAwayTeam"),
    date: $("#fixturesMatchDate"),
    time: $("#fixturesMatchTime"),
    notes: $("#fixturesMatchNotes"),

    form: $("#fixturesMatchForm"),
    editingId: $("#fixturesEditingMatchId"),
    saveButton: $("#fixturesSaveMatchBtn"),
    cancelEdit: $("#fixturesCancelEditBtn"),
    resetButton: $("#fixturesResetMatchBtn"),

    search: $("#fixturesMatchSearch"),
    filter: $("#fixturesMatchStatusFilter"),
    list: $("#fixturesMatchList"),
    empty: $("#fixturesMatchesEmpty"),

    totalMatches: $("#fixturesTotalMatches"),
    upcomingMatches: $("#fixturesUpcomingMatches"),
    totalGrounds: $("#fixturesTotalGrounds"),

    groundGrid: $("#fixturesGroundGrid"),
    addGroundButton: $("#fixturesAddGroundBtn")
  };

  if (!el.page || !el.form || !el.list) {
    console.warn(
      "MatchCraft Fixtures: Required HTML elements were not found. " +
      "Check the fixtures section IDs in index.html."
    );
    return;
  }

  /* ========================================================
     DATA ACCESS
     ======================================================== */

  function getFixtures() {
    const data = getJSON(KEYS.fixtures, []);
    return Array.isArray(data) ? data : [];
  }

  function getGrounds() {
    const data = getJSON(KEYS.grounds, []);
    return Array.isArray(data) ? data : [];
  }

  function getTeams() {
    const data = getJSON(KEYS.teams, []);
    return Array.isArray(data) ? data : [];
  }

  function getTournaments() {
    const data = getJSON(KEYS.tournaments, []);
    return Array.isArray(data) ? data : [];
  }

  function getMatches() {
    const data = getJSON(KEYS.matches, []);
    return Array.isArray(data) ? data : [];
  }

  function persistFixtures(fixtures) {
    saveJSON(KEYS.fixtures, fixtures);

    // Keep the alternate fixture keys used by Match Center in sync.
    saveJSON("matchcraft_matches_fixtures", fixtures);
    saveJSON("matchcraft_scheduled_matches", fixtures);

    window.dispatchEvent(new CustomEvent("matchcraft:fixtures-updated", {
      detail: { fixtures }
    }));

    updateDashboardStats();
  }

  function persistGrounds(grounds) {
    saveJSON(KEYS.grounds, grounds);
    renderGrounds();
    updateDashboardStats();
  }

  function updateDashboardStats() {
    const fixtures = getFixtures();
    const grounds = getGrounds();

    if (el.totalMatches) {
      el.totalMatches.textContent = fixtures.length;
    }

    if (el.upcomingMatches) {
      el.upcomingMatches.textContent = fixtures.filter(fixture =>
        ["upcoming", "scheduled", ""].includes(
          String(fixture.status || "upcoming").toLowerCase()
        )
      ).length;
    }

    if (el.totalGrounds) {
      el.totalGrounds.textContent = grounds.length;
    }

    const dashboardMatches = $("#totalMatches");

    if (dashboardMatches) {
      dashboardMatches.textContent = getMatches().length;
    }
  }

  /* ========================================================
     SELECT OPTIONS
     ======================================================== */

  function setOptions(select, items, placeholder, selectedValue = "") {
    if (!select) return;

    const previousValue = String(selectedValue || select.value || "");

    select.innerHTML =
      `<option value="">${escapeHTML(placeholder)}</option>` +
      items.map(item => {
        const id = getId(item);
        const selected = id === previousValue ? " selected" : "";

        return `<option value="${escapeHTML(id)}"${selected}>` +
          `${escapeHTML(item.label)}` +
          `</option>`;
      }).join("");
  }

  function refreshTournamentOptions() {
    if (!el.tournament) return;

    const previous = valueOf(el.tournament);
    const tournaments = getTournaments().map(tournament => ({
      id: getTournamentId(tournament),
      label: getTournamentName(tournament)
    }));

    setOptions(
      el.tournament,
      tournaments,
      "Select tournament",
      previous
    );

    refreshTeamOptions();
  }

  function refreshTeamOptions() {
    const tournamentId = valueOf(el.tournament);
    const teams = getTeams();
    const previousHome = valueOf(el.homeTeam);
    const previousAway = valueOf(el.awayTeam);

    /*
     * Team records created by teams.js contain tournamentId.
     * Only show teams assigned to the selected tournament.
     */
    const eligibleTeams = tournamentId
      ? teams.filter(team =>
          getTeamTournamentId(team) === tournamentId
        )
      : [];

    const options = eligibleTeams.map(team => ({
      id: getId(team),
      label: getTeamName(team)
    }));

    setOptions(
      el.homeTeam,
      options,
      tournamentId ? "Select home team" : "Select tournament first",
      previousHome
    );

    setOptions(
      el.awayTeam,
      options,
      tournamentId ? "Select away team" : "Select tournament first",
      previousAway
    );

    // A team cannot play against itself.
    if (el.homeTeam && el.awayTeam) {
      [...el.homeTeam.options].forEach(option => {
        if (option.value && option.value === el.awayTeam.value) {
          option.disabled = true;
        }
      });

      [...el.awayTeam.options].forEach(option => {
        if (option.value && option.value === el.homeTeam.value) {
          option.disabled = true;
        }
      });
    }
  }

  function refreshGroundOptions(selectedGroundId = "") {
    if (!el.venue) return;

    const previous = selectedGroundId || valueOf(el.venue);

    const grounds = getGrounds().map(ground => ({
      id: getId(ground),
      label: ground.name || ground.groundName || "Unnamed Ground"
    }));

    setOptions(el.venue, grounds, "Select ground", previous);
  }

  /* ========================================================
     SCHEDULE CONFLICT VALIDATION
     ======================================================== */

  function fixtureTimestamp(fixture) {
    if (!fixture.date || !fixture.time) return null;

    const timestamp = new Date(
      `${fixture.date}T${fixture.time}:00`
    ).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function isActiveFixture(fixture) {
    return !["completed", "cancelled", "full-time"].includes(
      String(fixture.status || "upcoming").toLowerCase()
    );
  }

  function findScheduleConflict(candidate, ignoreId = null) {
    const start = fixtureTimestamp(candidate);

    if (start === null) {
      return "Please select a valid match date and time.";
    }

    const durationMinutes = 120;
    const end = start + durationMinutes * 60_000;

    for (const existing of getFixtures()) {
      if (String(existing.id) === String(ignoreId)) continue;
      if (!isActiveFixture(existing)) continue;

      const existingStart = fixtureTimestamp(existing);
      if (existingStart === null) continue;

      const existingEnd = existingStart + durationMinutes * 60_000;

      const overlaps = start < existingEnd && existingStart < end;

      if (!overlaps) continue;

      const sameHome = String(existing.homeTeamId) ===
        String(candidate.homeTeamId);
      const sameAway = String(existing.awayTeamId) ===
        String(candidate.awayTeamId);

      const existingTeams = [
        String(existing.homeTeamId),
        String(existing.awayTeamId)
      ];

      const candidateTeams = [
        String(candidate.homeTeamId),
        String(candidate.awayTeamId)
      ];

      const sharedTeam = candidateTeams.some(id =>
        id && existingTeams.includes(id)
      );

      if (sharedTeam) {
        return (
          `Schedule conflict: one of these teams already has a match ` +
          `around ${formatTime(existing.time)} on ${formatDate(existing.date)}.`
        );
      }

      const candidateGround = String(
        candidate.groundId ?? candidate.venueId ?? ""
      );

      const existingGround = String(
        existing.groundId ?? existing.venueId ?? ""
      );

      if (candidateGround && candidateGround === existingGround) {
        return (
          `Ground conflict: this ground already has a match ` +
          `around ${formatTime(existing.time)} on ${formatDate(existing.date)}.`
        );
      }

      // Keep the variables intentionally explicit for easier maintenance.
      void sameHome;
      void sameAway;
    }

    return "";
  }

  /* ========================================================
     FORM RESET / EDIT MODE
     ======================================================== */

  function resetFixtureForm() {
    editingFixtureId = null;

    if (el.form) el.form.reset();
    if (el.editingId) el.editingId.value = "";

    if (el.saveButton) {
      el.saveButton.innerHTML = "Save Fixture";
    }

    if (el.cancelEdit) {
      el.cancelEdit.hidden = true;
    }

    refreshTournamentOptions();
    refreshGroundOptions();
    refreshTeamOptions();
  }

  function startEditingFixture(fixtureId) {
    const fixture = getFixtures().find(item =>
      String(item.id) === String(fixtureId)
    );

    if (!fixture) {
      alert("Fixture not found.");
      return;
    }

    editingFixtureId = String(fixture.id);

    if (el.editingId) {
      el.editingId.value = editingFixtureId;
    }

    refreshTournamentOptions();

    if (el.tournament) {
      el.tournament.value = String(fixture.tournamentId || "");
    }

    refreshTeamOptions();

    if (el.homeTeam) {
      el.homeTeam.value = String(fixture.homeTeamId || "");
    }

    if (el.awayTeam) {
      el.awayTeam.value = String(fixture.awayTeamId || "");
    }

    refreshGroundOptions(
      String(fixture.groundId ?? fixture.venueId ?? "")
    );

    if (el.date) el.date.value = fixture.date || "";
    if (el.time) el.time.value = fixture.time || "";
    if (el.notes) el.notes.value = fixture.notes || "";

    if (el.saveButton) {
      el.saveButton.innerHTML = "Update Fixture";
    }

    if (el.cancelEdit) {
      el.cancelEdit.hidden = false;
    }

    el.form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /* ========================================================
     SAVE FIXTURE
     ======================================================== */

  function saveFixture(event) {
    event.preventDefault();

    const tournamentId = valueOf(el.tournament);
    const homeTeamId = valueOf(el.homeTeam);
    const awayTeamId = valueOf(el.awayTeam);
    const groundId = valueOf(el.venue);
    const date = valueOf(el.date);
    const time = valueOf(el.time);
    const notes = valueOf(el.notes);

    if (!tournamentId) {
      alert("Please select a tournament.");
      el.tournament?.focus();
      return;
    }

    if (!homeTeamId || !awayTeamId) {
      alert("Please select both home and away teams.");
      return;
    }

    if (homeTeamId === awayTeamId) {
      alert("The home team and away team cannot be the same.");
      return;
    }

    if (!date || !time) {
      alert("Please select the match date and time.");
      return;
    }

    const tournaments = getTournaments();
    const teams = getTeams();
    const grounds = getGrounds();

    const tournament = tournaments.find(item =>
      getTournamentId(item) === tournamentId
    );

    const homeTeam = teams.find(item =>
      getId(item) === homeTeamId
    );

    const awayTeam = teams.find(item =>
      getId(item) === awayTeamId
    );

    if (!tournament) {
      alert("The selected tournament no longer exists.");
      refreshTournamentOptions();
      return;
    }

    if (!homeTeam || !awayTeam) {
      alert("One of the selected teams no longer exists.");
      refreshTeamOptions();
      return;
    }

    if (
      getTeamTournamentId(homeTeam) !== tournamentId ||
      getTeamTournamentId(awayTeam) !== tournamentId
    ) {
      alert(
        "Both teams must be assigned to the selected tournament first."
      );
      return;
    }

    if (groundId && !grounds.some(ground =>
      getId(ground) === groundId
    )) {
      alert("The selected ground no longer exists.");
      refreshGroundOptions();
      return;
    }

    const ground = grounds.find(item => getId(item) === groundId);

    const previousFixture = editingFixtureId
      ? getFixtures().find(item =>
          String(item.id) === String(editingFixtureId)
        )
      : null;

    const fixture = {
      ...(previousFixture || {}),
      id: editingFixtureId || makeId(),

      tournamentId,
      tournamentName: getTournamentName(tournament),

      homeTeamId,
      homeTeamName: getTeamName(homeTeam),
      awayTeamId,
      awayTeamName: getTeamName(awayTeam),

      groundId: groundId || "",
      venueId: groundId || "",
      groundName: ground
        ? ground.name || ground.groundName || ""
        : "",
      venue: ground
        ? ground.name || ground.groundName || ""
        : "",

      date,
      time,
      notes,

      status: previousFixture?.status || "upcoming",
      updatedAt: new Date().toISOString(),

      createdAt: previousFixture?.createdAt ||
        new Date().toISOString()
    };

    /*
     * Preserve an existing result. Scheduling or editing a fixture
     * must never automatically turn it into a 0–0 completed match.
     */
    if (!previousFixture) {
      fixture.status = "upcoming";
      fixture.homeScore = null;
      fixture.awayScore = null;
      fixture.score = null;
    }

    const conflict = findScheduleConflict(
      fixture,
      editingFixtureId
    );

    if (conflict) {
      alert(conflict);
      return;
    }

    const fixtures = getFixtures();

    const index = fixtures.findIndex(item =>
      String(item.id) === String(fixture.id)
    );

    if (index >= 0) {
      fixtures[index] = fixture;
    } else {
      fixtures.push(fixture);
    }

    persistFixtures(fixtures);
    resetFixtureForm();
    renderFixtures();

    alert(index >= 0
      ? "Fixture updated successfully."
      : "Fixture scheduled successfully."
    );
  }

  /* ========================================================
     FIXTURE CARD RENDERING
     ======================================================== */

  function getFixtureTeamName(fixture, side) {
    const id = side === "home"
      ? fixture.homeTeamId
      : fixture.awayTeamId;

    const storedName = side === "home"
      ? fixture.homeTeamName
      : fixture.awayTeamName;

    const team = getTeams().find(item =>
      getId(item) === String(id ?? "")
    );

    return team ? getTeamName(team) : storedName || "Unknown Team";
  }

  function getFixtureTournamentName(fixture) {
    const tournament = getTournaments().find(item =>
      getTournamentId(item) === String(fixture.tournamentId ?? "")
    );

    return tournament
      ? getTournamentName(tournament)
      : fixture.tournamentName || "Unknown Tournament";
  }

  function getFixtureGroundName(fixture) {
    const groundId = String(
      fixture.groundId ?? fixture.venueId ?? ""
    );

    const ground = getGrounds().find(item =>
      getId(item) === groundId
    );

    return ground
      ? ground.name || ground.groundName || "Ground"
      : fixture.groundName || fixture.venue || "Ground not set";
  }

  function getFixtureScore(fixture) {
    const homeScore = fixture.homeScore ?? fixture.homeGoals;
    const awayScore = fixture.awayScore ?? fixture.awayGoals;

    if (homeScore !== null && homeScore !== undefined &&
        awayScore !== null && awayScore !== undefined) {
      return `${Number(homeScore)} - ${Number(awayScore)}`;
    }

    if (fixture.score && typeof fixture.score === "string") {
      return fixture.score;
    }

    return "VS";
  }

  function fixtureMatchesSearch(fixture, query) {
    if (!query) return true;

    const searchable = [
      fixture.tournamentName,
      getFixtureTournamentName(fixture),
      fixture.homeTeamName,
      fixture.awayTeamName,
      getFixtureTeamName(fixture, "home"),
      getFixtureTeamName(fixture, "away"),
      fixture.groundName,
      fixture.venue,
      getFixtureGroundName(fixture),
      fixture.date,
      fixture.time,
      fixture.notes,
      fixture.status
    ].join(" ");

    return normalise(searchable).includes(normalise(query));
  }

  function fixtureMatchesStatus(fixture, filter) {
    const status = String(fixture.status || "upcoming").toLowerCase();

    if (!filter || filter === "all") return true;

    if (filter === "upcoming") {
      return ["upcoming", "scheduled"].includes(status);
    }

    if (filter === "completed") {
      return ["completed", "full-time", "finished"].includes(status);
    }

    if (filter === "cancelled") {
      return ["cancelled", "canceled"].includes(status);
    }

    return status === filter;
  }

  function renderFixtureCard(fixture) {
    const id = escapeHTML(fixture.id);
    const homeName = getFixtureTeamName(fixture, "home");
    const awayName = getFixtureTeamName(fixture, "away");
    const tournamentName = getFixtureTournamentName(fixture);
    const groundName = getFixtureGroundName(fixture);
    const status = statusClass(fixture.status);
    const score = getFixtureScore(fixture);

    const completed = status === "completed";
    const cancelled = status === "cancelled";

    return `
      <article class="fixtures-match-card" data-fixture-id="${id}">
        <div class="fixtures-match-top">
          <div>
            <span class="fixtures-eyebrow">
              <i class="fa-solid fa-trophy"></i>
              ${escapeHTML(tournamentName)}
            </span>
            <p>${escapeHTML(formatDate(fixture.date))} ·
               ${escapeHTML(formatTime(fixture.time))}</p>
          </div>

          <span class="fixtures-status ${status}">
            ${escapeHTML(statusLabel(status))}
          </span>
        </div>

        <div class="fixtures-match-teams">
          <div class="fixtures-team">
            <div class="fixtures-team-logo-placeholder"
                 aria-hidden="true">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <strong>${escapeHTML(homeName)}</strong>
          </div>

          <div class="fixtures-vs">
            ${escapeHTML(score)}
          </div>

          <div class="fixtures-team">
            <div class="fixtures-team-logo-placeholder"
                 aria-hidden="true">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <strong>${escapeHTML(awayName)}</strong>
          </div>
        </div>

        <div class="fixtures-match-meta">
          <div class="fixtures-meta-item">
            <i class="fa-solid fa-location-dot"></i>
            <span>${escapeHTML(groundName)}</span>
          </div>

          <div class="fixtures-meta-item">
            <i class="fa-regular fa-calendar"></i>
            <span>${escapeHTML(formatDate(fixture.date))}</span>
          </div>

          ${
            fixture.notes
              ? `<div class="fixtures-meta-item">
                   <i class="fa-regular fa-note-sticky"></i>
                   <span>${escapeHTML(fixture.notes)}</span>
                 </div>`
              : ""
          }
        </div>

        <div class="fixtures-card-actions">
          ${
            !completed && !cancelled
              ? `<button type="button"
                         data-fixture-action="edit"
                         data-id="${id}">
                   <i class="fa-solid fa-pen"></i> Edit
                 </button>`
              : ""
          }

          ${
            !completed && !cancelled
              ? `<button type="button"
                         data-fixture-action="cancel"
                         data-id="${id}">
                   <i class="fa-solid fa-ban"></i> Cancel
                 </button>`
              : ""
          }

          <button type="button"
                  data-fixture-action="delete"
                  data-id="${id}">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </article>
    `;
  }

  function renderFixtures() {
    if (!el.list) return;

    const query = valueOf(el.search);
    const statusFilter = valueOf(el.filter) || "all";

    const fixtures = getFixtures()
      .filter(fixture =>
        fixtureMatchesSearch(fixture, query) &&
        fixtureMatchesStatus(fixture, statusFilter)
      )
      .sort((a, b) => {
        const aTime = fixtureTimestamp(a) ?? 0;
        const bTime = fixtureTimestamp(b) ?? 0;

        return aTime - bTime;
      });

    el.list.innerHTML = fixtures.map(renderFixtureCard).join("");

    if (el.empty) {
      el.empty.hidden = fixtures.length > 0;
    }

    updateDashboardStats();
  }

  /* ========================================================
     FIXTURE ACTIONS
     ======================================================== */

  function deleteFixture(fixtureId) {
    const fixture = getFixtures().find(item =>
      String(item.id) === String(fixtureId)
    );

    if (!fixture) return;

    if (
      ["live", "half-time", "halftime"].includes(
        String(fixture.status).toLowerCase()
      )
    ) {
      alert("A live match cannot be deleted from Fixtures.");
      return;
    }

    const confirmed = confirm(
      `Delete this fixture?\n\n` +
      `${getFixtureTeamName(fixture, "home")} vs ` +
      `${getFixtureTeamName(fixture, "away")}\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) return;

    const fixtures = getFixtures().filter(item =>
      String(item.id) !== String(fixtureId)
    );

    persistFixtures(fixtures);
    renderFixtures();

    if (String(editingFixtureId) === String(fixtureId)) {
      resetFixtureForm();
    }
  }

  function cancelFixture(fixtureId) {
    const fixtures = getFixtures();
    const fixture = fixtures.find(item =>
      String(item.id) === String(fixtureId)
    );

    if (!fixture) return;

    if (!confirm("Are you sure you want to cancel this fixture?")) {
      return;
    }

    fixture.status = "cancelled";
    fixture.updatedAt = new Date().toISOString();

    persistFixtures(fixtures);
    renderFixtures();
  }

  function handleFixtureListClick(event) {
    const button = event.target.closest("[data-fixture-action]");
    if (!button) return;

    const action = button.dataset.fixtureAction;
    const id = button.dataset.id;

    if (!id) return;

    if (action === "edit") {
      startEditingFixture(id);
    } else if (action === "delete") {
      deleteFixture(id);
    } else if (action === "cancel") {
      cancelFixture(id);
    }
  }

  /* ========================================================
     GROUND MANAGEMENT
     ======================================================== */

  function openGroundModal(ground = null) {
    closeGroundModal();

    currentGroundEditingId = ground ? String(ground.id) : null;

    const backdrop = document.createElement("div");
    backdrop.className = "fixtures-modal-backdrop";
    backdrop.id = "fixturesGroundModal";

    backdrop.innerHTML = `
      <section class="fixtures-modal"
               role="dialog"
               aria-modal="true"
               aria-labelledby="fixturesGroundModalTitle">

        <div class="fixtures-panel-heading">
          <div>
            <span class="fixtures-eyebrow">
              <i class="fa-solid fa-location-dot"></i>
              Ground Management
            </span>

            <h2 id="fixturesGroundModalTitle">
              ${ground ? "Edit Ground" : "Add New Ground"}
            </h2>

            <p>Save the venue details for your scheduled matches.</p>
          </div>

          <button type="button"
                  class="fixtures-ghost-btn"
                  data-ground-action="close"
                  aria-label="Close dialog">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="fixturesGroundForm">
          <div class="fixtures-form-grid">
            <label class="fixtures-form-group full-width">
              Ground name *
              <input id="fixturesGroundName"
                     name="groundName"
                     maxlength="100"
                     required
                     placeholder="e.g. National Stadium"
                     value="${escapeHTML(
                       ground?.name ?? ground?.groundName ?? ""
                     )}">
            </label>

            <label class="fixtures-form-group">
              Capacity
              <input id="fixturesGroundCapacity"
                     name="capacity"
                     type="number"
                     min="0"
                     step="1"
                     placeholder="e.g. 25000"
                     value="${escapeHTML(ground?.capacity ?? "")}">
            </label>

            <label class="fixtures-form-group">
              City / Location
              <input id="fixturesGroundLocation"
                     name="location"
                     maxlength="150"
                     placeholder="Ground location"
                     value="${escapeHTML(ground?.location ?? "")}">
            </label>

            <label class="fixtures-form-group full-width">
              Details
              <textarea id="fixturesGroundDetails"
                        name="details"
                        maxlength="1000"
                        placeholder="Optional ground details">${escapeHTML(
                          ground?.details ?? ""
                        )}</textarea>
            </label>
          </div>

          <div class="fixtures-form-actions">
            <button type="button"
                    class="fixtures-secondary-btn"
                    data-ground-action="close">
              Cancel
            </button>

            <button type="submit"
                    class="fixtures-primary-btn">
              <i class="fa-solid fa-floppy-disk"></i>
              ${ground ? "Update Ground" : "Save Ground"}
            </button>
          </div>
        </form>
      </section>
    `;

    document.body.appendChild(backdrop);
    currentModal = backdrop;

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) closeGroundModal();
    });

    backdrop.querySelectorAll("[data-ground-action='close']")
      .forEach(button => {
        button.addEventListener("click", closeGroundModal);
      });

    const form = $("#fixturesGroundForm", backdrop);

    form.addEventListener("submit", event => {
      event.preventDefault();
      saveGroundFromModal(backdrop);
    });

    $("#fixturesGroundName", backdrop)?.focus();
  }

  function closeGroundModal() {
    const modal = $("#fixturesGroundModal");

    if (modal) modal.remove();

    currentModal = null;
    currentGroundEditingId = null;
  }

  function saveGroundFromModal(modal) {
    const name = valueOf($("#fixturesGroundName", modal));
    const capacityValue = valueOf($("#fixturesGroundCapacity", modal));
    const location = valueOf($("#fixturesGroundLocation", modal));
    const details = valueOf($("#fixturesGroundDetails", modal));

    if (!name) {
      alert("Please enter a ground name.");
      return;
    }

    const grounds = getGrounds();

    const duplicate = grounds.find(ground =>
      normalise(ground.name ?? ground.groundName) === normalise(name) &&
      String(ground.id) !== String(currentGroundEditingId)
    );

    if (duplicate) {
      alert("A ground with this name already exists.");
      return;
    }

    const ground = {
      ...(grounds.find(item =>
        String(item.id) === String(currentGroundEditingId)
      ) || {}),

      id: currentGroundEditingId || makeId(),
      name,
      groundName: name,
      capacity: capacityValue ? Number(capacityValue) : null,
      location,
      details,
      updatedAt: new Date().toISOString()
    };

    const index = grounds.findIndex(item =>
      String(item.id) === String(ground.id)
    );

    if (index >= 0) {
      grounds[index] = ground;
    } else {
      grounds.push(ground);
    }

    persistGrounds(grounds);
    refreshGroundOptions(ground.id);
    closeGroundModal();

    alert(index >= 0
      ? "Ground updated successfully."
      : "Ground added successfully."
    );
  }

  function renderGrounds() {
    if (!el.groundGrid) return;

    const grounds = getGrounds();

    if (!grounds.length) {
      el.groundGrid.innerHTML = `
        <div class="fixtures-empty-state">
          <i class="fa-solid fa-location-dot"></i>
          <h3>No grounds added yet</h3>
          <p>Add a ground to use it when scheduling fixtures.</p>
        </div>
      `;

      updateDashboardStats();
      return;
    }

    el.groundGrid.innerHTML = grounds.map(ground => {
      const id = escapeHTML(ground.id);
      const name = ground.name ?? ground.groundName ?? "Unnamed Ground";

      return `
        <article class="fixtures-ground-card"
                 data-ground-id="${id}">
          <div class="fixtures-inline">
            <span class="fixtures-stat-icon">
              <i class="fa-solid fa-location-dot"></i>
            </span>

            <div>
              <h3>${escapeHTML(name)}</h3>
              <p>${escapeHTML(ground.location || "Location not provided")}</p>
            </div>
          </div>

          <div class="fixtures-divider"></div>

          <p>
            <i class="fa-solid fa-users"></i>
            Capacity:
            ${ground.capacity != null
              ? escapeHTML(Number(ground.capacity).toLocaleString())
              : "Not specified"}
          </p>

          ${
            ground.details
              ? `<p>${escapeHTML(ground.details)}</p>`
              : ""
          }

          <div class="fixtures-card-actions">
            <button type="button"
                    data-ground-action="edit"
                    data-id="${id}">
              <i class="fa-solid fa-pen"></i> Edit
            </button>

            <button type="button"
                    data-ground-action="delete"
                    data-id="${id}">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </article>
      `;
    }).join("");

    updateDashboardStats();
  }

  function deleteGround(groundId) {
    const grounds = getGrounds();
    const ground = grounds.find(item =>
      String(item.id) === String(groundId)
    );

    if (!ground) return;

    const usedByFixture = getFixtures().some(fixture =>
      String(fixture.groundId ?? fixture.venueId ?? "") ===
      String(groundId)
    );

    if (usedByFixture) {
      alert(
        "This ground is used by one or more fixtures. " +
        "Change those fixtures to another ground before deleting it."
      );
      return;
    }

    if (!confirm(`Delete ground "${ground.name || ground.groundName}"?`)) {
      return;
    }

    persistGrounds(grounds.filter(item =>
      String(item.id) !== String(groundId)
    ));

    refreshGroundOptions();
  }

  function handleGroundGridClick(event) {
    const button = event.target.closest("[data-ground-action]");
    if (!button) return;

    const action = button.dataset.groundAction;
    const id = button.dataset.id;

    if (action === "edit") {
      const ground = getGrounds().find(item =>
        String(item.id) === String(id)
      );

      if (ground) openGroundModal(ground);
    }

    if (action === "delete") {
      deleteGround(id);
    }
  }

  /* ========================================================
     SYNC RESULTS FROM MATCH CENTER
     ======================================================== */

  function syncCompletedMatchToFixture(match) {
    if (!match) return;

    const fixtures = getFixtures();

    const matchFixtureId =
      match.fixtureId ??
      match.scheduledFixtureId ??
      match.sourceFixtureId;

    let index = matchFixtureId
      ? fixtures.findIndex(fixture =>
          String(fixture.id) === String(matchFixtureId)
        )
      : -1;

    // Fallback: match by teams and scheduled date.
    if (index < 0 && match.homeTeamId && match.awayTeamId) {
      index = fixtures.findIndex(fixture =>
        String(fixture.homeTeamId) === String(match.homeTeamId) &&
        String(fixture.awayTeamId) === String(match.awayTeamId) &&
        (!match.date || fixture.date === match.date)
      );
    }

    if (index < 0) return;

    const fixture = fixtures[index];

    const homeScore = match.homeScore ?? match.homeGoals;
    const awayScore = match.awayScore ?? match.awayGoals;

    if (
      homeScore === undefined || homeScore === null ||
      awayScore === undefined || awayScore === null
    ) {
      return;
    }

    fixture.homeScore = Number(homeScore);
    fixture.awayScore = Number(awayScore);
    fixture.score = `${Number(homeScore)} - ${Number(awayScore)}`;
    fixture.status = "completed";
    fixture.completedAt = match.completedAt || new Date().toISOString();
    fixture.updatedAt = new Date().toISOString();

    persistFixtures(fixtures);
    renderFixtures();
  }

  function handleMatchUpdate(event) {
    const detail = event?.detail;

    if (detail?.match) {
      syncCompletedMatchToFixture(detail.match);
    } else if (detail?.fixture) {
      renderFixtures();
    }
  }

  /*
   * Public method for other scripts to call when a match finishes.
   * Example:
   * window.MatchCraftFixtures.syncCompletedMatch(matchObject);
   */
  window.MatchCraftFixtures = {
    refresh() {
      refreshTournamentOptions();
      refreshGroundOptions();
      refreshTeamOptions();
      renderFixtures();
      renderGrounds();
    },

    getFixtures,
    getGrounds,

    syncCompletedMatch: syncCompletedMatchToFixture
  };

  /* ========================================================
     INITIALISE
     ======================================================== */

  function initialise() {
    refreshTournamentOptions();
    refreshGroundOptions();
    refreshTeamOptions();

    renderFixtures();
    renderGrounds();
    updateDashboardStats();

    el.form.addEventListener("submit", saveFixture);

    el.tournament?.addEventListener("change", () => {
      refreshTeamOptions();
    });

    el.homeTeam?.addEventListener("change", refreshTeamOptions);
    el.awayTeam?.addEventListener("change", refreshTeamOptions);

    el.search?.addEventListener("input", renderFixtures);
    el.filter?.addEventListener("change", renderFixtures);

    el.list.addEventListener("click", handleFixtureListClick);

    el.groundGrid?.addEventListener("click", handleGroundGridClick);

    el.addGroundButton?.addEventListener("click", () => {
      openGroundModal();
    });

    el.cancelEdit?.addEventListener("click", resetFixtureForm);

    el.resetButton?.addEventListener("click", () => {
      if (editingFixtureId) {
        resetFixtureForm();
      } else {
        el.form.reset();
        refreshTournamentOptions();
        refreshGroundOptions();
        refreshTeamOptions();
      }
    });

    window.addEventListener(
      "matchcraft:match-completed",
      handleMatchUpdate
    );

    window.addEventListener(
      "matchcraft:match-updated",
      handleMatchUpdate
    );

    window.addEventListener("storage", event => {
      if (
        event.key === KEYS.fixtures ||
        event.key === KEYS.grounds ||
        event.key === KEYS.teams ||
        event.key === KEYS.tournaments ||
        event.key === KEYS.matches
      ) {
        refreshTournamentOptions();
        refreshGroundOptions();
        refreshTeamOptions();
        renderFixtures();
        renderGrounds();
      }
    });

   window.addEventListener("matchcraft:teams-updated", () => {
        refreshTeamOptions();
        renderFixtures();
    });

    window.addEventListener("matchcraft:tournaments-updated", () => {
        refreshTournamentOptions();
        refreshTeamOptions();
        renderFixtures();
    });

    window.addEventListener("matchcraft:fixtures-updated", () => {
        renderFixtures();

        if (typeof updateDashboardStats === "function") {
            updateDashboardStats();
        }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, {
      once: true
    });
  } else {
    initialise();
  }
})();
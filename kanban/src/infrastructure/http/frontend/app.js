(() => {
  const board = document.getElementById("board");
  const taskCountEl = document.getElementById("task-count");
  const lastUpdateEl = document.getElementById("last-update");
  const connectionDot = document.getElementById("connection-dot");
  const connectionLabel = document.getElementById("connection-label");
  const projectPathEl = document.getElementById("project-path");
  const projectPicker = document.getElementById("project-path-picker");
  const projectPathInput = document.getElementById("project-path-input");
  const projectPathScan = document.getElementById("project-path-scan");
  const projectPathError = document.getElementById("project-path-error");
  const panelOverlay = document.getElementById("panel-overlay");
  const panelTitle = document.getElementById("panel-title");
  const panelBody = document.getElementById("panel-body");
  const panelClose = document.getElementById("panel-close");

  function setConnected(connected) {
    connectionDot.className = connected ? "dot dot-connected" : "dot dot-disconnected";
    connectionLabel.textContent = connected ? "connected" : "disconnected";
  }

  function createProgressBar(done, total) {
    const bar = document.createElement("span");
    bar.className = "progress-bar";
    const fill = document.createElement("span");
    fill.className = "progress-fill";
    fill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : "0%";
    bar.appendChild(fill);
    return bar;
  }

  function createSubList(subDocuments) {
    const list = document.createElement("ul");
    list.className = "sub-list";
    for (const sub of subDocuments) {
      const li = document.createElement("li");
      li.className = "sub-item";
      li.setAttribute("data-progress", sub.progressStatus);
      const bullet = document.createElement("span");
      bullet.className = "sub-bullet";
      const label = document.createElement("span");
      label.textContent = sub.name;
      const badge = document.createElement("span");
      badge.className = "sub-status";
      badge.textContent = sub.status;
      li.appendChild(bullet);
      li.appendChild(label);
      li.appendChild(badge);
      list.appendChild(li);
    }
    return list;
  }

  function createCard(card) {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.setAttribute("data-progress", card.progressStatus);

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = card.name;
    cardEl.appendChild(name);

    const status = document.createElement("span");
    status.className = "card-status";
    status.textContent = card.status;
    cardEl.appendChild(status);

    if (card.totalSubCount > 0) {
      const subs = document.createElement("div");
      subs.className = "card-subs card-subs-toggle";

      const chevron = document.createElement("span");
      chevron.className = "chevron";
      chevron.textContent = "▶";
      subs.appendChild(chevron);

      subs.appendChild(document.createTextNode(`${card.doneSubCount}/${card.totalSubCount} done `));
      subs.appendChild(createProgressBar(card.doneSubCount, card.totalSubCount));
      cardEl.appendChild(subs);

      const subList = createSubList(card.subDocuments);
      cardEl.appendChild(subList);

      subs.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = cardEl.classList.toggle("card-expanded");
        chevron.textContent = expanded ? "▼" : "▶";
      });
    }

    cardEl.addEventListener("click", () => openPanel(card));

    return cardEl;
  }

  function openPanel(card) {
    panelTitle.textContent = card.name;
    panelBody.innerHTML = "";

    const metaSection = document.createElement("div");
    const metaLabel = document.createElement("div");
    metaLabel.className = "panel-section-label";
    metaLabel.textContent = "Status";
    metaSection.appendChild(metaLabel);
    const metaRow = document.createElement("div");
    metaRow.className = "panel-meta";
    const statusBadge = document.createElement("span");
    statusBadge.className = "panel-badge";
    statusBadge.setAttribute("data-progress", card.progressStatus);
    statusBadge.textContent = card.status;
    metaRow.appendChild(statusBadge);
    if (card.type) {
      const typeBadge = document.createElement("span");
      typeBadge.className = "panel-badge";
      typeBadge.textContent = card.type;
      metaRow.appendChild(typeBadge);
    }
    metaSection.appendChild(metaRow);
    panelBody.appendChild(metaSection);

    const pathSection = document.createElement("div");
    const pathLabel = document.createElement("div");
    pathLabel.className = "panel-section-label";
    pathLabel.textContent = "Path";
    pathSection.appendChild(pathLabel);
    const pathValue = document.createElement("div");
    pathValue.className = "panel-filepath";
    pathValue.textContent = card.path;
    pathSection.appendChild(pathValue);
    panelBody.appendChild(pathSection);

    if (card.description) {
      const descSection = document.createElement("div");
      const descLabel = document.createElement("div");
      descLabel.className = "panel-section-label";
      descLabel.textContent = "Description";
      descSection.appendChild(descLabel);
      const descValue = document.createElement("div");
      descValue.style.fontSize = "12px";
      descValue.textContent = card.description;
      descSection.appendChild(descValue);
      panelBody.appendChild(descSection);
    }

    if (card.totalSubCount > 0) {
      const subsSection = document.createElement("div");
      const subsLabel = document.createElement("div");
      subsLabel.className = "panel-section-label";
      const doneCount = card.doneSubCount;
      const total = card.totalSubCount;
      subsLabel.textContent = `Sub-tasks (${doneCount}/${total})`;
      subsSection.appendChild(subsLabel);

      const progressRow = document.createElement("div");
      progressRow.className = "panel-progress-row";
      progressRow.appendChild(createProgressBar(doneCount, total));
      const pct = document.createElement("span");
      pct.className = "dimmed";
      pct.textContent = total > 0 ? `${Math.round((doneCount / total) * 100)}%` : "0%";
      progressRow.appendChild(pct);
      subsSection.appendChild(progressRow);

      const list = document.createElement("ul");
      list.className = "panel-sub-list";
      for (const sub of card.subDocuments) {
        const li = document.createElement("li");
        li.className = "panel-sub-item";
        li.setAttribute("data-progress", sub.progressStatus);
        const bullet = document.createElement("span");
        bullet.className = "panel-sub-bullet";
        li.appendChild(bullet);
        const name = document.createElement("span");
        name.className = "panel-sub-name";
        name.textContent = sub.name;
        li.appendChild(name);
        const badge = document.createElement("span");
        badge.className = "panel-sub-status";
        badge.textContent = sub.status;
        li.appendChild(badge);
        list.appendChild(li);
      }
      subsSection.appendChild(list);
      panelBody.appendChild(subsSection);
    }

    panelOverlay.classList.add("panel-visible");
  }

  function closePanel() {
    panelOverlay.classList.remove("panel-visible");
  }

  panelClose.addEventListener("click", closePanel);
  panelOverlay.addEventListener("click", (e) => {
    if (e.target === panelOverlay) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelOverlay.classList.contains("panel-visible")) closePanel();
  });

  function renderBoard(columns) {
    board.innerHTML = "";

    const totalCards = columns.reduce((sum, column) => sum + column.cards.length, 0);

    if (totalCards === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No task documents found.";
      board.appendChild(empty);
      updateFooter(0);
      return;
    }

    for (const column of columns) {
      const columnEl = document.createElement("div");
      columnEl.className = "column";

      const header = document.createElement("div");
      header.className = "column-header";

      const label = document.createElement("span");
      label.textContent = column.label;
      header.appendChild(label);

      const count = document.createElement("span");
      count.className = "column-count";
      count.textContent = column.cards.length;
      header.appendChild(count);

      columnEl.appendChild(header);

      for (const card of column.cards) {
        columnEl.appendChild(createCard(card));
      }

      board.appendChild(columnEl);
    }

    updateFooter(totalCards);
  }

  function updateFooter(count) {
    taskCountEl.textContent = `${count} task${count !== 1 ? "s" : ""}`;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    lastUpdateEl.textContent = `Last updated: ${hh}:${mm}:${ss}`;
  }

  function loadInitialData() {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((boardDto) => {
        renderBoard(boardDto.columns);
      })
      .catch(() => {
        board.innerHTML = '<div class="empty-state">Failed to load task documents.</div>';
      });
  }

  function showProjectError(message) {
    projectPathError.textContent = message;
    projectPathError.hidden = message === "";
  }

  function loadProject() {
    fetch("/api/project")
      .then((res) => res.json())
      .then((project) => {
        if (project.pinned) {
          projectPathEl.textContent = project.path;
          projectPathEl.hidden = false;
          projectPicker.hidden = true;
          return;
        }
        projectPathInput.value = project.path;
        projectPicker.hidden = false;
        projectPathEl.hidden = true;
      })
      .catch(() => {});
  }

  function scanProject() {
    const path = projectPathInput.value.trim();
    if (path === "") return;
    fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) {
          showProjectError("");
          loadInitialData();
          return;
        }
        showProjectError(body.error ?? "Failed to scan the project path.");
      })
      .catch(() => {
        showProjectError("Could not reach the server.");
      });
  }

  projectPathScan.addEventListener("click", scanProject);
  projectPathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") scanProject();
  });

  function connectSSE() {
    const source = new EventSource("/events");

    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (event) => {
      try {
        const boardDto = JSON.parse(event.data);
        renderBoard(boardDto.columns);
      } catch (_) {}
    };

    source.onerror = () => {
      setConnected(false);
    };
  }

  loadProject();
  loadInitialData();
  connectSSE();
})();

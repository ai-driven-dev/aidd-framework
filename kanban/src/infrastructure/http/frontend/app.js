(() => {
  const PROGRESS_ORDER = ["todo", "in-progress", "done", "blocked", "unknown"];
  const PROGRESS_LABELS = {
    todo: "TODO",
    "in-progress": "IN PROGRESS",
    done: "DONE",
    blocked: "BLOCKED",
    unknown: "UNKNOWN",
  };

  const board = document.getElementById("board");
  const taskCountEl = document.getElementById("task-count");
  const lastUpdateEl = document.getElementById("last-update");
  const connectionDot = document.getElementById("connection-dot");
  const connectionLabel = document.getElementById("connection-label");
  const projectPathEl = document.getElementById("project-path");
  const panelOverlay = document.getElementById("panel-overlay");
  const panelTitle = document.getElementById("panel-title");
  const panelBody = document.getElementById("panel-body");
  const panelClose = document.getElementById("panel-close");

  function setConnected(connected) {
    connectionDot.className = connected ? "dot dot-connected" : "dot dot-disconnected";
    connectionLabel.textContent = connected ? "connected" : "disconnected";
  }

  function countDoneSubs(subDocuments) {
    let done = 0;
    for (const sub of subDocuments) {
      if (sub.progressStatus === "done") done++;
    }
    return done;
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

  function createCard(group) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-progress", group.parent.progressStatus);

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = group.parent.name;
    card.appendChild(name);

    const status = document.createElement("span");
    status.className = "card-status";
    status.textContent = group.parent.status;
    card.appendChild(status);

    if (group.subDocuments.length > 0) {
      const subs = document.createElement("div");
      subs.className = "card-subs card-subs-toggle";
      const doneCount = countDoneSubs(group.subDocuments);
      const total = group.subDocuments.length;

      const chevron = document.createElement("span");
      chevron.className = "chevron";
      chevron.textContent = "▶";
      subs.appendChild(chevron);

      const summary = document.createTextNode(`${doneCount}/${total} done `);
      subs.appendChild(summary);
      subs.appendChild(createProgressBar(doneCount, total));
      card.appendChild(subs);

      const subList = createSubList(group.subDocuments);
      card.appendChild(subList);

      subs.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = card.classList.toggle("card-expanded");
        chevron.textContent = expanded ? "▼" : "▶";
      });
    }

    card.addEventListener("click", () => openPanel(group));

    return card;
  }

  function openPanel(group) {
    panelTitle.textContent = group.parent.name;
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
    statusBadge.setAttribute("data-progress", group.parent.progressStatus);
    statusBadge.textContent = group.parent.status;
    metaRow.appendChild(statusBadge);
    if (group.parent.type) {
      const typeBadge = document.createElement("span");
      typeBadge.className = "panel-badge";
      typeBadge.textContent = group.parent.type;
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
    pathValue.textContent = group.parent.filePath;
    pathSection.appendChild(pathValue);
    panelBody.appendChild(pathSection);

    if (group.parent.description) {
      const descSection = document.createElement("div");
      const descLabel = document.createElement("div");
      descLabel.className = "panel-section-label";
      descLabel.textContent = "Description";
      descSection.appendChild(descLabel);
      const descValue = document.createElement("div");
      descValue.style.fontSize = "12px";
      descValue.textContent = group.parent.description;
      descSection.appendChild(descValue);
      panelBody.appendChild(descSection);
    }

    if (group.subDocuments.length > 0) {
      const subsSection = document.createElement("div");
      const subsLabel = document.createElement("div");
      subsLabel.className = "panel-section-label";
      const doneCount = countDoneSubs(group.subDocuments);
      const total = group.subDocuments.length;
      subsLabel.textContent = `Sub-tasks (${doneCount}/${total})`;
      subsSection.appendChild(subsLabel);

      const progressRow = document.createElement("div");
      progressRow.className = "panel-progress-row";
      progressRow.appendChild(
        createProgressBar(doneCount, total)
      );
      const pct = document.createElement("span");
      pct.className = "dimmed";
      pct.textContent = total > 0 ? `${Math.round((doneCount / total) * 100)}%` : "0%";
      progressRow.appendChild(pct);
      subsSection.appendChild(progressRow);

      const list = document.createElement("ul");
      list.className = "panel-sub-list";
      for (const sub of group.subDocuments) {
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
    if (e.key === "Escape" && !panelOverlay.hidden) closePanel();
  });

  function groupByProgress(taskGroups) {
    const grouped = {};
    for (const ps of PROGRESS_ORDER) {
      grouped[ps] = [];
    }
    for (const group of taskGroups) {
      const ps = group.parent.progressStatus;
      if (!grouped[ps]) grouped[ps] = [];
      grouped[ps].push(group);
    }
    return grouped;
  }

  function renderBoard(taskGroups) {
    board.innerHTML = "";

    if (taskGroups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No task documents found.";
      board.appendChild(empty);
      updateFooter(0);
      return;
    }

    const grouped = groupByProgress(taskGroups);

    for (const ps of PROGRESS_ORDER) {
      const items = grouped[ps];

      if (ps === "unknown" && items.length === 0) continue;

      const column = document.createElement("div");
      column.className = "column";

      const header = document.createElement("div");
      header.className = "column-header";

      const label = document.createElement("span");
      label.textContent = PROGRESS_LABELS[ps];
      header.appendChild(label);

      const count = document.createElement("span");
      count.className = "column-count";
      count.textContent = items.length;
      header.appendChild(count);

      column.appendChild(header);

      for (const item of items) {
        column.appendChild(createCard(item));
      }

      board.appendChild(column);
    }

    updateFooter(taskGroups.length);
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
      .then((data) => {
        renderBoard(data);
        projectPathEl.textContent = document.title;
      })
      .catch(() => {
        board.innerHTML = '<div class="empty-state">Failed to load task documents.</div>';
      });
  }

  function connectSSE() {
    const source = new EventSource("/events");

    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        renderBoard(data);
      } catch (_) {
        // ignore malformed events
      }
    };

    source.onerror = () => {
      setConnected(false);
    };
  }

  loadInitialData();
  connectSSE();
})();

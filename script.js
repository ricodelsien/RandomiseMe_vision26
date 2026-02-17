/* RandomiseMe! – Done, History, Tags, Export + Priority + In‑Progress */

document.addEventListener("DOMContentLoaded", function () {

  // Mobile: reduce accidental zoom gestures
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // App icon variant (useful BEFORE installing / adding to Home Screen)
  const ICON_VARIANTS = {
    default: { manifest: "manifest.json", icon: "icon.png" },
    blue:    { manifest: "manifest-blue.json", icon: "icon/icon_blue.png" },
    green:   { manifest: "manifest-green.json", icon: "icon/icon_green.png" },
    orange:  { manifest: "manifest-orange.json", icon: "icon/icon_orange.png" },
    pink:    { manifest: "manifest-pink.json", icon: "icon/icon_pink.png" },
    violet:  { manifest: "manifest-violet.json", icon: "icon/icon_violet.png" },
    yellow:  { manifest: "manifest-yellow.json", icon: "icon/icon_yellow.png" },
  };

  function getInitialIconVariant() {
    try {
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get("icon");
      if (fromQuery && ICON_VARIANTS[fromQuery]) return fromQuery;

      const stored = localStorage.getItem("iconVariant");
      if (stored && ICON_VARIANTS[stored]) return stored;
    } catch {}
    return "default";
  }

  function applyIconVariant(variant, { persist = true } = {}) {
    const v = ICON_VARIANTS[variant] ? variant : "default";

    const manifestLink = document.getElementById("manifestLink");
    if (manifestLink) manifestLink.setAttribute("href", ICON_VARIANTS[v].manifest);

    const appleIcon = document.getElementById("appleTouchIcon");
    if (appleIcon) appleIcon.setAttribute("href", ICON_VARIANTS[v].icon);

    const appIcon = document.getElementById("appIcon");
    if (appIcon) appIcon.setAttribute("href", ICON_VARIANTS[v].icon);

    // reflect in URL (so the install prompt uses the chosen variant)
    try {
      const url = new URL(window.location.href);
      if (v === "default") url.searchParams.delete("icon");
      else url.searchParams.set("icon", v);
      history.replaceState(null, "", url.toString());
    } catch {}

    if (persist) {
      try { localStorage.setItem("iconVariant", v); } catch {}
    }

    // highlight selection in modal
    document.querySelectorAll(".icon-chip").forEach((b) => {
      b.classList.toggle("is-selected", b.dataset.iconVariant === v);
    });
  }

  applyIconVariant(getInitialIconVariant(), { persist: false });

  const STORAGE_KEYS = {
    projects: "projects",
    progress: "inProgressProjects",
    done: "doneProjects",
    history: "history",
    groups: "projectGroups", // map: lower(name) => group/tag
    prio: "projectPriorities" // map: lower(name) => 0..3
  };

  const MAX_HISTORY = 50;

  // Cache DOM nodes (avoids repeated lookups)
  const DOM = {
    progressWrap: document.getElementById("progressWrap"),
    progressList: document.getElementById("progressList"),
    projectList: document.getElementById("projectList"),
    doneList: document.getElementById("doneList"),
    historyList: document.getElementById("historyList"),
    doneCount: document.getElementById("doneCount"),
    historyCount: document.getElementById("historyCount"),
    result: document.getElementById("result"),
    resultActions: document.getElementById("resultActions"),
    randomBtn: document.getElementById("randomBtn"),
    langSelect: document.getElementById("langSelect"),
  };

  // ---------- state ----------

  let projects = loadArray(STORAGE_KEYS.projects);
  let inProgress = loadArray(STORAGE_KEYS.progress);
  let doneProjects = loadArray(STORAGE_KEYS.done);
  let history = loadArray(STORAGE_KEYS.history);
  let groupsByName = loadObject(STORAGE_KEYS.groups);
  let prioByName = loadObject(STORAGE_KEYS.prio);

  // Fast membership checks (case-insensitive)
  let projectsSet = new Set(projects.map(p => String(p).toLowerCase()));
  // normalize inProgress format (legacy-safe)
  inProgress = (Array.isArray(inProgress) ? inProgress : []).map((x) => {
    if (typeof x === "string") return { name: x, startedAt: new Date().toISOString() };
    if (x && typeof x === "object" && x.name) return { name: String(x.name), startedAt: x.startedAt || new Date().toISOString() };
    return null;
  }).filter(Boolean);
  let progressSet = new Set(inProgress.map(x => String(x.name).toLowerCase()));
  let doneSet = new Set(doneProjects.map(x => (x && x.name ? String(x.name).toLowerCase() : "")));

  // Keep a single undo action (simple + predictable)
  let lastUndo = null;
  let toastTimer = null;

  // Last picked project name (for result action buttons)
  let lastPicked = null;

  // ---------- language select (English alphabetical order) ----------

  const LANG_META = {
    cs: { native: "Čeština", english: "Czech", flag: "🇨🇿" },
    da: { native: "Dansk", english: "Danish", flag: "🇩🇰" },
    de: { native: "Deutsch", english: "German", flag: "🇩🇪" },
    el: { native: "Ελληνικά", english: "Greek", flag: "🇬🇷" },
    en: { native: "English", english: "English", flag: "🇬🇧" },
    es: { native: "Español", english: "Spanish", flag: "🇪🇸" },
    fi: { native: "Suomi", english: "Finnish", flag: "🇫🇮" },
    fr: { native: "Français", english: "French", flag: "🇫🇷" },
    it: { native: "Italiano", english: "Italian", flag: "🇮🇹" },
    nb: { native: "Norsk bokmål", english: "Norwegian", flag: "🇳🇴" },
    nl: { native: "Nederlands", english: "Dutch", flag: "🇳🇱" },
    pl: { native: "Polski", english: "Polish", flag: "🇵🇱" },
    pt: { native: "Português", english: "Portuguese", flag: "🇵🇹" },
    ru: { native: "Русский", english: "Russian", flag: "🇷🇺" },
    sv: { native: "Svenska", english: "Swedish", flag: "🇸🇪" },
    tr: { native: "Türkçe", english: "Turkish", flag: "🇹🇷" },
    uk: { native: "Українська", english: "Ukrainian", flag: "🇺🇦" }
  };

  function buildLanguageSelectEnglishAlphabetical() {
    const selectEl = DOM.langSelect;
    if (!selectEl || !window.i18n) return;

    const available =
      (typeof window.i18n.available === "function") ? window.i18n.available() : [];

    const known = available
      .filter((code) => LANG_META[code])
      .map((code) => ({ code, ...LANG_META[code] }))
      .sort((a, b) => a.english.localeCompare(b.english, undefined, { sensitivity: "base" }));

    const unknown = available
      .filter((code) => !LANG_META[code])
      .map((code) => ({ code, name: code.toUpperCase(), native: code.toUpperCase(), flag: "🏳️" }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    selectEl.innerHTML = "";
    for (const it of [...known, ...unknown]) {
      const opt = document.createElement("option");
      opt.value = it.code;
      opt.textContent = `${it.flag} ${it.native}`;
      selectEl.appendChild(opt);
    }

    const current = (typeof window.i18n.getLang === "function") ? window.i18n.getLang() : "en";
    selectEl.value = current;
  }

  // ---------- helpers ----------

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadObject(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveAll() {
    localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(inProgress));
    localStorage.setItem(STORAGE_KEYS.done, JSON.stringify(doneProjects));
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    localStorage.setItem(STORAGE_KEYS.groups, JSON.stringify(groupsByName));
    localStorage.setItem(STORAGE_KEYS.prio, JSON.stringify(prioByName));
  }

  // Defer storage writes so UI updates feel instant on mobile.
  let saveQueued = false;
  function scheduleSave() {
    if (saveQueued) return;
    saveQueued = true;

    const run = () => {
      saveQueued = false;
      saveAll();
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 600 });
    } else {
      setTimeout(run, 0);
    }
  }

  function flushSaveNow() {
    if (!saveQueued) return;
    saveQueued = false;
    saveAll();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushSaveNow();
  });

  window.addEventListener("beforeunload", () => {
    flushSaveNow();
  });

  function rebuildSets() {
    projectsSet = new Set(projects.map(p => String(p).toLowerCase()));
    progressSet = new Set(inProgress.map(x => String(x.name).toLowerCase()));
    doneSet = new Set(doneProjects.map(x => (x && x.name ? String(x.name).toLowerCase() : "")));
  }

  function escapeHTML(str) {
    const s = String(str ?? "");
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeName(name) {
    return (name || "").trim();
  }

  function normalizeGroup(group) {
    const g = (group || "").trim();
    // keep it small-ish for UI; still user-editable
    return g.length > 28 ? g.slice(0, 28) : g;
  }

  function parseNameAndGroup(raw) {
    const input = normalizeName(raw);
    if (!input) return { name: "", group: "" };

    // [Group] Name
    const m = input.match(/^\[(.+?)\]\s*(.+)$/);
    if (m) {
      return { group: normalizeGroup(m[1]), name: normalizeName(m[2]) };
    }

    // Group :: Name
    const idx = input.indexOf("::");
    if (idx > 0) {
      const g = normalizeGroup(input.slice(0, idx));
      const n = normalizeName(input.slice(idx + 2));
      if (g && n) return { group: g, name: n };
    }

    return { name: input, group: "" };
  }

  function findIndexCaseInsensitive(arr, name) {
    const target = (name || "").toLowerCase();
    return arr.findIndex((x) => {
      const v = (typeof x === "string") ? x : (x && x.name ? x.name : "");
      return v.toLowerCase() === target;
    });
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "2-digit", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });
    } catch {
      return "";
    }
  }

  function t(key, vars) {
    return (window.i18n && typeof window.i18n.t === "function")
      ? window.i18n.t(key, vars)
      : key;
  }

  function groupOf(name) {
    const key = String(name || "").toLowerCase();
    const g = groupsByName[key];
    return normalizeGroup(g || "");
  }

  // ---------- priority ----------

  const MAX_PRIO = 3; // 0..3

  function prioOf(name) {
    const key = String(name || "").toLowerCase();
    const v = prioByName[key];
    const n = Number(v);
    if (!key) return 0;
    return Number.isFinite(n) ? Math.max(0, Math.min(MAX_PRIO, Math.round(n))) : 0;
  }

  function starsFor(prio) {
    const p = Math.max(0, Math.min(MAX_PRIO, prio || 0));
    return p === 0 ? "☆" : "⭐".repeat(p);
  }

  function cyclePrio(name) {
    const key = String(name || "").toLowerCase();
    if (!key) return;
    const cur = prioOf(name);
    const next = (cur + 1) % (MAX_PRIO + 1);
    if (next === 0) {
      delete prioByName[key];
      scheduleSave();
      scheduleRender("projects");
      scheduleRender("progress");
      scheduleRender("done");
      showToast(t("toast.prio_cleared"));
      return;
    }
    prioByName[key] = next;
    scheduleSave();
    scheduleRender("projects");
    scheduleRender("progress");
    scheduleRender("done");
    showToast(t("toast.prio_set", { prio: starsFor(next) }));
  }

  function setGroup(name, group) {
    const key = String(name || "").toLowerCase();
    if (!key) return;

    const g = normalizeGroup(group);
    if (!g) {
      delete groupsByName[key];
      scheduleSave();
      scheduleRender("progress");
      scheduleRender("projects");
      scheduleRender("done");
      showToast(t("toast.group_cleared"));
      return;
    }

    groupsByName[key] = g;
    scheduleSave();
    scheduleRender("progress");
    scheduleRender("projects");
    scheduleRender("done");
    showToast(t("toast.group_set", { group: g }));
  }

  function pushHistory(type, name) {
    history.unshift({ type, name, at: new Date().toISOString() });
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    scheduleSave();
    scheduleRender("history");
  }

  async function copyToClipboard(text) {
    const value = String(text || "");
    if (!value.trim()) {
      alert(t("alert.nothing_to_copy"));
      return false;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast(t("toast.copied"));
      return true;
    } catch {
      return false;
    }
  }

  // ---------- toast / undo ----------

  function clearToast() {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.style.display = "none";
    toast.innerHTML = "";
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  function showToast(message, withUndo = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    clearToast();

    const wrap = document.createElement("div");
    wrap.className = "toast-inner";

    const msg = document.createElement("div");
    msg.className = "toast-message";
    msg.textContent = message;

    wrap.appendChild(msg);

    if (withUndo && lastUndo) {
      const btn = document.createElement("button");
      btn.textContent = t("btn.undo");
      btn.setAttribute("aria-label", t("aria.undo"));
      btn.addEventListener("click", () => {
        performUndo();
        clearToast();
      });
      wrap.appendChild(btn);
    }

    toast.appendChild(wrap);
    toast.style.display = "block";

    toastTimer = setTimeout(() => {
      clearToast();
      lastUndo = null;
    }, 8500);
  }

  function setUndo(action) {
    lastUndo = action;
  }

  function performUndo() {
    if (!lastUndo) return;

    const a = lastUndo;
    lastUndo = null;

    if (a.type === "deleteActive") {
      projects.splice(a.index, 0, a.name);
      pushHistory("restore", a.name);
    }

    if (a.type === "deleteDone") {
      doneProjects.splice(a.index, 0, a.item);
      pushHistory("restore", a.item.name);
    }

    if (a.type === "markDone") {
      const di = findIndexCaseInsensitive(doneProjects, a.name);
      if (di !== -1) doneProjects.splice(di, 1);
      projects.splice(a.fromIndex, 0, a.name);
      pushHistory("restore", a.name);
    }

    if (a.type === "restoreFromDone") {
      const pi = findIndexCaseInsensitive(projects, a.name);
      if (pi !== -1) projects.splice(pi, 1);
      doneProjects.splice(a.fromIndex, 0, a.item);
      pushHistory("restore", a.name);
    }

    if (a.type === "clearActive") {
      projects = a.snapshot;
    }

    if (a.type === "clearDone") {
      doneProjects = a.snapshot;
    }

    if (a.type === "clearHistory") {
      history = a.snapshot;
    }

    if (a.type === "deleteProgress") {
      inProgress.splice(a.index, 0, a.item);
    }

    if (a.type === "backToActive") {
      // move back to progress
      const pi = findIndexCaseInsensitive(projects, a.name);
      if (pi !== -1) projects.splice(pi, 1);
      inProgress.splice(a.fromIndex, 0, a.item);
    }

    if (a.type === "doneFromProgress") {
      const di = findIndexCaseInsensitive(doneProjects, a.name);
      if (di !== -1) doneProjects.splice(di, 1);
      inProgress.splice(a.fromIndex, 0, a.item);
    }

    rebuildSets();
    scheduleSave();
    scheduleRender("progress");
    scheduleRender("projects");
    scheduleRender("done");
    scheduleRender("history");
  }

  // ---------- core actions ----------

  function addProject(raw) {
    const { name: parsedName, group } = parseNameAndGroup(raw);
    const name = normalizeName(parsedName);
    if (!name) return;

    const key = name.toLowerCase();

    // If already in progress, don't duplicate; still allow tag/priority updates
    if (progressSet.has(key)) {
      if (group) setGroup(name, group);
      return;
    }

    // If it exists in Done, restore it instead of duplicating
    if (doneSet.has(key)) {
      const doneIdx = findIndexCaseInsensitive(doneProjects, name);
      if (doneIdx !== -1) {
        const item = doneProjects.splice(doneIdx, 1)[0];
        doneSet.delete(key);
        if (!projectsSet.has(key)) {
          projects.push(item.name);
          projectsSet.add(key);
        }
        if (group) setGroup(item.name, group);
        scheduleSave();
        scheduleRender("projects");
        scheduleRender("done");
        pushHistory("restore", item.name);
        showToast(t("toast.restored", { name: item.name }));
        return;
      }
    }

    // Avoid duplicates in active list
    if (!projectsSet.has(key)) {
      projects.push(name);
      projectsSet.add(key);
      if (group) setGroup(name, group);
      scheduleSave();
      scheduleRender("projects");
      return;
    }

    // If duplicate but user provided a group, update it
    if (group) setGroup(name, group);
  }

  function deleteActive(index) {
    const name = projects[index];
    if (!name) return;

    projectsSet.delete(String(name).toLowerCase());

    projects.splice(index, 1);
    scheduleSave();
    scheduleRender("projects");

    setUndo({ type: "deleteActive", name, index });
    pushHistory("delete", name);
    showToast(t("toast.deleted", { name }), true);
  }

  function deleteProgress(index) {
    const item = inProgress[index];
    if (!item || !item.name) return;

    progressSet.delete(String(item.name).toLowerCase());
    inProgress.splice(index, 1);

    scheduleSave();
    scheduleRender("progress");

    setUndo({ type: "deleteProgress", index, item });
    pushHistory("delete", item.name);
    showToast(t("toast.deleted", { name: item.name }), true);

    if (lastPicked && lastPicked.toLowerCase() === item.name.toLowerCase()) {
      lastPicked = null;
      updateResultActions();
    }
  }

  function moveToProgressByName(name, { fromIndex = null } = {}) {
    const n = normalizeName(name);
    if (!n) return;
    const key = n.toLowerCase();

    // remove from active
    const idx = (fromIndex !== null && Number.isFinite(fromIndex)) ? fromIndex : findIndexCaseInsensitive(projects, n);
    if (idx !== -1) {
      projects.splice(idx, 1);
      projectsSet.delete(key);
    }

    // add to progress
    if (!progressSet.has(key)) {
      inProgress.unshift({ name: n, startedAt: new Date().toISOString() });
      progressSet.add(key);
    }

    scheduleSave();
    scheduleRender("progress");
    scheduleRender("projects");
  }

  function backToActiveFromProgress(index) {
    const item = inProgress[index];
    if (!item || !item.name) return;
    const name = item.name;
    const key = String(name).toLowerCase();

    progressSet.delete(key);
    inProgress.splice(index, 1);

    if (!projectsSet.has(key)) {
      projects.push(name);
      projectsSet.add(key);
    }

    scheduleSave();
    scheduleRender("progress");
    scheduleRender("projects");

    setUndo({ type: "backToActive", name, fromIndex: index, item });
    pushHistory("restore", name);
    showToast(t("toast.restored", { name }), true);

    if (lastPicked && lastPicked.toLowerCase() === name.toLowerCase()) {
      lastPicked = null;
      updateResultActions();
    }
  }

  function markDoneFromProgress(index) {
    const item = inProgress[index];
    if (!item || !item.name) return;
    const name = item.name;
    const key = String(name).toLowerCase();

    progressSet.delete(key);
    inProgress.splice(index, 1);

    const doneItem = { name, doneAt: new Date().toISOString() };
    doneProjects.unshift(doneItem);
    doneSet.add(key);

    scheduleSave();
    scheduleRender("progress");
    scheduleRender("done");

    setUndo({ type: "doneFromProgress", name, fromIndex: index, item });
    pushHistory("done", name);
    showToast(t("toast.done", { name }), true);

    if (lastPicked && lastPicked.toLowerCase() === name.toLowerCase()) {
      lastPicked = null;
      updateResultActions();
    }
  }

  function markDone(index) {
    const name = projects[index];
    if (!name) return;

    const key = String(name).toLowerCase();
    projectsSet.delete(key);

    projects.splice(index, 1);
    const item = { name, doneAt: new Date().toISOString() };
    doneProjects.unshift(item);
    doneSet.add(key);

    scheduleSave();
    scheduleRender("projects");
    scheduleRender("done");

    setUndo({ type: "markDone", name, fromIndex: index });
    pushHistory("done", name);
    showToast(t("toast.done", { name }), true);

    if (lastPicked && lastPicked.toLowerCase() === name.toLowerCase()) {
      lastPicked = null;
      updateResultActions();
    }
  }

  function restoreFromDone(index) {
    const item = doneProjects[index];
    if (!item || !item.name) return;

    const key = String(item.name).toLowerCase();
    doneSet.delete(key);

    doneProjects.splice(index, 1);

    if (!projectsSet.has(key)) {
      projects.push(item.name);
      projectsSet.add(key);
    }

    scheduleSave();
    scheduleRender("projects");
    scheduleRender("done");

    setUndo({ type: "restoreFromDone", name: item.name, fromIndex: index, item });
    pushHistory("restore", item.name);
    showToast(t("toast.restored", { name: item.name }), true);
  }

  function deleteDone(index) {
    const item = doneProjects[index];
    if (!item || !item.name) return;

    doneSet.delete(String(item.name).toLowerCase());

    doneProjects.splice(index, 1);
    scheduleSave();
    scheduleRender("done");

    setUndo({ type: "deleteDone", index, item });
    pushHistory("delete", item.name);
    showToast(t("toast.deleted", { name: item.name }), true);
  }

  function clearActive() {
    const confirmDelete = confirm(t("confirm.clear"));
    if (!confirmDelete) return;

    const snapshot = [...projects];
    projects = [];
    projectsSet.clear();

    scheduleSave();
    scheduleRender("projects");

    if (DOM.result) DOM.result.innerHTML = "";

    lastPicked = null;
    updateResultActions();

    setUndo({ type: "clearActive", snapshot });
    showToast(t("toast.cleared_active"), true);
  }

  function clearDone() {
    if (doneProjects.length === 0) return;

    const ok = confirm(t("confirm.clear_done"));
    if (!ok) return;

    const snapshot = [...doneProjects];
    doneProjects = [];
    doneSet.clear();

    scheduleSave();
    scheduleRender("done");

    setUndo({ type: "clearDone", snapshot });
    showToast(t("toast.cleared_done"), true);
  }

  function clearHistory() {
    if (history.length === 0) return;

    const ok = confirm(t("confirm.clear_history"));
    if (!ok) return;

    const snapshot = [...history];
    history = [];

    scheduleSave();
    scheduleRender("history");

    setUndo({ type: "clearHistory", snapshot });
    showToast(t("toast.cleared_history"), true);
  }

  function promptGroupForName(name) {
    const current = groupOf(name);
    const entered = prompt(t("prompt.group"), current);
    if (entered === null) return; // cancel
    setGroup(name, entered);
  }

  // ---------- rendering ----------

  // Batch renders to next animation frame (prevents repeated DOM rebuilds per action)
  const renderFlags = { progress: false, projects: false, done: false, history: false, resultActions: false };
  let renderQueued = false;
  function scheduleRender(which) {
    if (which && renderFlags.hasOwnProperty(which)) renderFlags[which] = true;
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(flushRender);
    }
  }

  function flushRender() {
    renderQueued = false;

    if (renderFlags.progress) {
      renderFlags.progress = false;
      renderProgress();
    }

    if (renderFlags.projects) {
      renderFlags.projects = false;
      renderProjects();
    }

    if (renderFlags.done) {
      renderFlags.done = false;
      renderDone();
    }

    if (renderFlags.history) {
      renderFlags.history = false;
      renderHistory();
    }

    if (renderFlags.resultActions) {
      renderFlags.resultActions = false;
      updateResultActions();
    }
  }

  function renderProjects() {
    const list = DOM.projectList;
    if (!list) return;

    const ariaDone = escapeHTML(t("aria.done"));
    const ariaDelete = escapeHTML(t("aria.delete"));
    const ariaGroup = escapeHTML(t("aria.group"));
    const ariaPrio = escapeHTML(t("aria.prio"));

    let html = "";
    for (let i = 0; i < projects.length; i++) {
      const name = projects[i];
      const g = groupOf(name);
      const tag = g ? `<span class="item-tag">${escapeHTML(g)}</span>` : "";
      const pr = prioOf(name);
      const prTxt = starsFor(pr);

      html +=
        `<li class="item">` +
          `<span class="item-text">${tag}${escapeHTML(name)}</span>` +
          `<div class="item-actions">` +
            `<button class="icon-btn" data-action="prio" data-index="${i}" title="${ariaPrio}" aria-label="${ariaPrio}">${escapeHTML(prTxt)}</button>` +
            `<button class="icon-btn" data-action="group" data-index="${i}" title="${ariaGroup}" aria-label="${ariaGroup}">🏷️</button>` +
            `<button class="icon-btn" data-action="done" data-index="${i}" title="${ariaDone}" aria-label="${ariaDone}">✅</button>` +
            `<button class="icon-btn" data-action="delete" data-index="${i}" title="${ariaDelete}" aria-label="${ariaDelete}">❌</button>` +
          `</div>` +
        `</li>`;
    }
    list.innerHTML = html;
  }

  function renderProgress() {
    const wrap = DOM.progressWrap;
    const list = DOM.progressList;
    if (!wrap || !list) return;

    if (!inProgress.length) {
      wrap.hidden = true;
      list.innerHTML = "";
      return;
    }

    wrap.hidden = false;

    const ariaDone = escapeHTML(t("aria.done"));
    const ariaDelete = escapeHTML(t("aria.delete"));
    const ariaBack = escapeHTML(t("aria.back"));
    const ariaGroup = escapeHTML(t("aria.group"));
    const ariaPrio = escapeHTML(t("aria.prio"));

    let html = "";
    for (let i = 0; i < inProgress.length; i++) {
      const it = inProgress[i];
      const name = it.name;
      const meta = it.startedAt ? fmtTime(it.startedAt) : "";
      const g = groupOf(name);
      const tag = g ? `<span class="item-tag">${escapeHTML(g)}</span>` : "";
      const pr = prioOf(name);
      const prTxt = starsFor(pr);

      html +=
        `<li class="item">` +
          `<span class="item-text">${tag}${escapeHTML(name)}<span class="item-meta">${escapeHTML(meta)}</span></span>` +
          `<div class="item-actions">` +
            `<button class="icon-btn" data-action="prio" data-index="${i}" title="${ariaPrio}" aria-label="${ariaPrio}">${escapeHTML(prTxt)}</button>` +
            `<button class="icon-btn" data-action="group" data-index="${i}" title="${ariaGroup}" aria-label="${ariaGroup}">🏷️</button>` +
            `<button class="icon-btn" data-action="done" data-index="${i}" title="${ariaDone}" aria-label="${ariaDone}">✅</button>` +
            `<button class="icon-btn" data-action="back" data-index="${i}" title="${ariaBack}" aria-label="${ariaBack}">↩️</button>` +
            `<button class="icon-btn" data-action="delete" data-index="${i}" title="${ariaDelete}" aria-label="${ariaDelete}">❌</button>` +
          `</div>` +
        `</li>`;
    }
    list.innerHTML = html;
  }

  function renderDone() {
    const list = DOM.doneList;
    if (DOM.doneCount) DOM.doneCount.textContent = String(doneProjects.length);
    if (!list) return;

    const ariaRestore = escapeHTML(t("aria.restore"));
    const ariaDelete = escapeHTML(t("aria.delete"));
    const ariaGroup = escapeHTML(t("aria.group"));
    const ariaPrio = escapeHTML(t("aria.prio"));

    let html = "";
    for (let i = 0; i < doneProjects.length; i++) {
      const item = doneProjects[i];
      const meta = item && item.doneAt ? fmtTime(item.doneAt) : "";
      const g = groupOf(item.name);
      const tag = g ? `<span class="item-tag">${escapeHTML(g)}</span>` : "";
      const pr = prioOf(item.name);
      const prTxt = starsFor(pr);

      html +=
        `<li class="item">` +
          `<span class="item-text">${tag}${escapeHTML(item.name)}<span class="item-meta">${escapeHTML(meta)}</span></span>` +
          `<div class="item-actions">` +
            `<button class="icon-btn" data-action="prio" data-index="${i}" title="${ariaPrio}" aria-label="${ariaPrio}">${escapeHTML(prTxt)}</button>` +
            `<button class="icon-btn" data-action="group" data-index="${i}" title="${ariaGroup}" aria-label="${ariaGroup}">🏷️</button>` +
            `<button class="icon-btn" data-action="restore" data-index="${i}" title="${ariaRestore}" aria-label="${ariaRestore}">↩️</button>` +
            `<button class="icon-btn" data-action="delete" data-index="${i}" title="${ariaDelete}" aria-label="${ariaDelete}">❌</button>` +
          `</div>` +
        `</li>`;
    }
    list.innerHTML = html;
  }

  function renderHistory() {
    const list = DOM.historyList;
    if (DOM.historyCount) DOM.historyCount.textContent = String(history.length);
    if (!list) return;

    let html = "";
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const actionLabel = t("history." + h.type);
      const meta = h.at ? fmtTime(h.at) : "";
      const g = groupOf(h.name);
      const tag = g ? `<span class="item-tag">${escapeHTML(g)}</span>` : "";
      html +=
        `<li class="item">` +
          `<span class="item-text">${escapeHTML(actionLabel)}: ${tag}${escapeHTML(h.name)}<span class="item-meta">${escapeHTML(meta)}</span></span>` +
        `</li>`;
    }
    list.innerHTML = html;
  }

  function updateResultActions() {
    if (!DOM.resultActions) return;
    DOM.resultActions.hidden = !lastPicked;
  }

  // ---------- randomiser ----------

  function pickWeightedIndex() {
    // default weight = 1; priority 1..3 => weight 2..4
    let total = 0;
    const weights = new Array(projects.length);
    for (let i = 0; i < projects.length; i++) {
      const w = 1 + prioOf(projects[i]);
      weights[i] = w;
      total += w;
    }
    const r = Math.random() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r <= acc) return i;
    }
    return Math.max(0, projects.length - 1);
  }

  function roll() {
    if (projects.length === 0) {
      alert(t("alert.no_projects"));
      return;
    }

    const resultDiv = DOM.result;
    const button = DOM.randomBtn;

    if (!resultDiv || !button) return;

    button.classList.add("rolling");

    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * projects.length);
      resultDiv.textContent = projects[randomIndex];
    }, 80);

    setTimeout(() => {
      clearInterval(interval);
      button.classList.remove("rolling");

      const finalIndex = pickWeightedIndex();
      lastPicked = projects[finalIndex];

      const exclamations = t("exclamations");
      const list = Array.isArray(exclamations) ? exclamations : ["Et voilà:"];
      const randomExclamation = list[Math.floor(Math.random() * list.length)];

      resultDiv.classList.remove("winner-glow");
      void resultDiv.offsetWidth;

      resultDiv.innerHTML =
        randomExclamation +
        " <span class='result-highlight'>" +
        escapeHTML(lastPicked) +
        "</span>";

      resultDiv.classList.add("winner-glow");

      pushHistory("roll", lastPicked);
      // Move rolled item to "In progress" so the active list stays clean
      moveToProgressByName(lastPicked, { fromIndex: finalIndex });
      updateResultActions();

    }, 2000);
  }

  // ---------- export ----------

  function csvEscape(value) {
    const s = String(value ?? "");
    if (/[",\n\r]/.test(s)) return '"' + s.replaceAll('"', '""') + '"';
    return s;
  }

  function groupKeyForExport(group) {
    const g = normalizeGroup(group);
    return g || t("export.ungrouped");
  }

  function buildGroupMapFromNames(names) {
    const map = new Map();
    for (const name of names) {
      const key = groupKeyForExport(groupOf(name));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(name);
    }
    return map;
  }

  function buildGroupMapFromDone(items) {
    const map = new Map();
    for (const it of items) {
      const key = groupKeyForExport(groupOf(it.name));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }

  function buildGroupMapFromProgress(items) {
    const map = new Map();
    for (const it of items) {
      const key = groupKeyForExport(groupOf(it.name));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }

  function sortedGroupKeys(map) {
    const keys = Array.from(map.keys());
    const ungrouped = t("export.ungrouped");
    keys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    // push ungrouped to the end
    if (keys.includes(ungrouped)) {
      return keys.filter(k => k !== ungrouped).concat([ungrouped]);
    }
    return keys;
  }

  function exportAsTxt({ includeProgress, includeActive, includeDone, includeHistory }) {
    const lines = [];
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    lines.push(`RandomiseMe export (${stamp})`);

    if (includeProgress) {
      lines.push("\n== IN PROGRESS ==");
      const map = buildGroupMapFromProgress(inProgress);
      for (const g of sortedGroupKeys(map)) {
        lines.push(`\n[${g}]`);
        for (const it of map.get(g)) {
          const pr = prioOf(it.name);
          const prTxt = pr ? starsFor(pr) + " " : "";
          const meta = it.startedAt ? fmtTime(it.startedAt) : "";
          lines.push(`- ${prTxt}${it.name}${meta ? " (" + meta + ")" : ""}`);
        }
      }
    }

    if (includeActive) {
      lines.push("\n== ACTIVE ==");
      const map = buildGroupMapFromNames(projects);
      for (const g of sortedGroupKeys(map)) {
        lines.push(`\n[${g}]`);
        for (const name of map.get(g)) {
          const pr = prioOf(name);
          const prTxt = pr ? starsFor(pr) + " " : "";
          lines.push(`- ${prTxt}${name}`);
        }
      }
    }

    if (includeDone) {
      lines.push("\n== DONE ==");
      const map = buildGroupMapFromDone(doneProjects);
      for (const g of sortedGroupKeys(map)) {
        lines.push(`\n[${g}]`);
        for (const it of map.get(g)) {
          const meta = it.doneAt ? fmtTime(it.doneAt) : "";
          const pr = prioOf(it.name);
          const prTxt = pr ? starsFor(pr) + " " : "";
          lines.push(`- ${prTxt}${it.name}${meta ? " (" + meta + ")" : ""}`);
        }
      }
    }

    if (includeHistory) {
      lines.push("\n== HISTORY ==");
      for (const h of history.slice(0, MAX_HISTORY)) {
        const meta = h.at ? fmtTime(h.at) : "";
        const g = groupOf(h.name);
        const tag = g ? `[${g}] ` : "";
        lines.push(`- ${meta} - ${t('history.' + h.type)}: ${tag}${h.name}`);
      }
    }

    return lines.join("\n");
  }

  function exportAsCsv({ includeProgress, includeActive, includeDone, includeHistory }) {
    const rows = [];
    rows.push(["list", "group", "name", "meta1", "meta2"]);

    if (includeProgress) {
      for (const it of inProgress) {
        rows.push(["progress", groupOf(it.name), it.name, it.startedAt || "", String(prioOf(it.name))]);
      }
    }

    if (includeActive) {
      for (const name of projects) {
        rows.push(["active", groupOf(name), name, String(prioOf(name)), ""]);
      }
    }

    if (includeDone) {
      for (const it of doneProjects) {
        rows.push(["done", groupOf(it.name), it.name, it.doneAt || "", String(prioOf(it.name))]);
      }
    }

    if (includeHistory) {
      for (const h of history.slice(0, MAX_HISTORY)) {
        rows.push(["history", groupOf(h.name), h.name, h.type || "", h.at || ""]);
      }
    }

    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
    // Excel-friendly BOM
    return "\ufeff" + csv;
  }

  function downloadFile(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  // ---------- wiring ----------

  const form = document.getElementById("projectForm");
  const input = document.getElementById("projectInput");
  const clearBtn = document.getElementById("clearBtn");
  const randomBtn = document.getElementById("randomBtn");
  const clearDoneBtn = document.getElementById("clearDoneBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const copyHistoryBtn = document.getElementById("copyHistoryBtn");
  const markPickedDoneBtn = document.getElementById("markPickedDoneBtn");
  const backPickedBtn = document.getElementById("backPickedBtn");
  const copyPickedBtn = document.getElementById("copyPickedBtn");

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!input) return;
      addProject(input.value);
      input.value = "";
      input.focus();
    });
  }

  if (clearBtn) clearBtn.addEventListener("click", clearActive);
  if (randomBtn) randomBtn.addEventListener("click", roll);
  if (clearDoneBtn) clearDoneBtn.addEventListener("click", clearDone);
  if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", clearHistory);

  if (copyHistoryBtn) {
    copyHistoryBtn.addEventListener("click", () => {
      if (!history.length) {
        alert(t("alert.nothing_to_copy"));
        return;
      }
      const lines = history
        .slice(0, MAX_HISTORY)
        .map(h => `${fmtTime(h.at)} - ${t('history.' + h.type)}: ${h.name}`);
      copyToClipboard(lines.join("\n"));
    });
  }

  if (markPickedDoneBtn) {
    markPickedDoneBtn.addEventListener("click", () => {
      if (!lastPicked) return;
      const idx = inProgress.findIndex((x) => String(x.name || "").toLowerCase() === lastPicked.toLowerCase());
      if (idx === -1) return;
      markDoneFromProgress(idx);
    });
  }

  if (backPickedBtn) {
    backPickedBtn.addEventListener("click", () => {
      if (!lastPicked) return;
      const idx = inProgress.findIndex((x) => String(x.name || "").toLowerCase() === lastPicked.toLowerCase());
      if (idx === -1) return;
      backToActiveFromProgress(idx);
    });
  }

  if (copyPickedBtn) {
    copyPickedBtn.addEventListener("click", () => {
      if (!lastPicked) {
        alert(t("alert.nothing_to_copy"));
        return;
      }
      copyToClipboard(lastPicked);
    });
  }

  // import projects from txt or csv (supports: [Group] Name OR Group :: Name)
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        const content = e.target.result;
        const entries = String(content || "").split(/[\r\n,;\t]+/);

        let added = 0;
        let restored = 0;

        entries.forEach((entry) => {
          let trimmed = normalizeName(entry);
          trimmed = trimmed.replace(/^"(.*)"$/, "$1");
          if (!trimmed) return;

          const { name, group } = parseNameAndGroup(trimmed);
          if (!name) return;

          const key = name.toLowerCase();

          // if in done → restore
          if (doneSet.has(key)) {
            const doneIdx = findIndexCaseInsensitive(doneProjects, name);
            if (doneIdx !== -1) {
              const item = doneProjects.splice(doneIdx, 1)[0];
              doneSet.delete(key);
              if (!projectsSet.has(key)) {
                projects.push(item.name);
                projectsSet.add(key);
              }
              if (group) setGroup(item.name, group);
              restored++;
              return;
            }
          }

          if (!projectsSet.has(key)) {
            projects.push(name);
            projectsSet.add(key);
            if (group) setGroup(name, group);
            added++;
          } else {
            // duplicate import: still update group if provided
            if (group) setGroup(name, group);
          }
        });

        scheduleSave();
        scheduleRender("projects");
        scheduleRender("done");

        const msg = t("alert.import_finished", { count: added });
        const restoredMsg = restored > 0 ? "\n" + t("alert.import_restored", { count: restored }) : "";
        alert(msg + restoredMsg);
      };

      reader.readAsText(file);
      event.target.value = "";
    });
  }

  // Event delegation (much faster than attaching listeners per row)
  if (DOM.projectList) {
    DOM.projectList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const index = Number(btn.dataset.index);
      if (!Number.isFinite(index)) return;

      if (action === "done") markDone(index);
      if (action === "delete") deleteActive(index);
      if (action === "group") promptGroupForName(projects[index]);
      if (action === "prio") cyclePrio(projects[index]);
    });
  }

  if (DOM.progressList) {
    DOM.progressList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const index = Number(btn.dataset.index);
      if (!Number.isFinite(index)) return;

      if (action === "done") markDoneFromProgress(index);
      if (action === "back") backToActiveFromProgress(index);
      if (action === "delete") deleteProgress(index);
      if (action === "group") promptGroupForName(inProgress[index].name);
      if (action === "prio") cyclePrio(inProgress[index].name);
    });
  }

  if (DOM.doneList) {
    DOM.doneList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const index = Number(btn.dataset.index);
      if (!Number.isFinite(index)) return;

      if (action === "restore") restoreFromDone(index);
      if (action === "delete") deleteDone(index);
      if (action === "group") promptGroupForName(doneProjects[index].name);
      if (action === "prio") cyclePrio(doneProjects[index].name);
    });
  }

  // help modal
  const helpModal = document.getElementById("helpModal");
  const helpBtn = document.getElementById("helpBtn");
  const helpCloseBtn = helpModal ? helpModal.querySelector(".close-btn") : null;

  function openModal(modal, focusEl) {
    if (!modal) return;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    if (focusEl) focusEl.focus();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }

  if (helpBtn && helpModal && helpCloseBtn) {
    helpBtn.addEventListener("click", () => openModal(helpModal, helpCloseBtn));
    helpCloseBtn.addEventListener("click", () => closeModal(helpModal));

    window.addEventListener("click", function (event) {
      if (event.target === helpModal) closeModal(helpModal);
    });
  }

  // icon picker buttons (changes manifest/icon for the NEXT install)
  document.querySelectorAll(".icon-chip").forEach((btn) => {
    btn.addEventListener("click", () => applyIconVariant(btn.dataset.iconVariant));
  });

  // export modal
  const exportModal = document.getElementById("exportModal");
  const exportBtn = document.getElementById("exportBtn");
  const exportCloseBtn = document.getElementById("exportCloseBtn");
  const exportTxtBtn = document.getElementById("exportTxtBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const expProgress = document.getElementById("expProgress");
  const expActive = document.getElementById("expActive");
  const expDone = document.getElementById("expDone");
  const expHistory = document.getElementById("expHistory");

  if (exportBtn && exportModal && exportCloseBtn) {
    exportBtn.addEventListener("click", () => openModal(exportModal, exportCloseBtn));
    exportCloseBtn.addEventListener("click", () => closeModal(exportModal));

    window.addEventListener("click", function (event) {
      if (event.target === exportModal) closeModal(exportModal);
    });
  }

  function currentExportOptions() {
    return {
      includeProgress: !!(expProgress && expProgress.checked),
      includeActive: !!(expActive && expActive.checked),
      includeDone: !!(expDone && expDone.checked),
      includeHistory: !!(expHistory && expHistory.checked),
    };
  }

  if (exportTxtBtn) {
    exportTxtBtn.addEventListener("click", () => {
      const opts = currentExportOptions();
      const content = exportAsTxt(opts);
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(content, "text/plain;charset=utf-8", `RandomiseMe_export_${date}.txt`);
      showToast(t("toast.exported"));
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      const opts = currentExportOptions();
      const content = exportAsCsv(opts);
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(content, "text/csv;charset=utf-8", `RandomiseMe_export_${date}.csv`);
      showToast(t("toast.exported"));
    });
  }

  // global key handling
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeModal(helpModal);
      closeModal(exportModal);
      clearToast();
    }
  });

  // Reload app (helps iOS homescreen caching)
  const reloadBtn = document.getElementById("reloadBtn");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", async function () {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        }
      } catch {}

      const url = new URL(window.location.href);
      url.searchParams.set("v", String(Date.now()));
      window.location.href = url.toString();
    });
  }

  // PWA: register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // small footer build date
  const bd = document.getElementById("buildDate");
  if (bd) {
    bd.textContent = " · " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  // initial render
  buildLanguageSelectEnglishAlphabetical();

  // Re-render lists on language change (button aria labels, history verbs)
  if (DOM.langSelect) {
    DOM.langSelect.addEventListener("change", () => {
      scheduleRender("progress");
      scheduleRender("projects");
      scheduleRender("done");
      scheduleRender("history");
    });
  }

  scheduleRender("progress");
  scheduleRender("projects");
  scheduleRender("done");
  scheduleRender("history");
  scheduleRender("resultActions");
});

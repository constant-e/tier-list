/* Tier List Maker — state, board editing, library and import logic. */
(function () {
  "use strict";

  const DATA = window.TIER_DATA;
  const TierExport = window.TierExport;
  const LAYOUT = TierExport?.LAYOUT ?? {
    leftW: 140,
    rowH: 140,
    img: 96,
    gap: 12,
    pad: 16,
    minRight: 1020,
    maxLabel: 74,
    imgRadius: 12,
  };

  const STORAGE_KEY = "tier-list-maker:v1";
  const MAX_ROWS = 20;
  const MAX_ITEMS_PER_ROW = 200;
  const MAX_LABEL_LENGTH = 12;
  const GAME_ORDER = ["gi", "hsr", "zzz"];
  const DEFAULT_LABELS = ["S", "A", "B", "C", "D"];

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const board = $("#board");
  const boardScroll = $("#board-scroll");
  const targetSelect = $("#target-row");
  const boardStats = $("#board-stats");
  const libraryGrid = $("#library-grid");
  const libraryEmpty = $("#library-empty");
  const searchInput = $("#search");
  const fileInput = $("#file-input");
  const toastEl = $("#toast");
  const exportBtn = $("#export");
  const protocolWarning = $("#protocol-warning");
  const appMain = $("main");

  if (!DATA || !DATA.games) {
    board.innerHTML =
      '<p style="padding:24px;color:#ffb4b4">头像数据未加载。请确认 data/characters.js 存在，并通过本地服务器打开页面。</p>';
    throw new Error("TIER_DATA is missing");
  }

  const characterIndex = new Map();
  const charactersByGame = new Map(GAME_ORDER.map((game) => [game, []]));

  for (const game of GAME_ORDER) {
    const definition = DATA.games[game];
    if (!definition) continue;
    for (const character of definition.characters ?? []) {
      const entry = { ...character, game, key: `${game}:${character.id}` };
      characterIndex.set(entry.key, entry);
      charactersByGame.get(game).push(entry);
    }
  }

  let state;
  let importIndex = new Map();
  let activeTab = "gi";
  let searchQuery = "";
  let activeDrag = null;
  let saveTimer = 0;
  let toastTimer = 0;
  let saveWarningShown = false;
  let importing = false;
  let screenLayout = computeScreenLayout();

  applyLayoutVariables();
  state = loadState();
  rebuildImportIndex();

  if (window.location.protocol === "file:") {
    protocolWarning.hidden = false;
  }

  const dataDate = $("#data-date");
  if (dataDate) {
    dataDate.textContent = DATA.generatedAt ? `角色数据更新于 ${DATA.generatedAt}` : "";
  }

  function computeScreenLayout() {
    const available = Math.max(180, appMain?.clientWidth || document.documentElement.clientWidth);
    const compact = window.matchMedia("(max-width: 620px)").matches;
    const medium = !compact && window.matchMedia("(max-width: 900px)").matches;

    const spec = compact
      ? { leftW: 96, rowH: 96, img: 64, gap: 8, pad: 10, maxLabel: 52, minLabel: 7, radius: 9, compact: true }
      : medium
        ? { leftW: 120, rowH: 120, img: 80, gap: 10, pad: 12, maxLabel: 62, minLabel: 8, radius: 10, compact: false }
        : {
            leftW: LAYOUT.leftW,
            rowH: LAYOUT.rowH,
            img: LAYOUT.img,
            gap: LAYOUT.gap,
            pad: LAYOUT.pad,
            maxLabel: LAYOUT.maxLabel,
            minLabel: 9,
            radius: LAYOUT.imgRadius,
            compact: false,
          };

    // On wide screens keep the established 1160px table. On narrower
    // screens, shrink the right column to fit the content area instead of
    // forcing a full-width horizontal scroll from the start.
    const minRight =
      available >= spec.leftW + LAYOUT.minRight
        ? LAYOUT.minRight
        : Math.max(compact ? 180 : 240, available - spec.leftW);

    return { ...spec, minRight };
  }

  function layoutDiffers(a, b) {
    return ["leftW", "rowH", "img", "gap", "pad", "minRight", "maxLabel", "minLabel", "radius"].some(
      (key) => a[key] !== b[key]
    );
  }

  function applyLayoutVariables() {
    const root = document.documentElement;
    root.style.setProperty("--left-w", `${screenLayout.leftW}px`);
    root.style.setProperty("--row-h", `${screenLayout.rowH}px`);
    root.style.setProperty("--img-size", `${screenLayout.img}px`);
    root.style.setProperty("--gap", `${screenLayout.gap}px`);
    root.style.setProperty("--pad", `${screenLayout.pad}px`);
    root.style.setProperty("--item-radius", `${screenLayout.radius}px`);
  }

  function screenLabelFontSize(text) {
    return TierExport.labelFontSize(text, {
      maxWidth: screenLayout.leftW - 22,
      maxSize: screenLayout.maxLabel,
      minSize: screenLayout.minLabel,
    });
  }

  function screenRightWidth(rows) {
    let maxItems = 0;
    for (const row of rows) maxItems = Math.max(maxItems, row.items.length);
    const content =
      screenLayout.pad * 2 +
      maxItems * screenLayout.img +
      Math.max(0, maxItems - 1) * screenLayout.gap;
    return Math.max(screenLayout.minRight, content);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function sanitizeLabel(value) {
    return String(value ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, MAX_LABEL_LENGTH);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function defaultState() {
    return {
      version: 1,
      rows: DEFAULT_LABELS.map((label) => ({ label, items: [] })),
      imports: [],
      targetRow: 0,
    };
  }

  function loadState() {
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      parsed = null;
    }

    const imports = normalizeImports(parsed?.imports);
    const validImportKeys = new Set(imports.map((item) => `u:${item.id}`));

    let rows = [];
    if (Array.isArray(parsed?.rows) && parsed.rows.length) {
      rows = parsed.rows.slice(0, MAX_ROWS).map((row, index) => {
        const label = sanitizeLabel(row?.label) || DEFAULT_LABELS[index] || String(index + 1);
        const items = Array.isArray(row?.items)
          ? row.items
              .filter((key) => typeof key === "string" && (characterIndex.has(key) || validImportKeys.has(key)))
              .slice(0, MAX_ITEMS_PER_ROW)
          : [];
        return { label, items };
      });
    }

    if (!rows.length) {
      rows = DEFAULT_LABELS.map((label) => ({ label, items: [] }));
    }

    return {
      version: 1,
      rows,
      imports,
      targetRow: clamp(Number(parsed?.targetRow) || 0, 0, rows.length - 1),
    };
  }

  function normalizeImports(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const imports = [];
    for (const item of raw) {
      if (!item || typeof item.id !== "string" || typeof item.src !== "string") continue;
      if (!item.src.startsWith("data:image/")) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      imports.push({
        id: item.id,
        name: String(item.name ?? "导入图片").slice(0, 48) || "导入图片",
        src: item.src,
      });
      if (imports.length >= 200) break;
    }
    return imports;
  }

  function rebuildImportIndex() {
    importIndex = new Map(state.imports.map((item) => [`u:${item.id}`, item]));
  }

  function resolveItem(key) {
    const character = characterIndex.get(key);
    if (character) return character;
    const imported = importIndex.get(key);
    if (imported) {
      return { ...imported, key, game: "imports", detail: "导入图片", en: "" };
    }
    return null;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 180);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          rows: state.rows,
          imports: state.imports,
          targetRow: state.targetRow,
        })
      );
    } catch (error) {
      console.warn("Unable to persist tier list", error);
      if (!saveWarningShown) {
        saveWarningShown = true;
        showToast("浏览器存储空间不足，当前列表仍可导出，但刷新后可能丢失改动。", "error", 6000);
      }
    }
  }

  function showToast(message, kind = "", duration = 2800) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = "toast show";
    if (kind) toastEl.classList.add(kind);
    toastTimer = setTimeout(() => {
      toastEl.className = "toast";
    }, duration);
  }

  function totalItems() {
    return state.rows.reduce((sum, row) => sum + row.items.length, 0);
  }

  function renderBoard() {
    const rightWidth = screenRightWidth(state.rows);
    const empty = totalItems() === 0;
    const hintText = screenLayout.compact
      ? "点击或拖拽头像到这里"
      : "从下方头像库点击或拖拽头像到这里";
    board.style.setProperty("--right-w", `${rightWidth}px`);
    board.style.width = `${screenLayout.leftW + rightWidth}px`;

    const rowsHtml = state.rows
      .map((row, rowIndex) => {
        const color = TierExport.tierColor(rowIndex, state.rows.length);
        const fontSize = screenLabelFontSize(row.label || " ");
        const itemsHtml = row.items
          .map((key, itemIndex) => {
            const item = resolveItem(key);
            if (!item) return "";
            const title = `${item.name}${item.detail ? ` · ${item.detail}` : ""}｜双击移除`;
            return `
              <div class="tier-item" draggable="true" data-row="${rowIndex}" data-index="${itemIndex}" title="${escapeAttr(title)}">
                <img src="${escapeAttr(item.src)}" alt="${escapeAttr(item.name)}" draggable="false" decoding="async" loading="lazy" />
                <button type="button" class="item-del" data-action="remove-item" data-row="${rowIndex}" data-index="${itemIndex}" aria-label="移除 ${escapeAttr(item.name)}" title="移除">×</button>
              </div>`;
          })
          .join("");

        const hint =
          empty && rowIndex === 0
            ? `<span class="row-hint">${hintText}</span>`
            : "";

        return `
          <div class="tier-row${rowIndex === state.targetRow ? " is-target" : ""}" data-row="${rowIndex}">
            <div class="tier-label" style="--tier-color:${color}">
              <span class="tier-label-text" contenteditable="true" role="textbox" spellcheck="false"
                aria-label="第 ${rowIndex + 1} 行名称" data-row="${rowIndex}" style="font-size:${fontSize}px"
              >${escapeHtml(row.label)}</span>
              <button type="button" class="row-del" data-action="remove-row" data-row="${rowIndex}"
                aria-label="删除第 ${rowIndex + 1} 行" title="删除该行">×</button>
            </div>
            <div class="tier-items" data-row="${rowIndex}">${itemsHtml}${hint}</div>
          </div>`;
      })
      .join("");

    board.innerHTML = rowsHtml;
    renderTargetSelect();
    updateStats();
  }

  function updateStats() {
    boardStats.textContent = `${state.rows.length} 行 · ${totalItems()} 个头像`;
  }

  function displayLabel(label) {
    return label || "?";
  }

  function renderTargetSelect() {
    const options = state.rows
      .map(
        (row, index) =>
          `<option value="${index}">${escapeHtml(displayLabel(row.label))} · 第 ${index + 1} 行</option>`
      )
      .join("");
    targetSelect.innerHTML = options;
    targetSelect.value = String(state.targetRow);
  }

  function updateTargetOption(rowIndex) {
    const option = targetSelect.options[rowIndex];
    if (option) {
      option.textContent = `${displayLabel(state.rows[rowIndex].label)} · 第 ${rowIndex + 1} 行`;
    }
  }

  function updateTargetHighlight() {
    $$(".tier-row", board).forEach((element) => {
      element.classList.toggle("is-target", Number(element.dataset.row) === state.targetRow);
    });
    targetSelect.value = String(state.targetRow);
  }

  function setTargetRow(rowIndex, { rerender = false } = {}) {
    const next = clamp(Number(rowIndex) || 0, 0, state.rows.length - 1);
    if (next === state.targetRow && !rerender) return;
    state.targetRow = next;
    if (rerender) {
      renderBoard();
    } else {
      updateTargetHighlight();
    }
    scheduleSave();
  }

  function commitBoard({ revealRow = null } = {}) {
    renderBoard();
    scheduleSave();
    if (revealRow !== null) {
      requestAnimationFrame(() => revealRowContents(revealRow));
    }
  }

  function revealRowContents(rowIndex) {
    const items = $$(`.tier-row[data-row="${rowIndex}"] .tier-item`, board);
    if (!items.length) return;
    const item = items[items.length - 1];
    const scrollRect = boardScroll.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const leftEdge = scrollRect.left + screenLayout.leftW;
    if (itemRect.right > scrollRect.right - 14) {
      boardScroll.scrollLeft += itemRect.right - scrollRect.right + 24;
    } else if (itemRect.left < leftEdge) {
      boardScroll.scrollLeft -= leftEdge - itemRect.left + 24;
    }
  }

  function addItem(key, rowIndex = state.targetRow, index = null) {
    if (!resolveItem(key)) return false;
    const row = state.rows[rowIndex];
    if (!row) return false;
    if (row.items.length >= MAX_ITEMS_PER_ROW) {
      showToast(`每行最多放置 ${MAX_ITEMS_PER_ROW} 个头像。`, "error");
      return false;
    }
    const at = clamp(index === null ? row.items.length : index, 0, row.items.length);
    row.items.splice(at, 0, key);
    state.targetRow = rowIndex;
    commitBoard({ revealRow: rowIndex });
    return true;
  }

  function moveItem(fromRow, fromIndex, toRow, toIndex) {
    const source = state.rows[fromRow];
    const target = state.rows[toRow];
    if (!source || !target) return;
    if (fromRow === toRow && fromIndex === toIndex) return;
    if (fromRow !== toRow && target.items.length >= MAX_ITEMS_PER_ROW) {
      showToast(`每行最多放置 ${MAX_ITEMS_PER_ROW} 个头像。`, "error");
      return;
    }
    const [key] = source.items.splice(fromIndex, 1);
    if (!key) return;
    target.items.splice(clamp(toIndex, 0, target.items.length), 0, key);
    state.targetRow = toRow;
    commitBoard({ revealRow: toRow });
  }

  function removeItem(rowIndex, itemIndex) {
    const row = state.rows[rowIndex];
    if (!row) return;
    const [key] = row.items.splice(itemIndex, 1);
    if (!key) return;
    const info = resolveItem(key);
    commitBoard();
    if (info) showToast(`已移除 ${info.name}`);
  }

  function nextRowLabel() {
    const used = new Set(state.rows.map((row) => row.label));
    for (const letter of "SABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      if (!used.has(letter)) return letter;
    }
    return "新";
  }

  function addRow() {
    if (state.rows.length >= MAX_ROWS) {
      showToast(`最多支持 ${MAX_ROWS} 行。`, "error");
      return;
    }
    state.rows.push({ label: nextRowLabel(), items: [] });
    state.targetRow = state.rows.length - 1;
    renderBoard();
    scheduleSave();
    const rowElement = $(`.tier-row[data-row="${state.targetRow}"]`, board);
    rowElement?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function removeRow(rowIndex) {
    if (state.rows.length <= 1) {
      showToast("至少保留一行。", "error");
      return;
    }
    const row = state.rows[rowIndex];
    if (!row) return;
    if (row.items.length) {
      const label = displayLabel(row.label);
      const confirmed = window.confirm(`删除“${label}”行及其中的 ${row.items.length} 个头像？`);
      if (!confirmed) return;
    }
    state.rows.splice(rowIndex, 1);
    state.targetRow = clamp(state.targetRow, 0, state.rows.length - 1);
    renderBoard();
    scheduleSave();
  }

  function resetBoard() {
    const confirmed = window.confirm("清空当前列表并恢复默认的 S / A / B / C / D 五行？\n已导入的图片库会保留。");
    if (!confirmed) return;
    state.rows = DEFAULT_LABELS.map((label) => ({ label, items: [] }));
    state.targetRow = 0;
    renderBoard();
    scheduleSave();
    showToast("已恢复默认列表");
  }

  function renderLibrary() {
    $$(".tab").forEach((tab) => {
      const active = tab.dataset.tab === activeTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    const query = searchQuery.trim().toLowerCase();
    let items;
    if (activeTab === "imports") {
      items = state.imports.map((item) => ({
        key: `u:${item.id}`,
        name: item.name,
        en: "",
        detail: "导入图片",
        src: item.src,
      }));
    } else {
      items = charactersByGame.get(activeTab) ?? [];
    }

    const filtered = query
      ? items.filter((item) => {
          const haystack = `${item.name} ${item.en ?? ""} ${item.detail ?? ""}`.toLowerCase();
          return haystack.includes(query);
        })
      : items;

    const importTile =
      activeTab === "imports"
        ? `<button type="button" class="lib-item import-tile" data-action="import">
             <span class="plus" aria-hidden="true">＋</span>
             <span class="lib-name">导入图片</span>
           </button>`
        : "";

    libraryGrid.innerHTML =
      importTile +
      filtered
        .map((item) => {
          const title = `${item.name}${item.en ? ` / ${item.en}` : ""}${item.detail ? ` · ${item.detail}` : ""}`;
          return `
            <button type="button" class="lib-item" draggable="true" data-key="${escapeAttr(item.key)}"
              title="${escapeAttr(title)}">
              <img src="${escapeAttr(item.src)}" alt="" loading="lazy" decoding="async" draggable="false" />
              <span class="lib-name">${escapeHtml(item.name)}</span>
            </button>`;
        })
        .join("");

    const showEmpty = filtered.length === 0 && !(activeTab === "imports" && !query);
    libraryEmpty.hidden = !showEmpty;
    if (showEmpty) {
      libraryEmpty.textContent = query
        ? `没有找到与“${searchQuery.trim()}”匹配的头像。`
        : "这个分类还没有头像。";
    }

    updateCounts();
  }

  function updateCounts() {
    const counts = {
      gi: charactersByGame.get("gi")?.length ?? 0,
      hsr: charactersByGame.get("hsr")?.length ?? 0,
      zzz: charactersByGame.get("zzz")?.length ?? 0,
      imports: state.imports.length,
    };
    $$("[data-count]").forEach((element) => {
      element.textContent = String(counts[element.dataset.count] ?? 0);
    });
  }

  function openFilePicker() {
    if (importing) return;
    fileInput.value = "";
    fileInput.click();
  }

  async function importFiles(fileList) {
    if (importing) return;
    const files = [...fileList].filter(
      (file) =>
        file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name)
    );
    if (!files.length) {
      showToast("没有可导入的图片文件。", "error");
      return;
    }

    importing = true;
    const importButtons = [$("#import"), $("#import-2")];
    importButtons.forEach((button) => {
      if (button) button.disabled = true;
    });

    let added = 0;
    let failed = 0;
    for (const [index, file] of files.entries()) {
      try {
        const src = await resampleImage(file);
        state.imports.push({
          id: `u_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name.replace(/\.[^.]+$/, "").trim().slice(0, 48) || "导入图片",
          src,
        });
        added += 1;
      } catch (error) {
        console.warn("Failed to import", file.name, error);
        failed += 1;
      }
    }

    rebuildImportIndex();
    importing = false;
    importButtons.forEach((button) => {
      if (button) button.disabled = false;
    });

    if (added) {
      activeTab = "imports";
      searchQuery = "";
      searchInput.value = "";
      renderLibrary();
      scheduleSave();
      showToast(
        failed ? `已导入 ${added} 张图片，${failed} 张失败。` : `已导入 ${added} 张图片，点击头像即可加入列表。`
      );
    } else {
      showToast("图片导入失败，请尝试 PNG、JPG 或 WebP 格式。", "error");
    }
  }

  async function resampleImage(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.decoding = "async";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("无法解码图片"));
        element.src = objectUrl;
      });
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效");

      const maxSide = 512;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);

      let dataUrl = canvas.toDataURL("image/webp", 0.9);
      if (!dataUrl.startsWith("data:image/webp")) {
        dataUrl = canvas.toDataURL("image/png");
      }
      if (dataUrl.length > 2_500_000) {
        dataUrl = canvas.toDataURL("image/webp", 0.78);
      }
      return dataUrl;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function getDropIndex(cell, clientX) {
    const items = $$(".tier-item", cell);
    for (let index = 0; index < items.length; index++) {
      const rect = items[index].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return index;
    }
    return items.length;
  }

  function showDropIndicator(cell, index) {
    $$(".tier-items", board).forEach((element) => {
      if (element !== cell) {
        element.classList.remove("drag-over");
        $(".drop-indicator", element)?.remove();
      }
    });
    cell.classList.add("drag-over");
    let indicator = $(".drop-indicator", cell);
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "drop-indicator";
      cell.append(indicator);
    }
    const x =
      screenLayout.pad +
      index * (screenLayout.img + screenLayout.gap) -
      screenLayout.gap / 2;
    indicator.style.left = `${Math.max(4, x)}px`;
  }

  function clearDragUi() {
    activeDrag = null;
    $$(".tier-items", board).forEach((element) => element.classList.remove("drag-over"));
    $$(".drop-indicator", board).forEach((element) => element.remove());
    $$(".tier-item.dragging", board).forEach((element) => element.classList.remove("dragging"));
  }

  function startLibraryDrag(event, tile) {
    const key = tile.dataset.key;
    if (!key || !resolveItem(key)) return;
    activeDrag = { type: "add", key };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", key);
    const image = $("img", tile);
    if (image) event.dataTransfer.setDragImage(image, 29, 29);
  }

  function startItemDrag(event, item) {
    const row = Number(item.dataset.row);
    const index = Number(item.dataset.index);
    activeDrag = { type: "move", row, index };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "move");
    item.classList.add("dragging");
    const image = $("img", item);
    if (image) {
      event.dataTransfer.setDragImage(
        image,
        screenLayout.img / 2,
        screenLayout.img / 2
      );
    }
  }

  function handleDrop(event, cell) {
    if (!activeDrag) return;
    event.preventDefault();
    const rowIndex = Number(cell.dataset.row);
    let dropIndex = getDropIndex(cell, event.clientX);
    const drag = activeDrag;
    clearDragUi();

    if (drag.type === "add") {
      addItem(drag.key, rowIndex, dropIndex);
      return;
    }

    if (drag.type === "move") {
      if (drag.row === rowIndex && dropIndex > drag.index) dropIndex -= 1;
      if (drag.row === rowIndex && dropIndex === drag.index) return;
      moveItem(drag.row, drag.index, rowIndex, dropIndex);
    }
  }

  // --- Events ------------------------------------------------------------

  board.addEventListener("click", (event) => {
    const removeRowButton = event.target.closest('[data-action="remove-row"]');
    if (removeRowButton) {
      event.stopPropagation();
      removeRow(Number(removeRowButton.dataset.row));
      return;
    }

    const removeItemButton = event.target.closest('[data-action="remove-item"]');
    if (removeItemButton) {
      event.stopPropagation();
      removeItem(Number(removeItemButton.dataset.row), Number(removeItemButton.dataset.index));
      return;
    }

    const rowElement = event.target.closest(".tier-row");
    if (rowElement) setTargetRow(Number(rowElement.dataset.row));
  });

  board.addEventListener("focusin", (event) => {
    const label = event.target.closest(".tier-label-text");
    if (!label) return;
    setTargetRow(Number(label.dataset.row));
    label.dataset.original = state.rows[Number(label.dataset.row)]?.label ?? "";
  });

  board.addEventListener("input", (event) => {
    const label = event.target.closest(".tier-label-text");
    if (!label) return;
    const rowIndex = Number(label.dataset.row);
    const row = state.rows[rowIndex];
    if (!row) return;

    let text = label.textContent.replace(/[\r\n\t]+/g, " ");
    if (Array.from(text).length > MAX_LABEL_LENGTH) {
      text = Array.from(text).slice(0, MAX_LABEL_LENGTH).join("");
      label.textContent = text;
      placeCaretAtEnd(label);
    }
    row.label = text;
    label.style.fontSize = `${screenLabelFontSize(text || " ")}px`;
    updateTargetOption(rowIndex);
    scheduleSave();
  });

  board.addEventListener("blur", (event) => {
    const label = event.target.closest(".tier-label-text");
    if (!label) return;
    const rowIndex = Number(label.dataset.row);
    const row = state.rows[rowIndex];
    if (!row) return;
    const text = sanitizeLabel(label.textContent) || "?";
    row.label = text;
    label.textContent = text;
    label.style.fontSize = `${screenLabelFontSize(text)}px`;
    updateTargetOption(rowIndex);
    scheduleSave();
  }, true);

  board.addEventListener("keydown", (event) => {
    const label = event.target.closest(".tier-label-text");
    if (!label) return;
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      label.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      const rowIndex = Number(label.dataset.row);
      const row = state.rows[rowIndex];
      if (row) {
        row.label = sanitizeLabel(label.dataset.original) || "?";
        label.textContent = row.label;
        label.style.fontSize = `${screenLabelFontSize(row.label)}px`;
        updateTargetOption(rowIndex);
        scheduleSave();
      }
      label.blur();
    }
  });

  board.addEventListener("paste", (event) => {
    const label = event.target.closest(".tier-label-text");
    if (!label) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, MAX_LABEL_LENGTH);
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    selection.deleteFromDocument();
    const node = document.createTextNode(text);
    selection.getRangeAt(0).insertNode(node);
    selection.collapseToEnd();
    label.dispatchEvent(new Event("input", { bubbles: true }));
  });

  board.addEventListener("dblclick", (event) => {
    const item = event.target.closest(".tier-item");
    if (!item || event.target.closest(".item-del")) return;
    removeItem(Number(item.dataset.row), Number(item.dataset.index));
  });

  document.addEventListener("dragstart", (event) => {
    const tile = event.target.closest?.(".lib-item[data-key]");
    if (tile) {
      startLibraryDrag(event, tile);
      return;
    }
    const item = event.target.closest?.(".tier-item");
    if (item) startItemDrag(event, item);
  });

  document.addEventListener("dragend", () => clearDragUi());

  document.addEventListener("dragover", (event) => {
    const cell = event.target.closest?.(".tier-items");
    if (!cell || !activeDrag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = activeDrag.type === "move" ? "move" : "copy";
    showDropIndicator(cell, getDropIndex(cell, event.clientX));

    const rect = boardScroll.getBoundingClientRect();
    if (event.clientX > rect.right - 46) {
      boardScroll.scrollLeft += 18;
    } else if (event.clientX < rect.left + screenLayout.leftW + 46) {
      boardScroll.scrollLeft -= 18;
    }
  });

  document.addEventListener("drop", (event) => {
    const cell = event.target.closest?.(".tier-items");
    if (!cell || !activeDrag) return;
    handleDrop(event, cell);
  });

  libraryGrid.addEventListener("click", (event) => {
    const importTile = event.target.closest('[data-action="import"]');
    if (importTile) {
      openFilePicker();
      return;
    }
    const tile = event.target.closest(".lib-item[data-key]");
    if (!tile) return;
    const key = tile.dataset.key;
    if (key.startsWith("u:")) {
      activeTab = "imports";
    }
    addItem(key, state.targetRow);
  });

  targetSelect.addEventListener("change", () => {
    setTargetRow(Number(targetSelect.value), { rerender: true });
  });

  $("#add-row").addEventListener("click", addRow);
  $("#reset").addEventListener("click", resetBoard);
  $("#import").addEventListener("click", openFilePicker);
  $("#import-2").addEventListener("click", openFilePicker);
  exportBtn.addEventListener("click", exportPng);

  fileInput.addEventListener("change", () => {
    const files = fileInput.files;
    if (files?.length) importFiles(files);
    fileInput.value = "";
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.tab === activeTab) return;
      activeTab = tab.dataset.tab;
      renderLibrary();
    });
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderLibrary();
  });

  async function exportPng() {
    if (!state.rows.length) return;
    const originalText = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = "导出中…";
    try {
      const colors = state.rows.map((_, index) => TierExport.tierColor(index, state.rows.length));
      const rows = state.rows.map((row, index) => ({
        label: row.label || "?",
        color: colors[index],
        items: row.items.map(resolveItem).filter(Boolean).map((item) => ({
          name: item.name,
          src: item.src,
        })),
      }));
      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const stamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
      ].join("-");
      const info = await TierExport.renderPng({
        rows,
        filename: `tier-list-${stamp}.png`,
      });
      showToast(`已导出 ${info.width} × ${info.height} PNG`);
    } catch (error) {
      console.error(error);
      showToast(error?.message || "导出失败，请重试。", "error", 7000);
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalText;
    }
  }

  function placeCaretAtEnd(element) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  window.addEventListener("pagehide", saveNow);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = computeScreenLayout();
      if (!layoutDiffers(screenLayout, next)) return;
      screenLayout = next;
      applyLayoutVariables();
      renderBoard();
    }, 120);
  });

  renderLibrary();
  screenLayout = computeScreenLayout();
  applyLayoutVariables();
  renderBoard();
})();

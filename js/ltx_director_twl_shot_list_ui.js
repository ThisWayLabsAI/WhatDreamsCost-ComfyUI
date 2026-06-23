// @ts-check

(function () {
  const DEFAULT_FRAME_RATE = 24;
  const MODAL_CLASS = "ltx-director-twl-shot-list-modal";
  const CONFIRM_MODAL_CLASS = "ltx-director-twl-confirm-modal";
  const CONFIRM_BACKDROP_CLASS = "ltx-director-twl-confirm-backdrop";
  let activeConfirmCleanup = null;

  function getShotListApi() {
    if (typeof globalThis !== "undefined" && globalThis.LTXDirectorShotList) {
      return globalThis.LTXDirectorShotList;
    }
    if (typeof require !== "undefined") {
      return require("./ltx_director_twl_shot_script.js");
    }
    return null;
  }

  function normalizeFrameRate(frameRate) {
    const parsed = Number(frameRate);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FRAME_RATE;
  }

  function makeIdFactory(prefix = "shot") {
    let next = 1;
    return () => `${prefix}_${Date.now().toString(36)}_${next++}`;
  }

  function getFrameRate(editor) {
    if (editor && typeof editor.getFrameRate === "function") {
      return normalizeFrameRate(editor.getFrameRate());
    }
    return normalizeFrameRate(editor?.frameRateWidget?.value || editor?.node?.properties?.frame_rate);
  }

  function getWidgetValue(editor, name) {
    const widget = editor?.node?.widgets?.find((item) => item?.name === name);
    return widget?.value ?? editor?.node?.properties?.[name];
  }

  function setWidgetValue(editor, name, value) {
    if (!editor?.node) return false;
    const widget = editor.node.widgets?.find((item) => item?.name === name);
    if (widget) {
      widget.value = value;
      if (typeof widget.callback === "function") widget.callback(value);
    }
    editor.node.properties = editor.node.properties || {};
    editor.node.properties[name] = value;
    return true;
  }

  function getVideoMetadata(editor) {
    return {
      width: getWidgetValue(editor, "custom_width"),
      height: getWidgetValue(editor, "custom_height"),
    };
  }

  function getGlobalPrompt(editor) {
    if (!editor) return "";
    if (typeof editor.getGlobalPrompt === "function") return editor.getGlobalPrompt() || "";
    if (editor.globalPromptInput) return editor.globalPromptInput.value || "";
    return editor.timeline?.global_prompt || editor.node?.properties?.global_prompt || "";
  }

  function setGlobalPrompt(editor, value) {
    if (!editor) return;
    const prompt = value || "";
    if (typeof editor.syncGlobalPrompt === "function") {
      editor.syncGlobalPrompt(prompt);
      return true;
    }
    return false;
  }

  function applyVideoMetadata(editor, video = {}) {
    const width = Number(video.width);
    const height = Number(video.height);
    let applied = false;
    if (Number.isFinite(width) && width >= 0) {
      applied = setWidgetValue(editor, "custom_width", Math.round(width)) || applied;
    }
    if (Number.isFinite(height) && height >= 0) {
      applied = setWidgetValue(editor, "custom_height", Math.round(height)) || applied;
    }
    return applied;
  }

  function getSortedMainSegments(editor) {
    return [...(editor?.timeline?.segments || [])]
      .filter((segment) => segment.type !== "ghost" && segment.type !== "temp")
      .sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
  }

  function exportEditorShotList(editor, options = {}) {
    const api = getShotListApi();
    if (!api?.exportShotList) throw new Error("Shot List parser/exporter is not available.");
    const frameRate = normalizeFrameRate(options.frameRate ?? getFrameRate(editor));
    return api.exportShotList({
      globalPrompt: options.globalPrompt ?? getGlobalPrompt(editor),
      frameRate,
      segments: getSortedMainSegments(editor),
      video: options.video || getVideoMetadata(editor),
    });
  }

  function createSegmentsFromShots(shots, options = {}) {
    const frameRate = normalizeFrameRate(options.frameRate);
    const idFactory = options.idFactory || makeIdFactory("shot");
    let cursor = Math.max(0, Math.round(Number(options.startFrame) || 0));
    return (shots || []).map((shot) => {
      const length = Math.max(1, Math.round(Number(shot.duration || 0) * frameRate));
      const segment = {
        id: idFactory(),
        start: cursor,
        length,
        prompt: shot.prompt || "",
        type: "text",
      };
      cursor += length;
      return segment;
    });
  }

  function parseShotListText(text) {
    const api = getShotListApi();
    if (!api?.parseShotList) throw new Error("Shot List parser/exporter is not available.");
    return api.parseShotList(text || "");
  }

  function hasGlobalPromptDeclaration(text) {
    const firstContentLine = (text || "").split(/\r?\n/).find((line) => line.trim().length > 0);
    return /^\s*GLOBAL\s*:/i.test(firstContentLine || "");
  }

  function buildShotListImport(editor, text, options = {}) {
    const parsed = parseShotListText(text);
    const hasGlobalPrompt = hasGlobalPromptDeclaration(text);
    const mode = options.mode === "append" ? "append" : "replace";
    const existing = getSortedMainSegments(editor);
    const appendStart = existing.length > 0
      ? Math.max(...existing.map((segment) => (Number(segment.start) || 0) + (Number(segment.length) || 0)))
      : 0;
    const startFrame = mode === "append" ? appendStart : 0;
    const importedSegments = createSegmentsFromShots(parsed.shots, {
      frameRate: options.frameRate ?? getFrameRate(editor),
      startFrame,
      idFactory: options.idFactory,
    });
    return {
      mode,
      parsed,
      hasGlobalPrompt,
      segments: mode === "append" ? [...existing, ...importedSegments] : importedSegments,
      importedSegments,
      warnings: parsed.warnings || [],
    };
  }

  function syncEditorAfterTimelineMutation(editor, selectedSegment = null) {
    if (!editor) return;
    if (selectedSegment) {
      editor.selectionType = "image";
      editor.selectedIndex = editor.timeline.segments.findIndex((segment) => segment.id === selectedSegment.id);
    }
    editor.updateUIFromSelection?.();
    editor.syncWidgetsAndUI?.();
    editor.commitChanges?.();
    editor.render?.();
  }

  function applyShotListImport(editor, text, options = {}) {
    const built = buildShotListImport(editor, text, options);
    if (!editor?.timeline) return built;
    editor.timeline.segments = built.segments;
    if (built.hasGlobalPrompt && options.applyGlobalPrompt !== false) {
      setGlobalPrompt(editor, built.parsed.globalPrompt || "");
    }
    applyVideoMetadata(editor, built.parsed.video);
    const finalEnd = built.segments.reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
    editor.growTimelineIfNeeded?.(finalEnd);
    syncEditorAfterTimelineMutation(editor, built.importedSegments[0] || null);
    return built;
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("ltx-director-twl-shot-list-styles")) return;
    const style = document.createElement("style");
    style.id = "ltx-director-twl-shot-list-styles";
    style.textContent = `
      .${MODAL_CLASS} {
        position: fixed;
        z-index: 10001;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(760px, calc(100vw - 48px));
        max-height: calc(100vh - 80px);
        background: #181818;
        color: #e8e8e8;
        border: 1px solid #3a3a3a;
        border-radius: 8px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);
        padding: 14px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .${MODAL_CLASS} .twl-shot-list-title {
        font-weight: 600;
        font-size: 14px;
      }
      .${MODAL_CLASS} textarea {
        width: 100%;
        min-height: 320px;
        resize: vertical;
        background: #101010;
        color: #eeeeee;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 10px;
        box-sizing: border-box;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 12px;
      }
      .${MODAL_CLASS} .twl-shot-list-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .${MODAL_CLASS} .twl-shot-list-message {
        min-height: 18px;
        color: #d7d7d7;
        font-size: 12px;
        white-space: pre-wrap;
      }
      .${CONFIRM_BACKDROP_CLASS} {
        position: fixed;
        z-index: 10002;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.48);
      }
      .${CONFIRM_MODAL_CLASS} {
        width: min(440px, calc(100vw - 48px));
        max-height: calc(100vh - 80px);
        overflow: auto;
        background: #1a1a1a;
        color: #e8e8e8;
        border: 1px solid #3a3a3a;
        border-radius: 10px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);
        padding: 14px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .${CONFIRM_MODAL_CLASS} .twl-confirm-title {
        font-weight: 700;
        font-size: 14px;
      }
      .${CONFIRM_MODAL_CLASS} .twl-confirm-message {
        color: #d0d0d0;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
      }
      .${CONFIRM_MODAL_CLASS} .twl-confirm-warning {
        margin-top: 8px;
        padding: 8px;
        border: 1px solid rgba(245, 158, 11, 0.45);
        border-radius: 6px;
        background: rgba(245, 158, 11, 0.12);
        color: #f8d28a;
      }
      .${CONFIRM_MODAL_CLASS} .twl-confirm-warning-label {
        display: block;
        margin-bottom: 4px;
        color: #f5b84b;
        font-weight: 700;
      }
      .${CONFIRM_MODAL_CLASS} .twl-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }
    `;
    document.head.appendChild(style);
  }

  function closeExistingConfirmModals() {
    if (typeof document === "undefined") return;
    if (activeConfirmCleanup) {
      activeConfirmCleanup(false);
      return;
    }
    document.querySelectorAll(`.${CONFIRM_BACKDROP_CLASS}`).forEach((el) => el.remove());
  }

  function renderConfirmMessage(messageEl, message) {
    const warningMarker = "Warnings:\n";
    const warningIndex = (message || "").indexOf(warningMarker);
    if (warningIndex === -1) {
      messageEl.textContent = message;
      return;
    }

    const beforeWarning = message.slice(0, warningIndex).trimEnd();
    const warningText = message.slice(warningIndex + warningMarker.length);
    if (beforeWarning) messageEl.appendChild(document.createTextNode(beforeWarning));
    const warningBlock = document.createElement("div");
    warningBlock.className = "twl-confirm-warning";
    const warningLabel = document.createElement("span");
    warningLabel.className = "twl-confirm-warning-label";
    warningLabel.textContent = "Warnings";
    warningBlock.appendChild(warningLabel);
    warningBlock.appendChild(document.createTextNode(warningText));
    messageEl.appendChild(warningBlock);
  }

  function openConfirmModal({
    title = "Confirm Action",
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    returnFocusTo = null,
  } = {}) {
    if (typeof document === "undefined") return Promise.resolve(false);
    ensureStyles();
    closeExistingConfirmModals();

    return new Promise((resolve) => {
      const previousFocus = returnFocusTo || document.activeElement;
      const backdrop = document.createElement("div");
      backdrop.className = CONFIRM_BACKDROP_CLASS;

      const modal = document.createElement("div");
      modal.className = CONFIRM_MODAL_CLASS;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      const titleEl = document.createElement("div");
      const titleId = `twl-confirm-title-${Date.now().toString(36)}`;
      titleEl.id = titleId;
      titleEl.className = "twl-confirm-title";
      titleEl.textContent = title;
      modal.setAttribute("aria-labelledby", titleId);

      const messageEl = document.createElement("div");
      const messageId = `twl-confirm-message-${Date.now().toString(36)}`;
      messageEl.id = messageId;
      messageEl.className = "twl-confirm-message";
      renderConfirmMessage(messageEl, message);
      modal.setAttribute("aria-describedby", messageId);

      const actions = document.createElement("div");
      actions.className = "twl-confirm-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "pr-btn";
      cancelBtn.textContent = cancelLabel;

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "pr-btn";
      confirmBtn.textContent = confirmLabel;

      let settled = false;
      const cleanup = (confirmed) => {
        if (settled) return;
        settled = true;
        activeConfirmCleanup = null;
        document.removeEventListener("keydown", onKeyDown);
        backdrop.remove();
        if (previousFocus && previousFocus.isConnected !== false && typeof previousFocus.focus === "function") previousFocus.focus();
        resolve(confirmed);
      };

      const getFocusable = () => [...modal.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((el) => !el.disabled && el.offsetParent !== null);

      function onKeyDown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(false);
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      cancelBtn.addEventListener("click", () => cleanup(false));
      confirmBtn.addEventListener("click", () => cleanup(true));
      backdrop.addEventListener("mousedown", (event) => {
        if (event.target === backdrop) cleanup(false);
      });
      document.addEventListener("keydown", onKeyDown);
      activeConfirmCleanup = cleanup;

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      modal.appendChild(titleEl);
      modal.appendChild(messageEl);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      confirmBtn.focus();
    });
  }

  function buildApplyConfirmation({ mode = "replace", warnings = [], existingCount = 0 } = {}) {
    const needsReplaceConfirm = mode === "replace" && existingCount > 0;
    const warningList = (warnings || []).filter(Boolean);
    if (!needsReplaceConfirm && warningList.length === 0) return null;
    const parts = [];
    if (needsReplaceConfirm) {
      parts.push("Replace current main segments with this Shot List? Audio, motion, and settings will be preserved.");
    }
    if (warningList.length > 0) {
      parts.push(`Warnings:\n${warningList.join("\n")}`);
    }
    return {
      title: needsReplaceConfirm ? "Apply Shot List?" : "Apply Shot List with warnings?",
      message: parts.join("\n\n"),
      confirmLabel: "Apply Shot List",
      cancelLabel: "Cancel",
    };
  }

  function saveTextFile(text, filename = "ltx-director-shot-list.txt") {
    if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return false;
    const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  async function applyShotListTextWithConfirmation(editor, text, options = {}) {
    const mode = options.mode === "append" ? "append" : "replace";
    const preview = buildShotListImport(editor, text, { mode });
    const confirmation = buildApplyConfirmation({
      mode,
      warnings: preview.warnings,
      existingCount: getSortedMainSegments(editor).length,
    });
    if (confirmation) {
      const confirmFn = options.confirmFn || openConfirmModal;
      const confirmed = await confirmFn({ ...confirmation, returnFocusTo: options.returnFocusTo || null });
      if (!confirmed) return { applied: false, cancelled: true, preview };
    }
    if (options.shouldApply && !options.shouldApply()) return { applied: false, cancelled: true, preview };
    return { applied: true, cancelled: false, preview: applyShotListImport(editor, text, { mode }) };
  }

  function isTextareaDirty(textarea, cleanValue) {
    return (textarea?.value || "") !== (cleanValue || "");
  }

  function closeModal(modal, returnFocusTo = null) {
    modal?.remove();
    closeExistingConfirmModals();
    if (returnFocusTo && returnFocusTo.isConnected !== false && typeof returnFocusTo.focus === "function") returnFocusTo.focus();
  }

  function openShotListModal(editor, returnFocusTo = null) {
    if (typeof document === "undefined") return;
    ensureStyles();
    closeExistingConfirmModals();
    document.querySelectorAll(`.${MODAL_CLASS}`).forEach((el) => el.remove());

    const modal = document.createElement("div");
    modal.className = MODAL_CLASS;
    const title = document.createElement("div");
    title.className = "twl-shot-list-title";
    title.textContent = "Shot List";

    const textarea = document.createElement("textarea");
    textarea.value = exportEditorShotList(editor);
    let textOrigin = "timeline";
    textarea.placeholder = "GLOBAL: Describe global prompt here.\n\nSHOT 1 | 3s\nDescribe segment prompt here.";
    textarea.addEventListener("input", () => {
      textOrigin = "user";
    });

    const message = document.createElement("div");
    message.className = "twl-shot-list-message";
    let fileLoadRequestId = 0;

    const modeRow = document.createElement("div");
    modeRow.className = "twl-shot-list-row";
    const replaceLabel = document.createElement("label");
    const replaceInput = document.createElement("input");
    replaceInput.type = "radio";
    replaceInput.name = "twl-shot-list-import-mode";
    replaceInput.value = "replace";
    replaceInput.checked = true;
    replaceLabel.appendChild(replaceInput);
    replaceLabel.appendChild(document.createTextNode(" Replace segments"));
    const appendLabel = document.createElement("label");
    const appendInput = document.createElement("input");
    appendInput.type = "radio";
    appendInput.name = "twl-shot-list-import-mode";
    appendInput.value = "append";
    appendLabel.appendChild(appendInput);
    appendLabel.appendChild(document.createTextNode(" Append segments"));
    modeRow.appendChild(replaceLabel);
    modeRow.appendChild(appendLabel);

    const buttonRow = document.createElement("div");
    buttonRow.className = "twl-shot-list-row";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".txt,text/plain";
    fileInput.style.display = "none";
    const loadBtn = document.createElement("button");
    loadBtn.className = "pr-btn";
    loadBtn.textContent = "Load .txt";
    loadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (event) => {
      const requestId = ++fileLoadRequestId;
      const file = event.target.files?.[0];
      fileInput.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        if (!modal.isConnected || requestId !== fileLoadRequestId) return;
        if (textOrigin !== "timeline") {
          const confirmed = await openConfirmModal({
            title: "Replace Shot List text?",
            message: "Loading this file will replace the Shot List text currently in the modal. Timeline segments will not change until you apply the Shot List.",
            confirmLabel: "Load .txt",
            returnFocusTo: loadBtn,
          });
          if (!modal.isConnected || requestId !== fileLoadRequestId) return;
          if (!confirmed) return;
        }
        textarea.value = text;
        textOrigin = "user";
        message.textContent = `Loaded ${file.name || ".txt file"}. Review or edit before applying.`;
      } catch (err) {
        message.textContent = "Could not read Shot List file.";
        console.error("[LTXDirector] Failed to read Shot List file", err);
      }
    });
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "pr-btn";
    refreshBtn.textContent = "Refresh from Timeline";
    refreshBtn.addEventListener("click", async () => {
      if (textOrigin !== "timeline") {
        const confirmed = await openConfirmModal({
          title: "Replace Shot List text?",
          message: "Refreshing from the timeline will replace the Shot List text currently in the modal.",
          confirmLabel: "Refresh",
          returnFocusTo: refreshBtn,
        });
        if (!modal.isConnected) return;
        if (!confirmed) return;
      }
      textarea.value = exportEditorShotList(editor);
      textOrigin = "timeline";
      message.textContent = "Refreshed Shot List from current segments.";
    });
    const saveBtn = document.createElement("button");
    saveBtn.className = "pr-btn";
    saveBtn.textContent = "Save .txt";
    saveBtn.addEventListener("click", () => {
      if (saveTextFile(textarea.value)) {
        message.textContent = "Saved Shot List .txt.";
      } else {
        message.textContent = "Could not save Shot List .txt in this browser.";
      }
    });
    const copyBtn = document.createElement("button");
    copyBtn.className = "pr-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        if (!modal.isConnected) return;
        message.textContent = "Copied Shot List.";
      } catch (_) {
        if (!modal.isConnected) return;
        textarea.select();
        document.execCommand("copy");
        message.textContent = "Copied Shot List.";
      }
    });
    const applyBtn = document.createElement("button");
    applyBtn.className = "pr-btn";
    applyBtn.textContent = "Apply Shot List";
    applyBtn.addEventListener("click", async () => {
      const mode = appendInput.checked ? "append" : "replace";
      try {
        const result = await applyShotListTextWithConfirmation(editor, textarea.value, {
          mode,
          returnFocusTo: applyBtn,
          shouldApply: () => modal.isConnected,
        });
        if (!modal.isConnected || !result.applied) return;
        textOrigin = "timeline";
        closeModal(modal, returnFocusTo);
      } catch (err) {
        message.textContent = err?.message || String(err);
      }
    });
    const closeBtn = document.createElement("button");
    closeBtn.className = "pr-btn";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => closeModal(modal, returnFocusTo));
    buttonRow.appendChild(fileInput);
    buttonRow.appendChild(loadBtn);
    buttonRow.appendChild(refreshBtn);
    buttonRow.appendChild(saveBtn);
    buttonRow.appendChild(copyBtn);
    buttonRow.appendChild(applyBtn);
    buttonRow.appendChild(closeBtn);

    modal.appendChild(title);
    modal.appendChild(textarea);
    modal.appendChild(modeRow);
    modal.appendChild(message);
    modal.appendChild(buttonRow);
    document.body.appendChild(modal);
  }

  function installShotListUi(editor) {
    if (!editor || editor._twlShotListInstalled || typeof document === "undefined") return;
    editor._twlShotListInstalled = true;
    const button = document.createElement("button");
    button.className = "pr-btn";
    button.textContent = "Shot List (View/Load/Save)";
    button.title = "View, load, save, or apply Shot List text";
    button.addEventListener("click", () => openShotListModal(editor, button));
    const actionGroup = editor.addTextBtn?.parentElement || editor.uploadBtn?.parentElement || editor.wrapper?.querySelector(".pr-actions");
    if (actionGroup) {
      actionGroup.appendChild(button);
    }
    editor._ltxDirectorPluginCleanup = editor._ltxDirectorPluginCleanup || [];
    editor._ltxDirectorPluginCleanup.push(() => {
      document.querySelectorAll(`.${MODAL_CLASS}`).forEach((el) => el.remove());
      closeExistingConfirmModals();
      button.remove();
    });
  }

  const publicApi = {
    applyShotListImport,
    buildShotListImport,
    createSegmentsFromShots,
    exportEditorShotList,
    getGlobalPrompt,
    getSortedMainSegments,
    getVideoMetadata,
    hasGlobalPromptDeclaration,
    installShotListUi,
    parseShotListText,
    setGlobalPrompt,
  };
  const testApi = {
    ...publicApi,
    applyVideoMetadata,
    applyShotListTextWithConfirmation,
    buildApplyConfirmation,
    isTextareaDirty,
    openConfirmModal,
    saveTextFile,
    setWidgetValue,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = testApi;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LTXDirectorTwlShotListUi = publicApi;
    globalThis.LTXDirectorTwlConfirm = globalThis.LTXDirectorTwlConfirm || { openConfirmModal };
    if (typeof globalThis.registerLTXDirectorPlugin === "function") {
      globalThis.registerLTXDirectorPlugin(installShotListUi);
    } else {
      globalThis.LTXDirectorPlugins = globalThis.LTXDirectorPlugins || [];
      globalThis.LTXDirectorPlugins.push(installShotListUi);
    }
  }
})();

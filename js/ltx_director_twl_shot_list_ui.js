// @ts-check

(function () {
  const DEFAULT_FRAME_RATE = 24;
  const MODAL_CLASS = "ltx-director-twl-shot-list-modal";

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
      video: options.video || {},
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
    `;
    document.head.appendChild(style);
  }

  function closeModal(modal) {
    modal?.remove();
  }

  function openShotListModal(editor) {
    if (typeof document === "undefined") return;
    ensureStyles();
    document.querySelectorAll(`.${MODAL_CLASS}`).forEach((el) => el.remove());

    const modal = document.createElement("div");
    modal.className = MODAL_CLASS;
    const title = document.createElement("div");
    title.className = "twl-shot-list-title";
    title.textContent = "Shot List";

    const textarea = document.createElement("textarea");
    textarea.value = exportEditorShotList(editor);
    textarea.placeholder = "GLOBAL: Describe global prompt here.\n\nSHOT 1 | 3s\nDescribe segment prompt here.";

    const message = document.createElement("div");
    message.className = "twl-shot-list-message";

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
    const exportBtn = document.createElement("button");
    exportBtn.className = "pr-btn";
    exportBtn.textContent = "Export Shot List";
    exportBtn.addEventListener("click", () => {
      textarea.value = exportEditorShotList(editor);
      message.textContent = "Exported current segments.";
    });
    const copyBtn = document.createElement("button");
    copyBtn.className = "pr-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        message.textContent = "Copied Shot List.";
      } catch (_) {
        textarea.select();
        document.execCommand("copy");
        message.textContent = "Copied Shot List.";
      }
    });
    const importBtn = document.createElement("button");
    importBtn.className = "pr-btn";
    importBtn.textContent = "Import Shot List";
    importBtn.addEventListener("click", () => {
      const mode = appendInput.checked ? "append" : "replace";
      try {
        const preview = buildShotListImport(editor, textarea.value, { mode });
        if (mode === "replace" && !confirm("Replace current main segments with this Shot List? Audio, motion, and settings will be preserved.")) return;
        if (preview.warnings.length > 0 && !confirm(`${preview.warnings.join("\n")}\n\nContinue import?`)) return;
        applyShotListImport(editor, textarea.value, { mode });
        message.textContent = mode === "append" ? "Appended Shot List segments." : "Replaced segments from Shot List.";
      } catch (err) {
        message.textContent = err?.message || String(err);
      }
    });
    const closeBtn = document.createElement("button");
    closeBtn.className = "pr-btn";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => closeModal(modal));
    buttonRow.appendChild(exportBtn);
    buttonRow.appendChild(copyBtn);
    buttonRow.appendChild(importBtn);
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
    button.textContent = "Shot List (View/Import/Export)";
    button.title = "View, import, or export Shot List text";
    button.addEventListener("click", () => openShotListModal(editor));
    const actionGroup = editor.addTextBtn?.parentElement || editor.uploadBtn?.parentElement || editor.wrapper?.querySelector(".pr-actions");
    if (actionGroup) {
      actionGroup.appendChild(button);
    }
    editor._ltxDirectorPluginCleanup = editor._ltxDirectorPluginCleanup || [];
    editor._ltxDirectorPluginCleanup.push(() => {
      button.remove();
      document.querySelectorAll(`.${MODAL_CLASS}`).forEach((el) => el.remove());
    });
  }

  const api = {
    applyShotListImport,
    buildShotListImport,
    createSegmentsFromShots,
    exportEditorShotList,
    getGlobalPrompt,
    getSortedMainSegments,
    hasGlobalPromptDeclaration,
    installShotListUi,
    parseShotListText,
    setGlobalPrompt,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LTXDirectorTwlShotListUi = api;
    if (typeof globalThis.registerLTXDirectorPlugin === "function") {
      globalThis.registerLTXDirectorPlugin(installShotListUi);
    } else {
      globalThis.LTXDirectorPlugins = globalThis.LTXDirectorPlugins || [];
      globalThis.LTXDirectorPlugins.push(installShotListUi);
    }
  }
})();

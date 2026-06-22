// @ts-check

(function () {
  const DEFAULT_FRAME_RATE = 24;
  const DEFAULT_DURATION_FRAMES = 120;

  function normalizeFrameRate(frameRate) {
    const parsed = Number(frameRate);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FRAME_RATE;
  }

  function getFrameRate(editor) {
    if (editor && typeof editor.getFrameRate === "function") return normalizeFrameRate(editor.getFrameRate());
    return normalizeFrameRate(editor?.frameRateWidget?.value || editor?.node?.properties?.frame_rate);
  }

  function makeId(prefix = "segment") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function getWidget(editor, name) {
    return editor?.node?.widgets?.find((widget) => widget?.name === name) || null;
  }

  function setWidgetValue(editor, name, value) {
    const widget = getWidget(editor, name);
    if (widget) {
      widget.value = value;
      if (typeof widget.callback === "function") widget.callback(value);
    }
    if (editor?.node?.properties) editor.node.properties[name] = value;
    return !!widget;
  }

  function getSegmentEnd(segment) {
    return (Number(segment?.start) || 0) + (Number(segment?.length) || 0);
  }

  function isRealMainSegment(segment) {
    return !!segment && segment.type !== "ghost" && segment.type !== "temp";
  }

  function getSelectedMainSegment(editor) {
    if (!editor || editor.selectionType !== "image") return null;
    const index = Number(editor.selectedIndex);
    if (!Number.isInteger(index) || index < 0) return null;
    const segment = editor.timeline?.segments?.[index] || null;
    return isRealMainSegment(segment) ? segment : null;
  }

  function getSelectedMainSegments(editor) {
    const segments = editor?.timeline?.segments || [];
    const selectedIds = new Set(Array.isArray(editor?.selectedSegmentIds) ? editor.selectedSegmentIds : []);
    const selectedSegments = selectedIds.size
      ? segments.filter((segment) => selectedIds.has(segment.id) && isRealMainSegment(segment))
      : [];
    if (selectedSegments.length) return selectedSegments;
    const selected = getSelectedMainSegment(editor);
    return selected ? [selected] : [];
  }

  function syncAfterMutation(editor, options = {}) {
    if (!editor) return;
    if (Number.isFinite(Number(options.growTo))) editor.growTimelineIfNeeded?.(Math.max(0, Math.round(Number(options.growTo))));
    editor.updateUIFromSelection?.();
    editor.syncWidgetsAndUI?.();
    editor.commitChanges?.();
    editor.render?.();
  }

  function getLinkedAudioId(segment) {
    if (!segment?.id || !segment.id.endsWith("_v")) return null;
    return `${segment.id.slice(0, -2)}_a`;
  }

  function removeLinkedAudioSibling(editor, segment) {
    const audioId = getLinkedAudioId(segment);
    if (!audioId || !Array.isArray(editor?.timeline?.audioSegments)) return false;
    const before = editor.timeline.audioSegments.length;
    editor.timeline.audioSegments = editor.timeline.audioSegments.filter((audio) => audio.id !== audioId);
    return editor.timeline.audioSegments.length !== before;
  }

  function applyRippleDelete(editor) {
    const selectedSegments = getSelectedMainSegments(editor);
    if (!selectedSegments.length) return { changed: false, reason: "no_selected_segment" };

    const segments = editor.timeline.segments || [];
    const removedIds = new Set(selectedSegments.map((segment) => segment.id));
    const removals = selectedSegments.map((segment) => ({
      start: Number(segment.start) || 0,
      length: Math.max(0, Math.round(Number(segment.length) || 0)),
    }));
    editor.timeline.segments = segments.filter((item) => !removedIds.has(item.id));
    for (const segment of selectedSegments) removeLinkedAudioSibling(editor, segment);

    for (const item of editor.timeline.segments) {
      const start = Number(item.start) || 0;
      const shift = removals.reduce((sum, removal) => start > removal.start ? sum + removal.length : sum, 0);
      if (shift > 0) item.start = Math.max(0, Math.round(start - shift));
    }

    editor.selectedSegmentIds = [];
    editor.selectedIndex = editor.timeline.segments.length ? Math.min(Number(editor.selectedIndex) || 0, editor.timeline.segments.length - 1) : -1;
    editor.selectionType = "image";
    const maxEnd = getMaxTimelineEnd(editor);
    syncAfterMutation(editor, { growTo: maxEnd });
    return { changed: true, removedLength: removals.reduce((sum, removal) => sum + removal.length, 0), maxEnd };
  }

  function applyRippleDeleteGaps(editor) {
    const segments = [...(editor?.timeline?.segments || [])].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    if (!segments.length) return { changed: false, reason: "empty_timeline" };
    let cursor = 0;
    let changed = false;
    for (const segment of segments) {
      if (!isRealMainSegment(segment)) continue;
      const nextStart = Math.max(0, cursor);
      if ((Number(segment.start) || 0) !== nextStart) changed = true;
      segment.start = nextStart;
      cursor = segment.start + Math.max(0, Math.round(Number(segment.length) || 0));
    }
    editor.timeline.segments = segments;
    if (!changed) return { changed: false, reason: "no_gaps" };
    syncAfterMutation(editor, { growTo: cursor });
    return { changed: true, maxEnd: cursor };
  }

  function getMaxTimelineEnd(editor) {
    const all = [
      ...(editor?.timeline?.segments || []),
      ...(editor?.timeline?.audioSegments || []),
      ...(editor?.timeline?.motionSegments || []),
    ];
    return all.reduce((max, segment) => Math.max(max, getSegmentEnd(segment)), 0);
  }

  function applyTrimToLastClip(editor) {
    const lastEnd = getMaxTimelineEnd(editor);
    if (lastEnd <= 0) return { changed: false, reason: "empty_timeline" };
    const frames = Math.max(1, Math.round(lastEnd));
    setWidgetValue(editor, "duration_frames", frames);
    setWidgetValue(editor, "end_frame", frames);
    setWidgetValue(editor, "duration_seconds", Number((frames / getFrameRate(editor)).toFixed(3)));
    if (editor?.timeline) editor.timeline.normalDurationFrames = frames;
    syncAfterMutation(editor, { growTo: frames });
    return { changed: true, frames };
  }

  function clearSelectionState(editor) {
    editor.selectedIndex = -1;
    editor.selectionType = "image";
    editor.selectedSegmentIds = [];
    editor.markedSelection = null;
    editor.currentFrame = 0;
  }

  function applyResetTimeline(editor) {
    if (!editor?.timeline) return { changed: false, reason: "missing_timeline" };
    editor.timeline.segments = [];
    editor.timeline.audioSegments = [];
    editor.timeline.motionSegments = [];
    clearSelectionState(editor);
    syncAfterMutation(editor, { growTo: editor.timeline.normalDurationFrames || DEFAULT_DURATION_FRAMES });
    return { changed: true };
  }

  function applyResetAll(editor) {
    if (!editor?.timeline) return { changed: false, reason: "missing_timeline" };
    editor.timeline.segments = [];
    editor.timeline.audioSegments = [];
    editor.timeline.motionSegments = [];
    editor.timeline.global_prompt = "";
    editor.timeline.retake_global_prompt = "";
    editor.timeline.mainTrackEnabled = true;
    editor.timeline.audioTrackEnabled = true;
    editor.timeline.motionTrackEnabled = true;
    editor.timeline.propHeight = 90;
    editor.timeline.globalPropHeight = 60;
    editor.timeline.showFilenames = true;
    editor.timeline.overrideAudio = false;
    editor.timeline.inpaint_audio = true;
    editor.timeline.retakeMode = false;
    editor.timeline.retakeStart = 24;
    editor.timeline.retakeLength = 48;
    editor.timeline.retakePrompt = "";
    editor.timeline.retakeStrength = 1;
    editor.timeline.retakeVideo = null;
    editor.timeline.normalStartFrame = 0;
    editor.timeline.normalDurationFrames = DEFAULT_DURATION_FRAMES;
    editor.mainTrackEnabled = true;
    editor.audioTrackEnabled = true;
    editor.motionTrackEnabled = true;
    editor.propHeight = 90;
    editor.globalPropHeight = 60;
    editor.retakeMode = false;
    if (editor.propContainer?.style) editor.propContainer.style.height = "90px";
    if (editor.globalPropContainer?.style) editor.globalPropContainer.style.height = "60px";
    if (editor.node?.properties) {
      editor.node.properties.global_prompt = "";
      editor.node.properties.mainTrackEnabled = true;
      editor.node.properties.audioTrackEnabled = true;
      editor.node.properties.motionTrackEnabled = true;
      editor.node.properties.showFilenames = true;
      editor.node.properties.overrideAudio = false;
      editor.node.properties.inpaint_audio = true;
      editor.node.properties.retakeMode = false;
    }
    if (editor.globalPromptInput) editor.globalPromptInput.value = "";
    setWidgetValue(editor, "override_audio", false);
    setWidgetValue(editor, "inpaint_audio", true);
    setWidgetValue(editor, "duration_frames", DEFAULT_DURATION_FRAMES);
    setWidgetValue(editor, "duration_seconds", Number((DEFAULT_DURATION_FRAMES / getFrameRate(editor)).toFixed(3)));
    setWidgetValue(editor, "start_frame", 0);
    setWidgetValue(editor, "end_frame", DEFAULT_DURATION_FRAMES);
    clearSelectionState(editor);
    editor.updateRetakeUIState?.();
    syncAfterMutation(editor, { growTo: DEFAULT_DURATION_FRAMES });
    return { changed: true };
  }

  function buildActionConfirmation(action) {
    const confirmations = {
      resetTimeline: {
        title: "Reset Timeline?",
        message: "This will clear timeline segments, audio segments, motion segments, and selection state. Global prompt and node settings will be preserved.",
        confirmLabel: "Reset Timeline",
        cancelLabel: "Cancel",
      },
      resetAll: {
        title: "Reset All?",
        message: "This will reset LTX Director timeline and prompt state to defaults. Uploaded files on disk will not be deleted.",
        confirmLabel: "Reset All",
        cancelLabel: "Cancel",
      },
      convertToText: {
        title: "Convert to Text?",
        message: "This removes visual media from the segment while preserving the prompt and related audio / IC-LoRA motion context.",
        confirmLabel: "Convert to Text",
        cancelLabel: "Cancel",
      },
    };
    return confirmations[action] || null;
  }

  function getConfirmFn(options = {}) {
    if (typeof options.confirmFn === "function") return options.confirmFn;
    const shared = typeof globalThis !== "undefined" ? globalThis.LTXDirectorTwlConfirm : null;
    if (typeof shared?.openConfirmModal === "function") return shared.openConfirmModal;
    return async () => false;
  }

  async function applyConfirmedAction(editor, action, applyFn, options = {}) {
    const confirmation = buildActionConfirmation(action);
    const confirmFn = getConfirmFn(options);
    const confirmed = confirmation ? await confirmFn({ ...confirmation, returnFocusTo: options.returnFocusTo || null }) : true;
    if (!confirmed) return { applied: false, cancelled: true };
    if (typeof options.shouldApply === "function" && !options.shouldApply()) return { applied: false, stale: true };
    const result = applyFn(editor, options);
    return { ...result, applied: !!result?.changed };
  }

  function createButton(label, options = {}) {
    const button = document.createElement("button");
    button.className = options.className || "pr-btn";
    button.textContent = label;
    if (options.title) button.title = options.title;
    if (options.danger) button.className += " pr-btn-danger";
    if (typeof options.onClick === "function") button.addEventListener("click", options.onClick);
    return button;
  }

  function findTimelineActionsParent(editor) {
    const controls = editor?.wrapper?.querySelector?.(".pr-player-controls")?.parentElement;
    if (controls?.parentElement) return { parent: controls.parentElement, after: controls };
    if (editor?.wrapper) return { parent: editor.wrapper, after: null };
    const actionGroup = editor?.addTextBtn?.parentElement || editor?.uploadBtn?.parentElement;
    if (actionGroup) return { parent: actionGroup, after: null };
    return { parent: null, after: null };
  }

  function insertAfter(parent, child, after) {
    if (!parent) return;
    if (!after || !Array.isArray(parent.children)) {
      parent.appendChild(child);
      return;
    }
    const index = parent.children.indexOf(after);
    if (index === -1 || index === parent.children.length - 1 || typeof parent.insertBefore !== "function") {
      parent.appendChild(child);
      return;
    }
    parent.insertBefore(child, parent.children[index + 1]);
  }

  function installTimelineActionsContainer(editor) {
    if (!editor || editor._twlTimelineActionsContainerInstalled || typeof document === "undefined") return;
    const { parent, after } = findTimelineActionsParent(editor);
    if (!parent) return;
    editor._twlTimelineActionsContainerInstalled = true;

    const group = document.createElement("div");
    group.className = "pr-controls-group twl-timeline-actions-group";

    const label = document.createElement("div");
    label.className = "pr-controls-label";
    label.textContent = "Timeline Actions";

    const actions = document.createElement("div");
    actions.className = "twl-timeline-actions";
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "6px";

    actions.appendChild(createButton("Ripple Delete", {
      danger: true,
      onClick: () => applyRippleDelete(editor),
    }));
    actions.appendChild(createButton("Ripple Delete Gaps", {
      onClick: () => applyRippleDeleteGaps(editor),
    }));
    actions.appendChild(createButton("Trim to Last Clip", {
      onClick: () => applyTrimToLastClip(editor),
    }));
    actions.appendChild(createButton("Reset Timeline", {
      danger: true,
      onClick: () => applyConfirmedAction(editor, "resetTimeline", applyResetTimeline, { returnFocusTo: group }),
    }));
    actions.appendChild(createButton("Reset All", {
      danger: true,
      onClick: () => applyConfirmedAction(editor, "resetAll", applyResetAll, { returnFocusTo: group }),
    }));

    group.appendChild(label);
    group.appendChild(actions);
    insertAfter(parent, group, after);

    editor._ltxDirectorPluginCleanup = editor._ltxDirectorPluginCleanup || [];
    editor._ltxDirectorPluginCleanup.push(() => group.remove());
  }

  function isMainContextSegment(editor, segment, trackType) {
    if (!isRealMainSegment(segment)) return false;
    if (["audio", "motion", "motion_video"].includes(trackType)) return false;
    return (editor?.timeline?.segments || []).some((item) => item.id === segment.id);
  }

  function makeMenuDivider() {
    const divider = document.createElement("div");
    divider.className = "pr-settings-divider";
    return divider;
  }

  function insertContextActionsAtTop(menu, group) {
    group.style.display = "flex";
    group.style.flexDirection = "column";
    group.style.gap = "4px";
    const divider = makeMenuDivider();
    const firstChild = menu.children?.[0] || null;
    if (firstChild && typeof menu.insertBefore === "function") {
      menu.insertBefore(group, firstChild);
      menu.insertBefore(divider, firstChild);
      return;
    }
    menu.appendChild(group);
    menu.appendChild(divider);
  }

  function appendTwlContextActions(editor, segment, trackType) {
    const menu = editor?._contextMenu;
    if (!menu || typeof document === "undefined") return;
    if (!isMainContextSegment(editor, segment, trackType)) return;
    if (menu.querySelector?.(".twl-timeline-context-actions")) return;

    const group = document.createElement("div");
    group.className = "twl-timeline-context-actions";

    const appendMenuButton = (label, onClick, options = {}) => {
      const button = createButton(label, {
        className: "pr-gap-menu-btn",
        onClick: () => {
          onClick();
          editor.dismissContextMenu?.();
        },
      });
      if (options.danger) button.style.color = "#ff4444";
      group.appendChild(button);
      return button;
    };

    const selectOnlyContextSegment = () => {
      editor.selectionType = "image";
      editor.selectedSegmentIds = segment?.id ? [segment.id] : [];
      editor.selectedIndex = (editor.timeline.segments || []).findIndex((item) => item.id === segment.id);
    };

    appendMenuButton("Ripple Delete", () => {
      selectOnlyContextSegment();
      applyRippleDelete(editor);
    }, { danger: true });
    appendMenuButton("Add Segment Before", () => {
      selectOnlyContextSegment();
      addSegmentAdjacent(editor, "before");
    });
    appendMenuButton("Add Segment After", () => {
      selectOnlyContextSegment();
      addSegmentAdjacent(editor, "after");
    });

    if (segment.type !== "text") {
      appendMenuButton("Convert to Text", () => {
        promptConvertToText(editor, segment, { returnFocusTo: menu });
      });
    }
    if (segment.type !== "image") {
      appendMenuButton("Convert to Image", () => promptConvertToImage(editor, segment));
    }
    if (segment.type !== "video") {
      appendMenuButton("Convert to Video", () => promptConvertToVideo(editor, segment));
    }

    insertContextActionsAtTop(menu, group);
  }

  function installContextMenuExtension(editor) {
    if (!editor || editor._twlTimelineContextInstalled || typeof editor.showContextMenu !== "function" || typeof document === "undefined") return;
    editor._twlTimelineContextInstalled = true;
    const originalShowContextMenu = editor.showContextMenu.bind(editor);
    editor.showContextMenu = function (clientX, clientY, segment, trackType) {
      const result = originalShowContextMenu(clientX, clientY, segment, trackType);
      try {
        appendTwlContextActions(editor, segment, trackType);
      } catch (error) {
        console.error("[LTXDirectorTWL] failed to append timeline context actions:", error);
      }
      return result;
    };
    editor._ltxDirectorPluginCleanup = editor._ltxDirectorPluginCleanup || [];
    editor._ltxDirectorPluginCleanup.push(() => {
      editor.showContextMenu = originalShowContextMenu;
      editor._twlTimelineContextInstalled = false;
    });
  }

  function addSegmentAdjacent(editor, direction = "after", options = {}) {
    const target = getSelectedMainSegment(editor);
    if (!target) return { changed: false, reason: "no_selected_segment" };
    const frameRate = getFrameRate(editor);
    const newLength = Math.max(1, Math.round(frameRate));
    const sorted = [...(editor.timeline.segments || [])].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    const targetIndex = sorted.findIndex((segment) => segment.id === target.id);
    if (targetIndex === -1) return { changed: false, reason: "no_selected_segment" };

    const insertStart = direction === "before" ? Number(target.start) || 0 : getSegmentEnd(target);
    const shiftFromIndex = direction === "before" ? targetIndex : targetIndex + 1;
    for (let index = shiftFromIndex; index < sorted.length; index += 1) {
      sorted[index].start = Math.max(0, Math.round((Number(sorted[index].start) || 0) + newLength));
    }

    const newSegment = {
      id: (options.idFactory || makeId)("segment"),
      start: insertStart,
      length: newLength,
      prompt: "",
      type: "text",
    };
    sorted.push(newSegment);
    sorted.sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    editor.timeline.segments = sorted;
    editor.selectionType = "image";
    editor.selectedIndex = sorted.findIndex((segment) => segment.id === newSegment.id);
    const maxEnd = getMaxTimelineEnd(editor);
    syncAfterMutation(editor, { growTo: maxEnd });
    return { changed: true, segment: newSegment, maxEnd };
  }

  function findLiveMainSegment(editor, segment) {
    if (!segment?.id) return null;
    return (editor?.timeline?.segments || []).find((item) => item.id === segment.id) || null;
  }

  function hasLinkedAudioSibling(editor, segment) {
    const audioId = getLinkedAudioId(segment);
    return !!audioId && (editor?.timeline?.audioSegments || []).some((audio) => audio.id === audioId);
  }

  function deleteMediaFields(segment) {
    for (const key of [
      "imageFile",
      "imageB64",
      "imgObj",
      "videoEl",
      "videoDurationFrames",
      "fileName",
      "thumbnails",
      "_blobUrl",
      "_uploading",
      "_extractingThumbs",
      "fileSize",
      "trimStart",
    ]) {
      delete segment[key];
    }
  }

  function convertSegmentToText(editor, segment, options = {}) {
    const target = findLiveMainSegment(editor, segment);
    if (!target) return { changed: false, reason: "stale_segment" };
    const linkedAudioId = getLinkedAudioId(target);
    if (options.removeLinkedAudio && linkedAudioId && Array.isArray(editor?.timeline?.audioSegments)) {
      editor.timeline.audioSegments = editor.timeline.audioSegments.filter((audio) => audio.id !== linkedAudioId);
    }
    target.type = "text";
    if (target.id?.endsWith("_v") || target.id?.endsWith("_a")) target.id = (options.idFactory || makeId)("segment");
    deleteMediaFields(target);
    syncAfterMutation(editor, { growTo: getMaxTimelineEnd(editor) });
    return { changed: true, segment: target };
  }

  function convertSegmentToImage(editor, segment, image = {}) {
    const target = findLiveMainSegment(editor, segment);
    if (!target) return { changed: false, reason: "stale_segment" };
    if (!image.imageFile && !image.imageB64) return { changed: false, reason: "missing_image" };
    deleteMediaFields(target);
    target.type = "image";
    if (image.imageFile !== undefined) target.imageFile = image.imageFile;
    if (image.imageB64 !== undefined) target.imageB64 = image.imageB64;
    if (image.imgObj !== undefined) target.imgObj = image.imgObj;
    syncAfterMutation(editor, { growTo: getMaxTimelineEnd(editor) });
    return { changed: true, segment: target };
  }

  function getVideoBaseId(segment, options = {}) {
    if (segment?.id?.endsWith("_v") || segment?.id?.endsWith("_a")) return segment.id.slice(0, -2);
    return (options.idFactory || makeId)("segment");
  }

  function shiftLaterLinkedAudio(editor, shiftedMainIds, delta) {
    if (!delta || !Array.isArray(editor?.timeline?.audioSegments)) return;
    const linkedAudioIds = new Set([...shiftedMainIds]
      .filter((id) => id?.endsWith("_v"))
      .map((id) => `${id.slice(0, -2)}_a`));
    for (const audio of editor.timeline.audioSegments) {
      if (linkedAudioIds.has(audio.id)) audio.start = Math.max(0, Math.round((Number(audio.start) || 0) + delta));
    }
  }

  function rippleMainSegmentsAfter(editor, targetId, targetStart, delta) {
    if (!delta) return;
    const shiftedMainIds = new Set();
    for (const item of editor?.timeline?.segments || []) {
      if (item.id === targetId) continue;
      if ((Number(item.start) || 0) > targetStart) {
        item.start = Math.max(0, Math.round((Number(item.start) || 0) + delta));
        shiftedMainIds.add(item.id);
      }
    }
    shiftLaterLinkedAudio(editor, shiftedMainIds, delta);
  }

  function upsertVideoAudioSibling(editor, target, video = {}, options = {}) {
    const baseId = getVideoBaseId(target, options);
    const audioId = `${baseId}_a`;
    target.id = `${baseId}_v`;

    editor.timeline.audioSegments = editor.timeline.audioSegments || [];
    let audio = editor.timeline.audioSegments.find((segment) => segment.id === audioId);
    if (!audio) {
      audio = { id: audioId, type: "audio" };
      editor.timeline.audioSegments.push(audio);
    }

    audio.start = Number(target.start) || 0;
    audio.length = Math.max(1, Math.round(Number(target.length) || 1));
    audio.trimStart = Number(video.trimStart) || 0;
    audio.audioDurationFrames = Math.max(1, Math.round(Number(video.videoDurationFrames) || Number(target.length) || 1));
    audio.audioFile = video.audioFile ?? video.imageFile ?? "";
    if (video.fileName !== undefined) audio.fileName = video.fileName;
    audio.waveformPeaks = Array.isArray(video.waveformPeaks) ? video.waveformPeaks : [];
    if (video._blobUrl !== undefined) audio._blobUrl = video._blobUrl;
    if (video.fileSize !== undefined) audio.fileSize = video.fileSize;
    audio._uploading = video._uploading === true;
    audio._decoding = video._decoding === true;
    return audio;
  }

  function convertSegmentToVideo(editor, segment, video = {}, options = {}) {
    const target = findLiveMainSegment(editor, segment);
    if (!target) return { changed: false, reason: "stale_segment" };
    if (!video.imageFile && !video.videoEl && !video.fileName) return { changed: false, reason: "missing_video" };
    const oldStart = Number(target.start) || 0;
    const oldLength = Math.max(1, Math.round(Number(target.length) || 1));
    const clipFrames = Math.max(1, Math.round(Number(video.videoDurationFrames) || oldLength));
    const nextLength = video.durationMode === "expandToVideo" ? clipFrames : Math.min(oldLength, clipFrames);
    const delta = nextLength - oldLength;
    deleteMediaFields(target);
    target.type = "video";
    target.trimStart = Number(video.trimStart) || 0;
    target.length = nextLength;
    if (video.imageFile !== undefined) target.imageFile = video.imageFile;
    if (video.fileName !== undefined) target.fileName = video.fileName;
    target.videoDurationFrames = clipFrames;
    if (video.imageB64 !== undefined) target.imageB64 = video.imageB64;
    if (video.videoEl !== undefined) target.videoEl = video.videoEl;
    if (video.imgObj !== undefined) target.imgObj = video.imgObj;
    if (video._blobUrl !== undefined) target._blobUrl = video._blobUrl;
    if (video.fileSize !== undefined) target.fileSize = video.fileSize;
    if (video._uploading !== undefined) target._uploading = video._uploading;
    const audioSegment = upsertVideoAudioSibling(editor, target, video, options);
    rippleMainSegmentsAfter(editor, target.id, oldStart, delta);
    editor.timeline.audioSegments.sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    editor.timeline.segments.sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    editor.selectionType = "image";
    editor.selectedIndex = editor.timeline.segments.findIndex((item) => item.id === target.id);
    editor.selectedSegmentIds = [target.id, audioSegment.id];
    syncAfterMutation(editor, { growTo: getMaxTimelineEnd(editor) });
    return { changed: true, segment: target, audioSegment };
  }

  function promptForFile(accept, onFile) {
    if (typeof document === "undefined") return false;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", (event) => {
      const file = event.target?.files?.[0];
      if (file) onFile(file);
    });
    input.click();
    return true;
  }

  function getComfyApi() {
    const comfyApi = typeof globalThis !== "undefined" ? globalThis.comfyAPI?.api : null;
    return comfyApi?.api || comfyApi;
  }

  async function uploadImageForSegment(editor, segment, file) {
    if (!file || !file.type?.startsWith("image/")) return { changed: false, reason: "invalid_file" };
    const api = getComfyApi();
    if (!api?.fetchApi || !api?.apiURL || typeof FormData === "undefined") return { changed: false, reason: "upload_unavailable" };
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("subfolder", "whatdreamscost");
      const resp = await api.fetchApi("/upload/image", { method: "POST", body });
      if (resp.status !== 200) return { changed: false, reason: "upload_failed" };
      const data = await resp.json();
      const filename = data.name;
      const subfolder = data.subfolder || "";
      const imageFile = subfolder ? `${subfolder}/${filename}` : filename;
      const imageB64 = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${encodeURIComponent(subfolder)}`);
      if (typeof Image === "undefined") return convertSegmentToImage(editor, segment, { imageFile, imageB64 });
      return await new Promise((resolve) => {
        const imgObj = new Image();
        imgObj.onload = () => resolve(convertSegmentToImage(editor, segment, { imageFile, imageB64, imgObj }));
        imgObj.onerror = () => resolve(convertSegmentToImage(editor, segment, { imageFile, imageB64 }));
        imgObj.src = imageB64;
      });
    } catch (error) {
      console.error("[LTXDirectorTWL] convert to image failed:", error);
      return { changed: false, reason: "upload_failed" };
    }
  }

  function finishVideoAudioExtraction(editor, audioSegment, file, blobUrl) {
    if (!audioSegment) return;
    const isLargeFile = Number(file?.size) > 100 * 1024 * 1024;
    if (!isLargeFile && typeof editor?._extractAudioOnClient === "function") {
      editor._extractAudioOnClient(file, audioSegment.id, blobUrl);
    }
  }

  function updateConvertedVideoUploadState(editor, result, filePath, blobUrl) {
    const live = findLiveMainSegment(editor, result.segment);
    const audio = result.audioSegment?.id
      ? (editor?.timeline?.audioSegments || []).find((segment) => segment.id === result.audioSegment.id)
      : null;
    if (live) {
      live.imageFile = filePath || live.imageFile;
      live._uploading = false;
    }
    if (audio) {
      audio.audioFile = filePath || audio.audioFile;
      audio._uploading = false;
    }
    const api = getComfyApi();
    if (api?.fetchApi && filePath && audio) {
      api.fetchApi(`/ltx_director_get_audio?filename=${encodeURIComponent(filePath)}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.audio_file && data.peaks) {
            const currentAudio = (editor?.timeline?.audioSegments || []).find((segment) => segment.id === audio.id || segment._blobUrl === blobUrl);
            if (currentAudio) {
              currentAudio.audioFile = data.audio_file;
              currentAudio.waveformPeaks = data.peaks;
              currentAudio._decoding = false;
              editor._preloadAudioSegment?.(currentAudio);
            }
          } else if (audio) {
            audio._decoding = false;
          }
          editor.commitChanges?.(true);
          editor.render?.();
        })
        .catch((error) => {
          console.error("[LTXDirectorTWL] convert to video audio query failed:", error);
          if (audio) audio._decoding = false;
          editor.render?.();
        });
    }
  }

  async function uploadVideoForSegment(editor, segment, file, options = {}) {
    if (!file || !file.type?.startsWith("video/")) return { changed: false, reason: "invalid_file" };
    if (typeof document === "undefined" || typeof URL === "undefined") return { changed: false, reason: "upload_unavailable" };
    try {
      const blobUrl = URL.createObjectURL(file);
      const videoEl = document.createElement("video");
      videoEl.crossOrigin = "Anonymous";
      videoEl.preload = "auto";
      videoEl.muted = true;
      const frameRate = getFrameRate(editor);
      return await new Promise((resolve) => {
        videoEl.onerror = () => resolve({ changed: false, reason: "load_failed" });
        videoEl.onloadeddata = () => {
          const clipFrames = Math.max(1, Math.ceil((videoEl.duration || 1) * frameRate));
          const result = convertSegmentToVideo(editor, segment, {
            fileName: file.name,
            videoDurationFrames: clipFrames,
            videoEl,
            _blobUrl: blobUrl,
            fileSize: file.size,
            _uploading: typeof editor?._uploadVideoFile === "function",
            _decoding: typeof editor?._extractAudioOnClient === "function",
            durationMode: options.durationMode || "trimToSegment",
          });
          if (result.changed) {
            editor._ensureThumbnails?.(result.segment);
            finishVideoAudioExtraction(editor, result.audioSegment, file, blobUrl);
          }
          if (result.changed && typeof editor?._uploadVideoFile === "function") {
            editor._uploadVideoFile(file).then((filePath) => {
              updateConvertedVideoUploadState(editor, result, filePath, blobUrl);
              editor.commitChanges?.(true);
              editor.render?.();
            }).catch((error) => {
              console.error("[LTXDirectorTWL] convert to video upload failed:", error);
              const live = findLiveMainSegment(editor, result.segment);
              if (live) live._uploading = false;
              const audio = result.audioSegment?.id ? (editor?.timeline?.audioSegments || []).find((item) => item.id === result.audioSegment.id) : null;
              if (audio) {
                audio._uploading = false;
                audio._decoding = false;
              }
              editor.commitChanges?.(true);
              editor.render?.();
            });
          }
          resolve(result);
        };
        videoEl.src = blobUrl;
      });
    } catch (error) {
      console.error("[LTXDirectorTWL] convert to video failed:", error);
      return { changed: false, reason: "upload_failed" };
    }
  }

  function promptConvertToImage(editor, segment) {
    return promptForFile("image/*", (file) => uploadImageForSegment(editor, segment, file));
  }

  function applyConvertToTextChoice(editor, segment, options = {}) {
    return applyConfirmedAction(editor, "convertToText", () => convertSegmentToText(editor, segment, options), {
      confirmFn: options.confirmFn,
      shouldApply: () => !!findLiveMainSegment(editor, segment),
      returnFocusTo: options.returnFocusTo || null,
    });
  }

  function openConvertToTextAudioChoice(editor, segment, options = {}) {
    if (typeof document === "undefined") return null;
    const modal = document.createElement("div");
    modal.className = "twl-convert-text-audio-choice";
    modal.style.position = "fixed";
    modal.style.zIndex = "10000";
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.background = "#1e1e1e";
    modal.style.border = "1px solid #444";
    modal.style.borderRadius = "6px";
    modal.style.padding = "10px";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
    modal.style.gap = "8px";

    const title = document.createElement("div");
    title.textContent = "Convert to Text";
    title.style.color = "#e0e0e0";
    title.style.fontSize = "12px";
    modal.appendChild(title);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    const choose = (removeLinkedAudio) => {
      modal.remove();
      applyConvertToTextChoice(editor, segment, { ...options, removeLinkedAudio });
    };
    row.appendChild(createButton("Keep Audio", { onClick: () => choose(false) }));
    row.appendChild(createButton("Remove Audio", { danger: true, onClick: () => choose(true) }));
    row.appendChild(createButton("Cancel", { onClick: () => modal.remove() }));
    modal.appendChild(row);
    document.body.appendChild(modal);
    return modal;
  }

  function promptConvertToText(editor, segment, options = {}) {
    if (segment?.type === "video" && hasLinkedAudioSibling(editor, segment)) {
      return openConvertToTextAudioChoice(editor, segment, options);
    }
    return applyConvertToTextChoice(editor, segment, options);
  }

  function openVideoConversionChoice(editor, segment) {
    if (typeof document === "undefined") return null;
    const modal = document.createElement("div");
    modal.className = "twl-video-conversion-choice";
    modal.style.position = "fixed";
    modal.style.zIndex = "10000";
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.background = "#1e1e1e";
    modal.style.border = "1px solid #444";
    modal.style.borderRadius = "6px";
    modal.style.padding = "10px";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
    modal.style.gap = "8px";

    const title = document.createElement("div");
    title.textContent = "Convert to Video";
    title.style.color = "#e0e0e0";
    title.style.fontSize = "12px";
    modal.appendChild(title);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    const choose = (durationMode) => {
      modal.remove();
      promptForFile("video/*", (file) => uploadVideoForSegment(editor, segment, file, { durationMode }));
    };
    row.appendChild(createButton("Trim to Segment", { onClick: () => choose("trimToSegment") }));
    row.appendChild(createButton("Expand to Video", { onClick: () => choose("expandToVideo") }));
    row.appendChild(createButton("Cancel", { onClick: () => modal.remove() }));
    modal.appendChild(row);
    document.body.appendChild(modal);
    return modal;
  }

  function promptConvertToVideo(editor, segment) {
    return openVideoConversionChoice(editor, segment);
  }

  function installTimelineActionsUi(editor) {
    if (!editor || editor._twlTimelineActionsInstalled || typeof document === "undefined") return;
    editor._twlTimelineActionsInstalled = true;
    installTimelineActionsContainer(editor);
    installContextMenuExtension(editor);
  }

  const api = {
    addSegmentAdjacent,
    applyConfirmedAction,
    applyResetAll,
    applyResetTimeline,
    applyRippleDelete,
    applyRippleDeleteGaps,
    applyTrimToLastClip,
    buildActionConfirmation,
    convertSegmentToImage,
    convertSegmentToText,
    convertSegmentToVideo,
    getSelectedMainSegments,
    getSelectedMainSegment,
    installContextMenuExtension,
    installTimelineActionsUi,
    installTimelineActionsContainer,
    promptConvertToImage,
    promptConvertToVideo,
    syncAfterMutation,
    uploadImageForSegment,
    uploadVideoForSegment,
    getComfyApi,
    openVideoConversionChoice,
    openConvertToTextAudioChoice,
    promptConvertToText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LTXDirectorTwlTimelineActionsUi = api;
    if (typeof globalThis.registerLTXDirectorPlugin === "function") {
      globalThis.registerLTXDirectorPlugin(installTimelineActionsUi);
    } else {
      globalThis.LTXDirectorPlugins = globalThis.LTXDirectorPlugins || [];
      globalThis.LTXDirectorPlugins.push(installTimelineActionsUi);
    }
  }
})();

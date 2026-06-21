// @ts-check

(function () {
  const DEFAULT_FRAME_RATE = 24;
  const MIN_SEGMENT_LENGTH = 1;

  function normalizeFrameRate(frameRate) {
    const parsed = Number(frameRate);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FRAME_RATE;
  }

  function getFrameRate(editor) {
    if (editor && typeof editor.getFrameRate === "function") {
      return normalizeFrameRate(editor.getFrameRate());
    }
    return normalizeFrameRate(editor?.frameRateWidget?.value || editor?.node?.properties?.frame_rate);
  }

  function getSelectedMainSegment(editor) {
    if (!editor || editor.selectionType !== "image") return null;
    const index = Number(editor.selectedIndex);
    if (!Number.isInteger(index) || index < 0) return null;
    const segment = editor.timeline?.segments?.[index] || null;
    if (!segment || segment.type === "ghost" || segment.type === "temp") return null;
    return segment;
  }

  function getSegmentMaxLength(segment) {
    if (!segment) return Infinity;
    if (segment.type === "video" && Number.isFinite(Number(segment.videoDurationFrames))) {
      const trimStart = Number(segment.trimStart) || 0;
      return Math.max(MIN_SEGMENT_LENGTH, Math.round(Number(segment.videoDurationFrames) - trimStart));
    }
    if (Number.isFinite(Number(segment.audioDurationFrames))) {
      const trimStart = Number(segment.trimStart) || 0;
      return Math.max(MIN_SEGMENT_LENGTH, Math.round(Number(segment.audioDurationFrames) - trimStart));
    }
    return Infinity;
  }

  function normalizeDurationToFrames(value, options = {}) {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (options.units === "frames") return Math.round(raw);
    return Math.round(raw * normalizeFrameRate(options.frameRate));
  }

  function applyRippleDuration(segments, targetId, requestedFrames, options = {}) {
    const target = (segments || []).find((segment) => segment.id === targetId);
    if (!target) return { changed: false, segments, delta: 0, length: null, maxEnd: 0 };

    const maxLength = getSegmentMaxLength(target);
    const nextLength = Math.max(MIN_SEGMENT_LENGTH, Math.min(Math.round(requestedFrames), maxLength));
    const oldLength = Math.max(MIN_SEGMENT_LENGTH, Math.round(Number(target.length) || MIN_SEGMENT_LENGTH));
    const delta = nextLength - oldLength;
    if (delta === 0) {
      const maxEnd = (segments || []).reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
      return { changed: false, segments, delta, length: nextLength, maxEnd };
    }

    const targetStart = Number(target.start) || 0;
    for (const segment of segments || []) {
      if (segment.id === targetId) {
        segment.length = nextLength;
      } else if ((Number(segment.start) || 0) > targetStart) {
        segment.start = Math.max(0, Math.round((Number(segment.start) || 0) + delta));
      }
    }
    const maxEnd = (segments || []).reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
    return { changed: true, segments, delta, length: nextLength, maxEnd };
  }

  function applySelectedSegmentDuration(editor, value, options = {}) {
    const segment = getSelectedMainSegment(editor);
    if (!segment) return { changed: false, reason: "no_selected_segment" };
    const frames = normalizeDurationToFrames(value, {
      frameRate: options.frameRate ?? getFrameRate(editor),
      units: options.units,
    });
    if (frames === null) return { changed: false, reason: "invalid_duration" };

    const result = applyRippleDuration(editor.timeline.segments, segment.id, frames, options);
    if (!result.changed) return result;
    editor.growTimelineIfNeeded?.(result.maxEnd);
    editor.updateUIFromSelection?.();
    editor.syncWidgetsAndUI?.();
    editor.commitChanges?.();
    editor.render?.();
    return result;
  }

  function formatSegmentDuration(editor, segment) {
    if (!segment) return "";
    const inFrames = editor?.displayModeWidget?.value === "frames";
    if (inFrames) return `${Math.round(Number(segment.length) || 0)}`;
    return ((Number(segment.length) || 0) / getFrameRate(editor)).toFixed(2);
  }

  function syncDurationControl(editor) {
    const input = editor?._twlSegmentDurationInput;
    const unit = editor?._twlSegmentDurationUnit;
    if (!input || !unit) return;
    const segment = getSelectedMainSegment(editor);
    const inFrames = editor.displayModeWidget?.value === "frames";
    unit.textContent = inFrames ? "frames" : "s";
    if (!segment || segment.type === "ghost" || segment.type === "temp" || editor.retakeMode) {
      input.value = "";
      input.disabled = true;
      input.title = editor.retakeMode ? "Segment duration editing is disabled in retake mode" : "Select a main segment to edit duration";
      return;
    }
    input.disabled = false;
    input.title = "Edit selected segment duration";
    input.value = formatSegmentDuration(editor, segment);
  }

  function installSegmentDurationUi(editor) {
    if (!editor || editor._twlSegmentDurationInstalled || typeof document === "undefined") return;
    editor._twlSegmentDurationInstalled = true;

    const row = document.createElement("div");
    row.className = "twl-segment-duration-row";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "4px";
    row.style.fontSize = "11px";
    row.style.color = "#d8d8d8";

    const label = document.createElement("span");
    label.textContent = "Segment Duration:";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.01";
    input.step = "0.01";
    input.style.width = "66px";
    input.style.background = "#111";
    input.style.color = "#eee";
    input.style.border = "1px solid #333";
    input.style.borderRadius = "3px";
    input.style.padding = "2px 4px";
    const unit = document.createElement("span");
    unit.textContent = "s";

    const apply = () => {
      const inFrames = editor.displayModeWidget?.value === "frames";
      const result = applySelectedSegmentDuration(editor, input.value, { units: inFrames ? "frames" : "seconds" });
      if (!result.changed && result.reason === "invalid_duration") {
        syncDurationControl(editor);
      }
    };
    input.addEventListener("change", apply);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") apply();
    });
    input.addEventListener("blur", () => syncDurationControl(editor));

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(unit);
    editor._twlSegmentDurationInput = input;
    editor._twlSegmentDurationUnit = unit;

    const parent = editor.segmentBoundsDisplay?.parentElement || editor.wrapper?.querySelector(".pr-right-group");
    if (parent && editor.segmentBoundsDisplay) {
      parent.insertBefore(row, editor.segmentBoundsDisplay);
    } else if (parent) {
      parent.prepend(row);
    }

    const originalUpdate = editor.updateUIFromSelection?.bind(editor);
    editor.updateUIFromSelection = function () {
      const result = originalUpdate?.apply(editor, arguments);
      syncDurationControl(editor);
      return result;
    };
    syncDurationControl(editor);
  }

  const api = {
    applyRippleDuration,
    applySelectedSegmentDuration,
    formatSegmentDuration,
    getSelectedMainSegment,
    installSegmentDurationUi,
    normalizeDurationToFrames,
    syncDurationControl,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LTXDirectorTwlSegmentDurationUi = api;
    if (typeof globalThis.registerLTXDirectorPlugin === "function") {
      globalThis.registerLTXDirectorPlugin(installSegmentDurationUi);
    } else {
      globalThis.LTXDirectorPlugins = globalThis.LTXDirectorPlugins || [];
      globalThis.LTXDirectorPlugins.push(installSegmentDurationUi);
    }
  }
})();

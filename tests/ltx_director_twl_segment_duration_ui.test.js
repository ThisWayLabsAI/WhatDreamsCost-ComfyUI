const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyRippleDuration,
  applySelectedSegmentDuration,
  normalizeDurationToFrames,
} = require("../js/ltx_director_twl_segment_duration_ui.js");

function makeEditor(segments) {
  return {
    selectionType: "image",
    selectedIndex: 0,
    timeline: { segments },
    getFrameRate: () => 24,
    growTimelineIfNeeded(frame) {
      this.grownTo = frame;
    },
    updateUIFromSelection() {
      this.updated = true;
    },
    syncWidgetsAndUI() {
      this.synced = true;
    },
    commitChanges() {
      this.committed = true;
    },
    render() {
      this.rendered = true;
    },
  };
}

test("normalizeDurationToFrames converts seconds with current frame rate", () => {
  assert.equal(normalizeDurationToFrames(1.5, { frameRate: 10 }), 15);
  assert.equal(normalizeDurationToFrames(12, { units: "frames" }), 12);
  assert.equal(normalizeDurationToFrames("bad", { frameRate: 24 }), null);
});

test("applyRippleDuration increases selected segment and shifts following segments later", () => {
  const segments = [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 15, length: 5, type: "text" },
    { id: "c", start: 30, length: 5, type: "text" },
  ];

  const result = applyRippleDuration(segments, "a", 20);

  assert.equal(result.changed, true);
  assert.equal(result.delta, 10);
  assert.deepEqual(segments, [
    { id: "a", start: 0, length: 20, type: "text" },
    { id: "b", start: 25, length: 5, type: "text" },
    { id: "c", start: 40, length: 5, type: "text" },
  ]);
});

test("applyRippleDuration decreases selected segment and preserves later spacing", () => {
  const segments = [
    { id: "a", start: 0, length: 20, type: "text" },
    { id: "b", start: 30, length: 5, type: "text" },
    { id: "c", start: 50, length: 5, type: "text" },
  ];

  applyRippleDuration(segments, "a", 10);

  assert.deepEqual(segments, [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 20, length: 5, type: "text" },
    { id: "c", start: 40, length: 5, type: "text" },
  ]);
});

test("applyRippleDuration clamps video length to available frames", () => {
  const segments = [
    { id: "video", start: 0, length: 10, type: "video", videoDurationFrames: 30, trimStart: 5 },
    { id: "next", start: 20, length: 5, type: "text" },
  ];

  const result = applyRippleDuration(segments, "video", 100);

  assert.equal(result.length, 25);
  assert.deepEqual(segments, [
    { id: "video", start: 0, length: 25, type: "video", videoDurationFrames: 30, trimStart: 5 },
    { id: "next", start: 35, length: 5, type: "text" },
  ]);
});

test("applySelectedSegmentDuration syncs editor after ripple", () => {
  const editor = makeEditor([
    { id: "a", start: 0, length: 24, type: "text" },
    { id: "b", start: 24, length: 24, type: "text" },
  ]);

  const result = applySelectedSegmentDuration(editor, 2, { units: "seconds" });

  assert.equal(result.changed, true);
  assert.equal(editor.timeline.segments[0].length, 48);
  assert.equal(editor.timeline.segments[1].start, 48);
  assert.equal(editor.grownTo, 72);
  assert.equal(editor.updated, true);
  assert.equal(editor.synced, true);
  assert.equal(editor.committed, true);
  assert.equal(editor.rendered, true);
});

test("applySelectedSegmentDuration rejects invalid input without mutation", () => {
  const editor = makeEditor([{ id: "a", start: 0, length: 24, type: "text" }]);

  const result = applySelectedSegmentDuration(editor, "bad", { units: "seconds" });

  assert.deepEqual(result, { changed: false, reason: "invalid_duration" });
  assert.equal(editor.timeline.segments[0].length, 24);
  assert.equal(editor.committed, undefined);
});

test("applySelectedSegmentDuration ignores non-main selections", () => {
  const editor = makeEditor([{ id: "a", start: 0, length: 24, type: "text" }]);
  editor.selectionType = "audio";

  const result = applySelectedSegmentDuration(editor, 2, { units: "seconds" });

  assert.deepEqual(result, { changed: false, reason: "no_selected_segment" });
  assert.equal(editor.timeline.segments[0].length, 24);
});

test("applySelectedSegmentDuration ignores ghost and temp pseudo-segments", () => {
  for (const type of ["ghost", "temp"]) {
    const editor = makeEditor([{ id: type, start: 0, length: 24, type }]);

    const result = applySelectedSegmentDuration(editor, 2, { units: "seconds" });

    assert.deepEqual(result, { changed: false, reason: "no_selected_segment" });
    assert.equal(editor.timeline.segments[0].length, 24);
    assert.equal(editor.committed, undefined);
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.LTXDirectorShotList = require("../js/ltx_director_twl_shot_script.js");

const {
  applyShotListImport,
  applyVideoMetadata,
  applyShotListTextWithConfirmation,
  buildApplyConfirmation,
  buildShotListImport,
  createSegmentsFromShots,
  exportEditorShotList,
  isTextareaDirty,
  saveTextFile,
} = require("../js/ltx_director_twl_shot_list_ui.js");

function makeEditor(overrides = {}) {
  const editor = {
    timeline: {
      segments: [],
      audioSegments: [{ id: "audio_1", start: 0, length: 10 }],
      motionSegments: [{ id: "motion_1", start: 0, length: 10 }],
      global_prompt: "",
      retake_global_prompt: "retake prompt",
    },
    node: {
      properties: { global_prompt: "" },
      widgets: [{ name: "global_prompt", value: "" }],
    },
    globalPromptInput: { value: "" },
    getFrameRate: () => 24,
    getGlobalPrompt() {
      return this.globalPromptInput.value || "";
    },
    syncGlobalPrompt(value) {
      this.timeline.global_prompt = value;
      this.node.properties.global_prompt = value;
      this.globalPromptInput.value = value;
      this.node.widgets[0].value = value;
    },
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
    ...overrides,
  };
  return editor;
}

test("createSegmentsFromShots creates contiguous text segments", () => {
  const segments = createSegmentsFromShots([
    { duration: 1.5, prompt: "First" },
    { duration: 2, prompt: "Second" },
  ], {
    frameRate: 10,
    startFrame: 5,
    idFactory: (() => {
      let id = 0;
      return () => `seg_${++id}`;
    })(),
  });

  assert.deepEqual(segments, [
    { id: "seg_1", start: 5, length: 15, prompt: "First", type: "text" },
    { id: "seg_2", start: 20, length: 20, prompt: "Second", type: "text" },
  ]);
});

test("exportEditorShotList orders main segments by start", () => {
  const editor = makeEditor();
  editor.globalPromptInput.value = "Global context.";
  editor.timeline.segments = [
    { id: "b", start: 24, length: 48, prompt: "Second", type: "text" },
    { id: "a", start: 0, length: 24, prompt: "First", type: "text" },
  ];

  const exported = exportEditorShotList(editor);

  assert.match(exported, /^GLOBAL: Global context\./);
  assert.match(exported, /SHOT 1 \| 1s\nFirst/);
  assert.match(exported, /SHOT 2 \| 2s\nSecond/);
});

test("exportEditorShotList includes custom width and height widgets", () => {
  const editor = makeEditor({
    node: {
      properties: { global_prompt: "" },
      widgets: [
        { name: "custom_width", value: 1280 },
        { name: "custom_height", value: 720 },
      ],
    },
  });
  editor.timeline.segments = [{ id: "a", start: 0, length: 24, prompt: "First", type: "text" }];

  const exported = exportEditorShotList(editor);

  assert.match(exported, /VIDEO:\nwidth: 1280\nheight: 720\ntotal_duration: 1/);
});

test("buildShotListImport appends after the last main segment", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "existing", start: 12, length: 12, prompt: "Existing", type: "text" },
  ];

  const built = buildShotListImport(editor, "SHOT 1 | 1s\nNew", {
    mode: "append",
    idFactory: () => "new_seg",
  });

  assert.deepEqual(built.segments, [
    { id: "existing", start: 12, length: 12, prompt: "Existing", type: "text" },
    { id: "new_seg", start: 24, length: 24, prompt: "New", type: "text" },
  ]);
});

test("applyShotListImport replaces main segments and preserves non-main state", () => {
  const editor = makeEditor();
  const audioSegments = editor.timeline.audioSegments;
  const motionSegments = editor.timeline.motionSegments;
  editor.timeline.segments = [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }];

  applyShotListImport(editor, "GLOBAL: New global\n\nSHOT 1 | 2s\nNew prompt", {
    mode: "replace",
    idFactory: () => "new_seg",
  });

  assert.deepEqual(editor.timeline.segments, [
    { id: "new_seg", start: 0, length: 48, prompt: "New prompt", type: "text" },
  ]);
  assert.equal(editor.timeline.audioSegments, audioSegments);
  assert.equal(editor.timeline.motionSegments, motionSegments);
  assert.equal(editor.globalPromptInput.value, "New global");
  assert.equal(editor.node.properties.global_prompt, "New global");
  assert.equal(editor.committed, true);
  assert.equal(editor.rendered, true);
});

test("applyShotListImport applies VIDEO width and height to custom widgets", () => {
  const widgetUpdates = [];
  const editor = makeEditor({
    node: {
      properties: { global_prompt: "", custom_width: 0, custom_height: 0 },
      widgets: [
        { name: "global_prompt", value: "" },
        { name: "custom_width", value: 0, callback: (value) => widgetUpdates.push(["custom_width", value]) },
        { name: "custom_height", value: 0, callback: (value) => widgetUpdates.push(["custom_height", value]) },
      ],
    },
  });

  applyShotListImport(editor, `VIDEO:
width: 1280
height: 720

SHOT 1 | 1s
Prompt`, {
    mode: "replace",
    idFactory: () => "new_seg",
  });

  assert.equal(editor.node.properties.custom_width, 1280);
  assert.equal(editor.node.properties.custom_height, 720);
  assert.equal(editor.node.widgets.find((widget) => widget.name === "custom_width").value, 1280);
  assert.equal(editor.node.widgets.find((widget) => widget.name === "custom_height").value, 720);
  assert.deepEqual(widgetUpdates, [["custom_width", 1280], ["custom_height", 720]]);
});

test("applyShotListImport applies zero VIDEO width and height", () => {
  const editor = makeEditor({
    node: {
      properties: { global_prompt: "", custom_width: 1280, custom_height: 720 },
      widgets: [
        { name: "global_prompt", value: "" },
        { name: "custom_width", value: 1280 },
        { name: "custom_height", value: 720 },
      ],
    },
  });

  applyShotListImport(editor, `VIDEO:
width: 0
height: 0

SHOT 1 | 1s
Prompt`, {
    mode: "replace",
    idFactory: () => "new_seg",
  });

  assert.equal(editor.node.properties.custom_width, 0);
  assert.equal(editor.node.properties.custom_height, 0);
  assert.equal(editor.node.widgets.find((widget) => widget.name === "custom_width").value, 0);
  assert.equal(editor.node.widgets.find((widget) => widget.name === "custom_height").value, 0);
});

test("applyVideoMetadata ignores absent VIDEO width and height", () => {
  const editor = makeEditor({
    node: {
      properties: { global_prompt: "", custom_width: 1280, custom_height: 720 },
      widgets: [
        { name: "global_prompt", value: "" },
        { name: "custom_width", value: 1280 },
        { name: "custom_height", value: 720 },
      ],
    },
  });

  assert.equal(applyVideoMetadata(editor, { width: undefined, height: undefined }), false);
  assert.equal(editor.node.properties.custom_width, 1280);
  assert.equal(editor.node.properties.custom_height, 720);
});

test("applyShotListImport without GLOBAL leaves existing global prompt unchanged", () => {
  const editor = makeEditor();
  editor.globalPromptInput.value = "Keep this global prompt";
  editor.timeline.global_prompt = "Keep this global prompt";
  editor.node.properties.global_prompt = "Keep this global prompt";

  applyShotListImport(editor, "SHOT 1 | 1s\nOnly segment prompt", {
    mode: "replace",
    idFactory: () => "new_seg",
  });

  assert.equal(editor.globalPromptInput.value, "Keep this global prompt");
  assert.equal(editor.timeline.global_prompt, "Keep this global prompt");
  assert.equal(editor.node.properties.global_prompt, "Keep this global prompt");
});

test("GLOBAL text inside a shot prompt does not clear existing global prompt", () => {
  const editor = makeEditor();
  editor.globalPromptInput.value = "Keep this global prompt";
  editor.timeline.global_prompt = "Keep this global prompt";
  editor.node.properties.global_prompt = "Keep this global prompt";

  applyShotListImport(editor, "SHOT 1 | 1s\nPrompt line\nGLOBAL: this is part of the shot", {
    mode: "replace",
    idFactory: () => "new_seg",
  });

  assert.equal(editor.globalPromptInput.value, "Keep this global prompt");
  assert.equal(editor.timeline.global_prompt, "Keep this global prompt");
  assert.equal(editor.node.properties.global_prompt, "Keep this global prompt");
  assert.equal(editor.timeline.segments[0].prompt, "Prompt line\nGLOBAL: this is part of the shot");
});

test("invalid Shot List input does not mutate timeline", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }];

  assert.throws(() => applyShotListImport(editor, "SHOT 1 | nope\nBroken"), /Invalid shot declaration/);
  assert.deepEqual(editor.timeline.segments, [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }]);
  assert.equal(editor.committed, undefined);
});

test("buildApplyConfirmation combines replace risk and parser warnings", () => {
  const confirmation = buildApplyConfirmation({
    mode: "replace",
    existingCount: 2,
    warnings: ["VIDEO total_duration does not match total SHOT duration."],
  });

  assert.equal(confirmation.title, "Apply Shot List?");
  assert.match(confirmation.message, /Replace current main segments/);
  assert.match(confirmation.message, /Warnings:/);
  assert.match(confirmation.message, /VIDEO total_duration/);
  assert.equal(confirmation.confirmLabel, "Apply Shot List");
});

test("buildApplyConfirmation skips destructive prompt for empty replace without warnings", () => {
  assert.equal(buildApplyConfirmation({ mode: "replace", existingCount: 0, warnings: [] }), null);
});

test("buildApplyConfirmation prompts for append warnings", () => {
  const confirmation = buildApplyConfirmation({
    mode: "append",
    existingCount: 2,
    warnings: ["Warning text"],
  });

  assert.equal(confirmation.title, "Apply Shot List with warnings?");
  assert.doesNotMatch(confirmation.message, /Replace current main segments/);
  assert.match(confirmation.message, /Warning text/);
});

test("isTextareaDirty detects text that would be overwritten", () => {
  assert.equal(isTextareaDirty({ value: "edited" }, "clean"), true);
  assert.equal(isTextareaDirty({ value: "clean" }, "clean"), false);
});

test("applyShotListTextWithConfirmation applies after confirm", async () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }];

  const result = await applyShotListTextWithConfirmation(editor, "SHOT 1 | 1s\nNew", {
    mode: "replace",
    confirmFn: async () => true,
  });

  assert.equal(result.applied, true);
  assert.deepEqual(editor.timeline.segments, [
    { id: editor.timeline.segments[0].id, start: 0, length: 24, prompt: "New", type: "text" },
  ]);
  assert.equal(editor.committed, true);
});

test("applyShotListTextWithConfirmation cancel preserves timeline", async () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }];

  const result = await applyShotListTextWithConfirmation(editor, "SHOT 1 | 1s\nNew", {
    mode: "replace",
    confirmFn: async () => false,
  });

  assert.equal(result.applied, false);
  assert.equal(result.cancelled, true);
  assert.deepEqual(editor.timeline.segments, [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }]);
  assert.equal(editor.committed, undefined);
});

test("applyShotListTextWithConfirmation skips mutation when apply guard is stale", async () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }];

  const result = await applyShotListTextWithConfirmation(editor, "SHOT 1 | 1s\nNew", {
    mode: "replace",
    confirmFn: async () => true,
    shouldApply: () => false,
  });

  assert.equal(result.applied, false);
  assert.deepEqual(editor.timeline.segments, [{ id: "old", start: 0, length: 24, prompt: "Old", type: "text" }]);
  assert.equal(editor.committed, undefined);
});

test("applyShotListTextWithConfirmation invalid input does not ask for confirmation", async () => {
  const editor = makeEditor();
  let confirmed = false;

  await assert.rejects(
    applyShotListTextWithConfirmation(editor, "SHOT 1 | nope\nBroken", {
      mode: "replace",
      confirmFn: async () => {
        confirmed = true;
        return true;
      },
    }),
    /Invalid shot declaration/
  );
  assert.equal(confirmed, false);
});

test("saveTextFile reports unavailable browser download APIs", () => {
  assert.equal(saveTextFile("SHOT 1 | 1s\nPrompt"), false);
});

test("browser global API does not expose modal implementation helpers", () => {
  assert.equal(globalThis.LTXDirectorTwlShotListUi.openConfirmModal, undefined);
  assert.equal(globalThis.LTXDirectorTwlShotListUi.saveTextFile, undefined);
  assert.equal(typeof globalThis.LTXDirectorTwlShotListUi.applyShotListImport, "function");
});

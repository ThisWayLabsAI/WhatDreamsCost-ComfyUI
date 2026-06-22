const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addSegmentAdjacent,
  applyConfirmedAction,
  applyRippleDelete,
  applyRippleDeleteGaps,
  applyResetAll,
  applyResetTimeline,
  applyTrimToLastClip,
  convertSegmentToImage,
  convertSegmentToText,
  convertSegmentToVideo,
  buildActionConfirmation,
  installTimelineActionsUi,
  promptConvertToText,
  promptConvertToVideo,
  uploadImageForSegment,
  uploadVideoForSegment,
} = require("../js/ltx_director_twl_timeline_actions_ui.js");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.title = "";
    this.disabled = false;
    this.listeners = {};
    this.style = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, before) {
    child.parentElement = this;
    const index = this.children.indexOf(before);
    if (index === -1) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  addEventListener(type, listener) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(listener);
  }

  click() {
    for (const listener of this.listeners.click || []) listener({ target: this });
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    return findElement(this, (element) => String(element.className || "").split(/\s+/).includes(className));
  }

  querySelectorAll(selector) {
    if (!selector.startsWith(".")) return [];
    const className = selector.slice(1);
    const matches = [];
    walkElements(this, (element) => {
      if (String(element.className || "").split(/\s+/).includes(className)) matches.push(element);
    });
    return matches;
  }
}

function walkElements(root, visit) {
  for (const child of root.children || []) {
    visit(child);
    walkElements(child, visit);
  }
}

function findElement(root, predicate) {
  let found = null;
  walkElements(root, (element) => {
    if (!found && predicate(element)) found = element;
  });
  return found;
}

function createFakeDocument() {
  return {
    body: new FakeElement("body"),
    createElement: (tagName) => new FakeElement(tagName),
    querySelectorAll(selector) {
      return this.body.querySelectorAll(selector);
    },
  };
}

function getButtonByText(root, text) {
  return findElement(root, (element) => element.tagName === "button" && (element.textContent || element.innerHTML) === text);
}

function makeEditor(overrides = {}) {
  return {
    selectionType: "image",
    selectedIndex: 0,
    currentFrame: 12,
    markedSelection: { start: 0, end: 24 },
    selectedSegmentIds: [],
    timeline: {
      segments: [],
      audioSegments: [],
      motionSegments: [],
      global_prompt: "keep global",
      retake_global_prompt: "keep retake",
      mainTrackEnabled: true,
      audioTrackEnabled: true,
      motionTrackEnabled: true,
      propHeight: 90,
      globalPropHeight: 60,
      showFilenames: true,
      overrideAudio: false,
      inpaint_audio: true,
      retakeMode: false,
      retakeStart: 24,
      retakeLength: 48,
      retakePrompt: "retake prompt",
      retakeStrength: 1,
      retakeVideo: { id: "retake" },
      normalStartFrame: 0,
      normalDurationFrames: 120,
    },
    node: {
      properties: {
        global_prompt: "keep global",
        custom_width: 1280,
        custom_height: 720,
        mainTrackEnabled: true,
        audioTrackEnabled: true,
        motionTrackEnabled: true,
        showFilenames: true,
        overrideAudio: false,
        inpaint_audio: true,
        retakeMode: false,
      },
      widgets: [
        { name: "duration_frames", value: 120, callback: (value) => { overrides.durationCallbackValue = value; } },
        { name: "duration_seconds", value: 5, callback: (value) => { overrides.secondsCallbackValue = value; } },
        { name: "start_frame", value: 0 },
        { name: "end_frame", value: 120 },
        { name: "override_audio", value: false, callback: (value) => { overrides.overrideAudioCallbackValue = value; } },
        { name: "inpaint_audio", value: true, callback: (value) => { overrides.inpaintAudioCallbackValue = value; } },
      ],
    },
    mainTrackEnabled: true,
    audioTrackEnabled: true,
    motionTrackEnabled: true,
    propHeight: 90,
    globalPropHeight: 60,
    retakeMode: false,
    getFrameRate: () => 24,
    getDurationFrames() {
      return this.node.widgets.find((widget) => widget.name === "duration_frames")?.value || 120;
    },
    growTimelineIfNeeded(frame) {
      this.grownTo = frame;
    },
    updateUIFromSelection() {
      this.updated = (this.updated || 0) + 1;
    },
    syncWidgetsAndUI() {
      this.synced = (this.synced || 0) + 1;
    },
    commitChanges() {
      this.committed = (this.committed || 0) + 1;
    },
    render() {
      this.rendered = (this.rendered || 0) + 1;
    },
    ...overrides,
  };
}

test("applyRippleDelete removes selected main segment and shifts later main segments", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 20, length: 5, type: "text" },
    { id: "c", start: 30, length: 5, type: "text" },
  ];

  const result = applyRippleDelete(editor);

  assert.equal(result.changed, true);
  assert.deepEqual(editor.timeline.segments, [
    { id: "b", start: 10, length: 5, type: "text" },
    { id: "c", start: 20, length: 5, type: "text" },
  ]);
  assert.equal(editor.committed, 1);
  assert.equal(editor.rendered, 1);
});

test("applyRippleDelete removes linked video audio sibling without shifting independent tracks", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "clip_v", start: 0, length: 12, type: "video" },
    { id: "next", start: 24, length: 6, type: "text" },
  ];
  editor.timeline.audioSegments = [
    { id: "clip_a", start: 0, length: 12, type: "audio" },
    { id: "music", start: 24, length: 6, type: "audio" },
  ];
  editor.timeline.motionSegments = [{ id: "motion", start: 24, length: 6, type: "motion_video" }];

  applyRippleDelete(editor);

  assert.deepEqual(editor.timeline.segments, [{ id: "next", start: 12, length: 6, type: "text" }]);
  assert.deepEqual(editor.timeline.audioSegments, [{ id: "music", start: 24, length: 6, type: "audio" }]);
  assert.deepEqual(editor.timeline.motionSegments, [{ id: "motion", start: 24, length: 6, type: "motion_video" }]);
});

test("applyRippleDelete removes multi-selected main segments and ripples once per removed segment", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 10, length: 5, type: "text" },
    { id: "c", start: 20, length: 10, type: "text" },
    { id: "d", start: 35, length: 5, type: "text" },
  ];
  editor.selectedIndex = -1;
  editor.selectedSegmentIds = ["a", "c"];

  const result = applyRippleDelete(editor);

  assert.equal(result.changed, true);
  assert.deepEqual(editor.timeline.segments, [
    { id: "b", start: 0, length: 5, type: "text" },
    { id: "d", start: 15, length: 5, type: "text" },
  ]);
  assert.deepEqual(editor.selectedSegmentIds, []);
});

test("applyRippleDelete ignores invalid selection without syncing", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];
  editor.selectedIndex = -1;

  const result = applyRippleDelete(editor);

  assert.deepEqual(result, { changed: false, reason: "no_selected_segment" });
  assert.deepEqual(editor.timeline.segments, [{ id: "a", start: 0, length: 10, type: "text" }]);
  assert.equal(editor.committed, undefined);
});

test("applyRippleDeleteGaps compacts main segments from frame zero", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "a", start: 10, length: 10, type: "text" },
    { id: "b", start: 30, length: 5, type: "text" },
    { id: "c", start: 50, length: 5, type: "text" },
  ];
  editor.timeline.audioSegments = [{ id: "music", start: 30, length: 5, type: "audio" }];

  applyRippleDeleteGaps(editor);

  assert.deepEqual(editor.timeline.segments, [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 10, length: 5, type: "text" },
    { id: "c", start: 15, length: 5, type: "text" },
  ]);
  assert.deepEqual(editor.timeline.audioSegments, [{ id: "music", start: 30, length: 5, type: "audio" }]);
});

test("applyTrimToLastClip updates duration widgets to latest segment end", () => {
  const callbackValues = {};
  const editor = makeEditor(callbackValues);
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];
  editor.timeline.audioSegments = [{ id: "audio", start: 20, length: 15, type: "audio" }];
  editor.timeline.motionSegments = [{ id: "motion", start: 12, length: 6, type: "motion_video" }];

  const result = applyTrimToLastClip(editor);

  assert.equal(result.changed, true);
  assert.equal(editor.node.widgets.find((widget) => widget.name === "duration_frames").value, 35);
  assert.equal(editor.node.widgets.find((widget) => widget.name === "end_frame").value, 35);
  assert.equal(callbackValues.durationCallbackValue, 35);
  assert.equal(callbackValues.secondsCallbackValue, 1.458);
});

test("applyTrimToLastClip no-ops for empty timeline", () => {
  const editor = makeEditor();

  const result = applyTrimToLastClip(editor);

  assert.deepEqual(result, { changed: false, reason: "empty_timeline" });
  assert.equal(editor.node.widgets.find((widget) => widget.name === "duration_frames").value, 120);
  assert.equal(editor.committed, undefined);
});

test("applyResetTimeline clears segment arrays and selection while preserving prompt settings", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];
  editor.timeline.audioSegments = [{ id: "audio", start: 0, length: 10, type: "audio" }];
  editor.timeline.motionSegments = [{ id: "motion", start: 0, length: 10, type: "motion_video" }];

  applyResetTimeline(editor);

  assert.deepEqual(editor.timeline.segments, []);
  assert.deepEqual(editor.timeline.audioSegments, []);
  assert.deepEqual(editor.timeline.motionSegments, []);
  assert.equal(editor.timeline.global_prompt, "keep global");
  assert.equal(editor.node.properties.custom_width, 1280);
  assert.equal(editor.selectedIndex, -1);
  assert.equal(editor.currentFrame, 0);
});

test("applyResetAll restores default timeline state without deleting uploaded files", () => {
  const callbackValues = {};
  const editor = makeEditor(callbackValues);
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "image", imageFile: "keep-on-disk.png" }];
  editor.timeline.global_prompt = "clear me";
  editor.timeline.mainTrackEnabled = false;
  editor.timeline.audioTrackEnabled = false;
  editor.timeline.motionTrackEnabled = false;
  editor.timeline.showFilenames = false;
  editor.timeline.overrideAudio = true;
  editor.timeline.inpaint_audio = false;
  editor.timeline.retakeMode = true;
  editor.mainTrackEnabled = false;
  editor.audioTrackEnabled = false;
  editor.motionTrackEnabled = false;
  editor.propHeight = 180;
  editor.globalPropHeight = 120;
  editor.retakeMode = true;
  editor.node.properties.global_prompt = "clear me";
  editor.node.properties.mainTrackEnabled = false;
  editor.node.properties.audioTrackEnabled = false;
  editor.node.properties.motionTrackEnabled = false;
  editor.node.properties.showFilenames = false;
  editor.node.properties.overrideAudio = true;
  editor.node.properties.inpaint_audio = false;
  editor.node.properties.retakeMode = true;
  editor.globalPromptInput = { value: "clear me" };
  editor.propContainer = { style: { height: "180px" } };
  editor.globalPropContainer = { style: { height: "120px" } };
  editor.updateRetakeUIState = () => { editor.retakeUiUpdated = true; };

  applyResetAll(editor);

  assert.deepEqual(editor.timeline.segments, []);
  assert.equal(editor.timeline.global_prompt, "");
  assert.equal(editor.timeline.mainTrackEnabled, true);
  assert.equal(editor.timeline.audioTrackEnabled, true);
  assert.equal(editor.timeline.motionTrackEnabled, true);
  assert.equal(editor.timeline.showFilenames, true);
  assert.equal(editor.timeline.overrideAudio, false);
  assert.equal(editor.timeline.inpaint_audio, true);
  assert.equal(editor.timeline.retakeMode, false);
  assert.equal(editor.mainTrackEnabled, true);
  assert.equal(editor.audioTrackEnabled, true);
  assert.equal(editor.motionTrackEnabled, true);
  assert.equal(editor.propHeight, 90);
  assert.equal(editor.globalPropHeight, 60);
  assert.equal(editor.propContainer.style.height, "90px");
  assert.equal(editor.globalPropContainer.style.height, "60px");
  assert.equal(editor.retakeMode, false);
  assert.equal(editor.timeline.normalDurationFrames, 120);
  assert.equal(editor.node.properties.global_prompt, "");
  assert.equal(editor.node.properties.mainTrackEnabled, true);
  assert.equal(editor.node.properties.audioTrackEnabled, true);
  assert.equal(editor.node.properties.motionTrackEnabled, true);
  assert.equal(editor.node.properties.showFilenames, true);
  assert.equal(editor.node.properties.overrideAudio, false);
  assert.equal(editor.node.properties.inpaint_audio, true);
  assert.equal(editor.node.properties.retakeMode, false);
  assert.equal(editor.globalPromptInput.value, "");
  assert.equal(callbackValues.overrideAudioCallbackValue, false);
  assert.equal(callbackValues.inpaintAudioCallbackValue, true);
  assert.equal(editor.retakeUiUpdated, true);
  assert.equal(editor.deletedFiles, undefined);
});

test("addSegmentAdjacent inserts one-second text segment before and shifts selected segment", () => {
  const editor = makeEditor({ getFrameRate: () => 10 });
  editor.timeline.segments = [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 20, length: 5, type: "text" },
  ];
  editor.selectedIndex = 1;

  const result = addSegmentAdjacent(editor, "before", { idFactory: () => "new" });

  assert.equal(result.changed, true);
  assert.deepEqual(editor.timeline.segments, [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "new", start: 20, length: 10, prompt: "", type: "text" },
    { id: "b", start: 30, length: 5, type: "text" },
  ]);
  assert.equal(editor.selectedIndex, 1);
});

test("addSegmentAdjacent inserts one-second text segment after and shifts later segments", () => {
  const editor = makeEditor({ getFrameRate: () => 10 });
  editor.timeline.segments = [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "b", start: 20, length: 5, type: "text" },
  ];

  addSegmentAdjacent(editor, "after", { idFactory: () => "new" });

  assert.deepEqual(editor.timeline.segments, [
    { id: "a", start: 0, length: 10, type: "text" },
    { id: "new", start: 10, length: 10, prompt: "", type: "text" },
    { id: "b", start: 30, length: 5, type: "text" },
  ]);
  assert.equal(editor.selectedIndex, 1);
});

test("buildActionConfirmation describes destructive timeline actions", () => {
  const resetTimeline = buildActionConfirmation("resetTimeline");
  assert.equal(resetTimeline.title, "Reset Timeline?");
  assert.match(resetTimeline.message, /clear timeline segments/i);
  assert.equal(resetTimeline.confirmLabel, "Reset Timeline");

  const resetAll = buildActionConfirmation("resetAll");
  assert.equal(resetAll.title, "Reset All?");
  assert.match(resetAll.message, /uploaded files/i);

  const convertToText = buildActionConfirmation("convertToText");
  assert.equal(convertToText.title, "Convert to Text?");
  assert.match(convertToText.message, /removes visual media/i);
});

test("applyConfirmedAction applies after confirmation", async () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];

  const result = await applyConfirmedAction(editor, "resetTimeline", applyResetTimeline, {
    confirmFn: async () => true,
  });

  assert.equal(result.applied, true);
  assert.deepEqual(editor.timeline.segments, []);
});

test("applyConfirmedAction cancel preserves state", async () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];

  const result = await applyConfirmedAction(editor, "resetTimeline", applyResetTimeline, {
    confirmFn: async () => false,
  });

  assert.equal(result.applied, false);
  assert.equal(result.cancelled, true);
  assert.deepEqual(editor.timeline.segments, [{ id: "a", start: 0, length: 10, type: "text" }]);
  assert.equal(editor.committed, undefined);
});

test("applyConfirmedAction stale guard preserves state", async () => {
  const editor = makeEditor();
  editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];

  const result = await applyConfirmedAction(editor, "resetTimeline", applyResetTimeline, {
    confirmFn: async () => true,
    shouldApply: () => false,
  });

  assert.equal(result.applied, false);
  assert.deepEqual(editor.timeline.segments, [{ id: "a", start: 0, length: 10, type: "text" }]);
  assert.equal(editor.committed, undefined);
});

test("installTimelineActionsUi injects one Timeline Actions container", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const wrapper = document.createElement("div");
    const controlsGroup = document.createElement("div");
    controlsGroup.className = "pr-controls-group";
    const playerControls = document.createElement("div");
    playerControls.className = "pr-player-controls";
    controlsGroup.appendChild(playerControls);
    wrapper.appendChild(controlsGroup);
    const editor = makeEditor({ wrapper });

    installTimelineActionsUi(editor);
    installTimelineActionsUi(editor);

    assert.equal(wrapper.querySelectorAll(".twl-timeline-actions-group").length, 1);
    assert.ok(getButtonByText(wrapper, "Ripple Delete"));
    assert.ok(getButtonByText(wrapper, "Ripple Delete Gaps"));
    assert.ok(getButtonByText(wrapper, "Trim to Last Clip"));
    assert.ok(getButtonByText(wrapper, "Reset Timeline"));
    assert.ok(getButtonByText(wrapper, "Reset All"));
  } finally {
    global.document = previousDocument;
  }
});

test("Timeline Actions buttons invoke helpers without moving upstream Delete", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const wrapper = document.createElement("div");
    const upstreamDelete = document.createElement("button");
    upstreamDelete.textContent = "Delete";
    wrapper.appendChild(upstreamDelete);
    const editor = makeEditor({ wrapper });
    editor.timeline.segments = [
      { id: "a", start: 10, length: 10, type: "text" },
      { id: "b", start: 30, length: 5, type: "text" },
    ];

    installTimelineActionsUi(editor);
    getButtonByText(wrapper, "Ripple Delete Gaps").click();

    assert.deepEqual(editor.timeline.segments.map((segment) => segment.start), [0, 10]);
    assert.equal(getButtonByText(wrapper, "Delete"), upstreamDelete);
  } finally {
    global.document = previousDocument;
  }
});

test("right-click extension appends TWL actions and preserves upstream Delete", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const wrapper = document.createElement("div");
    const editor = makeEditor({ wrapper });
    editor.timeline.segments = [{ id: "a", start: 0, length: 10, type: "text" }];
    editor.showContextMenu = function () {
      const menu = document.createElement("div");
      menu.className = "pr-gap-menu";
      const del = document.createElement("button");
      del.className = "pr-gap-menu-btn";
      del.innerHTML = "Delete";
      menu.appendChild(del);
      document.body.appendChild(menu);
      this._contextMenu = menu;
    };

    installTimelineActionsUi(editor);
    installTimelineActionsUi(editor);
    editor.showContextMenu(0, 0, editor.timeline.segments[0], "text");

    assert.equal(editor._contextMenu.children.filter((child) => (child.textContent || child.innerHTML) === "Delete").length, 1);
    assert.equal(editor._contextMenu.children[0].className, "twl-timeline-context-actions");
    assert.equal(editor._contextMenu.children[0].style.gap, "4px");
    assert.equal(editor._contextMenu.children[1].className, "pr-settings-divider");
    assert.ok(getButtonByText(editor._contextMenu, "Ripple Delete"));
    assert.ok(getButtonByText(editor._contextMenu, "Add Segment Before"));
    assert.ok(getButtonByText(editor._contextMenu, "Add Segment After"));
    assert.ok(getButtonByText(editor._contextMenu, "Convert to Image"));
    assert.ok(getButtonByText(editor._contextMenu, "Convert to Video"));
  } finally {
    global.document = previousDocument;
  }
});

test("right-click Ripple Delete targets the context segment instead of stale multi-selection", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const editor = makeEditor({ wrapper: document.createElement("div") });
    editor.timeline.segments = [
      { id: "a", start: 0, length: 10, type: "text" },
      { id: "b", start: 10, length: 5, type: "text" },
      { id: "c", start: 20, length: 5, type: "text" },
    ];
    editor.selectedIndex = -1;
    editor.selectedSegmentIds = ["a", "c"];
    editor.showContextMenu = function () {
      const menu = document.createElement("div");
      menu.className = "pr-gap-menu";
      document.body.appendChild(menu);
      this._contextMenu = menu;
    };

    installTimelineActionsUi(editor);
    editor.showContextMenu(0, 0, editor.timeline.segments[1], "text");
    getButtonByText(editor._contextMenu, "Ripple Delete").click();

    assert.deepEqual(editor.timeline.segments, [
      { id: "a", start: 0, length: 10, type: "text" },
      { id: "c", start: 15, length: 5, type: "text" },
    ]);
  } finally {
    global.document = previousDocument;
  }
});

test("right-click extension omits main-segment actions for audio segments", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const editor = makeEditor({ wrapper: document.createElement("div") });
    editor.showContextMenu = function () {
      const menu = document.createElement("div");
      menu.className = "pr-gap-menu";
      document.body.appendChild(menu);
      this._contextMenu = menu;
    };

    installTimelineActionsUi(editor);
    editor.showContextMenu(0, 0, { id: "audio", start: 0, length: 10, type: "audio" }, "audio");

    assert.equal(getButtonByText(editor._contextMenu, "Ripple Delete"), null);
    assert.equal(getButtonByText(editor._contextMenu, "Convert to Text"), null);
  } finally {
    global.document = previousDocument;
  }
});

test("convertSegmentToText preserves prompt, timing, audio, and motion while removing media", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{
    id: "clip_v",
    type: "video",
    start: 12,
    length: 24,
    prompt: "Keep prompt",
    imageFile: "video.mp4",
    imageB64: "thumb",
    imgObj: { image: true },
    videoEl: { video: true },
    videoDurationFrames: 100,
    thumbnails: ["a"],
    _blobUrl: "blob:video",
    _uploading: true,
  }];
  editor.timeline.audioSegments = [{ id: "clip_a", start: 12, length: 24, type: "audio" }];
  editor.timeline.motionSegments = [{ id: "motion", start: 12, length: 24, type: "motion_video" }];

  const result = convertSegmentToText(editor, editor.timeline.segments[0]);

  assert.equal(result.changed, true);
  assert.deepEqual(editor.timeline.segments[0], {
    id: editor.timeline.segments[0].id,
    type: "text",
    start: 12,
    length: 24,
    prompt: "Keep prompt",
  });
  assert.doesNotMatch(editor.timeline.segments[0].id, /_v$/);
  assert.deepEqual(editor.timeline.audioSegments, [{ id: "clip_a", start: 12, length: 24, type: "audio" }]);
  assert.deepEqual(editor.timeline.motionSegments, [{ id: "motion", start: 12, length: 24, type: "motion_video" }]);
  assert.equal(editor.committed, 1);
});

test("convertSegmentToText can remove directly linked video audio sibling", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{
    id: "clip_v",
    type: "video",
    start: 12,
    length: 24,
    prompt: "Keep prompt",
    imageFile: "video.mp4",
  }];
  editor.timeline.audioSegments = [
    { id: "clip_a", start: 12, length: 24, type: "audio" },
    { id: "music", start: 0, length: 50, type: "audio" },
  ];

  const result = convertSegmentToText(editor, editor.timeline.segments[0], { removeLinkedAudio: true });

  assert.equal(result.changed, true);
  assert.equal(editor.timeline.segments[0].type, "text");
  assert.deepEqual(editor.timeline.audioSegments, [{ id: "music", start: 0, length: 50, type: "audio" }]);
});

test("promptConvertToText asks whether to keep or remove linked video audio", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const editor = makeEditor();
    editor.timeline.segments = [{ id: "clip_v", type: "video", start: 12, length: 24, prompt: "Keep prompt" }];
    editor.timeline.audioSegments = [{ id: "clip_a", start: 12, length: 24, type: "audio" }];

    const modal = promptConvertToText(editor, editor.timeline.segments[0], { confirmFn: async () => true });

    assert.ok(modal);
    assert.ok(getButtonByText(document.body, "Keep Audio"));
    assert.ok(getButtonByText(document.body, "Remove Audio"));
    assert.ok(getButtonByText(document.body, "Cancel"));
  } finally {
    global.document = previousDocument;
  }
});

test("convertSegmentToImage preserves prompt and timing while replacing image fields", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{
    id: "seg",
    type: "video",
    start: 5,
    length: 10,
    prompt: "Keep prompt",
    videoEl: { video: true },
    videoDurationFrames: 50,
  }];

  convertSegmentToImage(editor, editor.timeline.segments[0], {
    imageFile: "image.png",
    imageB64: "url",
    imgObj: { image: true },
  });

  assert.deepEqual(editor.timeline.segments[0], {
    id: "seg",
    type: "image",
    start: 5,
    length: 10,
    prompt: "Keep prompt",
    imageFile: "image.png",
    imageB64: "url",
    imgObj: { image: true },
  });
});

test("uploadImageForSegment uses Comfy API shape and waits for image load", async () => {
  const previousComfyAPI = global.comfyAPI;
  const previousFormData = global.FormData;
  const previousImage = global.Image;
  const appended = [];
  global.FormData = class FakeFormData {
    append(name, value) {
      appended.push([name, value]);
    }
  };
  global.Image = class FakeImage {
    set src(value) {
      this._src = value;
      setTimeout(() => this.onload?.(), 0);
    }
    get src() {
      return this._src;
    }
  };
  global.comfyAPI = {
    api: {
      api: {
        fetchApi: async (path, options) => {
          assert.equal(path, "/upload/image");
          assert.equal(options.method, "POST");
          return {
            status: 200,
            json: async () => ({ name: "new.png", subfolder: "whatdreamscost" }),
          };
        },
        apiURL: (path) => `http://local${path}`,
      },
    },
  };
  try {
    const editor = makeEditor();
    editor.timeline.segments = [{ id: "seg", type: "text", start: 5, length: 10, prompt: "Keep prompt" }];

    const result = await uploadImageForSegment(editor, editor.timeline.segments[0], { type: "image/png" });

    assert.equal(result.changed, true);
    assert.deepEqual(appended.map(([name]) => name), ["image", "subfolder"]);
    assert.equal(editor.timeline.segments[0].type, "image");
    assert.equal(editor.timeline.segments[0].imageFile, "whatdreamscost/new.png");
    assert.match(editor.timeline.segments[0].imageB64, /\/view\?filename=new\.png/);
    assert.ok(editor.timeline.segments[0].imgObj);
    assert.equal(editor.rendered, 1);
  } finally {
    global.comfyAPI = previousComfyAPI;
    global.FormData = previousFormData;
    global.Image = previousImage;
  }
});

test("convertSegmentToVideo preserves prompt and timing while replacing video fields", () => {
  const editor = makeEditor();
  editor.timeline.segments = [{
    id: "seg",
    type: "image",
    start: 5,
    length: 10,
    prompt: "Keep prompt",
    imageFile: "old.png",
    imageB64: "old",
    imgObj: { old: true },
  }];

  convertSegmentToVideo(editor, editor.timeline.segments[0], {
    imageFile: "video.mp4",
    fileName: "video.mp4",
    videoDurationFrames: 80,
    imageB64: "thumb",
    videoEl: { video: true },
  });

  assert.deepEqual(editor.timeline.segments[0], {
    id: editor.timeline.segments[0].id,
    type: "video",
    start: 5,
    length: 10,
    prompt: "Keep prompt",
    imageFile: "video.mp4",
    fileName: "video.mp4",
    videoDurationFrames: 80,
    imageB64: "thumb",
    videoEl: { video: true },
    trimStart: 0,
  });
  assert.match(editor.timeline.segments[0].id, /_v$/);
  assert.equal(editor.selectedIndex, 0);
  assert.deepEqual(editor.selectedSegmentIds, [editor.timeline.segments[0].id, editor.timeline.segments[0].id.replace(/_v$/, "_a")]);
  assert.deepEqual(editor.timeline.audioSegments, [{
    id: editor.timeline.segments[0].id.replace(/_v$/, "_a"),
    type: "audio",
    start: 5,
    length: 10,
    trimStart: 0,
    audioDurationFrames: 80,
    audioFile: "video.mp4",
    fileName: "video.mp4",
    waveformPeaks: [],
    _uploading: false,
    _decoding: false,
  }]);
});

test("convertSegmentToVideo expand mode grows segment and ripples later linked main segments", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "seg", type: "text", start: 5, length: 10, prompt: "Keep prompt" },
    { id: "later_v", type: "video", start: 20, length: 5, prompt: "Later" },
  ];
  editor.timeline.audioSegments = [{ id: "later_a", type: "audio", start: 20, length: 5 }];

  convertSegmentToVideo(editor, editor.timeline.segments[0], {
    imageFile: "video.mp4",
    fileName: "video.mp4",
    videoDurationFrames: 30,
    durationMode: "expandToVideo",
  });

  assert.equal(editor.timeline.segments[0].length, 30);
  assert.equal(editor.timeline.audioSegments[0].length, 30);
  assert.equal(editor.timeline.segments[1].start, 40);
  assert.equal(editor.timeline.audioSegments[1].start, 40);
});

test("convertSegmentToVideo trim mode clamps to short video duration and ripples later linked main segments earlier", () => {
  const editor = makeEditor();
  editor.timeline.segments = [
    { id: "seg", type: "text", start: 5, length: 30, prompt: "Keep prompt" },
    { id: "later_v", type: "video", start: 40, length: 5, prompt: "Later" },
  ];
  editor.timeline.audioSegments = [{ id: "later_a", type: "audio", start: 40, length: 5 }];

  convertSegmentToVideo(editor, editor.timeline.segments[0], {
    imageFile: "short.mp4",
    fileName: "short.mp4",
    videoDurationFrames: 10,
    durationMode: "trimToSegment",
  });

  assert.equal(editor.timeline.segments[0].length, 10);
  assert.equal(editor.timeline.audioSegments[0].length, 10);
  assert.equal(editor.timeline.segments[1].start, 20);
  assert.equal(editor.timeline.audioSegments[1].start, 20);
});

test("uploadVideoForSegment clears large-video audio decoding state when upload fails", async () => {
  const previousDocument = global.document;
  const previousURL = global.URL;
  const previousConsoleError = console.error;
  console.error = () => {};
  global.URL = { createObjectURL: () => "blob:video" };
  global.document = createFakeDocument();
  global.document.createElement = (tagName) => {
    if (tagName !== "video") return new FakeElement(tagName);
    return {
      crossOrigin: "",
      preload: "",
      muted: false,
      duration: 2,
      set src(value) {
        this._src = value;
        setTimeout(() => this.onloadeddata?.(), 0);
      },
      get src() {
        return this._src;
      },
    };
  };
  try {
    const editor = makeEditor({
      _extractAudioOnClient: () => { editor.extractedAudio = true; },
      _uploadVideoFile: async () => { throw new Error("upload failed"); },
    });
    editor.timeline.segments = [{ id: "seg", type: "text", start: 5, length: 10, prompt: "Keep prompt" }];

    await uploadVideoForSegment(editor, editor.timeline.segments[0], {
      type: "video/mp4",
      name: "large.mp4",
      size: 101 * 1024 * 1024,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(editor.timeline.audioSegments[0]._uploading, false);
    assert.equal(editor.timeline.audioSegments[0]._decoding, false);
    assert.equal(editor.extractedAudio, undefined);
  } finally {
    global.document = previousDocument;
    global.URL = previousURL;
    console.error = previousConsoleError;
  }
});

test("promptConvertToVideo asks for duration mode before file selection", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const editor = makeEditor();
    editor.timeline.segments = [{ id: "seg", type: "text", start: 5, length: 10, prompt: "Keep prompt" }];

    const modal = promptConvertToVideo(editor, editor.timeline.segments[0]);

    assert.ok(modal);
    assert.ok(getButtonByText(document.body, "Trim to Segment"));
    assert.ok(getButtonByText(document.body, "Expand to Video"));
  } finally {
    global.document = previousDocument;
  }
});

test("conversion helpers no-op when target segment is stale", () => {
  const editor = makeEditor();
  const stale = { id: "missing", type: "text", start: 0, length: 10, prompt: "Nope" };

  assert.deepEqual(convertSegmentToImage(editor, stale, { imageFile: "image.png" }), { changed: false, reason: "stale_segment" });
  assert.equal(editor.committed, undefined);
});

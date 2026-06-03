const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ShotScriptParseError,
  exportTimelineToShotScript,
  parseShotScript,
  parseShotScriptDocument,
} = require("../js/ltx_director_shot_script.js");

test("parseShotScript parses a valid script with inline global prompt", () => {
  const parsed = parseShotScriptDocument(`GLOBAL: 1903 Kitty Hawk. Historical realism.

SHOT 1 | 3s
Wide low-angle shot beside the launch rail.

SHOT 2 | 2s
The Wright Flyer begins moving forward.`);

  assert.equal(parsed.globalPrompt, "1903 Kitty Hawk. Historical realism.");
  assert.deepEqual(parsed.video, { width: undefined, height: undefined, totalDuration: undefined });
  assert.deepEqual(parsed.shots, [
    {
      shotNumber: 1,
      duration: 3,
      prompt: "Wide low-angle shot beside the launch rail.",
    },
    {
      shotNumber: 2,
      duration: 2,
      prompt: "The Wright Flyer begins moving forward.",
    },
  ]);
});

test("parseShotScript still supports legacy global prompt block format", () => {
  const parsed = parseShotScriptDocument(`GLOBAL:
1903 Kitty Hawk. Historical realism.

SHOT 1 | 3s
Wide low-angle shot beside the launch rail.`);

  assert.equal(parsed.globalPrompt, "1903 Kitty Hawk. Historical realism.");
  assert.deepEqual(parsed.video, { width: undefined, height: undefined, totalDuration: undefined });
  assert.equal(parsed.shots.length, 1);
});

test("parseShotScript supports decimal durations", () => {
  const parsed = parseShotScript(`SHOT 1 | 4.5s
The Flyer lifts into the air.`);

  assert.deepEqual(parsed, [
    {
      shotNumber: 1,
      duration: 4.5,
      prompt: "The Flyer lifts into the air.",
    },
  ]);
});

test("parseShotScript accepts CLIP declarations", () => {
  const parsed = parseShotScript(`CLIP 1 | 4.5s
The Flyer lifts into the air.`);

  assert.deepEqual(parsed, [
    {
      shotNumber: 1,
      duration: 4.5,
      prompt: "The Flyer lifts into the air.",
    },
  ]);
});

test("parseShotScript works without a global section", () => {
  const parsed = parseShotScriptDocument(`SHOT 1 | 3s
First prompt.

SHOT 2 | 1.25s
Second prompt.`);

  assert.equal(parsed.globalPrompt, "");
  assert.deepEqual(parsed.video, { width: undefined, height: undefined, totalDuration: undefined });
  assert.equal(parsed.shots.length, 2);
  assert.equal(parsed.shots[1].duration, 1.25);
});

test("parseShotScript accepts mixed SHOT and CLIP declarations as aliases", () => {
  const parsed = parseShotScriptDocument(`CLIP 1 | 3s
First prompt.

SHOT 2 | 1.25s
Second prompt.`);

  assert.equal(parsed.globalPrompt, "");
  assert.deepEqual(parsed.video, { width: undefined, height: undefined, totalDuration: undefined });
  assert.equal(parsed.shots.length, 2);
  assert.equal(parsed.shots[0].duration, 3);
  assert.equal(parsed.shots[1].duration, 1.25);
});

test("parseShotScriptDocument parses optional VIDEO metadata block", () => {
  const parsed = parseShotScriptDocument(`GLOBAL: Historical realism.

VIDEO:
width: 1280
height: 720
total_duration: 40.5

SHOT 1 | 3s
First prompt.`);

  assert.deepEqual(parsed.video, { width: 1280, height: 720, totalDuration: 40.5 });
  assert.equal(parsed.shots.length, 1);
});

test("parseShotScriptDocument trims blank leading/trailing lines around parsed prompts", () => {
  const parsed = parseShotScriptDocument(`GLOBAL:

1903 Kitty Hawk. Historical realism.


SHOT 1 | 3s

First prompt.


SHOT 2 | 2s

Second prompt.

`);

  assert.equal(parsed.globalPrompt, "1903 Kitty Hawk. Historical realism.");
  assert.equal(parsed.shots[0].prompt, "First prompt.");
  assert.equal(parsed.shots[1].prompt, "Second prompt.");
});

test("parseShotScriptDocument parses VIDEO block without GLOBAL block", () => {
  const parsed = parseShotScriptDocument(`VIDEO:
width: 1024

SHOT 1 | 2s
First prompt.`);

  assert.deepEqual(parsed.video, { width: 1024, height: undefined, totalDuration: undefined });
  assert.equal(parsed.globalPrompt, "");
});

test("parseShotScriptDocument reports invalid VIDEO metadata", () => {
  assert.throws(
    () => parseShotScriptDocument(`VIDEO:
width: -5

SHOT 1 | 2s
Prompt.`),
    /** @param {unknown} error */ (error) => {
      assert.ok(error instanceof ShotScriptParseError);
      assert.match(error.message, /Invalid VIDEO width: must be a positive integer\./);
      return true;
    }
  );
});

test("parseShotScript reports malformed shot blocks with line numbers", () => {
  assert.throws(
    () => parseShotScript(`SHOT 1 | xs
Broken prompt.`),
    /** @param {unknown} error */ (error) => {
      assert.ok(error instanceof ShotScriptParseError);
      assert.match(error.message, /Line 1:/);
      assert.match(error.message, /Invalid clip declaration:/);
      assert.match(error.message, /SHOT 1 \| xs/);
      return true;
    }
  );
});

test("parseShotScript reports duplicate shot numbers", () => {
  assert.throws(
    () => parseShotScript(`SHOT 1 | 2s
First.

SHOT 1 | 3s
Second.`),
    /** @param {unknown} error */ (error) => {
      assert.ok(error instanceof ShotScriptParseError);
      assert.match(error.message, /Line 4:/);
      assert.match(error.message, /Duplicate clip number: 1/);
      return true;
    }
  );
});

test("exportTimelineToShotScript serializes the timeline in clip script format", () => {
  const text = exportTimelineToShotScript({
    globalPrompt: "Historical realism.",
    frameRate: 24,
    segments: [
      { start: 24, length: 48, prompt: "Second prompt." },
      { start: 0, length: 72, prompt: "First prompt." },
    ],
    video: {
      width: 1280,
      height: 720,
    },
  });

  assert.equal(text, `GLOBAL: Historical realism.

VIDEO:
width: 1280
height: 720
total_duration: 5

CLIP 1 | 3s
First prompt.

CLIP 2 | 2s
Second prompt.`);
});

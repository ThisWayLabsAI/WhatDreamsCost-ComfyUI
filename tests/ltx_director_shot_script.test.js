const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  ShotListParseError,
  exportShotList,
  parseShotList,
} = require("../js/ltx_director_shot_script.js");

test("parseShotList parses a valid SHOT list", () => {
  const parsed = parseShotList(`GLOBAL: 1903 Kitty Hawk. Historical realism.

SHOT 1 | 3s
Wide low-angle shot beside the launch rail.

SHOT 2 | 2s
The Wright Flyer begins moving forward.`);

  assert.equal(parsed.globalPrompt, "1903 Kitty Hawk. Historical realism.");
  assert.deepEqual(parsed.video, { width: undefined, height: undefined, totalDuration: undefined });
  assert.deepEqual(parsed.warnings, []);
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

test("parseShotList supports decimal durations", () => {
  const parsed = parseShotList(`SHOT 1 | 4.5s
The Flyer lifts into the air.`);

  assert.deepEqual(parsed.shots, [
    {
      shotNumber: 1,
      duration: 4.5,
      prompt: "The Flyer lifts into the air.",
    },
  ]);
});

test("parseShotList works without a GLOBAL section", () => {
  const parsed = parseShotList(`SHOT 1 | 3s
First prompt.

SHOT 2 | 1.25s
Second prompt.`);

  assert.equal(parsed.globalPrompt, "");
  assert.equal(parsed.shots.length, 2);
});

test("parseShotList works without a VIDEO section", () => {
  const parsed = parseShotList(`SHOT 1 | 2s
First prompt.`);

  assert.deepEqual(parsed.video, { width: undefined, height: undefined, totalDuration: undefined });
});

test("parseShotList parses VIDEO width and height", () => {
  const parsed = parseShotList(`VIDEO:
width: 1280
height: 720

SHOT 1 | 2s
Prompt.`);

  assert.deepEqual(parsed.video, { width: 1280, height: 720, totalDuration: undefined });
});

test("parseShotList reports a non-blocking total_duration mismatch warning", () => {
  const parsed = parseShotList(`VIDEO:
total_duration: 40

SHOT 1 | 3s
Prompt one.

SHOT 2 | 2s
Prompt two.`);

  assert.equal(parsed.shots.length, 2);
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /does not match total SHOT duration/);
});

test("parseShotList accepts backward-compatible CLIP declarations", () => {
  const parsed = parseShotList(`CLIP 1 | 4.5s
The Flyer lifts into the air.`);

  assert.deepEqual(parsed.shots, [
    {
      shotNumber: 1,
      duration: 4.5,
      prompt: "The Flyer lifts into the air.",
    },
  ]);
});

test("parseShotList reports duplicate shot numbers", () => {
  assert.throws(
    () => parseShotList(`SHOT 1 | 2s
First.

SHOT 1 | 3s
Second.`),
    /** @param {unknown} error */ (error) => {
      assert.ok(error instanceof ShotListParseError);
      assert.match(error.message, /Line 4:/);
      assert.match(error.message, /Duplicate shot number: 1/);
      return true;
    }
  );
});

test("parseShotList reports invalid durations", () => {
  assert.throws(
    () => parseShotList(`SHOT 1 | xs
Broken prompt.`),
    /** @param {unknown} error */ (error) => {
      assert.ok(error instanceof ShotListParseError);
      assert.match(error.message, /Line 1:/);
      assert.match(error.message, /Invalid shot declaration:/);
      assert.match(error.message, /SHOT 1 \| xs/);
      return true;
    }
  );
});

test("exportShotList serializes timeline data using SHOT blocks only", () => {
  const text = exportShotList({
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

SHOT 1 | 3s
First prompt.

SHOT 2 | 2s
Second prompt.`);
  assert.doesNotMatch(text, /\bCLIP\b/);
});

test("no remaining user-facing Clip Script labels", () => {
  const uiSource = fs.readFileSync(require.resolve("../js/ltx_director.js"), "utf8");
  const readmeSource = fs.readFileSync(require.resolve("../README.md"), "utf8");
  assert.doesNotMatch(uiSource, /Clip Script/i);
  assert.match(uiSource, /Shot List \(View\/Import\/Export\)/);
  assert.match(uiSource, /Import Shot List/);
  assert.match(uiSource, /Export Shot List/);
  assert.match(uiSource, /SHOT 1 \\| 3s/);
  assert.doesNotMatch(readmeSource, /clip script/i);
});

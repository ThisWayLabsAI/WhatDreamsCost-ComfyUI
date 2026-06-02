const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ShotScriptParseError,
  exportTimelineToShotScript,
  parseShotScript,
  parseShotScriptDocument,
} = require("../js/ltx_director_shot_script.js");

test("parseShotScript parses a valid script with global prompt", () => {
  const parsed = parseShotScriptDocument(`GLOBAL:
1903 Kitty Hawk. Historical realism.

SHOT 1 | 3s
Wide low-angle shot beside the launch rail.

SHOT 2 | 2s
The Wright Flyer begins moving forward.`);

  assert.equal(parsed.globalPrompt, "1903 Kitty Hawk. Historical realism.\n");
  assert.deepEqual(parsed.shots, [
    {
      shotNumber: 1,
      duration: 3,
      prompt: "Wide low-angle shot beside the launch rail.\n",
    },
    {
      shotNumber: 2,
      duration: 2,
      prompt: "The Wright Flyer begins moving forward.",
    },
  ]);
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

test("parseShotScript works without a global section", () => {
  const parsed = parseShotScriptDocument(`SHOT 1 | 3s
First prompt.

SHOT 2 | 1.25s
Second prompt.`);

  assert.equal(parsed.globalPrompt, "");
  assert.equal(parsed.shots.length, 2);
  assert.equal(parsed.shots[1].duration, 1.25);
});

test("parseShotScript reports malformed shot blocks with line numbers", () => {
  assert.throws(
    () => parseShotScript(`SHOT 1 | xs
Broken prompt.`),
    /** @param {unknown} error */ (error) => {
      assert.ok(error instanceof ShotScriptParseError);
      assert.match(error.message, /Line 1:/);
      assert.match(error.message, /Invalid shot declaration:/);
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
      assert.match(error.message, /Duplicate shot number: 1/);
      return true;
    }
  );
});

test("exportTimelineToShotScript serializes the timeline in shot script format", () => {
  const text = exportTimelineToShotScript({
    globalPrompt: "Historical realism.",
    frameRate: 24,
    segments: [
      { start: 24, length: 48, prompt: "Second prompt." },
      { start: 0, length: 72, prompt: "First prompt." },
    ],
  });

  assert.equal(text, `GLOBAL:
Historical realism.

SHOT 1 | 3s
First prompt.

SHOT 2 | 2s
Second prompt.`);
});

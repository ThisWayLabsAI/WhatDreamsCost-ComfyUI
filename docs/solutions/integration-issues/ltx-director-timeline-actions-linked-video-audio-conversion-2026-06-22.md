---
title: LTX Director Timeline Actions Linked Video Audio Conversion
date: 2026-06-22
category: integration-issues
module: LTX Director TWL Timeline Actions
problem_type: integration_issue
component: frontend_stimulus
symptoms:
  - Right-click Convert to Video converted only the main visual segment.
  - Converted videos did not create the linked audio segment that upstream video upload creates.
  - Converted video duration handling did not offer a clear trim-or-expand choice.
  - Convert to Text could not distinguish keeping linked video audio from removing it.
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
related_components:
  - ltx-director-upstream-video-upload
  - twl-timeline-actions-tests
tags:
  - ltx-director
  - timeline-actions
  - convert-to-video
  - linked-audio
  - video-audio
  - plugin-seam
  - twl
---

# LTX Director Timeline Actions Linked Video Audio Conversion

## Problem

The TWL Timeline Actions right-click `Convert to Video` path converted the selected main segment without creating the linked audio segment that the original LTX Director video upload path creates. Converted videos therefore behaved differently from videos added through the upstream author's upload flow.

## Symptoms

- Right-click `Convert to Video` produced a video segment but no linked `_a` audio segment on the audio timeline.
- Converted videos did not match the upstream `_v` / `_a` linked segment model.
- Audio upload, decoding, waveform, and server extraction state was missing or incomplete for converted videos.
- Duration-changing conversion did not clearly distinguish keeping the current segment length from expanding to the selected video's natural length.
- Converting a linked video back to text had no explicit `Keep Audio` / `Remove Audio` choice.

## What Didn't Work

- Mutating only the selected segment's media fields was too shallow. The upstream video upload path creates a paired video/audio timeline model, not just one visual segment.
- Preserving the selected segment length unconditionally created invalid ranges when the chosen source video was shorter than the existing segment.
- Treating audio removal as implicit would have violated the earlier Convert to Text requirement to preserve related audio and IC-LoRA motion context by default.
- Removing audio broadly was unsafe because independent user-added audio tracks must not be deleted when only the video's direct audio sibling is in question.

## Solution

Mirror the upstream linked-media model when converting a segment to video:

- Normalize the converted main segment to the upstream-style `<base>_v` id.
- Create or update the direct linked audio sibling as `<base>_a`.
- Store audio-side metadata alongside the converted video state: `audioDurationFrames`, `audioFile`, `waveformPeaks`, upload state, and decoding state.
- Keep selection on the converted linked pair so later UI actions operate on current ids instead of stale pre-conversion ids.
- Sort the main and audio timelines after conversion.

Add an explicit duration choice before the file picker:

- `Trim to Segment` keeps the current segment length unless the source video is shorter, then clamps to the available media duration.
- `Expand to Video` sets the converted segment length to the selected video's natural duration and ripples later linked main/audio segments.

Extend the upload path to preserve the same durable state transitions as the original author's video upload behavior:

- Generate thumbnails for the converted video segment when possible.
- Populate linked audio metadata and waveform information when available.
- Keep video and audio upload/decoding state consistent through success and failure paths.
- Clear audio decoding state on upload failure, especially for large videos where client-side extraction is skipped.

Add a separate `Convert to Text` linked-audio choice only when converting a video segment with a direct `_a` sibling:

- `Keep Audio` preserves the existing default behavior and leaves the linked audio segment in place.
- `Remove Audio` removes only the direct `_a` sibling for that video.
- `Cancel` leaves the timeline unchanged.

Independent audio and IC-LoRA motion segments remain untouched.

## Why This Works

The upstream LTX Director video upload flow treats a video-with-audio as two coordinated timeline items with a shared base id: one main video segment ending in `_v` and one audio segment ending in `_a`. Matching that model during conversion means downstream selection, ripple, delete, upload, and waveform behavior can continue using the same assumptions for uploaded and converted videos.

The duration choice makes the previously implicit behavior explicit. `Trim to Segment` is useful when the user is replacing media inside an existing timing slot, while `Expand to Video` is useful when the selected media should define the segment length. Clamping Trim mode to short source videos prevents impossible trim ranges where segment length exceeds available media duration.

The Convert to Text choice preserves the original safe default while adding an intentional cleanup path. Because `Remove Audio` only targets the directly linked `_a` sibling, user-added music, dialogue, and motion context cannot be removed accidentally.

## Prevention

- When adding TWL media conversions, compare behavior against the upstream upload path, not just the segment object fields.
- Preserve linked segment invariants explicitly: `_v` and `_a` ids, shared base id, matching start/length, and upload/decoding state transitions.
- Add tests for both direct helper behavior and UI choice entry points when a conversion has user-visible branches.
- Include short-media boundary coverage when a conversion can preserve an existing duration.
- For destructive or ambiguous media context changes, default to preserving user context and require an explicit choice to remove it.

Regression tests were added in `tests/ltx_director_twl_timeline_actions_ui.test.js` for:

- Converted videos creating linked `_v` / `_a` segments.
- `Expand to Video` rippling later linked main/audio segments.
- `Trim to Segment` clamping when the source video is shorter than the selected segment.
- Upload failure clearing audio decoding state for large videos.
- The `Trim to Segment` / `Expand to Video` choice before file selection.
- Convert to Text preserving linked audio by default.
- Convert to Text removing only the directly linked audio sibling when requested.
- The `Keep Audio` / `Remove Audio` choice appearing only for linked video audio.

The verified test results were:

- `node --test tests/ltx_director_twl_timeline_actions_ui.test.js`: 31/31 passing.
- `node --test tests/*.test.js`: 74/74 passing.

## Related Issues

- Related: `docs/solutions/ui-bugs/ltx-director-shot-list-modal-metadata-round-trip-2026-06-21.md` covers another LTX Director TWL UI boundary where modal actions, async guards, and timeline mutation needed explicit state boundaries.
- Related: `docs/solutions/conventions/twl-parser-file-naming-convention-2026-06-20.md` documents the TWL-owned file naming convention that keeps add-on ownership clear during upstream syncs.

---
date: 2026-06-20
topic: twl-ltx-director-addons
---

# TWL LTX Director Add-ons Requirements

## Summary

Add a small LTX Director plugin seam and use it to deliver TWL-owned UI add-ons without spreading feature code through upstream-heavy files. The first execution slice prioritizes Shot List UI, then ripple-based segment duration editing, while preserving other v1 UX ideas as backlog candidates only.

---

## Problem Frame

The v2 branch is based on the original author's newer LTX Director implementation, while the older `ltx-director-v1-twlai` branch contains TWL UI/UX improvements that proved useful during v1 testing. Directly merging v1 into v2 creates large conflicts because both branches changed the same upstream-owned surfaces.

Future upstream updates are likely to keep touching the main LTX Director files. If TWL features continue to be embedded directly into those files, each upstream sync risks re-solving the same conflicts. The requirements here define a smaller feature slice that preserves the most valuable TWL UX while making future updates easier to absorb.

---

## Actors

- A1. LTX Director user: Builds or edits timelines using image, video, text prompt, audio, and motion segments.
- A2. Fork maintainer: Ports TWL UX improvements while keeping the fork easy to update from upstream.
- A3. Future planning or implementation agent: Uses this document and `docs/twl-upstream-integration-strategy.md` to plan and implement without inventing scope.

---

## Key Flows

- F1. Shot List export
  - **Trigger:** A user wants a text representation of the current main segment timeline.
  - **Actors:** A1
  - **Steps:** User opens Shot List UI, chooses export/view, reviews generated Shot List text, and copies or otherwise uses the text outside the node.
  - **Outcome:** The user has a readable Shot List matching the current timeline segments and prompts.
  - **Covered by:** R3, R4, R5, R6

- F2. Shot List import
  - **Trigger:** A user has Shot List text they want to turn into timeline segments.
  - **Actors:** A1
  - **Steps:** User opens Shot List UI, chooses import, provides Shot List text, chooses whether to replace or append, confirms the result, and the timeline updates.
  - **Outcome:** Timeline segments reflect the imported shots according to the selected import mode.
  - **Covered by:** R3, R4, R7, R8, R9

- F3. Segment duration edit
  - **Trigger:** A user wants to adjust the duration of a selected image, video, or text prompt segment.
  - **Actors:** A1
  - **Steps:** User selects a segment, edits its duration, applies the change, and following segments move to preserve sequence flow.
  - **Outcome:** The selected segment has the requested duration and later segments ripple accordingly.
  - **Covered by:** R10, R11, R12

- F4. Upstream-safe feature extension
  - **Trigger:** A maintainer or implementation agent adds TWL UI behavior to LTX Director.
  - **Actors:** A2, A3
  - **Steps:** The add-on uses the plugin seam, keeps TWL-owned code separate, and limits direct edits to upstream-owned files.
  - **Outcome:** TWL behavior is easier to review, revert, and preserve during future upstream syncs.
  - **Covered by:** R1, R2, R13, R14

---

## Requirements

**Plugin seam and ownership**
- R1. The LTX Director UI must expose a small plugin seam that allows TWL-owned add-ons to run after the timeline editor is available.
- R2. TWL-specific UI behavior must live outside broad upstream-owned editor code wherever practical.
- R3. User-facing labels must use upstream-compatible terminology, especially `segment` for image, video, and text prompt timeline items.

**Shot List UI**
- R4. Users must be able to open a Shot List UI from the LTX Director experience.
- R5. Users must be able to export the current main segment timeline as Shot List text.
- R6. Exported Shot List text must include enough information for users to understand segment order, segment duration, and segment prompts.
- R7. Users must be able to import Shot List text into the timeline.
- R8. Shot List import must support both replacing the current main segment timeline and appending imported shots after existing main segments.
- R9. Import must avoid silently destructive behavior; replacing existing main segments requires a clear user choice or confirmation.

**Segment duration editing**
- R10. Users must be able to directly edit the duration of a selected image, video, or text prompt segment.
- R11. Segment duration edits must ripple following main segments so sequence flow is preserved.
- R12. Duration editing must keep timeline state, visible timing, and generated segment data consistent after the change.

**Compatibility and maintainability**
- R13. The first execution slice must not change global prompt behavior.
- R14. The first execution slice must not reintroduce v1 prompt modal behavior.
- R15. Deferred v1 UI/UX items must be recorded as backlog candidates, not silently pulled into this execution slice.

---

## Acceptance Examples

- AE1. **Covers R5, R6.** Given a timeline with three main segments, when the user exports a Shot List, the output presents three ordered shots with durations and prompts matching those segments.
- AE2. **Covers R7, R8, R9.** Given an existing timeline and valid Shot List text, when the user chooses replace, the existing main segments are replaced only after the user has made that choice clear.
- AE3. **Covers R7, R8.** Given an existing timeline and valid Shot List text, when the user chooses append, imported shots are added after the existing main segments instead of replacing them.
- AE4. **Covers R10, R11, R12.** Given a selected segment followed by later segments, when the user increases the selected segment duration, the later segments move later so the sequence remains ordered.
- AE5. **Covers R13, R14.** Given upstream v2's current global prompt and resizable prompt areas, when this execution slice is implemented, those behaviors remain governed by upstream v2 rather than v1 TWL modal/global-prompt behavior.

---

## Success Criteria

- Users can complete the Shot List workflow without needing the old v1 branch or manual timeline reconstruction.
- Users can adjust a segment's duration directly and see later segments ripple in a predictable way.
- Future upstream syncs have fewer conflict points because TWL feature code is isolated behind a small seam.
- A planning or implementation agent can identify what is required now, what is deferred, and what must not be changed.

---

## Scope Boundaries

- Global prompt UI or behavior changes are out of scope for this execution slice.
- Prompt modal work from v1 is out of scope because upstream v2 already supports resizing prompt text areas.
- Old v1 example workflows are out of scope unless separately reprioritized.
- Broad v1 changes to unrelated files are out of scope unless tied to a specifically selected feature.
- Timeline trim actions, ripple delete gaps / close gaps, context-menu conveniences, and other v1 UX items are deferred backlog candidates only.

---

## Key Decisions

- Shot List first: The Shot List workflow is the primary user-facing win and has already been tested for efficacy in v1.
- Use a plugin seam: A small extension point carries less future merge cost than embedding TWL behavior directly into upstream-heavy editor code.
- Support replace and append import: Users need both safe full replacement and additive workflows.
- Ripple duration editing: Segment duration changes should preserve sequence flow instead of only resizing one isolated segment.
- Keep backlog candidates explicit: Partial memory of v1 timeline actions should not become accidental implementation scope.

---

## Dependencies / Assumptions

- The existing integration strategy in `docs/twl-upstream-integration-strategy.md` remains the architectural constraint for this work.
- The committed Shot List parser/test files are available for the Shot List UI to use.
- The current v2 LTX Director global prompt and prompt text-area behavior should be preserved.
- Segment duration editing is expected to be achievable as UI behavior without backend Python changes unless planning discovers otherwise.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What is the smallest safe plugin seam that survives node creation, workflow load, and future upstream edits?
- [Affects R4-R9][Technical] Where should the Shot List entry point appear in the current v2 UI so it feels native and does not compete with upstream controls?
- [Affects R10-R12][Technical] How should ripple duration editing handle overlaps, gaps, locked media duration limits, and end-of-timeline growth in the current v2 timeline model?
- [Affects R15][Needs review] Which v1 timeline action candidates should be captured later after comparing v1 behavior against current v2 behavior?

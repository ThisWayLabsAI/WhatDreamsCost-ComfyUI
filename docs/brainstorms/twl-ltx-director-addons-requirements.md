---
date: 2026-06-20
topic: twl-ltx-director-addons
---

# TWL LTX Director Add-ons Requirements

## Summary

Add a small LTX Director plugin seam and use it to deliver TWL-owned UI add-ons without spreading feature code through upstream-heavy files. The first execution slice prioritizes Shot List UI, then ripple-based segment duration editing, while preserving other v1 UX ideas as backlog candidates only. The immediate refinement slice focuses only on Shot List polish: file import into the modal, clearer apply language, real `.txt` export, and v1-style in-app confirmations instead of browser confirms.

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
  - **Steps:** User opens Shot List UI, chooses export/view, reviews generated Shot List text, and either copies it or saves it as a `.txt` file.
  - **Outcome:** The user has a readable Shot List matching the current timeline segments and prompts, available outside the node as text.
  - **Covered by:** R3, R4, R5, R6, R10

- F2. Shot List import
  - **Trigger:** A user has Shot List text they want to turn into timeline segments.
  - **Actors:** A1
  - **Steps:** User opens Shot List UI, optionally imports a `.txt` file into the modal textarea, reviews or edits the text, chooses whether to replace or append, applies the Shot List, confirms any destructive or warning state through the in-app confirmation UI, and the timeline updates.
  - **Outcome:** Timeline segments reflect the imported shots according to the selected import mode.
  - **Covered by:** R3, R4, R7, R8, R9, R11, R12, R13

- F3. Segment duration edit
  - **Trigger:** A user wants to adjust the duration of a selected image, video, or text prompt segment.
  - **Actors:** A1
  - **Steps:** User selects a segment, edits its duration, applies the change, and following segments move to preserve sequence flow.
  - **Outcome:** The selected segment has the requested duration and later segments ripple accordingly.
  - **Covered by:** R14, R15, R16

- F4. Upstream-safe feature extension
  - **Trigger:** A maintainer or implementation agent adds TWL UI behavior to LTX Director.
  - **Actors:** A2, A3
  - **Steps:** The add-on uses the plugin seam, keeps TWL-owned code separate, and limits direct edits to upstream-owned files.
  - **Outcome:** TWL behavior is easier to review, revert, and preserve during future upstream syncs.
  - **Covered by:** R1, R2, R17, R19

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
- R10. Users must be able to save the current Shot List as a `.txt` file through the export flow, rather than only populating the modal textarea.
- R11. Users must be able to load a `.txt` file into the Shot List modal textarea for review or editing before applying it to the timeline.
- R12. The timeline-changing Shot List action must be labeled as applying the Shot List, not importing it, so file import and timeline apply are distinct user actions.
- R13. Shot List confirmations must use an in-app reusable confirmation modal pattern instead of browser `confirm()` dialogs.

**Segment duration editing**
- R14. Users must be able to directly edit the duration of a selected image, video, or text prompt segment.
- R15. Segment duration edits must ripple following main segments so sequence flow is preserved.
- R16. Duration editing must keep timeline state, visible timing, and generated segment data consistent after the change.

**Compatibility and maintainability**
- R17. The first execution slice must not change global prompt behavior.
- R18. The first execution slice must not reintroduce v1 prompt modal behavior.
- R19. Deferred v1 UI/UX items must be recorded as backlog candidates, not silently pulled into this execution slice.

---

## Acceptance Examples

- AE1. **Covers R5, R6, R10.** Given a timeline with three main segments, when the user exports a Shot List, the output presents three ordered shots with durations and prompts matching those segments and can be saved as a `.txt` file.
- AE2. **Covers R7, R8, R9, R12, R13.** Given an existing timeline and valid Shot List text, when the user chooses replace and applies the Shot List, the existing main segments are replaced only after the user confirms through the in-app confirmation UI.
- AE3. **Covers R7, R8, R12.** Given an existing timeline and valid Shot List text, when the user chooses append and applies the Shot List, imported shots are added after the existing main segments instead of replacing them.
- AE4. **Covers R11, R12.** Given a user has a `.txt` Shot List file, when they import the file in the Shot List modal, the file contents appear in the textarea for review or editing before any timeline changes are applied.
- AE5. **Covers R13.** Given Shot List import produces warnings, when the user applies the Shot List, the warning confirmation appears as an in-app modal rather than a browser confirmation dialog.
- AE6. **Covers R14, R15, R16.** Given a selected segment followed by later segments, when the user increases the selected segment duration, the later segments move later so the sequence remains ordered.
- AE7. **Covers R17, R18.** Given upstream v2's current global prompt and resizable prompt areas, when this execution slice is implemented, those behaviors remain governed by upstream v2 rather than v1 TWL modal/global-prompt behavior.

---

## Success Criteria

- Users can complete the Shot List workflow without needing the old v1 branch or manual timeline reconstruction.
- Users can move Shot List text in and out of the modal via `.txt` files without manual copy/paste as the only path.
- Users can distinguish loading text into the modal from applying that text to the timeline.
- Destructive or warning Shot List actions feel native to the app and do not rely on browser confirmation dialogs.
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
- The immediate Shot List polish refinement does not pull in adjacent v1 backlog items beyond `.txt` import, `.txt` export, clearer apply labeling, and reusable confirmation UI.

---

## Key Decisions

- Shot List first: The Shot List workflow is the primary user-facing win and has already been tested for efficacy in v1.
- Polish Shot List before other backlog: The next slice should finish the currently exposed Shot List workflow before taking on additional v1 carryover work.
- Separate file import from timeline apply: Loading a `.txt` file should populate the modal textarea for review/editing first; applying the Shot List is the action that changes timeline state.
- Use in-app confirmations: v1's custom confirmation UX is preferable to browser `confirm()` for destructive or warning Shot List actions.
- Use a plugin seam: A small extension point carries less future merge cost than embedding TWL behavior directly into upstream-heavy editor code.
- Support replace and append import: Users need both safe full replacement and additive workflows.
- Ripple duration editing: Segment duration changes should preserve sequence flow instead of only resizing one isolated segment.
- Keep backlog candidates explicit: Partial memory of v1 timeline actions should not become accidental implementation scope.

---

## Dependencies / Assumptions

- The existing integration strategy in `docs/twl-upstream-integration-strategy.md` remains the architectural constraint for this work.
- The committed Shot List parser/test files are available for the Shot List UI to use.
- The `ltx-director-v1-twlai` branch remains a useful behavioral reference for file import into the old Shot Script modal and the custom confirmation modal pattern.
- The current v2 LTX Director global prompt and prompt text-area behavior should be preserved.
- Segment duration editing is expected to be achievable as UI behavior without backend Python changes unless planning discovers otherwise.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What is the smallest safe plugin seam that survives node creation, workflow load, and future upstream edits?
- [Affects R4-R9][Technical] Where should the Shot List entry point appear in the current v2 UI so it feels native and does not compete with upstream controls?
- [Affects R13][Technical] What is the smallest reusable in-app confirmation modal pattern to carry forward from v1 without reintroducing broad v1 prompt-modal behavior?
- [Affects R14-R16][Technical] How should ripple duration editing handle overlaps, gaps, locked media duration limits, and end-of-timeline growth in the current v2 timeline model?
- [Affects R19][Needs review] Which v1 timeline action candidates should be captured later after comparing v1 behavior against current v2 behavior?

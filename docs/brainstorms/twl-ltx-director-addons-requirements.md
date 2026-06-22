---
date: 2026-06-21
topic: twl-ltx-director-addons
---

# TWL LTX Director Add-ons Requirements

## Summary

Add a small LTX Director plugin seam and use it to deliver TWL-owned UI add-ons without spreading feature code through upstream-heavy files. The first execution slice prioritizes Shot List UI, then ripple-based segment duration editing. The next reprioritized slice adds timeline actions from v1 through a TWL-owned UI container and right-click segment actions while preserving upstream v2's existing Delete behavior and terminology.

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

- F5. Timeline-wide action
  - **Trigger:** A user wants to clean up or reset timeline state without manually editing each segment.
  - **Actors:** A1
  - **Steps:** User finds the TWL Timeline Actions area near the timeline, chooses a timeline-wide action such as ripple delete gaps, trim to last clip, reset timeline, or reset all, confirms destructive actions when prompted, and the timeline updates.
  - **Outcome:** Timeline cleanup or reset behavior completes predictably without moving or replacing upstream's default Delete control.
  - **Covered by:** R20, R21, R22, R23, R24, R25, R26

- F6. Right-click segment action
  - **Trigger:** A user wants to operate on a specific segment in context.
  - **Actors:** A1
  - **Steps:** User right-clicks a segment, chooses Ripple Delete, Add Segment Before, Add Segment After, Convert to Text, Convert to Image, or Convert to Video, completes any confirmation or file selection step, and the selected segment or surrounding timeline updates.
  - **Outcome:** Segment-local actions are available where the user is already working, while sequence flow and related prompt/audio/motion context are preserved.
  - **Covered by:** R27, R28, R29, R30, R31, R32, R33, R34, R35

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

**Timeline Actions container**
- R20. Users must have access to a TWL-owned Timeline Actions area injected near the timeline experience for timeline-wide actions.
- R21. The Timeline Actions area must include Ripple Delete for removing the current selection with sequence-preserving ripple behavior.
- R22. The Timeline Actions area must include Ripple Delete Gaps for closing timeline gaps without requiring manual segment dragging.
- R23. The Timeline Actions area must include Trim to Last Clip so the timeline can be shortened to the end of the last clip or segment.
- R24. The Timeline Actions area must include Reset Timeline for clearing timeline-specific content and action state without clearing the full node experience.
- R25. The Timeline Actions area must include Reset All for broader full-node reset behavior.
- R26. Destructive timeline-wide actions, especially Reset Timeline and Reset All, must require clear in-app confirmation before applying.

**Right-click timeline actions**
- R27. The existing upstream Delete action must remain in its current place and continue to behave as the upstream author intended.
- R28. Segment right-click menus must include Ripple Delete as a separate action from the upstream Delete action.
- R29. Segment right-click menus must include Add Segment Before and Add Segment After using the upstream author's `segment` terminology instead of v1's `shot` terminology.
- R30. Add Segment Before and Add Segment After must ripple later main segments to make room so the sequence remains ordered.
- R31. Segment right-click menus must include Convert to Text, Convert to Image, and Convert to Video where those actions are valid for the selected segment.
- R32. Convert to Text must preserve the segment prompt and related audio and IC-LoRA video track content, while removing the selected segment's main visual media.
- R33. Convert to Image must preserve the segment prompt and allow the user to choose replacement image media through the file picker.
- R34. Convert to Video must preserve the segment prompt and allow the user to choose replacement video media through the file picker.
- R35. Convert to Text must require confirmation because it removes visual media from the segment.

---

## Acceptance Examples

- AE1. **Covers R5, R6, R10.** Given a timeline with three main segments, when the user exports a Shot List, the output presents three ordered shots with durations and prompts matching those segments and can be saved as a `.txt` file.
- AE2. **Covers R7, R8, R9, R12, R13.** Given an existing timeline and valid Shot List text, when the user chooses replace and applies the Shot List, the existing main segments are replaced only after the user confirms through the in-app confirmation UI.
- AE3. **Covers R7, R8, R12.** Given an existing timeline and valid Shot List text, when the user chooses append and applies the Shot List, imported shots are added after the existing main segments instead of replacing them.
- AE4. **Covers R11, R12.** Given a user has a `.txt` Shot List file, when they import the file in the Shot List modal, the file contents appear in the textarea for review or editing before any timeline changes are applied.
- AE5. **Covers R13.** Given Shot List import produces warnings, when the user applies the Shot List, the warning confirmation appears as an in-app modal rather than a browser confirmation dialog.
- AE6. **Covers R14, R15, R16.** Given a selected segment followed by later segments, when the user increases the selected segment duration, the later segments move later so the sequence remains ordered.
- AE7. **Covers R17, R18.** Given upstream v2's current global prompt and resizable prompt areas, when this execution slice is implemented, those behaviors remain governed by upstream v2 rather than v1 TWL modal/global-prompt behavior.
- AE8. **Covers R20, R22, R23.** Given a timeline with gaps and multiple clips, when the user uses Timeline Actions to close gaps or trim to the last clip, the timeline updates without requiring manual drag cleanup.
- AE9. **Covers R24, R25, R26.** Given a populated node, when the user chooses Reset Timeline or Reset All, the user sees an in-app confirmation before any destructive reset is applied.
- AE10. **Covers R27, R28.** Given a selected segment, when the user opens the right-click menu, upstream Delete remains available and Ripple Delete appears as a distinct action.
- AE11. **Covers R29, R30.** Given a segment followed by later main segments, when the user adds a segment before or after it, later main segments shift to make room and the UI labels use `segment` terminology.
- AE12. **Covers R31, R32, R35.** Given an image or video segment with a prompt plus related audio or IC-LoRA video track content, when the user confirms Convert to Text, the prompt and related tracks remain while the main visual media is removed.
- AE13. **Covers R31, R33, R34.** Given a text or media segment with a prompt, when the user chooses Convert to Image or Convert to Video and selects a file, the segment keeps its prompt and receives the chosen media type.

---

## Success Criteria

- Users can complete the Shot List workflow without needing the old v1 branch or manual timeline reconstruction.
- Users can move Shot List text in and out of the modal via `.txt` files without manual copy/paste as the only path.
- Users can distinguish loading text into the modal from applying that text to the timeline.
- Destructive or warning Shot List actions feel native to the app and do not rely on browser confirmation dialogs.
- Users can adjust a segment's duration directly and see later segments ripple in a predictable way.
- Users can perform common timeline cleanup actions without manual drag-and-delete sequences.
- Users can use right-click segment actions for ripple delete, adjacent segment insertion, and media-type conversion without losing prompts or related audio / IC-LoRA video context.
- Destructive timeline actions are clearly confirmed in-app before they change timeline or node state.
- Future upstream syncs have fewer conflict points because TWL feature code is isolated behind a small seam.
- A planning or implementation agent can identify what is required now, what is deferred, and what must not be changed.

---

## Scope Boundaries

- Global prompt UI or behavior changes are out of scope for this execution slice.
- Prompt modal work from v1 is out of scope because upstream v2 already supports resizing prompt text areas.
- Old v1 example workflows are out of scope unless separately reprioritized.
- Broad v1 changes to unrelated files are out of scope unless tied to a specifically selected feature.
- Upstream's existing Delete action should not be replaced, moved, or redefined by this TWL slice.
- Timeline actions not named in this requirements document remain deferred backlog candidates only.
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
- Timeline actions are now reprioritized: Ripple Delete, Ripple Delete Gaps, Trim to Last Clip, Reset Timeline, Reset All, Add Segment Before/After, and Convert to Text/Image/Video are the selected next v1-to-v2 migration slice.
- Keep upstream Delete unchanged: TWL Ripple Delete should be additive rather than replacing the original author's Delete behavior.
- Use segment terminology: v1's `shot` labels should become `segment` labels in v2-facing UI.
- Preserve context during conversion: Convert-to-text removes main visual media but keeps prompt, audio, and IC-LoRA video track context; convert-to-image and convert-to-video keep the prompt while asking the user for media.
- Keep backlog candidates explicit: Partial memory of other v1 timeline actions should not become accidental implementation scope.

---

## Dependencies / Assumptions

- The existing integration strategy in `docs/twl-upstream-integration-strategy.md` remains the architectural constraint for this work.
- The committed Shot List parser/test files are available for the Shot List UI to use.
- The `ltx-director-v1-twlai` branch remains a useful behavioral reference for file import into the old Shot Script modal and the custom confirmation modal pattern.
- The current v2 LTX Director global prompt and prompt text-area behavior should be preserved.
- Segment duration editing is expected to be achievable as UI behavior without backend Python changes unless planning discovers otherwise.
- The existing plugin seam is expected to be sufficient for the next timeline-actions slice; additional direct edits to `js/ltx_director.js` should be treated as a planning concern that requires specific justification.
- Existing v2 right-click menus and upload helpers are expected to be reusable by TWL add-ons unless planning discovers a seam limitation.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What is the smallest safe plugin seam that survives node creation, workflow load, and future upstream edits?
- [Affects R4-R9][Technical] Where should the Shot List entry point appear in the current v2 UI so it feels native and does not compete with upstream controls?
- [Affects R13][Technical] What is the smallest reusable in-app confirmation modal pattern to carry forward from v1 without reintroducing broad v1 prompt-modal behavior?
- [Affects R14-R16][Technical] How should ripple duration editing handle overlaps, gaps, locked media duration limits, and end-of-timeline growth in the current v2 timeline model?
- [Affects R20-R35][Technical] Can the confirmed timeline actions be added entirely through the existing plugin seam, or does the seam need a small additional hook for right-click menu extension?
- [Affects R21, R22, R28, R30][Technical] How should ripple actions handle linked video/audio siblings, motion segments, existing gaps, and multi-selection in the current v2 timeline model?
- [Affects R24, R25][Technical] What exact current v2 state belongs to Reset Timeline versus Reset All while preserving the user-facing distinction captured here?
- [Affects R31-R35][Technical] Which existing v2 media upload and segment replacement helpers can be reused for Convert to Image and Convert to Video without duplicating upstream logic?

---
title: feat: Polish Shot List file workflow
type: feat
status: completed
date: 2026-06-21
origin: docs/brainstorms/twl-ltx-director-addons-requirements.md
---

# feat: Polish Shot List file workflow

## Summary

Polish the existing TWL Shot List add-on by separating file load/save actions from timeline mutation, replacing browser confirmations with an in-app confirmation flow, and updating tests around the new modal behavior. The plan keeps the work in TWL-owned frontend code behind the existing plugin seam and does not reopen the broader completed add-ons slice.

---

## Problem Frame

The current v2 Shot List modal exposes the right core workflow, but file-oriented import/export and destructive confirmation behavior still lag behind useful v1 UX. Users need to move Shot List text in and out of `.txt` files, review or edit that text before applying it, and confirm destructive or warning states without browser-native dialogs.

---

## Requirements

- R1. The LTX Director UI must expose a small plugin seam that allows TWL-owned add-ons to run after the timeline editor is available.
- R2. TWL-specific UI behavior must live outside broad upstream-owned editor code wherever practical.
- R3. User-facing labels must use upstream-compatible terminology, especially `segment` for image, video, and text prompt timeline items.
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
- R17. The first execution slice must not change global prompt behavior.
- R18. The first execution slice must not reintroduce v1 prompt modal behavior.
- R19. Deferred v1 UI/UX items must be recorded as backlog candidates, not silently pulled into this execution slice.

**Origin actors:** A1 LTX Director user, A2 fork maintainer, A3 future planning or implementation agent

**Origin flows:** F1 Shot List export, F2 Shot List import, F4 Upstream-safe feature extension

**Origin acceptance examples:** AE1 `.txt` Shot List export, AE2 replace apply with in-app confirmation, AE3 append apply, AE4 `.txt` load into textarea, AE5 warning confirmation in app, AE7 preserve upstream prompt behavior

---

## Scope Boundaries

- Do not change backend Python execution behavior.
- Do not rework the existing plugin seam unless implementation discovers a direct blocker.
- Do not change global prompt or prompt-modal behavior beyond preserving the current v2 Shot List `GLOBAL:` handling.
- Do not port v1 prompt modals, old example workflows, timeline trim actions, ripple delete gaps / close gaps, context-menu conveniences, or other v1 backlog items.
- Do not treat file load as timeline import: loading a `.txt` only updates the modal textarea until the user applies the Shot List.
- Do not remove the ability to refresh the modal text from the current timeline; keep that as a distinct action from saving `.txt`.

### Deferred to Follow-Up Work

- Segment duration editing polish from the broader origin remains outside this follow-up plan unless a separate active plan reprioritizes it.
- Broader reusable modal adoption outside Shot List can happen later if more TWL add-ons need confirmation UX.

---

## Context & Research

### Relevant Code and Patterns

- `js/ltx_director.js` already exposes `globalThis.LTXDirectorPlugins`, `registerLTXDirectorPlugin`, failure-isolated plugin installation, and cleanup hooks.
- `js/ltx_director_twl_shot_list_ui.js` owns the current Shot List modal, export-to-textarea behavior, copy button, replace/append apply helpers, and current browser `confirm()` calls.
- `js/ltx_director_twl_shot_script.js` owns Shot List parsing and formatting through `globalThis.LTXDirectorShotList`; the polish should reuse it rather than duplicate parser rules.
- `tests/ltx_director_twl_shot_list_ui.test.js` already covers helper behavior for export ordering, append positioning, replace, global prompt preservation, and invalid input no-mutation.
- `tests/ltx_director_twl_shot_script.test.js` includes user-facing label assertions that currently expect `Import Shot List` and must be updated with the apply/file-action language.
- The v1 branch is a behavioral reference for hidden `.txt` file input, blob download, and an in-app confirm modal, but should not be ported wholesale.

### Institutional Learnings

- `docs/twl-upstream-integration-strategy.md` says to avoid broad edits to upstream-heavy files and keep TWL UI behavior in `js/ltx_director_twl_*` files behind the plugin seam.
- `docs/solutions/conventions/twl-parser-file-naming-convention-2026-06-20.md` reinforces keeping TWL-owned files clearly named with `twl` and updating references/tests systematically when labels or files change.
- `docs/plans/2026-06-20-001-feat-twl-ltx-director-addons-plan.md` is completed historical context: it established the existing seam and Shot List UI but does not carry progress state for this follow-up.

### External References

- No external research was used. This work is repo-specific and has clear local patterns.

---

## Key Technical Decisions

- Keep the confirm UI TWL-owned: add or extend a reusable in-app confirmation helper in TWL-owned frontend code instead of modifying the upstream-heavy editor file.
- Use async apply flow: replace synchronous browser confirmations with a preview, awaited in-app confirmation, and only then timeline mutation.
- Combine replace and warning confirmations: when replace mode and parser warnings both apply, show one confirmation that communicates both risks instead of stacking prompts.
- Split modal actions by intent: `Load .txt` updates the textarea, `Refresh from Timeline` regenerates the textarea from the editor, `Save .txt` saves the current textarea contents, and `Apply Shot List` mutates the timeline.
- Preserve user text before overwriting: if file load or refresh-from-timeline would replace edited or loaded modal text, require the same in-app confirmation pattern before changing the textarea.
- Prefer injectable helper/source tests around browser UI behavior and existing helper tests for timeline mutation; use manual ComfyUI verification for file-picker details that are hard to prove in Node without adding a DOM harness.

---

## Open Questions

### Resolved During Planning

- Should `.txt` export save regenerated timeline text or current modal text? Use both actions: `Refresh from Timeline` regenerates from the editor, while `Save .txt` saves the current textarea contents.
- Should the confirmation modal be introduced globally in `js/ltx_director.js`? No. Keep it TWL-owned unless implementation discovers a concrete need for upstream-owned integration.
- Should replace confirmation and parser warning confirmation be separate prompts? No. Combine them into one in-app confirmation when both apply.
- Should loading a `.txt` immediately apply it to the timeline? No. It only populates the textarea for review/editing.

### Deferred to Implementation

- Exact confirm helper shape and export surface: choose the smallest reusable function or object that fits the current TWL add-on without over-abstracting.
- Exact text for non-critical button and status copy: keep labels clear and native-feeling, but tune wording during implementation.
- Exact browser file API fallback: use current browser capabilities and fallback download/input patterns where practical.

---

## Implementation Units

### U1. Add reusable in-app confirmation helper

**Goal:** Provide a TWL-owned confirmation flow that can replace Shot List browser `confirm()` calls and be reused by nearby TWL add-ons if needed.

**Requirements:** R2, R13, R17, R18; supports F2, F4, AE2, AE5, AE7

**Dependencies:** None

**Files:**
- Modify: `js/ltx_director_twl_shot_list_ui.js`
- Test: `tests/ltx_director_twl_shot_list_ui.test.js`
- Test: `tests/ltx_director_twl_shot_script.test.js`

**Approach:**
- Add a small promise-based in-app confirmation helper in TWL-owned UI code.
- Mirror the v1 confirm modal behavior at a product level: title, message, confirm/cancel labels, cancel on backdrop/Escape, focus management, and cleanup after resolution.
- Include baseline dialog accessibility: semantic dialog role, modal state, labelled title/description, keyboard-operable controls, focus trap while open, Escape cancel, and focus restoration to the triggering control.
- Keep styles scoped to TWL Shot List/add-on classes so this does not revive v1 prompt-modal behavior.
- Expose the helper through the existing Shot List UI API only if tests or future TWL add-ons need direct access.

**Execution note:** Start with source-level or injectable helper coverage that proves `confirm()` is no longer required before replacing the apply flow.

**Patterns to follow:**
- Existing modal style injection and cleanup in `js/ltx_director_twl_shot_list_ui.js`.
- v1 branch confirm modal behavior as a reference for UX, not as code to paste wholesale.
- Existing plugin cleanup hooks on `editor._ltxDirectorPluginCleanup`.

**Test scenarios:**
- Happy path: Given the helper is opened, confirming resolves truthy and removes the modal from the document.
- Edge case: Given the helper is opened, canceling via cancel button, Escape, or backdrop resolves falsey and removes the modal.
- Edge case: Given the helper is opened by a focused control, tab navigation stays within the modal and focus returns to the triggering control after close.
- Error path: Given the apply flow is exercised in tests, replacing `window.confirm` with a throwing stub does not break the flow because browser confirm is not used.
- Integration: Given a Shot List modal is closed or plugin cleanup runs, any active TWL confirmation UI is removed.

**Verification:**
- No `confirm(` calls remain in the Shot List UI source.
- Confirmation UI appears inside the app using existing visual language.
- Existing Shot List helper tests still pass after the async confirmation helper is introduced.

---

### U2. Separate file load/save controls from timeline apply

**Goal:** Make the modal's file workflow explicit: load `.txt` into the textarea, refresh from the current timeline, save the current textarea as `.txt`, and reserve apply language for timeline mutation.

**Requirements:** R3, R4, R5, R6, R10, R11, R12; supports F1, F2, AE1, AE4

**Dependencies:** U1 for overwrite confirmation when loading a file or refreshing from timeline over edited or loaded text.

**Files:**
- Modify: `js/ltx_director_twl_shot_list_ui.js`
- Modify: `tests/ltx_director_twl_shot_script.test.js`
- Test: `tests/ltx_director_twl_shot_list_ui.test.js`

**Approach:**
- Rename the existing timeline-derived textarea population action to refresh-oriented language.
- Add a `.txt` load control that reads the selected file into the textarea and does not mutate editor timeline state.
- Add a `.txt` save control that saves the current textarea contents, including user edits or loaded file content.
- Keep copy behavior available and update user-facing labels/tests so file import, file export, refresh, copy, and apply are not conflated.
- Track enough modal state to know whether loading a file or refreshing from timeline would overwrite edited or loaded text, then use the in-app confirmation helper before replacing it.
- Validate file-oriented edge states in the modal: canceled selection is silent, unreadable files show inline error, empty files load but produce clear apply-time validation, and the file input resets so the same file can be selected again.
- Treat saving an empty textarea as allowed only if implementation provides clear feedback; otherwise disable or block save with an inline message.

**Patterns to follow:**
- Hidden file input pattern from v1 Shot List and current upload controls.
- Blob download fallback pattern from v1 Shot List and current timeline save fallback.
- Existing label assertion style in `tests/ltx_director_twl_shot_script.test.js`.

**Test scenarios:**
- Covers AE1. Happy path: Given textarea content, saving `.txt` creates a text/plain download with that content and a `.txt` filename.
- Covers AE4. Happy path: Given a selected `.txt` file, loading it places the file text in the modal textarea and leaves `editor.timeline.segments` unchanged.
- Happy path: Given the timeline changes while the modal is open, refreshing from timeline regenerates the textarea from current editor state.
- Edge case: Given the user cancels file selection, textarea and status message remain unchanged.
- Edge case: Given edited textarea content and a file load, canceling the overwrite confirmation preserves the edited text.
- Edge case: Given edited or loaded textarea content and a refresh-from-timeline action, canceling the overwrite confirmation preserves the current textarea.
- Edge case: Given the same file is selected twice, the file input reset allows the second selection to be processed.
- Edge case: Given an empty file loads successfully, applying it produces inline parser validation without timeline mutation.
- Error path: Given file reading fails, the modal shows inline feedback and preserves existing textarea content.
- Integration: User-facing source assertions no longer expect the timeline-changing action to be called `Import Shot List`.

**Verification:**
- File load changes only modal text until `Apply Shot List` is clicked.
- Save `.txt` works for freshly refreshed text, loaded text, and manually edited text.
- Labels make the distinction between file operations and timeline apply obvious.

---

### U3. Convert Shot List apply to async in-app confirmation

**Goal:** Replace browser confirmation during timeline apply with an async in-app confirmation flow that preserves current replace/append behavior and parser warning handling.

**Requirements:** R7, R8, R9, R12, R13, R17, R18; supports F2, AE2, AE3, AE5

**Dependencies:** U1, U2

**Files:**
- Modify: `js/ltx_director_twl_shot_list_ui.js`
- Test: `tests/ltx_director_twl_shot_list_ui.test.js`
- Test: `tests/ltx_director_twl_shot_script.test.js`

**Approach:**
- Rename the timeline-changing button to apply-oriented language.
- Parse and build a preview before any timeline mutation.
- If the preview is invalid, show inline parser feedback and do not open confirmation UI.
- If replace would remove existing main segments, require in-app confirmation before mutating.
- If parser warnings exist, require in-app confirmation before mutating in either replace or append mode.
- When replace and warnings both apply, show one confirmation that covers both the destructive replacement and the warning messages.
- Structure the combined confirmation so users can distinguish replacement risk from parser warnings; long warning lists should remain readable without overflowing the viewport.
- After confirmation, call the existing `applyShotListImport` path so editor sync, commit, render, global prompt handling, and append positioning remain centralized.

**Patterns to follow:**
- Current `buildShotListImport` and `applyShotListImport` helper separation.
- Current editor sync path inside `applyShotListImport`.
- Existing parser warnings from `js/ltx_director_twl_shot_script.js`.

**Test scenarios:**
- Covers AE2. Happy path: Given replace mode with existing segments, confirming the in-app prompt applies imported segments and updates editor state.
- Covers AE3. Happy path: Given append mode without warnings, applying appends imported shots after the latest existing main segment without destructive confirmation.
- Covers AE5. Happy path: Given warning-producing Shot List text, confirming the in-app warning prompt applies the import.
- Edge case: Given replace mode with warnings, the confirmation clearly presents both the replacement risk and warning details in one modal.
- Edge case: Given replace mode with no existing main segments, applying valid text does not require a destructive replacement prompt unless warnings exist.
- Error path: Given invalid Shot List text, apply shows parser feedback, does not open confirmation UI, and leaves timeline/global prompt state unchanged.
- Error path: Given replace mode or warnings, canceling the in-app confirmation leaves timeline/global prompt state unchanged and does not call commit/render.
- Integration: Given Shot List text with `GLOBAL:`, apply preserves the current v2 global prompt path and does not revive v1 prompt-modal behavior.

**Verification:**
- Replace, append, warning, cancel, and invalid-input flows behave predictably without browser-native dialogs.
- Timeline mutation remains centralized in the existing helper path after confirmation.
- Existing global prompt and non-main timeline state preservation tests continue to pass.

---

### U4. Tighten regression coverage and manual verification notes

**Goal:** Ensure the Shot List polish is covered by automated tests where practical and has explicit manual checks for browser-only behavior.

**Requirements:** R1, R2, R3, R4-R13, R17-R19; supports F1, F2, F4, AE1-AE5, AE7

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `tests/ltx_director_twl_shot_list_ui.test.js`
- Modify: `tests/ltx_director_twl_shot_script.test.js`
- Modify: `docs/plans/2026-06-21-001-feat-shot-list-polish-plan.md` only if implementation discovers plan drift that should be captured before execution continues

**Approach:**
- Extend existing helper tests rather than introducing a heavy browser harness by default.
- Add source-level assertions for user-facing label changes and removal of browser confirm usage.
- Factor browser-facing behavior into injectable helpers where practical so file save/load and confirmation outcomes can be tested in pure Node; only add a DOM test dependency if implementation cannot keep coverage meaningful without one.
- Keep tests focused on the confirmed polish slice and avoid pulling in unrelated v1 backlog coverage.

**Patterns to follow:**
- Existing Node test runner style in `tests/ltx_director_twl_shot_script.test.js` and `tests/ltx_director_twl_shot_list_ui.test.js`.
- Existing source assertions for user-facing terminology.
- Prior plan's preference for pure helper tests around TWL UI behavior.

**Test scenarios:**
- Happy path: Source assertions find file load/save, refresh, copy, and apply-oriented labels.
- Happy path: Helper tests cover file-load-to-textarea and save-current-text behavior with stubs, or a documented DOM harness if pure helpers prove insufficient.
- Edge case: Dirty textarea overwrite confirmation cancel preserves textarea text.
- Edge case: Refresh-from-timeline overwrite confirmation cancel preserves textarea text.
- Error path: Browser confirm is absent from Shot List UI source and a throwing `window.confirm` stub does not affect apply tests.
- Integration: Existing parser/export tests still pass, confirming Shot List format behavior was not changed by UI polish.

**Verification:**
- Automated tests cover parser, helper, label, confirmation, and no-mutation cases.
- Manual ComfyUI check confirms the modal opens, file picker/download paths work in the browser, no duplicate controls appear after node reload, and the node loads without console errors caused by the add-on.

---

## System-Wide Impact

- **Interaction graph:** The Shot List modal remains installed through the existing plugin seam and interacts with the editor through current helper functions and sync methods.
- **Error propagation:** Parser errors and file read failures should surface inline in the modal; destructive or warning states should route through in-app confirmation.
- **State lifecycle risks:** Async confirmation creates a gap between preview and mutation, so implementation should ensure cancel paths do not mutate timeline/global prompt state.
- **Accessibility:** Confirmation and status flows should be keyboard operable, screen-reader legible, and should not strand focus after modal close.
- **API surface parity:** No Python backend or public node schema changes are expected.
- **Integration coverage:** Browser file picker/download behavior requires manual ComfyUI verification in addition to helper/source tests.
- **Unchanged invariants:** Current Shot List parsing format, v2 global prompt synchronization, plugin seam behavior, audio/motion preservation, and deferred v1 backlog boundaries remain unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Async confirmation accidentally mutates before the user confirms | Keep the apply flow as preview first, await confirmation, then call the mutation helper only after confirmation. |
| File load overwrites unsaved textarea edits | Track dirty modal text and confirm before replacing it with file contents. |
| Refresh from timeline overwrites loaded or edited textarea text | Use the same overwrite confirmation guard as file load before refreshing over dirty text. |
| UI labels become more confusing while adding controls | Split labels by intent: load/save files, refresh from timeline, apply to timeline. Update source assertions to lock in the distinction. |
| Browser file APIs are difficult to fully test in Node | Cover helper/source behavior automatically and require manual ComfyUI verification for picker/download behavior. |
| Reusable confirm helper grows into premature framework code | Keep it small and TWL-owned; defer broader modal adoption until another add-on needs it. |

---

## Documentation / Operational Notes

- No README update is required unless implementation changes visible user-facing workflow enough that maintainers want the Shot List instructions documented.
- Manual verification should include at least one browser with the standard download fallback path if native file picker APIs are unavailable.

---

## Sources & References

- **Origin document:** [docs/brainstorms/twl-ltx-director-addons-requirements.md](../brainstorms/twl-ltx-director-addons-requirements.md)
- **Prior completed plan:** [docs/plans/2026-06-20-001-feat-twl-ltx-director-addons-plan.md](2026-06-20-001-feat-twl-ltx-director-addons-plan.md)
- **Integration strategy:** [docs/twl-upstream-integration-strategy.md](../twl-upstream-integration-strategy.md)
- Related code: `js/ltx_director_twl_shot_list_ui.js`
- Related code: `js/ltx_director_twl_shot_script.js`
- Related tests: `tests/ltx_director_twl_shot_list_ui.test.js`
- Related tests: `tests/ltx_director_twl_shot_script.test.js`

---
title: LTX Director Shot List Modal Boundaries and Metadata Round Trip
date: 2026-06-21
category: ui-bugs
module: LTX Director TWL Shot List
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - Shot List modal controls conflated file load/save actions with timeline mutation.
  - Loading a file or refreshing from the timeline could overwrite edited modal text without scoped confirmation.
  - VIDEO width and height metadata did not reliably round-trip through export, parse, and apply.
  - Width and height values of 0 were dropped or rejected instead of preserved.
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - ltx-director-twl-shot-script
  - shot-list-tests
tags:
  - ltx-director
  - shot-list
  - modal
  - video-metadata
  - width-height
  - round-trip
  - async-guards
---

# LTX Director Shot List Modal Boundaries and Metadata Round Trip

## Problem

The TWL Shot List modal mixed text-file operations with timeline mutation, which made it too easy to overwrite loaded or edited text and unclear when the timeline would change. The Shot List `VIDEO` metadata path also failed to preserve `custom_width` and `custom_height` consistently, especially when either value was `0`.

## Symptoms

- `Load`, refresh, save, and apply behavior was ambiguous from the modal controls.
- Browser-native `confirm()` interrupted the ComfyUI/LTX Director modal flow and could not be styled or scoped to the TWL UI.
- Loading a `.txt` file or refreshing from the timeline could replace modal text without an in-app overwrite guard.
- Async file and confirmation flows needed stale-state checks so closed modals could not mutate UI or editor state.
- `VIDEO width: 0` and `VIDEO height: 0` were treated like missing values in parts of the export/parse/apply path.

## What Didn't Work

- Treating file load as timeline import was the wrong model. Users need to load text into the modal, review or edit it, then explicitly apply it.
- Browser `confirm()` was a poor fit for this plugin UI because it is global, synchronous, unstyled, and hard to clean up when the Shot List modal closes.
- Truthiness checks for numeric metadata were unsafe. In this domain, `0` is a valid widget value and must not be treated as absent.
- Mutating the timeline before confirmation made cancel and stale-modal cases risky. The apply flow needed to preview first, then mutate only after confirmation.

## Solution

Separate the modal controls by state boundary in `js/ltx_director_twl_shot_list_ui.js`:

- `Load .txt` reads a selected text file into the modal textarea only.
- `Refresh from Timeline` regenerates the textarea from current editor segments.
- `Save .txt` downloads the current textarea contents.
- `Apply Shot List` is the only action that mutates the timeline.
- Successful apply closes the Shot List modal.

Replace browser confirmation with a TWL-owned async confirmation modal:

- Use an in-app modal helper with `role="dialog"` and `aria-modal="true"`.
- Resolve a promise from confirm, cancel, Escape, or backdrop click.
- Clean up active confirmation UI when the Shot List modal closes and restore focus afterward.
- Render parser warnings as a styled warning block inside the confirmation UI.

Preview before applying timeline changes:

```js
const preview = buildShotListImport(editor, text, { mode });
const confirmation = buildApplyConfirmation(editor, preview, { mode });

if (confirmation) {
  const confirmed = await openConfirmModal(confirmation);
  if (!confirmed) return { applied: false, preview };
}

if (!shouldApply()) return { applied: false, preview };

return { applied: true, preview: applyShotListImport(editor, text, { mode }) };
```

Guard modal text replacement:

- Track whether textarea content came from the timeline or user-loaded/edited text.
- Ask for confirmation before loading a file over edited or loaded text.
- Ask for confirmation before refreshing from the timeline over edited or loaded text.
- Use a file-load request id plus `modal.isConnected` checks to ignore stale reads.
- Reset the file input value so selecting the same file again still fires `change`.

Fix the `VIDEO` width/height round trip across `js/ltx_director_twl_shot_script.js` and the UI apply path:

- Read editor `custom_width` and `custom_height` in `getVideoMetadata()`.
- Pass those values from `exportEditorShotList()` into `exportShotList()`.
- Serialize width and height when they are finite and non-negative, so `0` is included.
- Parse `width: 0` and `height: 0` with non-negative integer validation.
- Apply parsed `VIDEO` width and height back to `custom_width` and `custom_height` widgets.

```js
if (Number.isFinite(width) && width >= 0) {
  lines.push(`width: ${Math.round(width)}`);
}
```

```js
if (Number.isFinite(width) && width >= 0) {
  applied = setWidgetValue(editor, "custom_width", Math.round(width)) || applied;
}
```

Tests in `tests/ltx_director_twl_shot_list_ui.test.js` and `tests/ltx_director_twl_shot_script.test.js` lock down the critical behavior:

- Export includes custom width/height widgets.
- Apply writes `VIDEO` width/height to custom widgets and properties.
- Zero width/height values export, parse, and apply.
- Confirmation combines replace risk and parser warnings.
- Cancel preserves timeline state.
- Stale async apply guards prevent mutation.
- UX-critical labels stay as `Load .txt`, `Refresh from Timeline`, `Save .txt`, and `Apply Shot List`.
- Browser `confirm(` does not reappear in the TWL Shot List UI.

Verification:

```bash
node --test tests/*.test.js
```

## Why This Works

Separating file operations from timeline apply matches the user workflow. Text can be loaded, edited, saved, copied, or refreshed without mutating editor state, and timeline mutation becomes one deliberate final action.

The async confirmation modal keeps destructive and warning decisions inside the app lifecycle. Because apply previews first and mutates only after confirmation, cancel paths and stale modal paths preserve the timeline and global prompt state.

The metadata fix works because each layer treats `0` as a valid non-negative integer instead of a falsy missing value. Export, parse, and apply now use explicit numeric validation rather than truthiness.

Keeping mutation centralized through `applyShotListImport()` preserves existing editor synchronization behavior: segment replacement or append, global prompt handling, widget sync, commit, render, and timeline growth remain in one path.

## Prevention

- Name UI controls by state boundary. File load/save should not imply timeline mutation, and apply/import should not imply file I/O.
- Avoid browser-native `confirm()` inside scoped plugin modals. Use owned async confirmation UI with cleanup and stale guards.
- In async modal or file flows, check both request identity and `modal.isConnected` before writing UI state or mutating editor state.
- Do not use truthiness for numeric metadata when `0` is valid. For integer fields like width and height, validate finite non-negative numbers and normalize deliberately with `Math.round()`.
- Keep parser, formatter, exporter, and apply tests paired for round-trip metadata.
- Add source-level label assertions when ambiguous labels previously caused workflow defects.

## Related Issues

- `docs/plans/2026-06-21-001-feat-shot-list-polish-plan.md` captured the implementation plan for this fix.
- `docs/solutions/conventions/twl-parser-file-naming-convention-2026-06-20.md` is related only by TWL parser ownership and naming conventions, not by root cause or solution.

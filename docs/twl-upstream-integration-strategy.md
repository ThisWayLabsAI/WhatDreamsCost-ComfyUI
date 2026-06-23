# TWL Upstream Integration Strategy

Last updated: 2026-06-20

## Goal

Preserve selected TWL UI/UX improvements while keeping this fork easy to update from the original upstream LTX Director project.

The current v2 branch is based on the original author's newer implementation. The older `ltx-director-v1-twlai` branch contains useful TWL UX work, but it was built against an older structure. Directly merging that branch creates large conflicts in upstream-owned files, especially `js/ltx_director.js` and `ltx_director.py`.

## Integration Rule

Do not merge `ltx-director-v1-twlai` wholesale into the v2 branch.

Port individual features in small slices. Each port should have a clear purpose, minimal touched files, and a small commit that can be reviewed or reverted independently.

## Upstream-Owned Files

Treat these files as high-collision upstream surfaces:

- `js/ltx_director.js`
- `ltx_director.py`
- `README.md`

Avoid broad rewrites in these files. Prefer small, stable integration seams in `js/ltx_director.js` and avoid `ltx_director.py` unless a feature requires backend execution behavior.

## Plugin Seam Strategy

Use a tiny plugin seam in `js/ltx_director.js` so TWL-owned UI features can live in separate files.

The intended seam is a small global plugin registry that runs after `TimelineEditor` is created. Conceptually:

```js
globalThis.LTXDirectorPlugins = globalThis.LTXDirectorPlugins || [];

function installLTXDirectorPlugins(editor, node) {
  for (const plugin of globalThis.LTXDirectorPlugins) {
    plugin(editor, node);
  }
}
```

After the upstream editor is created:

```js
self._timelineEditor = new TimelineEditor(self, container, widget);
installLTXDirectorPlugins(self._timelineEditor, self);
```

This keeps future upstream merges focused on preserving a tiny hook instead of repeatedly resolving large feature conflicts inside the main editor file.

## TWL-Owned Files

New TWL-specific UI files should include `twl` in the filename so ownership is obvious during future diffs and merges.

Recommended names:

- `js/ltx_director_twl_shot_list_ui.js`
- `js/ltx_director_twl_segment_duration_ui.js`
- `js/ltx_director_twl_addons.js` for shared installer/helper code if needed

Avoid `twl` in user-facing UI labels unless the feature is intentionally branded. User-facing labels should remain generic, such as `Shot List` or `Edit Segment Duration`.

The committed parser files also follow the `twl` prefix convention now:

- `js/ltx_director_twl_shot_script.js`
- `js/ltx_director_twl_shot_script.d.ts`
- `tests/ltx_director_twl_shot_script.test.js`

## Current TWL Add-ons

These selected v1 TWL improvements have been ported through the plugin seam:

1. Shot List UI
    - Uses the committed shot-list parser/exporter.
   - Adds view/import/export behavior for timeline segments.
   - Supports replacing or appending main timeline segments.
   - Syncs `GLOBAL:` text through the current v2 global prompt path.
   - Lives in a TWL-owned JS add-on file.

2. Segment Duration UI
    - Lets users edit segment duration directly.
    - Should follow the upstream author's terminology: image, video, and text prompt items are `segments`.
   - Updates existing timeline state and calls existing editor synchronization methods rather than replacing upstream timeline logic.
   - Ripples following main segments by the duration delta.

3. Timeline Actions UI
   - Adds a TWL-owned Timeline Actions container for ripple delete, ripple delete gaps, trim to last clip, reset timeline, and reset all.
   - Extends segment right-click menus with additive TWL actions while preserving upstream Delete behavior.
   - Supports Add Segment Before/After and Convert to Text/Image/Video using v2 `segment` terminology.
   - Uses in-app confirmation behavior for destructive actions.

## Explicitly Deferred

Do not port these unless reprioritized later:

- Global prompt UI/behavior changes from v1, because upstream v2 already changed this area.
- Prompt modal work from v1, because upstream v2 now supports resizing global and segment prompt text areas.
- Old v1 example workflows, unless a specific example is needed.
- Broad v1 changes to unrelated files such as `load_audio_ui.js`, `load_video_ui.js`, `multi_image_loader.js`, `patches.py`, or `prompt_relay.py` unless tied to a specific selected feature.
- Other v1 UX items not explicitly listed under Current TWL Add-ons until reviewed against current v2 behavior and explicitly reprioritized.

## Commit Strategy

Keep commits small and feature-scoped:

- One commit for the plugin seam.
- One commit for Shot List UI.
- One commit for Segment Duration UI.
- One commit for Timeline Actions UI.
- One commit for README updates after the feature exists.

This creates a patch stack that is easier to rebase onto future upstream updates.

## Verification Strategy

For each TWL UI add-on:

- Run parser/unit tests when parser behavior is touched.
- Manually verify the ComfyUI node loads without console errors.
- Verify existing upstream editor behavior still works.
- Verify the add-on survives node creation, workflow load, and timeline save/load.

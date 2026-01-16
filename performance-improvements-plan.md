# Performance Improvements Plan

## 0) Implementation instructions (global)

- Only implement one item at a time. Confirm with me that I am happy with your work and happy to start the next item before moving on
- Before starting to implement an item, re-evaluate the item's plan considering what has actually been implemented for previous items. Based on what you implement for previous items, if there is any part of the current item's plan that you now think could/should change as a result, then call it out. If not, then state as much
- Always run `npm run test`, `npm run lint`, and `npm run prettier:verify` at the end of each task and verify all tests pass and changes a ready to commit. If any of these fail, then fix them without affecting the tests (eg don't just remove or bypass a test because that is easier, actually fix it)
- If `npm run lint` fails due to its glob/patterns, run `npx eslint` on the staged/changed files to ensure lint errors are still caught.
- After running the test/lint/prettier checks, validate a deployment based on tracked changes with `sf project deploy start --source-dir force-app --dry-run`. If validation fails, fix the issues without compromising the intent of the item’s solution
- Add a small line of text in the board UI with a unique 3-word combo (e.g., `lion-pear-car`) so I can verify I’m on the latest deploy. Each time you edit any code, change this value and tell me to deploy and what the new value is.
- Once above tests pass, then I will deploy it and test in my org. State how I should test it and what performance improvement I should notice
- Once I state I am happy with the changes, document what you actually implemented in a "Implemented Solution" section for each item, calling out any differences from the items plan
- Once I confirm that an item is complete, mark is "Completed", write a short commit message and remind me to commit changes, and then ask if I want to start the next one

## Cleanup

- Remove the 3-word UI version string when we’re done.

## Tracking (lightweight)

- Item 1: Fully specified
- Item 2: Fully specified
- Item 3: Fully specified
- Item 4: Fully specified
- Item 5: Fully specified
- Item 6: Fully specified
- Item 7: Fully specified
- Item 8: Pending
- Item 9: Pending

## Resume prompt

Please continue item 8 (virtualize cards per column) and item 9 (server-side filtering/search/pagination) in performance-improvements-plan.md. For each item, restate the item in plain English, ask if I understand it or want clarifications, then ask one implementation question at a time with an explainer. Keep going until you’re 95% confident.

## 1) Item: Skip full filter-definition rebuilds when records are unchanged (Completed)

**What it is**
Filter definitions are the data objects that drive the filter dropdowns (field, options, selected values, open state, button class). Today they are rebuilt by scanning the full `relatedRecords` dataset every time `rebuildColumnsWithPicklist()` runs.

**Why it matters**
Filter definition building is O(n) over all records and is triggered by interactions like search and filter toggles. With 100+ records, this repeated scan adds noticeable lag even though the underlying dataset hasn’t changed.

**High-level approach**
Rebuild filter definitions only when the record snapshot or filter field configuration changes. For search/filter interactions, reuse existing definitions and only update selection state, then rebuild columns.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`
- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- `force-app/main/default/lwc/lresKanbanExplorer/filterUtils.js`

**Possible strategy**

- Mark filters dirty in `handleConfigChange()` on any config change.
- Mark filters dirty in `applyCardRecordsSnapshot()` whenever a new snapshot is applied.
- In `rebuildColumnsWithPicklist()`, rebuild filter definitions only when dirty, then clear the dirty flag immediately.
- Keep a defensive short-circuit inside `buildFilterDefinitions()` to skip work when filters are not dirty.
- Continue to call `updateFilterSelection()` on toggle events to keep UI state accurate.
- Store `filtersDirty` on the component instance, defaulting to `true`.
- When config is missing and state is cleared, leave `filtersDirty = true` so a later valid config rebuilds filters.
- When not dirty, keep minimal UI-state sync (active menu, button classes) without rebuilding options.
- Recompute `buttonClass` from `selectedValues` during the minimal sync.
- Validate `activeFilterMenuId` still exists; close menus if it does not.
- Recompute `isOpen` from `activeFilterMenuId` during the minimal sync.
- Keep menu outside-click listener state in sync (unregister when no menus are open).
- Add debug logging for “filters rebuilt vs skipped” and gate it behind `debugLogging`.
- Emit the “rebuilt vs skipped” logs inside `boardInteractions.buildFilterDefinitions()`.
- During minimal sync, recompute option `selected` flags from `selectedValues`.
- Prune invalid `selectedValues` during minimal sync to future-proof against stale options.
- Set `filtersDirty` regardless of `_isConnected` (so early lifecycle changes are captured).

**Risks and edge cases**

- Stale filter options if the snapshot change isn’t detected correctly.
- Filters that depend on display formatting (e.g., date/time format changes) may also need to mark filters as dirty.

### Implemented Solution

- Added `filtersDirty` tracking on the component, set to `true` on config changes, record snapshots, date/time format updates, and metadata (object/picklist) reloads.
- Updated `boardInteractions.buildFilterDefinitions()` to skip rebuilds when filters are clean, performing a lightweight UI sync (selection flags, button classes, open state, and stale selection pruning) and logging rebuilt vs skipped.
- Ensured filter rebuilds clear the dirty flag and keep menu outside-click listener state aligned.
- Added a unit test to confirm clean-filter sync behavior and stale selection pruning.

## 2) Item: Make search debounce trailing-only and remove duplicate event triggers

**What it is**
Switch search input handling to a trailing-only debounce and ensure only one event path triggers search updates (prefer `input` over both `input` + `keyup`).

**Why it matters**
The current search handlers can trigger frequent rebuilds while the user types, which compounds UI lag as record count grows.

**High-level approach**
Use a trailing-only debounce for search updates and wire a single event handler so each keystroke doesn’t schedule multiple rebuilds.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.html`
- `force-app/main/default/lwc/lresKanbanBoardActions/*`

**Possible strategy**

- Implement a dedicated search debounce wrapper to handle trailing debounce with leading edge on empty → non-empty.
- Remove duplicate wiring so only `input` triggers search updates.
- Keep debounce delay at 200ms for now.
- Use trailing debounce with a leading option only when the search transitions from empty to non-empty.
- Place the wrapper in `boardInteractions.js` alongside search handlers.
- Use a dedicated component field (e.g., `_searchDebounceHandler`) and update `clearDebouncedSearch()` to match.
- Detect empty → non-empty using the normalized (trimmed) value.
- Execute the leading call immediately (no debounce) on empty → non-empty.
- Remove unused `handleSearchKeyup` to avoid dead code.
- Add/update unit tests in both `lresKanbanExplorer` and `lresKanbanBoardActions` to cover search handler wiring and debounce behavior.
- Allow trailing call after a leading update on empty → non-empty.
- Normalize once in the wrapper and pass the normalized value through.

**Risks and edge cases**

- Slight delay before search updates (tune delay for usability).
- No additional debug logging for debounce timing.

## 3) Item: Coalesce heavy rebuilds into the next animation frame

**What it is**
Batch multiple rebuild triggers into a single `requestAnimationFrame` so the UI can paint before heavy work runs.

**Why it matters**
Rapid UI interactions can trigger repeated rebuilds; coalescing reduces redundant work and improves perceived responsiveness.

**High-level approach**
Wrap `rebuildColumnsWithPicklist()` calls in a scheduler that queues one rebuild per frame and cancels prior pending requests.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`

**Possible strategy**

- Schedule rebuilds in the specific user interaction handlers (search input + filter option toggle), not in `rebuildColumnsWithPicklist()`.
- Use a single shared RAF scheduler for search + filter toggles, track a pending RAF id on the component and cancel/reschedule as needed.
- RAF callback uses the latest component state (no captured args).
- Cancel any pending RAF callback in `disconnectedCallback()`.
- Ensure the final state is applied after the last interaction in a burst.
- Apply RAF coalescing only for user-driven rebuild triggers (search/filter/sort), not data refreshes.

**Risks and edge cases**

- Slight delay (1 frame) before updates appear.
- No additional debug logging for RAF scheduling.
- Tests should assert scheduling is triggered in the correct handlers (via `lresKanbanExplorer` tests), without relying on RAF timing.

## 4) Item: Memoize per-record field extraction/display values

**What it is**
Precompute and cache derived field values for each record once per snapshot, reuse them for filtering, search, sorting, and card rendering.

**Why it matters**
Field extraction and formatting are repeated across multiple passes (filters, search, summaries). Caching reduces redundant work.

**High-level approach**
Build a record-id keyed cache during `applyCardRecordsSnapshot()` and have extraction helpers read from it.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`
- `force-app/main/default/lwc/lresKanbanExplorer/columnBuilder.js`
- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`

**Possible strategy**

- Cache per-record computed values (raw + display) for fields used by filters/search/cards.
- Invalidate cache on snapshot/config changes.
- Key cache entries by fully qualified field names to avoid collisions.
- Store cache as `Map<recordId, Map<fieldName, { raw, display }>>` for performance and safety.
- Populate the cache eagerly on snapshot/config changes.
- Eagerly populate using the union of search, filter, card, sort, and summary fields.
- Wire cache usage into `extractFieldData` only (single integration point).
- If cache is missing for a field, fall back to the existing computation.
- Populate cache after record normalization (`normalizeCardRecords`).
- Clear/rebuild cache when the record snapshot or filter field configuration changes.
- Add debug logging for cache build/clear events, gated by `debugLogging`.
- Add unit tests in `lresKanbanExplorer` to confirm `extractFieldData` uses cached values (cache hit vs fallback).

**Risks and edge cases**

- Memory overhead and cache invalidation complexity.

## 5) Item: Defer summary calculations (placeholders first, compute after render)

**What it is**
Render the board immediately with placeholder summary values, then compute and populate summaries after the main UI has painted.

**Why it matters**
Summary calculations are synchronous today and block the main thread during rebuilds. Deferring them improves perceived responsiveness without relying on cache correctness.

**High-level approach**
Split summary rendering into two phases: a fast initial render (no summaries or placeholders), followed by an asynchronous summary computation pass that updates each column’s summaries.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/summaryValueUtils.js`
- `force-app/main/default/lwc/lresKanbanExplorer/columnBuilder.js`
- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`

**Possible strategy**

- Build columns without summaries in the first pass and display a small loading spinner per summary row (replacing each value).
- Schedule summary computation asynchronously for all columns via `requestAnimationFrame`, then update summaries in one pass.
- Reuse existing summary calculation logic (`buildLaneSummaries`) for the deferred pass.
- Update summaries by rebuilding a new `columns` array with updated summary data.
- Show summary spinners only when summaries are configured and there are records.
- Only show summary spinners for columns that have records.

**Risks and edge cases**

- Summaries appear after a short delay; users may notice the placeholder.
- Cancel or ignore stale summary computations if a new rebuild happens before completion.
- Delay summary warning messages until summaries are computed.
- Add unit tests in `lresKanbanExplorer` to verify deferred summary placeholders and eventual summary population.

## 6) Item: Reduce drag-and-drop UI lag (hover/dragover lifecycle)

**What it is**
Improve responsiveness of hover, dragover, and drop-target highlighting by reducing event churn and DOM work during drag operations.

**Why it matters**
The laggy hover/drag lifecycle is a major UX issue with large boards; users can’t tell if a card is grabbed or which column is targeted.

**High-level approach**
Minimize drag event work during interactions and avoid unnecessary re-renders while a drag is active.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanBoardContainer/lresKanbanBoardContainer.js`
- `force-app/main/default/lwc/lresKanbanColumn/lresKanbanColumn.js`
- `force-app/main/default/lwc/lresKanbanCard/lresKanbanCard.js`

**Possible strategy**

- Throttle dragover events so column highlight updates are rate-limited.
- Avoid state updates when the active drop target hasn’t changed.
- Consider lightweight CSS-only hover effects that do not trigger LWC state changes.
- Use a 50ms throttle interval for drag events.
- Implement throttling in `lresKanbanBoardContainer` for centralized control.
- Use always-on CSS-only dragged-card styling to avoid board-wide re-renders on drag start.
- Remove `draggedRecordId` propagation and rely on local CSS class updates for drag styling.
- Apply/remove the drag styling class within `lresKanbanCard` on dragstart/dragend.
- Update `lresKanbanCard` tests to validate the new drag styling behavior.
- Split into two sub-items: (A) dragover/dragenter/leave throttling + gating, (B) drag-start styling optimization.
- Apply the drag styling class directly to the card `<article>` element.
- Remove the drag styling class unconditionally on `dragend` (including canceled drags).
- Keep the existing `.is-dragging` class name.
- Keep drag-start styling visual-only (no ARIA changes for now).
- Keep dragenter/dragleave immediate (no throttling), only throttle dragover.
- Use leading + trailing behavior for dragover throttling.
- Implement dragover throttling with a simple manual timestamp check.
- Store throttle state as fields on `lresKanbanBoardContainer` for easy reset/cleanup.
- Reset throttle state on dragend, drop, and when leaving the board.
- Add basic tests to assert dragover gating behavior without timing assertions.
- Add dragover gating tests in `lresKanbanBoardContainer`.

**Risks and edge cases**

- Over-throttling can make highlight feedback feel sluggish.
- Need to ensure final drop target state is always applied.

## 7) Item: Optimistic drag-and-drop updates with partial refresh

**What it is**
Update the UI immediately on drop, update the record in the background, and refresh only affected columns (or roll back on error).

**Why it matters**
Dragging feels laggy because the UI waits for the server and a full refresh before reflecting the new column.

**High-level approach**
Adjust local state on drop, fire the update, then reconcile on success/failure without full refresh.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`
- `force-app/main/default/lwc/lresKanbanExplorer/columnBuilder.js`

**Possible strategy**

- Move the record between columns in memory immediately.
- Call `updateRecord`, then either commit or revert on error.
- Do not update counts/summaries optimistically; wait for server confirmation.
- Apply a visual-only move (update columns) without mutating `relatedRecords` until server confirmation.
- Always run the full Apex refresh after a successful drop to re-sync card details.
- On update failure, immediately revert the visual move before showing the error toast.
- Show a lightweight “saving” indicator on the moved card while the update is in flight.
- Start with a simple dimming CSS class for the saving state (can be upgraded to an icon later).
- Track saving state on the moved card object in `columns` (e.g., `card.isSaving`).
- Append the moved card to the bottom of the target column during the optimistic phase.
- Block further drags of a card while it is in the saving state.
- Keep the full-refresh loading overlay behavior after drop (no background refresh).
- Do not auto-scroll; leave visibility of appended card to the user.
- Add unit tests for optimistic drag/drop (visual move, saving state, rollback on error).
- Cover optimistic drag/drop in `lresKanbanExplorer` integration tests.

**Risks and edge cases**

- Need robust rollback on failure and careful sync with server state.

## 8) Item: Virtualize cards per column (windowing)

**What it is**
Render only visible cards per column with a small buffer; avoid rendering all cards at once.

**Why it matters**
Large DOM trees and per-card rendering cost are a major source of lag with 100+ records.

**High-level approach**
Introduce a windowing layer based on scroll position and only render a slice of records.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanColumn/lresKanbanColumn.js`
- `force-app/main/default/lwc/lresKanbanColumn/lresKanbanColumn.html`
- `force-app/main/default/lwc/lresKanbanBoardContainer/lresKanbanBoardContainer.js`
- `force-app/main/default/lwc/lresKanbanCard/lresKanbanCard.js`
- `force-app/main/default/lwc/lresKanbanBoardContainer/lresKanbanBoardContainer.css`

**Possible strategy**

- Track scroll position and compute a visible range + buffer.
- Render only the visible range and update on scroll.

**Risks and edge cases**

- Drag-and-drop interactions and scroll positioning need careful handling.

## 9) Item: Server-side filtering/search/pagination

**What it is**
Move filtering/search and paging into Apex so the client handles a smaller dataset.

**Why it matters**
Large datasets amplify client-side processing; server-side filtering reduces work in the browser.

**High-level approach**
Extend Apex to accept filter/search inputs and return paged results.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/dataModeService.js`
- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`
- Apex controller (e.g., `LRES_KanbanCardRecordsController`)

**Possible strategy**

- Add filter/search parameters to Apex methods.
- Implement paging and update the client to request pages.

**Risks and edge cases**

- More complex backend logic and possible changes to filter semantics.

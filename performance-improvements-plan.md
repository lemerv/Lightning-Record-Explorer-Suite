# Performance Improvements Plan

## 0) Implementation instructions (global)

- Work on only one plan item at a time. After finishing an item, wait for my explicit confirmation before starting the next.
- Before starting an item, re-evaluate its plan in light of what has already been implemented. If any part should change, discuss it with me first; after agreement, record the update in `performance-improvements-plan.md`. If no changes are needed, state that explicitly.
- Each time you edit code, update the 3-word UI marker (lowercase, hyphenated) in the same location as before, and tell me the new value so I can verify the deploy.
- Stage files before running any checks or validations.
- At the end of each item, run: `npm run test`, `npm run lint`, and `npm run prettier:verify`. Fix any failures properly (do not bypass tests).
- If `npm run lint` fails due to glob/pattern issues, run `npx eslint` on the staged/changed files and fix any lint errors found.
- After tests/lint/prettier pass, validate a deployment with: `sf project deploy start --source-dir force-app --dry-run`. If validation fails, fix it without changing the item’s intent.
- Once checks pass, tell me how to test in my org and what performance improvement to expect.
- After I confirm I’m happy with the changes, add an "Implemented Solution" section under the relevant item in `performance-improvements-plan.md`, noting any deviations from the plan.
- After I confirm the item is complete, mark it "Completed" at the end of the item title and in the `## Tracking (lightweight)` section, provide a short commit message, remind me to commit, and ask whether to start the next item.

## Cleanup

- Remove the 3-word UI version string when we’re done.

## Tracking (lightweight)

- Item 1: Completed
- Item 2: Completed
- Item 3: Completed
- Item 4: Completed
- Item 5: Completed
- Item 6: Completed
- Item 7: Completed
- Item 8: Completed
- Item 9: Fully specified
- Item 10: Completed
- Item 11: Completed
- Item 12: Fully specified

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

## 2) Item: Make search debounce trailing-only and remove duplicate event triggers (Completed)

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

### Implemented Solution

- Switched search input wiring to a single `searchinput` path and added a safe `change` fallback to cover Lightning input event differences without double-firing.
- Replaced the prior debounce with a trailing-only handler that normalizes the search value and only rebuilds after the debounce delay.
- Updated unit tests for board actions search events and search debounce behavior, plus adjusted search filter test timing to wait for the trailing update.

## 3) Item: Coalesce heavy rebuilds into the next animation frame (Completed)

**What it is**
Batch multiple rebuild triggers into a single `requestAnimationFrame` so the UI can paint before heavy work runs.

**Why it matters**
Rapid UI interactions can trigger repeated rebuilds; coalescing reduces redundant work and improves perceived responsiveness.

**High-level approach**
Wrap `rebuildColumnsWithPicklist()` calls in a scheduler that coalesces user-driven rebuilds with a short trailing debounce (200ms), optionally using `requestAnimationFrame` inside the scheduled callback, and cancels prior pending requests.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`

**Possible strategy**

- Schedule rebuilds in the specific user interaction handlers (search input + filter option toggle), not in `rebuildColumnsWithPicklist()`.
- Use a single shared scheduler for user-driven filter/sort rebuilds with a 200ms trailing debounce, track a pending timeout id on the component and cancel/reschedule as needed.
- Do not change the search debounce timing or behavior; keep search on its existing debounce.
- Use `requestAnimationFrame` inside the debounced callback (optional) so the UI can paint before the rebuild.
- Debounced callback uses the latest component state (no captured args).
- Cancel any pending debounced callback in `disconnectedCallback()`.
- Ensure the final state is applied after the last interaction in a burst.
- Apply RAF coalescing only for user-driven rebuild triggers (search/filter/sort), not data refreshes.

**Risks and edge cases**

- Slight delay (200ms + 1 frame) before updates appear.
- No additional debug logging for RAF scheduling.
- Tests should assert scheduling is triggered in the correct handlers (via `lresKanbanExplorer` tests), without relying on RAF timing.

### Implemented Solution

- Added a user-interaction scheduler that debounces filter/sort-triggered rebuilds for 200ms, then schedules the rebuild on the next animation frame to coalesce bursts and allow a paint.
- Routed filter option toggles, clear filters, sort field changes, and sort direction toggles through the user scheduler while keeping search on its existing debounce.
- Added component cleanup for pending user rebuild scheduling on disconnect.
- Updated unit tests to assert user rebuild scheduling for sort and filter interactions.

## 4) Item: Memoize per-record field extraction/display values (Completed)

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

### Implemented Solution

- Added a per-record field data cache populated after `normalizeCardRecords` and reused via `extractFieldData` for filter/search/sort/summary and card rendering.
- Built cache entries using the union of card, filter, search, sort, and summary fields (including currency code when needed).
- Cleared/rebuilt the cache on snapshot application, config changes, date/time format changes, and metadata reloads, with debug logging for build/clear events.
- Added a unit test to verify cached values are reused and cleared values fall back to live extraction.

## 5) Item: Defer summary calculations (placeholders first, compute after render) (Completed)

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

### Implemented Solution

- Deferred summary computation to the next animation frame and rendered per-summary spinners during the initial column build.
- Rebuilt columns with full summaries after the defer window, updating summary warnings once computed.
- Skipped placeholder summaries for empty columns and canceled pending summary rebuilds on disconnect.
- Added unit tests to cover placeholder rendering and summary warning timing after the deferred pass.

## 6) Item: Reduce drag-and-drop UI lag (hover/dragover lifecycle) (Completed)

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

### Implemented Solution

- Throttled dragover handling at the board container with leading/trailing updates and reset logic on drag end, drop, and board leave.
- Gated active drop target updates to avoid redundant state changes while keeping dragenter/dragleave immediate.
- Moved drag-start styling to a local card class toggle and removed dragged-record propagation.
- Added dragover throttling and card drag styling unit tests.

## 7) Item: Optimistic drag-and-drop updates with partial refresh (Completed)

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

### Implemented Solution

- Added an optimistic column move on drop that appends the card to the target column and marks it as `isSaving` while the update is in flight.
- Reverted the optimistic move on update failure before showing the error toast.
- Prevented dragging cards while saving and added a lightweight saving style.
- Kept counts and summaries unchanged during the optimistic phase, with a full refresh after a successful update.
- Added tests for optimistic move, saving state, and rollback behavior.

## 8) Item: Virtualize cards per column (windowing) (Completed)

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

- Virtualize per column since each column body is its own vertical scroll container.
- Measure actual card height per column; include the vertical gap in the row height.
- Initial render shows first 10 cards to measure height, then switch to windowed rendering.
- Render a buffer of 5 cards above and below the visible range.
- Throttle scroll handling via `requestAnimationFrame`.
- Recompute only on scroll and data changes (no resize handling).
- Re-measure height when card display configuration changes.
- Enable virtualization only when total cards in the full dataset exceed a configurable threshold.
- Add a numeric board config field (saved with the board config) for the threshold.
  - Label: “Performance Mode Threshold”
  - Help: “Improve performance by rendering only visible cards when total cards exceed this number. Enter a number from 100 upwards. If left blank the default is 200. Enter 0 to disable performance mode.”
  - Blank defaults to 200 at runtime; 0 disables; 1–99 silently auto-correct to 100.
  - Place second from last, above the debug logging checkbox.
- Keep column counts and summaries based on totals, not the rendered slice.
- Use spacer elements so scroll height reflects full card count.
- Keep drag/drop behavior unchanged (column body remains the drop target).
- Add unit tests for threshold gating, initial measurement/slice, and window range updates.

**Risks and edge cases**

- Drag-and-drop interactions and scroll positioning need careful handling.

### Implemented Solution

- Added a performance-mode threshold setting to enable/disable per-column virtualization (default 200, 0 disables).
- Implemented windowed card rendering with spacer rows and row-height measurement in the column component.
- Throttled scroll handling via `requestAnimationFrame` to update the visible slice.
- Kept counts/summaries based on full totals and left drag/drop behavior unchanged.
- Added tests for threshold gating, initial measurement slice, and window updates.

## 9) Item: Review implementation structure for utility extraction

**What it is**
Review all prior performance items to determine if any logic should be extracted into smaller utilities/helpers for maintainability.

**Why it matters**
The main component files are growing, and splitting out reusable helpers can improve readability and testability.

**High-level approach**
After all items are implemented, audit added logic, identify tightly-coupled vs reusable code, and propose refactors.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`
- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- `force-app/main/default/lwc/lresKanbanExplorer/columnBuilder.js`
- Any new helper modules introduced by prior items

**Possible strategy**

- Inventory new logic added in Items 1-8 and cluster by responsibility.
- Extract utility helpers only where it improves clarity without increasing indirection.
- Keep stateful/component-bound logic in the component; extract pure or stateless helpers.
- Update tests to cover any extracted helpers directly.
- Document any refactor decisions and trade-offs in the plan.

**Risks and edge cases**

- Over-refactoring could obscure the flow of component state changes.

### Findings

- `lresKanbanExplorer.js` now mixes core state/config with scheduling logic (user rebuild debounce, RAF scheduling, summary rebuild timing).
- `boardInteractions.js` includes both event handling and pure column-mutation logic for optimistic drag/drop.
- `lresKanbanColumn.js` contains DOM wiring plus virtualization math (range and spacer calculations).

### Proposed Follow-on Items

#### 10) Item: Extract scheduling helpers for rebuilds and summaries (Completed)

**What it is**
Move rebuild/scheduling orchestration (user debounce, RAF scheduling, summary rebuild timing) into a small helper module.

**Why**
`lresKanbanExplorer.js` has grown to include timing/queueing logic that is conceptually separate from config/state management.

**Concrete benefits**

- Reduces `lresKanbanExplorer.js` size and cognitive load.
- Makes timing logic easier to unit test and safer to tune.
- Localizes debounce/RAF behavior changes to one helper.

**Best practice alignment**
Yes—separating scheduling from component state aligns with separation of concerns and keeps components thin.

**Recommendation**
Yes, low urgency. Do this if scheduler behavior will continue to evolve.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/lresKanbanExplorer.js`
- New helper (e.g., `force-app/main/default/lwc/lresKanbanExplorer/schedulerUtils.js`)

**High-level approach**

- Extract user rebuild debounce and RAF scheduling into a helper.
- Extract summary rebuild scheduling into the same helper or a focused summary scheduler.
- Keep component state mutations in the component; helper returns scheduling handles or invokes callbacks.
- Add unit tests for timing behavior if extracted.

**Risks and edge cases**

- Over-abstraction could hide scheduling side effects if the helper isn’t kept small and focused.

##### Implemented Solution

- Extracted rebuild and summary scheduling into `schedulerUtils.js` with explicit helpers for user rebuild, RAF rebuild, and summary scheduling.
- Updated the component to delegate scheduling to the helper while preserving existing timing behavior.

#### 11) Item: Extract optimistic drag/drop column mutation helper (Completed)

**What it is**
Move the pure optimistic column move/revert logic out of `boardInteractions.js` into a helper function.

**Why**
`boardInteractions.js` now blends event orchestration with pure column mutation, making it harder to reason about.

**Concrete benefits**

- Clearer drop handling; mutation logic becomes a pure input → output transformation.
- Easier unit tests for optimistic move/revert behavior.
- Safer future tweaks to drag/drop behavior.

**Best practice alignment**
Yes—extracting pure functions improves readability and testability.

**Recommendation**
Yes, medium urgency if drag/drop behavior is expected to evolve; otherwise optional.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanExplorer/boardInteractions.js`
- New helper (e.g., `force-app/main/default/lwc/lresKanbanExplorer/dragDropUtils.js`)

**High-level approach**

- Move `buildOptimisticColumnsForDrop` into a helper module.
- Keep side effects (setting `component.columns`, logging, toasts) in `boardInteractions.js`.
- Add helper unit tests for the column transformation logic.

**Risks and edge cases**

- Must ensure any future column shape changes remain aligned with the helper output.

##### Implemented Solution

- Extracted the optimistic column mutation logic into `dragDropUtils.js` as a pure helper.
- Updated `boardInteractions.js` to delegate to the helper while keeping side effects in the component flow.

#### 12) Item: Extract virtualization math into a helper (optional)

**What it is**
Move window range and spacer calculations into a pure helper used by `lresKanbanColumn.js`.

**Why**
The column component mixes DOM measurement/scroll wiring with non-trivial math; the math can be isolated.

**Concrete benefits**

- Keeps `lresKanbanColumn.js` focused on DOM/lifecycle work.
- Simplifies unit tests for range calculations and buffer behavior.
- Easier to extend for future features (resize handling, dynamic row heights).

**Best practice alignment**
Yes—separating computation from DOM interaction improves maintainability.

**Recommendation**
Optional. Do this only if virtualization is likely to grow in complexity.

**Key components involved**

- `force-app/main/default/lwc/lresKanbanColumn/lresKanbanColumn.js`
- New helper (e.g., `force-app/main/default/lwc/lresKanbanColumn/virtualizationUtils.js`)

**High-level approach**

- Extract range calculation (start/end indices) and spacer sizing into a helper.
- Keep DOM measurement and scroll event handling in the component.
- Add unit tests for the helper with various scroll/height/buffer scenarios.

**Risks and edge cases**

- Helper must remain lightweight to avoid making simple logic feel indirect.

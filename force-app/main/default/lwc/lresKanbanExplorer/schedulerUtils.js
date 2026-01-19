export function scheduleRebuildColumns(component, rebuildCallback) {
  cancelScheduledRebuildColumns(component);
  if (typeof requestAnimationFrame === "function") {
    component._rebuildColumnsRafType = "raf";
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    component._rebuildColumnsRafId = requestAnimationFrame(() => {
      component._rebuildColumnsRafId = null;
      component._rebuildColumnsRafType = null;
      rebuildCallback();
    });
    return;
  }
  component._rebuildColumnsRafType = "timeout";
  // eslint-disable-next-line @lwc/lwc/no-async-operation
  component._rebuildColumnsRafId = setTimeout(() => {
    component._rebuildColumnsRafId = null;
    component._rebuildColumnsRafType = null;
    rebuildCallback();
  }, 0);
}

export function scheduleUserRebuild(component, rebuildCallback, delayMs = 200) {
  cancelScheduledUserRebuild(component);
  // eslint-disable-next-line @lwc/lwc/no-async-operation
  component._userRebuildTimeoutId = setTimeout(() => {
    component._userRebuildTimeoutId = null;
    rebuildCallback();
  }, delayMs);
}

export function cancelScheduledUserRebuild(component) {
  if (!component._userRebuildTimeoutId) {
    return;
  }
  clearTimeout(component._userRebuildTimeoutId);
  component._userRebuildTimeoutId = null;
}

export function cancelScheduledRebuildColumns(component) {
  if (!component._rebuildColumnsRafId) {
    return;
  }
  if (
    component._rebuildColumnsRafType === "raf" &&
    typeof cancelAnimationFrame === "function"
  ) {
    cancelAnimationFrame(component._rebuildColumnsRafId);
  } else {
    clearTimeout(component._rebuildColumnsRafId);
  }
  component._rebuildColumnsRafId = null;
  component._rebuildColumnsRafType = null;
}

export function scheduleSummaryRebuild(
  component,
  {
    records,
    groupingField,
    cardFields,
    shouldDeferSummaries,
    buildColumns,
    logDebug
  }
) {
  cancelScheduledSummaryRebuild(component);
  const token = (component._summaryRebuildToken += 1);
  const run = () => {
    component._summaryRebuildRafId = null;
    component._summaryRebuildRafType = null;
    if (token !== component._summaryRebuildToken) {
      return;
    }
    if (!component._isConnected) {
      return;
    }
    if (!shouldDeferSummaries(records)) {
      return;
    }
    const columns = buildColumns(records, groupingField, cardFields, {
      deferSummaries: false
    });
    component.columns = columns;
    logDebug("Summaries rebuilt after initial render.", {
      columnCount: columns.length
    });
  };

  if (typeof requestAnimationFrame === "function") {
    component._summaryRebuildRafType = "raf";
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    component._summaryRebuildRafId = requestAnimationFrame(run);
    return;
  }
  component._summaryRebuildRafType = "timeout";
  // eslint-disable-next-line @lwc/lwc/no-async-operation
  component._summaryRebuildRafId = setTimeout(run, 0);
}

export function cancelScheduledSummaryRebuild(component) {
  if (!component._summaryRebuildRafId) {
    return;
  }
  if (
    component._summaryRebuildRafType === "raf" &&
    typeof cancelAnimationFrame === "function"
  ) {
    cancelAnimationFrame(component._summaryRebuildRafId);
  } else {
    clearTimeout(component._summaryRebuildRafId);
  }
  component._summaryRebuildRafId = null;
  component._summaryRebuildRafType = null;
}

export function resolveVirtualWindow({
  scrollTop,
  viewportHeight,
  rowHeight,
  totalCount,
  buffer
}) {
  if (!rowHeight || totalCount <= 0) {
    return { start: 0, end: 0 };
  }
  const safeTop = Number.isFinite(scrollTop) ? scrollTop : 0;
  const safeHeight = Number.isFinite(viewportHeight) ? viewportHeight : 0;
  const safeBuffer = Number.isFinite(buffer) ? buffer : 0;
  const start = Math.max(Math.floor(safeTop / rowHeight) - safeBuffer, 0);
  const end = Math.min(
    Math.ceil((safeTop + safeHeight) / rowHeight) + safeBuffer,
    totalCount
  );
  return { start, end };
}

export function resolveSpacerHeights({
  rowHeight,
  startIndex,
  endIndex,
  total
}) {
  if (!rowHeight || total <= 0) {
    return { top: 0, bottom: 0 };
  }
  const safeStart = Math.max(startIndex || 0, 0);
  const safeEnd = Math.max(endIndex || 0, 0);
  const remaining = Math.max(total - safeEnd, 0);
  return {
    top: rowHeight * safeStart,
    bottom: rowHeight * remaining
  };
}

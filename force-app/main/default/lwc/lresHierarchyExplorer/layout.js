export function computeTreeLayout(
  nodes,
  edges,
  { nodeWidth, nodeHeight, gapX, gapY }
) {
  const nodeById = new Map((nodes || []).map((node) => [node.id, node]));
  const childrenById = new Map();
  const parentById = new Map();

  (edges || []).forEach((edge) => {
    if (!edge?.parentId || !edge?.childId) {
      return;
    }
    parentById.set(edge.childId, edge.parentId);
    const list = childrenById.get(edge.parentId) || [];
    list.push(edge.childId);
    childrenById.set(edge.parentId, list);
  });

  const roots = (nodes || [])
    .map((n) => n?.id)
    .filter(Boolean)
    .filter((id) => !parentById.has(id));
  const rootId = roots.length ? roots[0] : nodes?.[0]?.id;
  if (!rootId || !nodeById.has(rootId)) {
    return {
      rootId: null,
      positionsById: new Map(),
      bounds: { width: 0, height: 0 }
    };
  }

  const xById = new Map();
  const depthById = new Map();
  let nextLeafX = 0;
  const visiting = new Set();

  const firstWalk = (id, depth) => {
    if (visiting.has(id)) {
      return;
    }
    visiting.add(id);
    depthById.set(id, depth);
    const children = childrenById.get(id) || [];
    if (!children.length) {
      xById.set(id, nextLeafX);
      nextLeafX += 1;
      visiting.delete(id);
      return;
    }
    children.forEach((childId) => firstWalk(childId, depth + 1));
    const childXs = children
      .map((childId) => xById.get(childId))
      .filter((value) => Number.isFinite(value));
    if (childXs.length) {
      const minX = Math.min(...childXs);
      const maxX = Math.max(...childXs);
      xById.set(id, (minX + maxX) / 2);
    } else {
      xById.set(id, nextLeafX);
      nextLeafX += 1;
    }
    visiting.delete(id);
  };

  firstWalk(rootId, 0);

  const unitX = nodeWidth + gapX;
  const unitY = nodeHeight + gapY;
  const positionsById = new Map();

  let minLeft = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const [id, xUnits] of xById.entries()) {
    const depth = depthById.get(id) || 0;
    const centerX = xUnits * unitX;
    const top = depth * unitY;
    const left = centerX - nodeWidth / 2;
    positionsById.set(id, {
      left,
      top,
      depth,
      centerX,
      centerY: top + nodeHeight / 2,
      bottomY: top + nodeHeight
    });
    minLeft = Math.min(minLeft, left);
    maxRight = Math.max(maxRight, left + nodeWidth);
    minTop = Math.min(minTop, top);
    maxBottom = Math.max(maxBottom, top + nodeHeight);
  }

  const offsetX = Number.isFinite(minLeft) && minLeft < 0 ? -minLeft : 0;
  const offsetY = Number.isFinite(minTop) && minTop < 0 ? -minTop : 0;

  for (const [id, pos] of positionsById.entries()) {
    positionsById.set(id, {
      ...pos,
      left: pos.left + offsetX,
      top: pos.top + offsetY,
      centerX: pos.centerX + offsetX,
      centerY: pos.centerY + offsetY,
      bottomY: pos.bottomY + offsetY
    });
  }

  const width = Math.max(0, maxRight - minLeft);
  const height = Math.max(0, maxBottom - minTop);

  return {
    rootId,
    positionsById,
    bounds: { width, height }
  };
}

export function buildOrthogonalPaths(edges, positionsById) {
  return (edges || [])
    .map((edge) => {
      const parent = positionsById.get(edge?.parentId);
      const child = positionsById.get(edge?.childId);
      if (!parent || !child) {
        return null;
      }
      const x1 = parent.centerX;
      const y1 = parent.bottomY;
      const x2 = child.centerX;
      const y2 = child.top;
      const midY = y1 + (y2 - y1) / 2;
      return {
        key: `${edge.parentId}-${edge.childId}`,
        d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`
      };
    })
    .filter(Boolean);
}

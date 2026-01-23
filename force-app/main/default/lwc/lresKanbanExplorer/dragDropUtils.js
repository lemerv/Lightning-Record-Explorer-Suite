export function buildOptimisticColumnsForDrop(
  columns,
  { recordId, sourceColumnKey, targetColumnKey, findColumnByKey }
) {
  const sourceColumns = Array.isArray(columns) ? columns : [];
  if (!sourceColumns.length) {
    return null;
  }

  const lookupColumn =
    typeof findColumnByKey === "function" ? findColumnByKey : null;
  const targetColumn = lookupColumn
    ? lookupColumn(targetColumnKey)
    : sourceColumns.find((column) => column.key === targetColumnKey) || null;
  if (!targetColumn) {
    return null;
  }

  let sourceColumn = sourceColumnKey
    ? lookupColumn
      ? lookupColumn(sourceColumnKey)
      : sourceColumns.find((column) => column.key === sourceColumnKey) || null
    : null;
  let sourceCard = null;
  if (sourceColumn && Array.isArray(sourceColumn.records)) {
    sourceCard = sourceColumn.records.find((card) => card.id === recordId);
  }

  if (!sourceCard) {
    sourceColumn =
      sourceColumns.find(
        (column) =>
          Array.isArray(column.records) &&
          column.records.some((card) => card.id === recordId)
      ) || null;
    sourceCard = sourceColumn?.records?.find((card) => card.id === recordId);
  }

  if (!sourceColumn || !sourceCard) {
    return null;
  }

  if (sourceColumn.key === targetColumn.key) {
    return null;
  }

  const savingCard = { ...sourceCard, isSaving: true };
  const nextColumns = sourceColumns.map((column) => {
    if (column.key === sourceColumn.key) {
      const records = Array.isArray(column.records) ? column.records : [];
      const nextRecords = records.filter((card) => card.id !== recordId);
      return {
        ...column,
        records: nextRecords
      };
    }
    if (column.key === targetColumn.key) {
      const records = Array.isArray(column.records) ? column.records : [];
      const nextRecords = [
        ...records.filter((card) => card.id !== recordId),
        savingCard
      ];
      return {
        ...column,
        records: nextRecords
      };
    }
    return column;
  });

  return {
    previousColumns: sourceColumns,
    nextColumns
  };
}

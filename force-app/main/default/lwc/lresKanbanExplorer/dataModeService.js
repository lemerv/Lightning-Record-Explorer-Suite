import fetchRelatedCardRecords from "@salesforce/apex/LRES_KanbanCardRecordsController.fetchRelatedCardRecords";
import fetchParentlessCardRecords from "@salesforce/apex/LRES_KanbanCardRecordsController.fetchParentlessCardRecords";

export function shouldAutoRefreshOnConfig(component) {
  const mode = component.dataMode;
  return component._isConnected && mode.type === "parentless" && mode.ready;
}

export function resolveDataMode(component) {
  if (component._dataModeCache) {
    return component._dataModeCache;
  }
  const hasChildConfig = Boolean(
    component.cardObjectApiName && component.groupingFieldApiName
  );
  if (!hasChildConfig) {
    component._dataModeCache = {
      type: null,
      ready: false,
      reason: "missingConfig"
    };
    return component._dataModeCache;
  }
  const parentIds = component.activeParentRecordIds;
  const parentContextDetected =
    component.hasRecordContext ||
    parentIds.length > 0 ||
    Boolean(component.parentObjectApiName);
  if (parentContextDetected && !component.childRelationshipName) {
    component._dataModeCache = {
      type: null,
      ready: false,
      reason: "missingRelatedList",
      parentIds
    };
    return component._dataModeCache;
  }
  if (component.hasRecordContext || parentIds.length > 0) {
    component._dataModeCache = {
      type: "parent",
      ready: true,
      reason: null,
      parentIds
    };
    return component._dataModeCache;
  }
  if (component._isConnected && !component.parentObjectApiName) {
    component._dataModeCache = {
      type: "parentless",
      ready: true,
      reason: null,
      parentIds: []
    };
    return component._dataModeCache;
  }
  component._dataModeCache = {
    type: null,
    ready: false,
    reason: "noParentSelected",
    parentIds
  };
  return component._dataModeCache;
}

export function buildDataFetchRequest(component, fieldList) {
  const mode = component.dataMode;
  if (!mode.ready) {
    return { ready: false, reason: mode.reason };
  }
  return {
    ready: true,
    mode: mode.type,
    parentIds: mode.parentIds || [],
    fieldList
  };
}

export async function refreshParentlessCardRecords(
  component,
  fieldList,
  { defaultCardTitleField }
) {
  component.logInfo("Refreshing card records in parentless mode.", {
    cardObjectApiName: component.cardObjectApiName,
    recordCount: component.relatedRecords?.length || 0
  });
  if (component._debugLoggingEnabled) {
    // eslint-disable-next-line no-console
    console.log(
      "[KanbanExplorer][Debug] refreshParentlessCardRecords invoked",
      {
        fieldListCount: fieldList?.length || 0,
        cardObjectApiName: component.cardObjectApiName
      }
    );
  }
  const records = await fetchParentlessCardRecords({
    cardObjectApiName: component.cardObjectApiName,
    fieldApiNames: fieldList,
    sortFieldApiName: component.getEffectiveSortField(
      component.qualifyFieldName(defaultCardTitleField)
    ),
    sortDirection: component.sortDirection,
    limitSize: component.dataFetchPageSize,
    cardWhereClause: component.cardRecordsWhereClause,
    orderByClause: component.cardRecordsOrderByClause,
    debugWhereErrors: component._debugLoggingEnabled
  });
  if (Array.isArray(records)) {
    component.logInfo("Parentless card snapshot received.", {
      recordCount: records.length
    });
    if (component._debugLoggingEnabled) {
      // eslint-disable-next-line no-console
      console.log("[KanbanExplorer][Debug] Parentless Apex payload", {
        ids: records.map((rec) => rec?.id),
        parents: records.map((rec) => rec?.parent?.id || null)
      });
    }
    component.applyCardRecordsSnapshot(records);
  } else {
    component.logWarn("Parentless card snapshot returned no data.");
    component.applyCardRecordsSnapshot([]);
  }
  return { records, applied: true };
}

export async function executeDataFetch(
  component,
  fetchRequest,
  { defaultCardTitleField }
) {
  if (!fetchRequest?.ready) {
    return { records: [], applied: false };
  }
  if (fetchRequest.mode === "parentless") {
    return refreshParentlessCardRecords(component, fetchRequest.fieldList, {
      defaultCardTitleField
    });
  }
  const parentIds = fetchRequest.parentIds || [];
  component.logInfo("Refreshing related records via Apex.", {
    effectiveRecordId: component.effectiveRecordId,
    childRelationshipName: component.childRelationshipName,
    cardObjectApiName: component.cardObjectApiName,
    parentIdCount: parentIds.length
  });
  const records = await fetchRelatedCardRecords({
    parentRecordId: parentIds[0],
    parentRecordIds: parentIds,
    childRelationshipName: component.childRelationshipName,
    cardObjectApiName: component.cardObjectApiName,
    fieldApiNames: fetchRequest.fieldList,
    sortFieldApiName: component.getEffectiveSortField(
      component.qualifyFieldName(defaultCardTitleField)
    ),
    sortDirection: component.sortDirection,
    limitSize: component.dataFetchPageSize,
    cardWhereClause: component.cardRecordsWhereClause,
    orderByClause: component.cardRecordsOrderByClause,
    debugWhereErrors: component._debugLoggingEnabled
  });
  if (component._debugLoggingEnabled) {
    // eslint-disable-next-line no-console
    console.log("[KanbanExplorer][Debug] Parent Apex payload", {
      ids: Array.isArray(records) ? records.map((rec) => rec?.id) : null,
      parentIds: parentIds
    });
  }
  return { records, applied: false };
}

export async function performCardRecordsRefresh(
  component,
  { defaultCardTitleField }
) {
  const fieldList = component.dataFetchFieldList;
  if (!Array.isArray(fieldList) || fieldList.length === 0) {
    component.logWarn(
      "Cannot refresh related records; field list unavailable."
    );
    return false;
  }
  const fetchRequest = buildDataFetchRequest(component, fieldList);
  if (!fetchRequest?.ready) {
    component.logWarn(
      "Cannot refresh related records; required configuration missing."
    );
    return false;
  }
  if (component._debugLoggingEnabled) {
    // eslint-disable-next-line no-console
    console.log("[KanbanExplorer][Debug] performCardRecordsRefresh", {
      mode: fetchRequest.mode,
      parentless: fetchRequest.mode === "parentless",
      parentIdCount: fetchRequest.parentIds?.length || 0,
      hasRecordContext: component.hasRecordContext
    });
  }
  component.isLoading = true;
  try {
    const { records, applied } = await executeDataFetch(
      component,
      fetchRequest,
      {
        defaultCardTitleField
      }
    );
    if (!applied) {
      if (Array.isArray(records)) {
        component.logInfo("Apex related records snapshot received.", {
          recordCount: records.length
        });
        component.applyCardRecordsSnapshot(records);
      } else {
        component.logWarn("Apex related records snapshot returned no data.");
        component.applyCardRecordsSnapshot([]);
      }
    }
    return true;
  } catch (error) {
    component.logError("Related records refresh failed.", error);
    component.errorMessage = component.formatError(error);
    throw error;
  } finally {
    if (component.isLoading) {
      component.isLoading = false;
      component.logDebug("Related records refresh complete.");
    }
  }
}

public with sharing class LRES_HierarchyExplorerController {
  private class RootPlacement {
    public Integer rootLevelNumber;
    public Map<Integer, Id> idByLevel;
  }

  private static List<LRES_HierarchyTemplateService.LevelConfig> takeFirstLevels(
    List<LRES_HierarchyTemplateService.LevelConfig> levels,
    Integer maxCount
  ) {
    List<LRES_HierarchyTemplateService.LevelConfig> result = new List<LRES_HierarchyTemplateService.LevelConfig>();
    if (
      levels == null ||
      levels.isEmpty() ||
      maxCount == null ||
      maxCount <= 0
    ) {
      return result;
    }

    Integer limitCount = Math.min(levels.size(), maxCount);
    for (Integer i = 0; i < limitCount; i += 1) {
      result.add(levels[i]);
    }
    return result;
  }

  @AuraEnabled(cacheable=true)
  public static LRES_HierarchyExplorerDtos.HierarchyResponseDto getHierarchy(
    String templateDeveloperName,
    Id effectiveRootRecordId,
    Integer maxLevels,
    Integer maxNodes
  ) {
    if (String.isBlank(templateDeveloperName)) {
      throw new AuraHandledException(
        'Hierarchy Template Developer Name is required.'
      );
    }
    if (effectiveRootRecordId == null) {
      throw new AuraHandledException('Root Record Id is required.');
    }

    Integer resolvedMaxLevels = clamp(maxLevels, 1, 10, 10);
    Integer resolvedMaxNodes = clamp(maxNodes, 1, 50, 50);

    LRES_HierarchyTemplateService.TemplateConfig templateConfig = LRES_HierarchyTemplateService.loadTemplate(
      templateDeveloperName
    );

    List<LRES_HierarchyTemplateService.LevelConfig> levels = templateConfig.levels;
    if (levels == null || levels.isEmpty()) {
      throw new AuraHandledException(
        'Hierarchy template has no configured levels.'
      );
    }
    if (levels.size() > resolvedMaxLevels) {
      levels = takeFirstLevels(levels, resolvedMaxLevels);
    }

    RootPlacement placement = inferRootPlacement(effectiveRootRecordId, levels);

    LRES_HierarchyExplorerDtos.HierarchyResponseDto response = new LRES_HierarchyExplorerDtos.HierarchyResponseDto();
    response.rootId = String.valueOf(effectiveRootRecordId);
    response.nodes = new List<LRES_HierarchyExplorerDtos.NodeDto>();
    response.edges = new List<LRES_HierarchyExplorerDtos.EdgeDto>();
    response.capped = false;
    response.capMessage = null;

    Set<String> nodeIds = new Set<String>();
    Integer remaining = resolvedMaxNodes;

    // Ancestor path (a single chain).
    List<Integer> ancestorLevels = new List<Integer>();
    for (
      Integer levelNum = 1; levelNum <= placement.rootLevelNumber; levelNum += 1
    ) {
      ancestorLevels.add(levelNum);
    }
    for (Integer levelNum : ancestorLevels) {
      if (remaining <= 0) {
        response.capped = true;
        response.capMessage = buildCapMessage(resolvedMaxNodes);
        break;
      }
      Id recordId = placement.idByLevel.get(levelNum);
      if (recordId == null) {
        throw new AuraHandledException(
          'Unable to resolve ancestor chain for the provided Root Record Id.'
        );
      }
      LRES_HierarchyTemplateService.LevelConfig levelConfig = levels[
        levelNum - 1
      ];
      LRES_HierarchyExplorerDtos.NodeDto node = fetchSingleNode(
        levelConfig,
        recordId,
        null
      );
      nodeIds.add(node.id);
      response.nodes.add(node);
      remaining -= 1;
    }

    // Edges for ancestor path (only the chain to the root).
    for (
      Integer levelNum = 1; levelNum < placement.rootLevelNumber; levelNum += 1
    ) {
      Id parentId = placement.idByLevel.get(levelNum);
      Id childId = placement.idByLevel.get(levelNum + 1);
      if (parentId != null && childId != null) {
        response.edges.add(
          edge(String.valueOf(parentId), String.valueOf(childId))
        );
      }
    }

    if (remaining <= 0) {
      return response;
    }

    // Descendants (level-by-level BFS) starting from chosen root.
    Set<Id> parentIds = new Set<Id>{ effectiveRootRecordId };
    for (
      Integer levelNum = placement.rootLevelNumber;
      levelNum < levels.size();
      levelNum += 1
    ) {
      if (remaining <= 0) {
        response.capped = true;
        response.capMessage = buildCapMessage(resolvedMaxNodes);
        break;
      }
      if (parentIds.isEmpty()) {
        break;
      }
      LRES_HierarchyTemplateService.LevelConfig parentLevel = levels[
        levelNum - 1
      ];
      LRES_HierarchyTemplateService.LevelConfig childLevel = levels[levelNum];
      String lookupFieldApiName = LRES_HierarchyTemplateService.deriveParentLookupFieldApiName(
        parentLevel.objectApiName,
        parentLevel.childRelationshipName,
        parentLevel.childObjectApiName
      );
      if (String.isBlank(lookupFieldApiName)) {
        throw new AuraHandledException(
          'Unable to resolve relationship "' +
            parentLevel.childRelationshipName +
            '" on object "' +
            parentLevel.objectApiName +
            '".'
        );
      }

      List<SObject> childRows = fetchChildRows(
        childLevel,
        lookupFieldApiName,
        new List<Id>(parentIds),
        remaining
      );

      Set<Id> nextParentIds = new Set<Id>();
      for (SObject row : childRows) {
        if (remaining <= 0) {
          response.capped = true;
          response.capMessage = buildCapMessage(resolvedMaxNodes);
          break;
        }
        String idStr = String.valueOf(row.get('Id'));
        if (!nodeIds.contains(idStr)) {
          LRES_HierarchyExplorerDtos.NodeDto node = buildNodeDto(
            childLevel,
            row
          );
          nodeIds.add(node.id);
          response.nodes.add(node);
          remaining -= 1;
        }
        Object parentIdValue = row.get(lookupFieldApiName);
        if (parentIdValue != null) {
          String parentIdStr = String.valueOf(parentIdValue);
          response.edges.add(edge(parentIdStr, idStr));
        }
        nextParentIds.add((Id) row.get('Id'));
      }
      parentIds = nextParentIds;
    }

    if (
      !response.capped &&
      remaining == 0 &&
      response.nodes.size() == resolvedMaxNodes
    ) {
      response.capped = true;
      response.capMessage = buildCapMessage(resolvedMaxNodes);
    }

    return response;
  }

  private static RootPlacement inferRootPlacement(
    Id rootRecordId,
    List<LRES_HierarchyTemplateService.LevelConfig> levels
  ) {
    String rootObjectApiName = rootRecordId.getSObjectType()
      .getDescribe()
      .getName();
    List<Integer> candidates = new List<Integer>();
    for (LRES_HierarchyTemplateService.LevelConfig level : levels) {
      if (
        level != null &&
        String.isNotBlank(level.objectApiName) &&
        level.objectApiName.equalsIgnoreCase(rootObjectApiName)
      ) {
        candidates.add(level.levelNumber);
      }
    }
    if (candidates.isEmpty()) {
      throw new AuraHandledException(
        'Root Record Id object "' +
          rootObjectApiName +
          '" does not appear in the selected hierarchy template.'
      );
    }

    List<RootPlacement> validPlacements = new List<RootPlacement>();
    for (Integer candidateLevel : candidates) {
      RootPlacement placement = tryBuildAncestorChain(
        rootRecordId,
        candidateLevel,
        levels
      );
      if (
        placement != null && validateDescendantTraversal(candidateLevel, levels)
      ) {
        validPlacements.add(placement);
      }
    }

    if (validPlacements.isEmpty()) {
      throw new AuraHandledException(
        'Unable to place Root Record Id within the selected hierarchy template using the configured relationships.'
      );
    }
    if (validPlacements.size() > 1) {
      List<String> levelStrings = new List<String>();
      for (RootPlacement placement : validPlacements) {
        levelStrings.add(String.valueOf(placement.rootLevelNumber));
      }
      throw new AuraHandledException(
        'Ambiguous Root Record Id placement: object "' +
          rootObjectApiName +
          '" matches multiple levels (' +
          String.join(levelStrings, ', ') +
          '). Adjust your template to make placement unique.'
      );
    }
    return validPlacements[0];
  }

  @TestVisible
  private static Integer inferRootLevelNumberForTest(
    Id rootRecordId,
    List<LRES_HierarchyTemplateService.LevelConfig> levels
  ) {
    RootPlacement placement = inferRootPlacement(rootRecordId, levels);
    return placement == null ? null : placement.rootLevelNumber;
  }

  private static RootPlacement tryBuildAncestorChain(
    Id rootRecordId,
    Integer candidateLevel,
    List<LRES_HierarchyTemplateService.LevelConfig> levels
  ) {
    Map<Integer, Id> idByLevel = new Map<Integer, Id>();
    idByLevel.put(candidateLevel, rootRecordId);

    Id currentId = rootRecordId;
    for (Integer levelNum = candidateLevel; levelNum > 1; levelNum -= 1) {
      LRES_HierarchyTemplateService.LevelConfig parentLevel = levels[
        levelNum - 2
      ];
      LRES_HierarchyTemplateService.LevelConfig childLevel = levels[
        levelNum - 1
      ];
      String lookupFieldApiName = LRES_HierarchyTemplateService.deriveParentLookupFieldApiName(
        parentLevel.objectApiName,
        parentLevel.childRelationshipName,
        parentLevel.childObjectApiName
      );
      if (String.isBlank(lookupFieldApiName)) {
        return null;
      }

      Schema.SObjectType childType = Schema.getGlobalDescribe()
        .get(childLevel.objectApiName);
      if (childType == null) {
        return null;
      }

      List<String> requestedFields = new List<String>{
        'Id',
        lookupFieldApiName
      };
      LRES_FieldValidationUtil.FlsValidationResult fls = LRES_FieldValidationUtil.validateFieldAccessibility(
        childLevel.objectApiName,
        requestedFields,
        null
      );
      if (fls.droppedSelectFields.contains(lookupFieldApiName)) {
        return null;
      }

      String soql =
        'SELECT ' +
        String.join(fls.accessibleFields, ', ') +
        ' FROM ' +
        childLevel.objectApiName +
        ' WHERE Id = :currentId WITH SECURITY_ENFORCED';
      List<SObject> rows = Database.query(soql);
      if (rows.isEmpty()) {
        return null;
      }
      Object parentIdValue = rows[0].get(lookupFieldApiName);
      if (parentIdValue == null) {
        return null;
      }
      Id parentId = (Id) parentIdValue;
      idByLevel.put(levelNum - 1, parentId);
      currentId = parentId;
    }

    RootPlacement placement = new RootPlacement();
    placement.rootLevelNumber = candidateLevel;
    placement.idByLevel = idByLevel;
    return placement;
  }

  private static Boolean validateDescendantTraversal(
    Integer rootLevelNumber,
    List<LRES_HierarchyTemplateService.LevelConfig> levels
  ) {
    if (rootLevelNumber == null || rootLevelNumber < 1) {
      return false;
    }
    if (levels == null || levels.isEmpty()) {
      return false;
    }
    if (rootLevelNumber > levels.size()) {
      return false;
    }

    // Validate each transition we would traverse when fetching descendants starting at the chosen root.
    for (
      Integer levelNum = rootLevelNumber;
      levelNum < levels.size();
      levelNum += 1
    ) {
      LRES_HierarchyTemplateService.LevelConfig parentLevel = levels[
        levelNum - 1
      ];
      LRES_HierarchyTemplateService.LevelConfig childLevel = levels[levelNum];
      if (parentLevel == null || childLevel == null) {
        return false;
      }
      if (
        String.isBlank(parentLevel.childObjectApiName) ||
        String.isBlank(childLevel.objectApiName)
      ) {
        return false;
      }
      if (
        !parentLevel.childObjectApiName.equalsIgnoreCase(
          childLevel.objectApiName
        )
      ) {
        return false;
      }

      String lookupFieldApiName = LRES_HierarchyTemplateService.deriveParentLookupFieldApiName(
        parentLevel.objectApiName,
        parentLevel.childRelationshipName,
        parentLevel.childObjectApiName
      );
      if (String.isBlank(lookupFieldApiName)) {
        return false;
      }

      Schema.SObjectType childType = Schema.getGlobalDescribe()
        .get(childLevel.objectApiName);
      if (childType == null) {
        return false;
      }
      Schema.DescribeSObjectResult childDescribe = childType.getDescribe();
      if (!childDescribe.isAccessible() || !childDescribe.isQueryable()) {
        return false;
      }

      // Validate the same shape we will query for descendant nodes (lookup + card fields).
      Set<String> requested = new Set<String>();
      requested.add('Id');
      requested.add(lookupFieldApiName);
      Map<String, String> qualifiedToSoql = buildSoqlFieldMap(
        childLevel.objectApiName,
        childLevel.cardFieldApiNames
      );
      requested.addAll(qualifiedToSoql.values());

      LRES_FieldValidationUtil.FlsValidationResult fls = LRES_FieldValidationUtil.validateFieldAccessibility(
        childLevel.objectApiName,
        new List<String>(requested),
        null
      );
      if (
        fls.droppedSelectFields.contains(lookupFieldApiName) ||
        !fls.accessibleFields.contains('Id')
      ) {
        return false;
      }
    }

    return true;
  }

  private static List<SObject> fetchChildRows(
    LRES_HierarchyTemplateService.LevelConfig childLevel,
    String parentLookupFieldApiName,
    List<Id> parentIds,
    Integer limitSize
  ) {
    if (childLevel == null) {
      return new List<SObject>();
    }
    Integer maxLimit = clamp(limitSize, 0, 50, 50);
    if (maxLimit <= 0) {
      return new List<SObject>();
    }

    Map<String, String> qualifiedToSoql = buildSoqlFieldMap(
      childLevel.objectApiName,
      childLevel.cardFieldApiNames
    );
    Set<String> requested = new Set<String>();
    requested.add('Id');
    requested.add(parentLookupFieldApiName);
    requested.addAll(qualifiedToSoql.values());

    LRES_FieldValidationUtil.FlsValidationResult fls = LRES_FieldValidationUtil.validateFieldAccessibility(
      childLevel.objectApiName,
      new List<String>(requested),
      null
    );

    if (fls.droppedSelectFields.contains(parentLookupFieldApiName)) {
      throw new AuraHandledException(
        'Insufficient permissions: cannot access required relationship field "' +
          parentLookupFieldApiName +
          '" on "' +
          childLevel.objectApiName +
          '".'
      );
    }

    List<String> selectFields = new List<String>(fls.accessibleFields);
    if (!selectFields.contains('Id')) {
      selectFields.add('Id');
    }
    if (!selectFields.contains(parentLookupFieldApiName)) {
      selectFields.add(parentLookupFieldApiName);
    }

    String soql =
      'SELECT ' +
      String.join(selectFields, ', ') +
      ' FROM ' +
      childLevel.objectApiName +
      ' WHERE ' +
      parentLookupFieldApiName +
      ' IN :parentIds' +
      ' WITH SECURITY_ENFORCED' +
      ' LIMIT :maxLimit';
    return Database.query(soql);
  }

  private static LRES_HierarchyExplorerDtos.NodeDto fetchSingleNode(
    LRES_HierarchyTemplateService.LevelConfig levelConfig,
    Id recordId,
    String parentLookupFieldApiName
  ) {
    if (levelConfig == null || recordId == null) {
      return null;
    }

    Map<String, String> qualifiedToSoql = buildSoqlFieldMap(
      levelConfig.objectApiName,
      levelConfig.cardFieldApiNames
    );
    Set<String> requested = new Set<String>();
    requested.add('Id');
    if (String.isNotBlank(parentLookupFieldApiName)) {
      requested.add(parentLookupFieldApiName);
    }
    requested.addAll(qualifiedToSoql.values());

    LRES_FieldValidationUtil.FlsValidationResult fls = LRES_FieldValidationUtil.validateFieldAccessibility(
      levelConfig.objectApiName,
      new List<String>(requested),
      null
    );

    List<String> selectFields = new List<String>(fls.accessibleFields);
    if (!selectFields.contains('Id')) {
      selectFields.add('Id');
    }
    if (
      String.isNotBlank(parentLookupFieldApiName) &&
      !selectFields.contains(parentLookupFieldApiName)
    ) {
      selectFields.add(parentLookupFieldApiName);
    }

    String soql =
      'SELECT ' +
      String.join(selectFields, ', ') +
      ' FROM ' +
      levelConfig.objectApiName +
      ' WHERE Id = :recordId WITH SECURITY_ENFORCED';
    List<SObject> rows = Database.query(soql);
    if (rows.isEmpty()) {
      throw new AuraHandledException(
        'Record not found: ' + String.valueOf(recordId)
      );
    }
    return buildNodeDto(levelConfig, rows[0]);
  }

  private static LRES_HierarchyExplorerDtos.NodeDto buildNodeDto(
    LRES_HierarchyTemplateService.LevelConfig levelConfig,
    SObject row
  ) {
    LRES_HierarchyExplorerDtos.NodeDto node = new LRES_HierarchyExplorerDtos.NodeDto();
    node.id = String.valueOf(row.get('Id'));
    node.objectApiName = levelConfig.objectApiName;
    node.levelNumber = levelConfig.levelNumber;
    node.showCardFieldLabels = levelConfig.showCardFieldLabels;
    node.enableTextWrap = levelConfig.enableTextWrap;
    node.details = new List<LRES_HierarchyExplorerDtos.DetailDto>();

    List<String> fields = levelConfig.cardFieldApiNames == null
      ? new List<String>()
      : new List<String>(levelConfig.cardFieldApiNames);

    // Title
    String titleFieldRaw = fields.isEmpty() ? null : fields[0];
    String titleField = String.isBlank(titleFieldRaw)
      ? null
      : LRES_FieldValidationUtil.stripObjectPrefix(
          levelConfig.objectApiName,
          titleFieldRaw
        );
    if (String.isNotBlank(titleField)) {
      node.title = stringifyValue(
        LRES_FieldValidationUtil.extractFieldValue(row, titleField)
      );
    }
    if (String.isBlank(node.title)) {
      node.title = node.id;
    }

    // Title icon token (normalized client-side using existing LWC utilities).
    String titleIconToken = iconTokenAt(levelConfig.cardFieldIcons, 0);
    if (String.isNotBlank(titleIconToken)) {
      node.titleIcon = titleIconToken;
    }

    // Details
    for (Integer i = 1; i < fields.size(); i += 1) {
      String fieldPathRaw = fields[i];
      String fieldPath = String.isBlank(fieldPathRaw)
        ? null
        : LRES_FieldValidationUtil.stripObjectPrefix(
            levelConfig.objectApiName,
            fieldPathRaw
          );
      if (String.isBlank(fieldPath)) {
        continue;
      }
      LRES_HierarchyExplorerDtos.DetailDto detail = new LRES_HierarchyExplorerDtos.DetailDto();
      detail.apiName = fieldPath;
      detail.label = extractLabel(fieldPath);
      detail.value = stringifyValue(
        LRES_FieldValidationUtil.extractFieldValue(row, fieldPath)
      );
      String token = iconTokenAt(levelConfig.cardFieldIcons, i);
      if (String.isNotBlank(token)) {
        detail.iconName = token;
      }
      node.details.add(detail);
    }

    return node;
  }

  private static Map<String, String> buildSoqlFieldMap(
    String objectApiName,
    List<String> fieldApiNames
  ) {
    Map<String, String> soqlFieldMap = new Map<String, String>();
    if (String.isBlank(objectApiName) || fieldApiNames == null) {
      return soqlFieldMap;
    }
    for (String raw : fieldApiNames) {
      if (String.isBlank(raw)) {
        continue;
      }
      String trimmed = raw.trim();
      if (trimmed.length() == 0) {
        continue;
      }
      String qualified = trimmed;
      if (!qualified.contains('.')) {
        qualified = objectApiName + '.' + qualified;
      } else if (!qualified.startsWith(objectApiName + '.')) {
        qualified = objectApiName + '.' + qualified;
      }
      String soqlField = LRES_FieldValidationUtil.stripObjectPrefix(
        objectApiName,
        qualified
      );
      soqlFieldMap.put(qualified, soqlField);
    }
    return soqlFieldMap;
  }

  private static String extractLabel(String fieldPath) {
    if (String.isBlank(fieldPath)) {
      return null;
    }
    List<String> segments = fieldPath.split('\\.');
    return segments.isEmpty() ? fieldPath : segments[segments.size() - 1];
  }

  private static String iconTokenAt(List<String> tokens, Integer index) {
    if (
      tokens == null ||
      index == null ||
      index < 0 ||
      index >= tokens.size()
    ) {
      return null;
    }
    String token = tokens[index];
    return String.isBlank(token) ? null : token.trim();
  }

  private static String stringifyValue(Object value) {
    if (value == null) {
      return '';
    }
    return String.valueOf(value);
  }

  private static Integer clamp(
    Integer value,
    Integer minValue,
    Integer maxValue,
    Integer fallback
  ) {
    if (value == null) {
      return fallback;
    }
    if (value < minValue) {
      return minValue;
    }
    if (value > maxValue) {
      return maxValue;
    }
    return value;
  }

  private static LRES_HierarchyExplorerDtos.EdgeDto edge(
    String parentId,
    String childId
  ) {
    LRES_HierarchyExplorerDtos.EdgeDto dto = new LRES_HierarchyExplorerDtos.EdgeDto();
    dto.parentId = parentId;
    dto.childId = childId;
    return dto;
  }

  private static String buildCapMessage(Integer maxNodes) {
    return 'Showing the first ' +
      String.valueOf(maxNodes) +
      ' nodes. Narrow the hierarchy or reduce depth to see more.';
  }
}

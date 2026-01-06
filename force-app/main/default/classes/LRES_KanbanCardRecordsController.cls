public with sharing class LRES_KanbanCardRecordsController {
  @AuraEnabled(cacheable=false)
  public static List<RelatedRecord> fetchRelatedCardRecords(
    Id parentRecordId,
    List<Id> parentRecordIds,
    String childRelationshipName,
    String cardObjectApiName,
    List<String> fieldApiNames,
    String sortFieldApiName,
    String sortDirection,
    Integer limitSize,
    String cardWhereClause,
    String orderByClause,
    Boolean debugWhereErrors
  ) {
    List<Id> resolvedParentIds = consolidateParentIds(
      parentRecordId,
      parentRecordIds
    );
    if (resolvedParentIds.isEmpty()) {
      throw new AuraHandledException('Parent record id is required.');
    }
    if (String.isBlank(childRelationshipName)) {
      throw new AuraHandledException('Child relationship name is required.');
    }
    if (String.isBlank(cardObjectApiName)) {
      throw new AuraHandledException('Card object API name is required.');
    }
    Integer maxLimit = limitSize != null
      ? Math.max(1, Math.min(limitSize, 1000))
      : 200;
    Id describeSeedId = resolvedParentIds[0];
    Schema.ChildRelationship relationship = resolveRelationship(
      describeSeedId,
      childRelationshipName,
      cardObjectApiName
    );
    if (relationship == null) {
      throw new AuraHandledException(
        'Unable to resolve the related list metadata.'
      );
    }
    String childObjectName = relationship.getChildSObject()
      .getDescribe()
      .getName();
    String parentFieldApiName = relationship.getField().getDescribe().getName();
    String parentRelationshipName = relationship.getField()
      .getDescribe()
      .getRelationshipName();
    Map<String, String> soqlFieldMap = buildSoqlFieldMap(
      childObjectName,
      fieldApiNames
    );
    ensureParentFieldSelections(
      soqlFieldMap,
      childObjectName,
      parentFieldApiName,
      parentRelationshipName
    );
    List<String> whereConditions = new List<String>();
    if (resolvedParentIds.size() == 1) {
      whereConditions.add(parentFieldApiName + ' = :describeSeedId');
    } else {
      whereConditions.add(parentFieldApiName + ' IN :resolvedParentIds');
    }
    String sanitizedWhere = LRES_FieldValidationUtil.sanitizeWhereClause(
      cardWhereClause,
      'Card record filter cannot include ',
      cardObjectApiName,
      null,
      debugWhereErrors
    );

    // Validate WHERE clause fields for FLS
    if (String.isNotBlank(sanitizedWhere)) {
      List<String> whereFields = LRES_FieldValidationUtil.extractFieldsFromWhereClause(
        sanitizedWhere,
        cardObjectApiName,
        null,
        debugWhereErrors
      );
      if (!whereFields.isEmpty()) {
        LRES_FieldValidationUtil.FlsValidationResult whereFlsResult = LRES_FieldValidationUtil.validateFieldAccessibility(
          childObjectName,
          new List<String>(),
          null,
          whereFields
        );
        if (!whereFlsResult.droppedWhereFields.isEmpty()) {
          throw new AuraHandledException(
            'Insufficient permissions: the specified Card Records WHERE Clause includes inaccessible fields: ' +
            String.join(whereFlsResult.droppedWhereFields, ', ')
          );
        }
      }
      whereConditions.add('(' + sanitizedWhere + ')');
    }

    QueryResult queryResult = executeChildQuery(
      childObjectName,
      soqlFieldMap,
      whereConditions,
      sortFieldApiName,
      sortDirection,
      maxLimit,
      orderByClause,
      describeSeedId,
      resolvedParentIds
    );
    return buildResult(
      queryResult.records,
      soqlFieldMap,
      queryResult.accessibleFieldMap,
      parentFieldApiName,
      parentRelationshipName
    );
  }

  @AuraEnabled(cacheable=false)
  public static List<RelatedRecord> fetchParentlessCardRecords(
    String cardObjectApiName,
    List<String> fieldApiNames,
    String sortFieldApiName,
    String sortDirection,
    Integer limitSize,
    String cardWhereClause,
    String orderByClause,
    Boolean debugWhereErrors
  ) {
    if (String.isBlank(cardObjectApiName)) {
      throw new AuraHandledException('Card object API name is required.');
    }
    Schema.SObjectType childType = Schema.getGlobalDescribe()
      .get(cardObjectApiName);
    if (childType == null) {
      throw new AuraHandledException('Unable to resolve the card object.');
    }
    String childObjectName = childType.getDescribe().getName();
    Map<String, String> soqlFieldMap = buildSoqlFieldMap(
      childObjectName,
      fieldApiNames
    );
    List<String> whereConditions = new List<String>();
    String sanitizedWhere = LRES_FieldValidationUtil.sanitizeWhereClause(
      cardWhereClause,
      'Card record filter cannot include ',
      cardObjectApiName,
      null,
      debugWhereErrors
    );

    // Validate WHERE clause fields for FLS
    if (String.isNotBlank(sanitizedWhere)) {
      List<String> whereFields = LRES_FieldValidationUtil.extractFieldsFromWhereClause(
        sanitizedWhere,
        cardObjectApiName,
        null,
        debugWhereErrors
      );
      if (!whereFields.isEmpty()) {
        LRES_FieldValidationUtil.FlsValidationResult whereFlsResult = LRES_FieldValidationUtil.validateFieldAccessibility(
          childObjectName,
          new List<String>(),
          null,
          whereFields
        );
        if (!whereFlsResult.droppedWhereFields.isEmpty()) {
          throw new AuraHandledException(
            'Insufficient permissions: the specified Card Records WHERE Clause includes inaccessible fields: ' +
            String.join(whereFlsResult.droppedWhereFields, ', ')
          );
        }
      }
      whereConditions.add('(' + sanitizedWhere + ')');
    }

    QueryResult queryResult = executeChildQuery(
      childObjectName,
      soqlFieldMap,
      whereConditions,
      sortFieldApiName,
      sortDirection,
      limitSize,
      orderByClause,
      null,
      null
    );
    return buildResult(
      queryResult.records,
      soqlFieldMap,
      queryResult.accessibleFieldMap,
      null,
      null
    );
  }

  private static QueryResult executeChildQuery(
    String childObjectName,
    Map<String, String> soqlFieldMap,
    List<String> whereConditions,
    String sortFieldApiName,
    String sortDirection,
    Integer limitSize,
    String orderByClause,
    Id describeSeedId,
    List<Id> resolvedParentIds
  ) {
    Integer maxLimit = limitSize != null
      ? Math.max(1, Math.min(limitSize, 1000))
      : 200;

    // PRE-FILTER: Validate FLS for all fields
    List<String> requestedFields = new List<String>(soqlFieldMap.values());
    String orderField = normalizeSortField(childObjectName, sortFieldApiName);
    LRES_FieldValidationUtil.FlsValidationResult flsResult = LRES_FieldValidationUtil.validateFieldAccessibility(
      childObjectName,
      requestedFields,
      orderField
    );

    // Log FLS removals for diagnostics
    if (flsResult.hasRemovals) {
      System.debug(LoggingLevel.WARN, 'FLS Validation Removed Fields:');
      System.debug(
        LoggingLevel.WARN,
        'Dropped SELECT fields: ' + flsResult.droppedSelectFields
      );
      System.debug(
        LoggingLevel.WARN,
        'Dropped ORDER BY fields: ' + flsResult.droppedOrderByFields
      );
    }

    // Use only accessible fields for SELECT
    List<String> selectFields = flsResult.accessibleFields;
    if (!selectFields.contains('Id')) {
      selectFields.add('Id');
    }

    // Build map of only accessible fields
    Set<String> accessibleFieldSet = new Set<String>(selectFields);
    Map<String, String> accessibleFieldMap = new Map<String, String>();
    for (String qualifiedField : soqlFieldMap.keySet()) {
      String soqlField = soqlFieldMap.get(qualifiedField);
      if (accessibleFieldSet.contains(soqlField)) {
        accessibleFieldMap.put(qualifiedField, soqlField);
      }
    }

    String soql = 'SELECT ' + String.join(selectFields, ', ');
    soql += ' FROM ' + childObjectName;
    if (!whereConditions.isEmpty()) {
      soql += ' WHERE ' + String.join(whereConditions, ' AND ');
    }

    LRES_FieldValidationUtil.OrderByMessages orderByMessages = LRES_FieldValidationUtil.buildOrderByMessages(
      'Card order clause'
    );
    String sanitizedOrderBy = LRES_FieldValidationUtil.sanitizeOrderByClause(
      orderByClause,
      orderByMessages
    );

    List<String> orderByFragments = new List<String>();
    if (String.isNotBlank(sanitizedOrderBy)) {
      orderByFragments.add(sanitizedOrderBy);
    }

    // Only add sort field if it passed FLS check
    if (
      orderField != null && !flsResult.droppedOrderByFields.contains(orderField)
    ) {
      String direction = 'desc'.equalsIgnoreCase(sortDirection)
        ? 'DESC'
        : 'ASC';
      orderByFragments.add(orderField + ' ' + direction);
    }

    soql += ' WITH SECURITY_ENFORCED';

    if (!orderByFragments.isEmpty()) {
      soql += ' ORDER BY ' + String.join(orderByFragments, ', ');
    }

    soql += ' LIMIT ' + maxLimit;

    List<SObject> rows = Database.query(soql);

    // FINAL GUARD: Strip any inaccessible fields from results
    SObjectAccessDecision securityDecision = Security.stripInaccessible(
      AccessType.READABLE,
      rows
    );

    QueryResult result = new QueryResult();
    result.records = securityDecision.getRecords();
    result.accessibleFieldMap = accessibleFieldMap;
    return result;
  }

  private class QueryResult {
    public List<SObject> records;
    public Map<String, String> accessibleFieldMap;
  }

  private static List<Id> consolidateParentIds(
    Id parentRecordId,
    List<Id> parentRecordIds
  ) {
    Set<Id> idSet = new Set<Id>();
    if (parentRecordId != null) {
      idSet.add(parentRecordId);
    }
    if (parentRecordIds != null) {
      idSet.addAll(parentRecordIds);
    }
    return new List<Id>(idSet);
  }

  private static Schema.ChildRelationship resolveRelationship(
    Id parentRecordId,
    String childRelationshipName,
    String cardObjectApiName
  ) {
    if (parentRecordId == null) {
      return null;
    }
    Schema.SObjectType parentType = parentRecordId.getSObjectType();
    if (parentType == null) {
      return null;
    }
    Schema.DescribeSObjectResult describe = parentType.getDescribe();
    for (Schema.ChildRelationship rel : describe.getChildRelationships()) {
      if (rel == null || rel.getChildSObject() == null) {
        continue;
      }
      String relName = rel.getRelationshipName();
      if (String.isBlank(relName)) {
        continue;
      }
      String childName = rel.getChildSObject().getDescribe().getName();
      Boolean childMatches =
        String.isBlank(cardObjectApiName) ||
        childName.equalsIgnoreCase(cardObjectApiName);
      if (childMatches && relName.equalsIgnoreCase(childRelationshipName)) {
        return rel;
      }
    }
    return null;
  }

  private static Map<String, String> buildSoqlFieldMap(
    String childObjectName,
    List<String> fieldApiNames
  ) {
    Map<String, String> result = new Map<String, String>();
    if (fieldApiNames == null) {
      return result;
    }
    for (String qualifiedField : fieldApiNames) {
      if (String.isBlank(qualifiedField)) {
        continue;
      }
      String cleaned = LRES_FieldValidationUtil.validateAndNormalizeFieldPath(
        childObjectName,
        qualifiedField
      );
      if (cleaned == null) {
        continue;
      }
      result.put(qualifiedField, cleaned);
    }
    return result;
  }

  private static String normalizeSortField(
    String childObjectName,
    String sortFieldApiName
  ) {
    if (String.isBlank(sortFieldApiName)) {
      return null;
    }
    return LRES_FieldValidationUtil.validateAndNormalizeFieldPath(
      childObjectName,
      sortFieldApiName
    );
  }

  private static void ensureParentFieldSelections(
    Map<String, String> soqlFieldMap,
    String childObjectName,
    String parentFieldApiName,
    String parentRelationshipName
  ) {
    if (String.isBlank(childObjectName)) {
      return;
    }
    if (String.isNotBlank(parentFieldApiName)) {
      String qualifiedParentField = childObjectName + '.' + parentFieldApiName;
      if (!soqlFieldMap.containsKey(qualifiedParentField)) {
        soqlFieldMap.put(qualifiedParentField, parentFieldApiName);
      }
    }
    if (String.isNotBlank(parentRelationshipName)) {
      String qualifiedParentNameField =
        childObjectName +
        '.' +
        parentRelationshipName +
        '.Name';
      if (!soqlFieldMap.containsKey(qualifiedParentNameField)) {
        soqlFieldMap.put(
          qualifiedParentNameField,
          parentRelationshipName + '.Name'
        );
      }
    }
  }

  private static List<RelatedRecord> buildResult(
    List<SObject> rows,
    Map<String, String> originalFieldMap,
    Map<String, String> accessibleFieldMap,
    String parentFieldApiName,
    String parentRelationshipName
  ) {
    List<RelatedRecord> results = new List<RelatedRecord>();
    for (SObject row : rows) {
      RelatedRecord record = new RelatedRecord();
      record.id = String.valueOf(row.get('Id'));
      record.fields = new Map<String, FieldValue>();
      for (String qualifiedField : originalFieldMap.keySet()) {
        FieldValue value = new FieldValue();
        if (accessibleFieldMap.containsKey(qualifiedField)) {
          // Field was accessible - extract real value
          String soqlField = accessibleFieldMap.get(qualifiedField);
          value.value = LRES_FieldValidationUtil.extractFieldValue(
            row,
            soqlField
          );
          value.displayValue = value.value;
        } else {
          // Field was dropped due to FLS
          value.value = '[inaccessible]';
          value.displayValue = '[inaccessible]';
        }
        record.fields.put(qualifiedField, value);
      }
      record.parent = buildParentDescriptor(
        row,
        parentFieldApiName,
        parentRelationshipName
      );
      results.add(record);
    }
    return results;
  }

  private static ParentDescriptor buildParentDescriptor(
    SObject row,
    String parentFieldApiName,
    String parentRelationshipName
  ) {
    if (row == null || String.isBlank(parentFieldApiName)) {
      return null;
    }
    Object parentIdValue = row.get(parentFieldApiName);
    if (parentIdValue == null) {
      return null;
    }
    ParentDescriptor descriptor = new ParentDescriptor();
    descriptor.id = String.valueOf(parentIdValue);
    if (String.isNotBlank(parentRelationshipName)) {
      try {
        SObject parentRow = row.getSObject(parentRelationshipName);
        if (parentRow != null) {
          Object parentName = parentRow.get('Name');
          if (parentName != null) {
            descriptor.name = String.valueOf(parentName);
          }
        }
      } catch (Exception ex) {
        System.debug(LoggingLevel.FINE, ex);
      }
    }
    return descriptor;
  }

  public class RelatedRecord {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public Map<String, FieldValue> fields;
    @AuraEnabled
    public ParentDescriptor parent;
  }

  public class FieldValue {
    @AuraEnabled
    public Object value;
    @AuraEnabled
    public Object displayValue;
  }

  public class ParentDescriptor {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
  }
}

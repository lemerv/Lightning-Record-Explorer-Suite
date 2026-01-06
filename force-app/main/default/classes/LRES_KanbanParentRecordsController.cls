public with sharing class LRES_KanbanParentRecordsController {
  private static final Integer DEFAULT_LIMIT = 100;
  private static final Integer MAX_LIMIT = 200;
  private static final Integer MAX_PARENT_DETAIL_FIELDS = 25;

  @AuraEnabled(cacheable=true)
  public static List<ParentRecordOption> fetchParentRecords(
    String objectApiName,
    String whereClause,
    String orderByClause,
    String fieldApiNames,
    Integer limitSize
  ) {
    if (String.isBlank(objectApiName)) {
      return new List<ParentRecordOption>();
    }

    Schema.SObjectType sObjectType = Schema.getGlobalDescribe()
      .get(objectApiName);
    if (sObjectType == null) {
      throw new AuraHandledException('Parent Object API Name is invalid.');
    }

    Schema.DescribeSObjectResult describe = sObjectType.getDescribe();
    Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();
    Boolean hasNameField = fieldMap != null && fieldMap.containsKey('Name');
    String nameFieldApiName = hasNameField ? 'Name' : null;

    Integer recordLimit = sanitizeLimit(limitSize);
    String orderField = hasNameField ? 'Name' : 'Id';

    List<String> additionalFields = LRES_FieldValidationUtil.parseFieldList(
      fieldApiNames
    );
    Set<String> normalizedFieldSet = new Set<String>();
    List<String> selectFields = new List<String>();
    selectFields.add('Id');
    if (hasNameField) {
      selectFields.add('Name');
    }

    String sanitizedWhere = LRES_FieldValidationUtil.sanitizeWhereClause(
      whereClause,
      'Parent record filter cannot include ',
      objectApiName,
      null
    );

    List<String> whereFields = new List<String>();
    if (String.isNotBlank(sanitizedWhere)) {
      whereFields = LRES_FieldValidationUtil.extractFieldsFromWhereClause(
        sanitizedWhere,
        objectApiName,
        null
      );
    }

    Map<String, String> fieldRefToNormalized = new Map<String, String>();
    Map<String, String> fieldLabelMap = new Map<String, String>();
    for (String fieldRef : additionalFields) {
      if (normalizedFieldSet.size() >= MAX_PARENT_DETAIL_FIELDS) {
        break;
      }
      if (fieldRef == null) {
        continue;
      }
      String normalizedFieldRef = LRES_FieldValidationUtil.validateAndNormalizeFieldPath(
        objectApiName,
        fieldRef
      );
      if (normalizedFieldRef == null) {
        continue;
      }
      String label = LRES_FieldValidationUtil.resolveFieldLabel(
        describe,
        normalizedFieldRef
      );
      if (!selectFields.contains(normalizedFieldRef)) {
        selectFields.add(normalizedFieldRef);
      }
      if (label != null) {
        fieldLabelMap.put(fieldRef, label);
      }
      if (!normalizedFieldSet.contains(normalizedFieldRef)) {
        normalizedFieldSet.add(normalizedFieldRef);
        fieldRefToNormalized.put(fieldRef, normalizedFieldRef);
      }
    }

    // PRE-FILTER: Validate FLS for SELECT, ORDER BY, and WHERE fields
    LRES_FieldValidationUtil.FlsValidationResult flsResult = LRES_FieldValidationUtil.validateFieldAccessibility(
      objectApiName,
      selectFields,
      orderField,
      whereFields
    );

    Boolean orderFieldAccessible = !flsResult.droppedOrderByFields.contains(
      orderField
    );

    // Log FLS removals for diagnostics
    if (flsResult.hasRemovals) {
      System.debug(
        LoggingLevel.WARN,
        'FLS Validation Removed Fields (Parent Records):'
      );
      System.debug(
        LoggingLevel.WARN,
        'Dropped SELECT fields: ' + flsResult.droppedSelectFields
      );
      System.debug(
        LoggingLevel.WARN,
        'Dropped ORDER BY fields: ' + flsResult.droppedOrderByFields
      );
      System.debug(
        LoggingLevel.WARN,
        'Dropped WHERE fields: ' + flsResult.droppedWhereFields
      );
    }

    // Use only accessible fields for SELECT
    List<String> accessibleSelectFields = flsResult.accessibleFields;
    if (!accessibleSelectFields.contains('Id')) {
      accessibleSelectFields.add('Id');
    }

    // Build list of valid fields that passed FLS check
    Set<String> accessibleFieldSet = new Set<String>(accessibleSelectFields);
    List<String> validFields = new List<String>();
    for (String fieldRef : fieldRefToNormalized.keySet()) {
      String normalizedFieldRef = fieldRefToNormalized.get(fieldRef);
      if (accessibleFieldSet.contains(normalizedFieldRef)) {
        validFields.add(fieldRef);
      }
    }

    String soql = 'SELECT ' + String.join(accessibleSelectFields, ', ');
    soql += ' FROM ' + objectApiName;

    // Validate WHERE clause fields for FLS (explicit check for consistency with Card Records)
    if (String.isNotBlank(sanitizedWhere)) {
      if (!flsResult.droppedWhereFields.isEmpty()) {
        throw new AuraHandledException(
          'Insufficient permissions: the specified Parent Records WHERE Clause includes inaccessible fields: ' +
          String.join(flsResult.droppedWhereFields, ', ')
        );
      }
      soql += ' WHERE ' + sanitizedWhere;
    }

    LRES_FieldValidationUtil.OrderByMessages orderByMessages = LRES_FieldValidationUtil.buildOrderByMessages(
      'Parent ORDER BY clause'
    );
    String sanitizedOrderBy = LRES_FieldValidationUtil.sanitizeOrderByClause(
      orderByClause,
      orderByMessages
    );

    // Validate ORDER BY field FLS
    String effectiveOrderBy = null;
    if (String.isNotBlank(sanitizedOrderBy)) {
      // Extract first field from ORDER BY clause (could be comma-separated)
      String firstOrderField = sanitizedOrderBy.split(',')[0]
        .trim()
        .split('\\s+')[0];
      if (!flsResult.droppedOrderByFields.contains(firstOrderField)) {
        effectiveOrderBy = sanitizedOrderBy;
      } else {
        System.debug(
          LoggingLevel.WARN,
          'Dropped ORDER BY field due to FLS: ' + firstOrderField
        );
      }
    }

    soql += ' WITH SECURITY_ENFORCED';

    if (String.isNotBlank(effectiveOrderBy)) {
      soql += ' ORDER BY ' + effectiveOrderBy;
    } else if (orderFieldAccessible) {
      soql += ' ORDER BY ' + orderField + ' NULLS LAST';
    } else {
      soql += ' ORDER BY Id NULLS LAST';
    }

    soql += ' LIMIT ' + recordLimit;
    System.debug(
      LoggingLevel.FINE,
      'LRES_KanbanParentRecordsController SOQL: ' + soql
    );

    List<SObject> records;
    try {
      records = Database.query(soql);

      // FINAL GUARD: Strip any inaccessible fields from results
      SObjectAccessDecision securityDecision = Security.stripInaccessible(
        AccessType.READABLE,
        records
      );
      records = securityDecision.getRecords();
    } catch (Exception ex) {
      throw new AuraHandledException(
        'Unable to load parent records: ' + ex.getMessage()
      );
    }

    List<ParentRecordOption> results = new List<ParentRecordOption>();
    Set<String> validFieldSet = new Set<String>(validFields);
    for (SObject row : records) {
      ParentRecordOption option = new ParentRecordOption();
      option.id = String.valueOf(row.get('Id'));
      Object rawLabel = (nameFieldApiName != null)
        ? row.get(nameFieldApiName)
        : null;
      option.label = rawLabel != null ? String.valueOf(rawLabel) : option.id;
      option.subtitle = describe.getLabel();
      if (!fieldRefToNormalized.isEmpty()) {
        option.fields = new Map<String, String>();
        for (String fieldRef : fieldRefToNormalized.keySet()) {
          if (fieldRef == null) {
            continue;
          }
          if (validFieldSet.contains(fieldRef)) {
            // Field was accessible - extract real value
            String normalizedFieldRef = LRES_FieldValidationUtil.stripObjectPrefix(
              objectApiName,
              fieldRef
            );
            Object fieldValue = LRES_FieldValidationUtil.extractFieldValue(
              row,
              normalizedFieldRef
            );
            if (fieldValue != null) {
              option.fields.put(fieldRef, String.valueOf(fieldValue));
            }
          } else {
            // Field was dropped due to FLS
            option.fields.put(fieldRef, '[inaccessible]');
          }
        }
        option.fieldLabels = new Map<String, String>(fieldLabelMap);
      }
      results.add(option);
    }

    return results;
  }

  private static Integer sanitizeLimit(Integer requested) {
    Integer value = requested;
    if (value == null) {
      value = DEFAULT_LIMIT;
    }
    if (value < 1) {
      value = 1;
    }
    if (value > MAX_LIMIT) {
      value = MAX_LIMIT;
    }
    return value;
  }

  public class ParentRecordOption {
    @AuraEnabled
    public String id;

    @AuraEnabled
    public String label;

    @AuraEnabled
    public String subtitle;

    @AuraEnabled
    public Map<String, String> fields { get; set; }

    @AuraEnabled
    public Map<String, String> fieldLabels { get; set; }
  }
}

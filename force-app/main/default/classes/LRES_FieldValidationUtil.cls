public with sharing class LRES_FieldValidationUtil {
  public class OrderByMessages {
    public String blockedClausePrefix;
    public String invalidFieldReferencePrefix;
    public String unsupportedNullsDirectiveMessage;
    public String incompleteNullsDirectiveMessage;
    public String unsupportedTokensMessage;
  }

  public class FlsValidationResult {
    public List<String> accessibleFields;
    public List<String> droppedSelectFields;
    public List<String> droppedOrderByFields;
    public List<String> droppedWhereFields;
    public Boolean hasRemovals;

    public FlsValidationResult() {
      this.accessibleFields = new List<String>();
      this.droppedSelectFields = new List<String>();
      this.droppedOrderByFields = new List<String>();
      this.droppedWhereFields = new List<String>();
      this.hasRemovals = false;
    }
  }

  public static OrderByMessages buildOrderByMessages(String clauseLabel) {
    OrderByMessages messages = new OrderByMessages();
    messages.blockedClausePrefix = clauseLabel + ' cannot include ';
    messages.invalidFieldReferencePrefix =
      clauseLabel + ' contains an invalid field reference: ';
    messages.unsupportedNullsDirectiveMessage =
      clauseLabel + ' has unsupported NULLS directive.';
    messages.incompleteNullsDirectiveMessage =
      clauseLabel + ' has incomplete NULLS directive.';
    messages.unsupportedTokensMessage =
      clauseLabel + ' contains unsupported tokens.';
    return messages;
  }

  public static String sanitizeWhereClause(
    String rawWhere,
    String blockedClausePrefix
  ) {
    return sanitizeWhereClause(
      rawWhere,
      blockedClausePrefix,
      null,
      null,
      false
    );
  }

  public static String sanitizeWhereClause(
    String rawWhere,
    String blockedClausePrefix,
    String objectApiName,
    Set<String> allowedFieldPaths
  ) {
    return sanitizeWhereClause(
      rawWhere,
      blockedClausePrefix,
      objectApiName,
      allowedFieldPaths,
      false
    );
  }

  public static String sanitizeWhereClause(
    String rawWhere,
    String blockedClausePrefix,
    String objectApiName,
    Set<String> allowedFieldPaths,
    Boolean debugWhereErrors
  ) {
    if (String.isBlank(rawWhere)) {
      return null;
    }
    String trimmed = rawWhere.trim();
    if (trimmed.length() == 0) {
      return null;
    }
    String lower = trimmed.toLowerCase();
    if (lower.startsWith('where ')) {
      trimmed = trimmed.substring(5).trim();
      lower = trimmed.toLowerCase();
    } else if ('where'.equals(lower)) {
      return null;
    }

    LRES_WhereClauseParser.ParseResult result = LRES_WhereClauseParser.parse(
      trimmed,
      objectApiName,
      allowedFieldPaths,
      blockedClausePrefix,
      debugWhereErrors
    );
    return result != null ? result.canonicalWhere : null;
  }

  public static String sanitizeOrderByClause(
    String rawOrderBy,
    OrderByMessages messages
  ) {
    if (String.isBlank(rawOrderBy)) {
      return null;
    }
    String trimmed = rawOrderBy.trim();
    if (trimmed.length() == 0) {
      return null;
    }

    Matcher blockedMatcher = Pattern.compile(
        '(?i)(limit|offset|where|group\\s+by|having)'
      )
      .matcher(trimmed);
    if (blockedMatcher.find()) {
      String detected = blockedMatcher.group(1)
        .toUpperCase()
        .replaceAll('\\s+', ' ');
      throw buildAuraException(
        messages.blockedClausePrefix + detected + ' clauses.'
      );
    }
    String lower = trimmed.toLowerCase();
    if (lower.startsWith('order by ')) {
      trimmed = trimmed.substring(8).trim();
      lower = trimmed.toLowerCase();
    } else if (lower == 'order' || lower == 'order by') {
      return null;
    }

    String canonical = (' ' + lower.replaceAll('[\\s\\t\\r\\n]+', ' ') + ' ');
    if (containsClause(canonical, 'limit')) {
      throw buildAuraException(messages.blockedClausePrefix + 'LIMIT clauses.');
    } else if (containsClause(canonical, 'offset')) {
      throw buildAuraException(
        messages.blockedClausePrefix + 'OFFSET clauses.'
      );
    } else if (containsClause(canonical, 'where')) {
      throw buildAuraException(messages.blockedClausePrefix + 'WHERE clauses.');
    } else if (containsClause(canonical, 'group by')) {
      throw buildAuraException(
        messages.blockedClausePrefix + 'GROUP BY clauses.'
      );
    } else if (containsClause(canonical, 'having')) {
      throw buildAuraException(
        messages.blockedClausePrefix + 'HAVING clauses.'
      );
    }

    List<String> parts = trimmed.split(',');
    List<String> sanitizedParts = new List<String>();
    for (String part : parts) {
      if (String.isBlank(part)) {
        continue;
      }
      List<String> tokens = new List<String>();
      for (String token : part.trim().split('\\s+')) {
        if (!String.isBlank(token)) {
          tokens.add(token);
        }
      }
      for (String token : tokens) {
        String tokenLower = token.toLowerCase();
        if (tokenLower == 'limit') {
          throw buildAuraException(
            messages.blockedClausePrefix + 'LIMIT clauses.'
          );
        }
        if (tokenLower == 'offset') {
          throw buildAuraException(
            messages.blockedClausePrefix + 'OFFSET clauses.'
          );
        }
        if (tokenLower == 'where') {
          throw buildAuraException(
            messages.blockedClausePrefix + 'WHERE clauses.'
          );
        }
        if (tokenLower == 'having') {
          throw buildAuraException(
            messages.blockedClausePrefix + 'HAVING clauses.'
          );
        }
      }
      if (tokens.isEmpty()) {
        continue;
      }

      String fieldRef = tokens[0];
      if (!isValidFieldPath(fieldRef)) {
        throw buildAuraException(
          messages.invalidFieldReferencePrefix + fieldRef
        );
      }

      Integer idx = 1;
      String direction = null;
      String nullsDirective = null;
      if (idx < tokens.size()) {
        String maybeDirection = tokens[idx].toLowerCase();
        if (maybeDirection == 'asc' || maybeDirection == 'desc') {
          direction = maybeDirection.toUpperCase();
          idx++;
        }
      }
      if (idx < tokens.size() && tokens[idx].toLowerCase() == 'nulls') {
        idx++;
        if (idx < tokens.size()) {
          String nullsValue = tokens[idx].toLowerCase();
          if (nullsValue == 'first' || nullsValue == 'last') {
            nullsDirective = 'NULLS ' + nullsValue.toUpperCase();
            idx++;
          } else {
            throw buildAuraException(messages.unsupportedNullsDirectiveMessage);
          }
        } else {
          throw buildAuraException(messages.incompleteNullsDirectiveMessage);
        }
      }
      if (idx != tokens.size()) {
        throw buildAuraException(messages.unsupportedTokensMessage);
      }

      String clause = fieldRef;
      if (direction != null) {
        clause += ' ' + direction;
      }
      if (nullsDirective != null) {
        clause += ' ' + nullsDirective;
      }
      sanitizedParts.add(clause);
    }

    if (sanitizedParts.isEmpty()) {
      return null;
    }
    return String.join(sanitizedParts, ', ');
  }

  public static Boolean containsClause(String canonical, String clause) {
    if (String.isBlank(canonical) || String.isBlank(clause)) {
      return false;
    }
    return canonical.contains(' ' + clause + ' ');
  }

  public static String stripObjectPrefix(String baseName, String fieldPath) {
    if (String.isBlank(baseName) || String.isBlank(fieldPath)) {
      return fieldPath;
    }
    String prefix = baseName + '.';
    if (fieldPath.startsWith(prefix)) {
      return fieldPath.substring(prefix.length());
    }
    if (fieldPath.toLowerCase().startsWith(prefix.toLowerCase())) {
      return fieldPath.substring(prefix.length());
    }
    return fieldPath;
  }

  public static Boolean isValidFieldPath(String fieldPath) {
    if (String.isBlank(fieldPath)) {
      return false;
    }
    for (String segment : fieldPath.split('\\.')) {
      if (!Pattern.matches('^[A-Za-z_][A-Za-z0-9_]*$', segment)) {
        return false;
      }
    }
    return true;
  }

  public static String validateAndNormalizeFieldPath(
    String objectName,
    String fieldPath
  ) {
    String normalized = stripObjectPrefix(objectName, fieldPath);
    return isValidFieldPath(normalized) ? normalized : null;
  }

  /**
   * Extracts field names from a WHERE clause for FLS validation.
   * Uses regex to identify field references and filters out SQL keywords.
   */
  public static List<String> extractFieldsFromWhereClause(String whereClause) {
    return extractFieldsFromWhereClause(whereClause, null, null, false);
  }

  public static List<String> extractFieldsFromWhereClause(
    String whereClause,
    String objectApiName,
    Set<String> allowedFieldPaths
  ) {
    return extractFieldsFromWhereClause(
      whereClause,
      objectApiName,
      allowedFieldPaths,
      false
    );
  }

  public static List<String> extractFieldsFromWhereClause(
    String whereClause,
    String objectApiName,
    Set<String> allowedFieldPaths,
    Boolean debugWhereErrors
  ) {
    if (String.isBlank(whereClause)) {
      return new List<String>();
    }

    LRES_WhereClauseParser.ParseResult result = LRES_WhereClauseParser.parse(
      whereClause,
      objectApiName,
      allowedFieldPaths,
      'Filter cannot include ',
      debugWhereErrors
    );
    return result != null &&
      result.referencedFields != null
      ? result.referencedFields
      : new List<String>();
  }

  public static List<String> parseFieldList(String rawList) {
    List<String> result = new List<String>();
    if (String.isBlank(rawList)) {
      return result;
    }
    for (String entry : rawList.split(',')) {
      if (entry == null) {
        continue;
      }
      String trimmed = entry.trim();
      if (trimmed.length() == 0) {
        continue;
      }
      result.add(trimmed);
    }
    return result;
  }

  public static List<String> parseFieldList(List<String> fieldList) {
    if (fieldList == null) {
      return new List<String>();
    }
    return new List<String>(fieldList);
  }

  public static Object extractFieldValue(SObject row, String fieldPath) {
    if (row == null || String.isBlank(fieldPath)) {
      return null;
    }
    List<String> segments = fieldPath.split('\\.');
    if (segments.isEmpty()) {
      return null;
    }
    SObject current = row;
    for (Integer i = 0; i < segments.size() - 1; i++) {
      if (current == null) {
        return null;
      }
      String relationshipName = segments[i];
      current = current.getSObject(relationshipName);
    }
    if (current == null) {
      return null;
    }
    String finalField = segments[segments.size() - 1];
    return current.get(finalField);
  }

  public static String resolveFieldLabel(
    Schema.DescribeSObjectResult describe,
    String fieldPath
  ) {
    if (describe == null || String.isBlank(fieldPath)) {
      return null;
    }
    List<String> segments = fieldPath.split('\\.');
    if (segments.isEmpty()) {
      return null;
    }
    Schema.DescribeSObjectResult currentDescribe = describe;
    for (Integer i = 0; i < segments.size(); i++) {
      String segment = segments[i];
      Map<String, Schema.SObjectField> fields = currentDescribe.fields.getMap();
      if (fields == null) {
        return null;
      }
      if (i == segments.size() - 1) {
        if (!fields.containsKey(segment)) {
          return formatApiName(segment);
        }
        Schema.DescribeFieldResult fieldDescribe = fields.get(segment)
          .getDescribe();
        String label = fieldDescribe.getLabel();
        return String.isNotBlank(label) ? label : formatApiName(segment);
      }
      Schema.DescribeFieldResult relationshipField = findRelationshipField(
        fields,
        segment
      );
      if (relationshipField == null) {
        return null;
      }
      List<Schema.SObjectType> references = relationshipField.getReferenceTo();
      if (references == null || references.isEmpty()) {
        return null;
      }
      currentDescribe = references[0].getDescribe();
    }
    return null;
  }

  private static Schema.DescribeFieldResult findRelationshipField(
    Map<String, Schema.SObjectField> fields,
    String relationshipSegment
  ) {
    if (fields == null || String.isBlank(relationshipSegment)) {
      return null;
    }
    for (Schema.SObjectField field : fields.values()) {
      Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
      if (fieldDescribe == null) {
        continue;
      }
      String relName = fieldDescribe.getRelationshipName();
      if (
        String.isNotBlank(relName) &&
        relName.equalsIgnoreCase(relationshipSegment)
      ) {
        return fieldDescribe;
      }
    }
    return null;
  }

  private static String formatApiName(String apiName) {
    if (String.isBlank(apiName)) {
      return '';
    }
    String cleaned = apiName;
    cleaned = cleaned.replaceAll('__(c|r|pc|pr|x|b)$', '');
    cleaned = cleaned.replaceAll('__', ' ');
    String result = cleaned.replaceAll('([a-z0-9])([A-Z])', '$1 $2').trim();
    if (result.length() == 0) {
      return apiName;
    }
    return result.substring(0, 1).toUpperCase() + result.substring(1);
  }

  /**
   * Validates field accessibility for SOQL query construction.
   * Walks relationship paths and checks isAccessible/isQueryable.
   */
  public static FlsValidationResult validateFieldAccessibility(
    String objectApiName,
    List<String> selectFields,
    String orderByField
  ) {
    return validateFieldAccessibility(
      objectApiName,
      selectFields,
      orderByField,
      null
    );
  }

  /**
   * Validates field accessibility for SOQL query construction including WHERE fields.
   * Walks relationship paths and checks isAccessible/isQueryable.
   */
  public static FlsValidationResult validateFieldAccessibility(
    String objectApiName,
    List<String> selectFields,
    String orderByField,
    List<String> whereFields
  ) {
    FlsValidationResult result = new FlsValidationResult();

    Schema.SObjectType sObjectType = Schema.getGlobalDescribe()
      .get(objectApiName);
    if (sObjectType == null) {
      return result;
    }

    Schema.DescribeSObjectResult objectDescribe = sObjectType.getDescribe();

    // Validate SELECT fields
    if (selectFields != null) {
      for (String fieldPath : selectFields) {
        if (isFieldAccessible(objectDescribe, fieldPath)) {
          result.accessibleFields.add(fieldPath);
        } else {
          result.droppedSelectFields.add(fieldPath);
        }
      }
    }

    // Validate ORDER BY field
    if (String.isNotBlank(orderByField)) {
      if (!isFieldAccessible(objectDescribe, orderByField)) {
        result.droppedOrderByFields.add(orderByField);
      }
    }

    // Validate WHERE fields
    if (whereFields != null) {
      for (String fieldPath : whereFields) {
        if (!isFieldAccessible(objectDescribe, fieldPath)) {
          result.droppedWhereFields.add(fieldPath);
        }
      }
    }

    result.hasRemovals =
      !result.droppedSelectFields.isEmpty() ||
      !result.droppedOrderByFields.isEmpty() ||
      !result.droppedWhereFields.isEmpty();

    return result;
  }

  /**
   * Checks if a field path is accessible, walking relationship segments.
   */
  private static Boolean isFieldAccessible(
    Schema.DescribeSObjectResult objectDescribe,
    String fieldPath
  ) {
    if (String.isBlank(fieldPath)) {
      return false;
    }

    List<String> segments = fieldPath.split('\\.');
    Schema.DescribeSObjectResult currentDescribe = objectDescribe;

    for (Integer i = 0; i < segments.size(); i++) {
      String segment = segments[i];
      Map<String, Schema.SObjectField> fields = currentDescribe.fields.getMap();

      Schema.DescribeFieldResult fieldDescribe = fields.containsKey(segment)
        ? fields.get(segment).getDescribe()
        : findRelationshipField(fields, segment);

      if (fieldDescribe == null) {
        return false;
      }

      // Check accessibility and queryability
      if (!fieldDescribe.isAccessible()) {
        return false;
      }

      // If not last segment, navigate to related object
      if (i < segments.size() - 1) {
        List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
        if (references == null || references.isEmpty()) {
          return false;
        }
        currentDescribe = references[0].getDescribe();
      }
    }

    return true;
  }

  private static AuraHandledException buildAuraException(String message) {
    AuraHandledException ex = new AuraHandledException(message);
    ex.setMessage(message);
    return ex;
  }
}

@IsTest
private class LRES_FieldValidationUtilTest {
  private static LRES_FieldValidationUtil.OrderByMessages buildMessages(
    String label
  ) {
    LRES_FieldValidationUtil.OrderByMessages messages = new LRES_FieldValidationUtil.OrderByMessages();
    messages.blockedClausePrefix = label + ' cannot include ';
    messages.invalidFieldReferencePrefix =
      label + ' contains an invalid field reference: ';
    messages.unsupportedNullsDirectiveMessage =
      label + ' has unsupported NULLS directive.';
    messages.incompleteNullsDirectiveMessage =
      label + ' has incomplete NULLS directive.';
    messages.unsupportedTokensMessage = label + ' contains unsupported tokens.';
    return messages;
  }

  @IsTest
  static void sanitizeWhereClauseBlocksUnsupported() {
    String sanitized = LRES_FieldValidationUtil.sanitizeWhereClause(
      'Status = \'New\'',
      'Test filter cannot include ',
      'Case',
      null
    );
    System.assertEquals(
      'Status = \'New\'',
      sanitized,
      'Should return trimmed WHERE clause.'
    );

    Boolean threw = false;
    try {
      LRES_FieldValidationUtil.sanitizeWhereClause(
        'Status = \'New\' ORDER BY CreatedDate',
        'Test filter cannot include ',
        'Case',
        null
      );
    } catch (AuraHandledException ex) {
      threw = true;
    }
    System.assertEquals(true, threw, 'Unsupported clause should throw.');

    Boolean quotesThrown = false;
    try {
      LRES_FieldValidationUtil.sanitizeWhereClause(
        'Priority = \"High\"',
        'Test filter cannot include ',
        'Case',
        null
      );
    } catch (AuraHandledException ex) {
      quotesThrown = true;
      System.assert(
        ex.getMessage() != null &&
        ex.getMessage().toLowerCase().contains('double quotes'),
        'Double-quote usage should surface a clear message.'
      );
    }
    System.assertEquals(
      true,
      quotesThrown,
      'Double quotes should be rejected.'
    );
  }

  @IsTest
  static void sanitizeOrderByClauseValidatesFieldsAndClauses() {
    LRES_FieldValidationUtil.OrderByMessages messages = buildMessages(
      'Test ORDER BY clause'
    );
    String sanitized = LRES_FieldValidationUtil.sanitizeOrderByClause(
      'Subject DESC, Owner.Name ASC NULLS LAST',
      messages
    );
    System.assertEquals(
      'Subject DESC, Owner.Name ASC NULLS LAST',
      sanitized,
      'Valid ORDER BY should be returned unchanged.'
    );

    Boolean blockedThrown = false;
    try {
      LRES_FieldValidationUtil.sanitizeOrderByClause(
        'Subject DESC LIMIT 1',
        messages
      );
    } catch (AuraHandledException ex) {
      blockedThrown = true;
    }
    System.assertEquals(true, blockedThrown, 'LIMIT should be blocked.');
  }

  @IsTest
  static void fieldPathHelpersStripValidateAndExtract() {
    System.assertEquals(
      'Subject',
      LRES_FieldValidationUtil.stripObjectPrefix('Case', 'Case.Subject'),
      'Prefix should be removed when it matches.'
    );
    System.assertEquals(
      'Foo__r.Bar__c',
      LRES_FieldValidationUtil.stripObjectPrefix('Case', 'Foo__r.Bar__c'),
      'Relationship paths should not be altered.'
    );
    System.assertEquals(
      false,
      LRES_FieldValidationUtil.isValidFieldPath('Bad$Field'),
      'Invalid field names should fail validation.'
    );

    Account account = new Account(Name = 'Parent');
    Object accountName = LRES_FieldValidationUtil.extractFieldValue(
      account,
      'Name'
    );
    System.assertEquals(
      'Parent',
      accountName,
      'Field extraction should resolve values.'
    );
  }

  @IsTest
  static void resolveFieldLabelAndParseFieldLists() {
    Schema.DescribeSObjectResult describe = Account.SObjectType.getDescribe();
    String label = LRES_FieldValidationUtil.resolveFieldLabel(describe, 'Name');
    System.assert(
      String.isNotBlank(label),
      'Field label should be returned for valid fields.'
    );

    List<String> parsedFromString = LRES_FieldValidationUtil.parseFieldList(
      'Name,Owner.Name, ,'
    );
    System.assertEquals(
      2,
      parsedFromString.size(),
      'Parsing string lists should ignore blanks.'
    );

    List<String> parsedFromList = LRES_FieldValidationUtil.parseFieldList(
      new List<String>{ 'Subject', 'Owner.Name' }
    );
    System.assertEquals(
      2,
      parsedFromList.size(),
      'Parsing list input should return a copy.'
    );
  }
}

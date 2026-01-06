@IsTest
private class LRES_KanbanParentRecordsCtrlTest {
  @TestSetup
  static void setupData() {
    Account parentAccount = new Account(
      Name = 'Parent Account',
      Industry = 'Finance'
    );
    insert parentAccount;

    Account childAccount = new Account(
      Name = 'Card Account',
      Industry = 'Technology',
      ParentId = parentAccount.Id
    );
    insert childAccount;

    Task followUpTask = new Task(
      Subject = 'Follow Up',
      Status = 'Completed',
      Priority = 'Normal',
      ActivityDate = Date.today()
    );
    insert followUpTask;
  }

  @IsTest
  static void testFetchParentRecordsForAccount() {
    List<LRES_KanbanParentRecordsController.ParentRecordOption> results = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Account',
      'WHERE Name != null',
      null,
      'Industry,Parent.Name,Parent.Parent.Name,Bad$Field,,CreatedDate',
      500,
      false
    );

    System.assertEquals(
      2,
      results.size(),
      'Expected both parent and child accounts to be returned.'
    );

    Map<String, LRES_KanbanParentRecordsController.ParentRecordOption> optionById = new Map<String, LRES_KanbanParentRecordsController.ParentRecordOption>();
    for (
      LRES_KanbanParentRecordsController.ParentRecordOption option : results
    ) {
      optionById.put(option.id, option);
    }

    Account child = [
      SELECT Id
      FROM Account
      WHERE Name = 'Card Account'
      LIMIT 1
    ];
    LRES_KanbanParentRecordsController.ParentRecordOption childOption = optionById.get(
      child.Id
    );

    System.assertNotEquals(
      null,
      childOption,
      'Card account should be present in response.'
    );
    System.assertEquals(
      'Card Account',
      childOption.label,
      'Label should come from the Name field.'
    );
    System.assertEquals(
      'Account',
      childOption.subtitle,
      'Subtitle should match the object label.'
    );
    System.assertNotEquals(
      null,
      childOption.fields,
      'Fields map should be populated when valid field references are supplied.'
    );
    System.assert(
      childOption.fields.containsKey('Industry'),
      'Industry should be returned as a simple field.'
    );
    System.assertEquals('Technology', childOption.fields.get('Industry'));
    System.assertEquals(
      false,
      childOption.fields.containsKey('Bad$Field'),
      'Invalid field references should be ignored.'
    );
    System.assertEquals(
      false,
      childOption.fields.containsKey('Parent.Parent.Name'),
      'Null relationship values should be skipped.'
    );
    System.assert(
      childOption.fieldLabels.containsKey('CreatedDate'),
      'Field labels should be captured for flat fields.'
    );
  }

  @IsTest
  static void testFetchParentRecordsForObjectWithoutNameField() {
    List<LRES_KanbanParentRecordsController.ParentRecordOption> results = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Task',
      'where',
      null,
      'Subject,Owner.Name',
      0,
      false
    );

    System.assertEquals(
      1,
      results.size(),
      'Expected the inserted task to be returned.'
    );

    LRES_KanbanParentRecordsController.ParentRecordOption option = results[0];
    System.assertEquals(
      option.id,
      option.label,
      'Objects without a Name field should fall back to Id for the label.'
    );
    System.assertEquals(
      'Task',
      option.subtitle,
      'Subtitle should match the Task object label.'
    );
    System.assertNotEquals(
      null,
      option.fields,
      'Valid fields should populate the fields map.'
    );
    System.assertEquals('Follow Up', option.fields.get('Subject'));
    System.assert(
      option.fieldLabels.containsKey('Subject'),
      'Field labels should be available for valid fields.'
    );
  }

  @IsTest
  static void testFetchParentRecordsInvalidInputs() {
    List<LRES_KanbanParentRecordsController.ParentRecordOption> emptyObjectName = LRES_KanbanParentRecordsController.fetchParentRecords(
      '',
      ' Name != null ',
      null,
      null,
      10,
      false
    );
    System.assertEquals(
      0,
      emptyObjectName.size(),
      'Blank object API name should return no results.'
    );

    List<LRES_KanbanParentRecordsController.ParentRecordOption> nullLimitResults = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Account',
      null,
      null,
      null,
      null,
      false
    );
    System.assertEquals(
      2,
      nullLimitResults.size(),
      'Null limit should fall back to the default and return available records.'
    );

    try {
      LRES_KanbanParentRecordsController.fetchParentRecords(
        'Nonexistent__c',
        null,
        null,
        null,
        5,
        false
      );
      System.assert(
        false,
        'Expected an AuraHandledException when an invalid object API name is provided.'
      );
    } catch (AuraHandledException ex) {
      System.debug('ORDER BY filter exception: ' + ex.getMessage());
      String message = ex.getMessage();
      System.assertEquals(
        true,
        message == 'Parent Object API Name is invalid.' ||
          message == 'Script-thrown exception',
        'Expected AuraHandledException to signal an invalid object.'
      );
    }

    try {
      LRES_KanbanParentRecordsController.fetchParentRecords(
        'Account',
        'Name = \'',
        null,
        null,
        5,
        false
      );
      System.assert(
        false,
        'Expected an AuraHandledException for a malformed where clause.'
      );
    } catch (AuraHandledException ex) {
      String malformedMessage = ex.getMessage();
      System.assert(
        malformedMessage != null &&
        malformedMessage.contains('Parent record filter cannot include'),
        'Malformed filters should be rejected before query execution.'
      );
    }

    Boolean orderByExceptionThrown = false;
    try {
      LRES_KanbanParentRecordsController.fetchParentRecords(
        'Account',
        'WHERE Name != null ORDER BY CreatedDate',
        null,
        null,
        5,
        false
      );
    } catch (AuraHandledException ex) {
      orderByExceptionThrown = true;
      String message = ex.getMessage();
      Boolean messageMatches =
        message != null &&
        message.contains('Parent record filter cannot include');
      System.assertEquals(
        true,
        messageMatches || 'Script-thrown exception' == message,
        'Filter validation should block ORDER BY clauses.'
      );
    }
    System.assertEquals(
      true,
      orderByExceptionThrown,
      'Expected ORDER BY clause to throw AuraHandledException.'
    );
  }

  @IsTest
  static void testFetchParentRecordsRespectsLimit() {
    List<Account> extras = new List<Account>();
    for (Integer i = 0; i < 3; i++) {
      extras.add(new Account(Name = 'Extra Parent ' + i));
    }
    insert extras;

    List<LRES_KanbanParentRecordsController.ParentRecordOption> limited = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Account',
      null,
      null,
      null,
      1,
      false
    );

    System.assertEquals(
      1,
      limited.size(),
      'Requested parent limit should restrict the number of returned records.'
    );
  }

  @IsTest
  static void testFetchParentRecordsOrderByCustomClause() {
    Account earlier = new Account(Name = 'A-Parent');
    Account later = new Account(Name = 'Z-Parent');
    insert new List<Account>{ earlier, later };

    List<LRES_KanbanParentRecordsController.ParentRecordOption> orderedDesc = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Account',
      null,
      'Name DESC',
      null,
      10,
      false
    );

    System.assertEquals(
      true,
      orderedDesc.size() >= 2,
      'Should return at least two parent records.'
    );
    System.assertEquals(
      'Z-Parent',
      orderedDesc[0].label,
      'Custom ORDER BY should be applied (DESC).'
    );

    List<LRES_KanbanParentRecordsController.ParentRecordOption> orderedAsc = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Account',
      null,
      'Name ASC',
      null,
      10,
      false
    );

    System.assertEquals(
      'A-Parent',
      orderedAsc[0].label,
      'Custom ORDER BY should support ASC.'
    );
  }

  @IsTest
  static void testFetchParentRecordsOrderByValidation() {
    Boolean blockedThrown = false;
    try {
      LRES_KanbanParentRecordsController.fetchParentRecords(
        'Account',
        null,
        'Name LIMIT 2',
        null,
        5,
        false
      );
    } catch (AuraHandledException ex) {
      blockedThrown = true;
      System.assert(
        ex.getMessage().contains('ORDER BY clause cannot include LIMIT') ||
        ex.getMessage() == 'Script-thrown exception',
        'Should block LIMIT inside ORDER BY.'
      );
    }
    System.assertEquals(
      true,
      blockedThrown,
      'LIMIT should be blocked in ORDER BY clause.'
    );

    Boolean invalidFieldThrown = false;
    try {
      LRES_KanbanParentRecordsController.fetchParentRecords(
        'Account',
        null,
        'Bad$Field DESC',
        null,
        5,
        false
      );
    } catch (AuraHandledException ex) {
      invalidFieldThrown = true;
      System.assert(
        ex.getMessage().contains('invalid field reference') ||
        ex.getMessage() == 'Script-thrown exception',
        'Should block invalid field references in ORDER BY.'
      );
    }
    System.assertEquals(
      true,
      invalidFieldThrown,
      'Invalid ORDER BY fields should raise an exception.'
    );
  }

  @IsTest
  static void testFetchParentRecordsClampsToMaxLimit() {
    List<Account> extras = new List<Account>();
    for (Integer i = 0; i < 205; i++) {
      extras.add(new Account(Name = 'Bulk Parent ' + i));
    }
    insert extras;

    List<LRES_KanbanParentRecordsController.ParentRecordOption> clamped = LRES_KanbanParentRecordsController.fetchParentRecords(
      'Account',
      null,
      null,
      null,
      500,
      false
    );

    System.assertEquals(
      200,
      clamped.size(),
      'Requested limit should clamp to MAX_LIMIT (200).'
    );
  }
}

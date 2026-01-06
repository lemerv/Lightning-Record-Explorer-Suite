@IsTest
private class LRES_KanbanCardRecordsCtrlTest {
  @IsTest
  static void fetchRelatedCasesForAccount() {
    Account account = new Account(Name = 'Test Account');
    insert account;
    Case c1 = new Case(Subject = 'A', Status = 'New', AccountId = account.Id);
    Case c2 = new Case(
      Subject = 'B',
      Status = 'Working',
      AccountId = account.Id
    );
    insert new List<Case>{ c1, c2 };

    Test.startTest();
    List<String> fields = new List<String>{ 'Case.Subject', 'Case.Status' };
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
      account.Id,
      null,
      'Cases',
      'Case',
      fields,
      'Case.Subject',
      'ASC',
      10,
      null,
      null,
      false
    );
    Test.stopTest();

    System.assertEquals(2, records.size());
    System.assert(records[0].fields.containsKey('Case.Subject'));
    System.assertNotEquals(null, records[0].fields.get('Case.Subject').value);
  }

  @IsTest
  static void fetchRelatedCasesForContact() {
    Account account = new Account(Name = 'Parent');
    insert account;
    Contact contact = new Contact(
      FirstName = 'First',
      LastName = 'Last',
      AccountId = account.Id
    );
    insert contact;
    Case contactCase = new Case(
      Subject = 'Contact Case',
      Status = 'New',
      ContactId = contact.Id
    );
    insert contactCase;

    Test.startTest();
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
      contact.Id,
      null,
      'Cases',
      'Case',
      new List<String>{ 'Case.Subject', 'Case.ContactId' },
      'Case.Subject',
      'ASC',
      10,
      null,
      null,
      false
    );
    Test.stopTest();

    System.assertEquals(1, records.size());
    System.assertEquals(
      'Contact Case',
      records[0].fields.get('Case.Subject').value
    );
  }

  @IsTest
  static void fetchRelatedCasesForMultipleParents() {
    Account accountOne = new Account(Name = 'Multi Parent A');
    Account accountTwo = new Account(Name = 'Multi Parent B');
    insert new List<Account>{ accountOne, accountTwo };
    insert new List<Case>{
      new Case(
        Subject = 'Parent A Case',
        Status = 'New',
        AccountId = accountOne.Id
      ),
      new Case(
        Subject = 'Parent B Case',
        Status = 'Working',
        AccountId = accountTwo.Id
      )
    };

    Test.startTest();
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
      null,
      new List<Id>{ accountOne.Id, accountTwo.Id },
      'Cases',
      'Case',
      new List<String>{ 'Case.Subject' },
      'Case.Subject',
      'ASC',
      10,
      null,
      null,
      false
    );
    Test.stopTest();

    System.assertEquals(
      2,
      records.size(),
      'Records from each parent should be returned.'
    );
    Set<String> parentIds = new Set<String>();
    Set<String> parentNames = new Set<String>();
    for (LRES_KanbanCardRecordsController.RelatedRecord record : records) {
      System.assertNotEquals(
        null,
        record.parent,
        'Parent metadata should be populated.'
      );
      System.assertNotEquals(
        null,
        record.parent.name,
        'Parent name should be captured.'
      );
      parentIds.add(record.parent.id);
      parentNames.add(record.parent.name);
    }
    System.assertEquals(
      new Set<String>{
        String.valueOf(accountOne.Id),
        String.valueOf(accountTwo.Id)
      },
      parentIds
    );
    System.assert(
      parentNames.contains('Multi Parent A') &&
      parentNames.contains('Multi Parent B')
    );
  }

  @IsTest
  static void fetchRelatedCasesWithWhereClause() {
    Account account = new Account(Name = 'Filter Parent');
    insert account;
    insert new List<Case>{
      new Case(Subject = 'Alpha', Status = 'New', AccountId = account.Id),
      new Case(Subject = 'Bravo', Status = 'Working', AccountId = account.Id)
    };

    Test.startTest();
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
      account.Id,
      null,
      'Cases',
      'Case',
      new List<String>{ 'Case.Subject', 'Case.Status' },
      'Case.Subject',
      'ASC',
      10,
      'Status = \'Working\'',
      null,
      false
    );
    Test.stopTest();

    System.assertEquals(
      1,
      records.size(),
      'Only matching card records should be returned.'
    );
    System.assertEquals('Bravo', records[0].fields.get('Case.Subject').value);
  }

  @IsTest
  static void rejectWhereClauseWithOrderBy() {
    Account account = new Account(Name = 'Invalid Filter Parent');
    insert account;

    Test.startTest();
    Boolean threw = false;
    try {
      LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
        account.Id,
        null,
        'Cases',
        'Case',
        new List<String>{ 'Case.Subject' },
        'Case.Subject',
        'ASC',
        5,
        'Status = \'Working\' ORDER BY CreatedDate DESC',
        null,
        false
      );
    } catch (AuraHandledException ex) {
      threw = true;
    }
    Test.stopTest();

    System.assert(
      threw,
      'An AuraHandledException should be thrown for unsupported clauses.'
    );
  }

  @IsTest
  static void rejectWhereClauseWithInvalidOperator() {
    Account account = new Account(Name = 'Invalid Operator Parent');
    insert account;
    insert new Case(Subject = 'Case A', Status = 'New', AccountId = account.Id);

    Boolean threw = false;
    try {
      LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
        account.Id,
        null,
        'Cases',
        'Case',
        new List<String>{ 'Case.Subject' },
        'Case.Subject',
        'ASC',
        5,
        'IsClosed LIKE \'T%\'',
        null,
        false
      );
    } catch (AuraHandledException ex) {
      threw = true;
    }

    System.assert(
      threw,
      'Invalid operator for boolean fields should be rejected.'
    );
  }

  @IsTest
  static void acceptWhereClauseWithDateLiteral() {
    Account account = new Account(Name = 'Date Literal Parent');
    insert account;
    insert new Case(
      Subject = 'Case Today',
      Status = 'New',
      AccountId = account.Id
    );

    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
      account.Id,
      null,
      'Cases',
      'Case',
      new List<String>{ 'Case.Subject' },
      'Case.Subject',
      'ASC',
      5,
      'CreatedDate = TODAY',
      null,
      false
    );

    System.assertEquals(
      1,
      records.size(),
      'Date literal filters should be accepted.'
    );
  }

  @IsTest
  static void applyOrderByClauseBeforeUiSort() {
    Account account = new Account(Name = 'Order Parent');
    insert account;
    // Insert records separately so Id ordering is deterministic.
    Case first = new Case(
      Subject = 'Alpha',
      Status = 'New',
      AccountId = account.Id
    );
    insert first;
    Case second = new Case(
      Subject = 'Zulu',
      Status = 'Working',
      AccountId = account.Id
    );
    insert second;

    Test.startTest();
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
      account.Id,
      null,
      'Cases',
      'Case',
      new List<String>{ 'Case.Subject' },
      'Case.Subject',
      'ASC',
      10,
      null,
      'CreatedDate DESC, Id DESC',
      false
    );
    Test.stopTest();

    System.assertEquals(2, records.size(), 'Both records should be returned.');
    System.assertEquals(
      'Zulu',
      records[0].fields.get('Case.Subject').value,
      'Admin order-by should control initial fetch ordering before UI sort.'
    );
  }

  @IsTest
  static void rejectBlockedOrderByClause() {
    Account account = new Account(Name = 'Blocked Order Parent');
    insert account;

    Test.startTest();
    Boolean threw = false;
    try {
      LRES_KanbanCardRecordsController.fetchRelatedCardRecords(
        account.Id,
        null,
        'Cases',
        'Case',
        new List<String>{ 'Case.Subject' },
        'Case.Subject',
        'ASC',
        10,
        null,
        'CreatedDate DESC LIMIT 5',
        false
      );
    } catch (AuraHandledException ex) {
      threw = true;
    }
    Test.stopTest();

    System.assert(threw, 'LIMIT in ORDER BY clause should be rejected.');
  }

  @IsTest
  static void fetchParentlessCardRecordsWithoutParent() {
    insert new List<Case>{
      new Case(Subject = 'Alpha', Status = 'New', Origin = 'Phone'),
      new Case(Subject = 'Bravo', Status = 'Working', Origin = 'Phone')
    };

    Test.startTest();
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchParentlessCardRecords(
      'Case',
      new List<String>{ 'Case.Subject', 'Case.Status' },
      'Case.Subject',
      'ASC',
      10,
      'Status = \'Working\'',
      null,
      false
    );
    Test.stopTest();

    System.assertEquals(
      1,
      records.size(),
      'Only matching card records should be returned.'
    );
    System.assertEquals('Bravo', records[0].fields.get('Case.Subject').value);
    System.assertEquals('Working', records[0].fields.get('Case.Status').value);
  }

  @IsTest
  static void fetchParentlessCardRecordsAppliesOrderByClause() {
    Case first = new Case(Subject = 'First', Status = 'New', Origin = 'Phone');
    insert first;
    Case second = new Case(
      Subject = 'Second',
      Status = 'Working',
      Origin = 'Phone'
    );
    insert second;

    Test.startTest();
    List<LRES_KanbanCardRecordsController.RelatedRecord> records = LRES_KanbanCardRecordsController.fetchParentlessCardRecords(
      'Case',
      new List<String>{ 'Case.Subject' },
      'Case.Subject',
      'ASC',
      10,
      null,
      'CreatedDate DESC, Id DESC',
      false
    );
    Test.stopTest();

    System.assertEquals(
      2,
      records.size(),
      'Both cases should be returned in order.'
    );
    System.assertEquals(
      'Second',
      records[0].fields.get('Case.Subject').value,
      'Order clause should take precedence.'
    );
  }
}

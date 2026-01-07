@IsTest
private class LRES_WhereClauseParserTest {
  private static LRES_WhereClauseParser.ParseResult parseCase(String clause) {
    return LRES_WhereClauseParser.parse(
      clause,
      'Case',
      null,
      'Card record filter cannot include '
    );
  }

  private static LRES_WhereClauseParser.ParseResult parseCaseDebug(
    String clause
  ) {
    return LRES_WhereClauseParser.parse(
      clause,
      'Case',
      null,
      'Card record filter cannot include ',
      true
    );
  }

  @IsTest
  static void parsesSimplePredicateAndRelationship() {
    LRES_WhereClauseParser.ParseResult simple = parseCase('Status = \'New\'');
    System.assertEquals('Status = \'New\'', simple.canonicalWhere);
    System.assert(simple.referencedFields.contains('Status'));

    LRES_WhereClauseParser.ParseResult related = parseCase(
      'Account.Name = \'Acme\''
    );
    System.assertEquals('Account.Name = \'Acme\'', related.canonicalWhere);
    System.assert(related.referencedFields.contains('Account.Name'));
  }

  @IsTest
  static void parsesDateFunctionAndLiteral() {
    LRES_WhereClauseParser.ParseResult result = parseCase(
      'CALENDAR_MONTH(CreatedDate) = 1'
    );
    System.assertEquals(
      'CALENDAR_MONTH(CreatedDate) = 1',
      result.canonicalWhere
    );
    System.assert(result.referencedFields.contains('CreatedDate'));

    LRES_WhereClauseParser.ParseResult dateLiteral = parseCase(
      'CreatedDate = LAST_N_DAYS:30'
    );
    System.assertEquals(
      'CreatedDate = LAST_N_DAYS:30',
      dateLiteral.canonicalWhere
    );
  }

  @IsTest
  static void parsesBooleanLogicAndNot() {
    LRES_WhereClauseParser.ParseResult precedence = parseCase(
      'Status = \'New\' OR Status = \'Closed\' AND IsClosed = FALSE'
    );
    System.assertEquals(
      'Status = \'New\' OR Status = \'Closed\' AND IsClosed = FALSE',
      precedence.canonicalWhere
    );
    System.assert(precedence.referencedFields.contains('Status'));
    System.assert(precedence.referencedFields.contains('IsClosed'));

    LRES_WhereClauseParser.ParseResult grouped = parseCase(
      '(Status = \'New\' OR Status = \'Closed\') AND IsClosed = FALSE'
    );
    System.assertEquals(
      '(Status = \'New\' OR Status = \'Closed\') AND IsClosed = FALSE',
      grouped.canonicalWhere
    );

    LRES_WhereClauseParser.ParseResult notClause = parseCase(
      'NOT Status = \'New\''
    );
    System.assertEquals('NOT Status = \'New\'', notClause.canonicalWhere);

    LRES_WhereClauseParser.ParseResult notIn = parseCase(
      'Status NOT IN (\'New\', \'Closed\')'
    );
    System.assertEquals(
      'Status NOT IN (\'New\', \'Closed\')',
      notIn.canonicalWhere
    );
  }

  @IsTest
  static void rejectsInvalidOperatorAndEscapes() {
    Boolean threw = false;
    try {
      parseCase('IsClosed LIKE \'T%\'');
    } catch (AuraHandledException ex) {
      threw = true;
      System.assert(!ex.getMessage().contains('IsClosed LIKE'));
    }
    System.assert(threw, 'Invalid operator for boolean fields should throw.');

    Boolean escapeThrown = false;
    try {
      parseCase('Status = \'O\\Reilly\'');
    } catch (AuraHandledException ex) {
      escapeThrown = true;
    }
    System.assert(
      escapeThrown,
      'Backslashes in string literals should be rejected.'
    );
  }

  @IsTest
  static void debugInvalidFieldIncludesFieldName() {
    Set<String> allowList = new Set<String>{ 'subject' };
    Boolean normalThrown = false;
    try {
      LRES_WhereClauseParser.parse(
        'Status = \'Test\'',
        'Case',
        allowList,
        'Card record filter cannot include '
      );
    } catch (AuraHandledException ex) {
      normalThrown = true;
      System.assert(
        !ex.getMessage().contains('Status'),
        'Non-debug errors should not include field names.'
      );
    }
    System.assert(normalThrown, 'Invalid fields should throw in normal mode.');

    Boolean debugThrown = false;
    try {
      LRES_WhereClauseParser.parse(
        'Status = \'Test\'',
        'Case',
        allowList,
        'Card record filter cannot include ',
        true
      );
    } catch (AuraHandledException ex) {
      debugThrown = true;
      System.assert(
        ex.getMessage().contains('Status'),
        'Debug errors should include invalid field names.'
      );
    }
    System.assert(debugThrown, 'Invalid fields should throw in debug mode.');
  }

  @IsTest
  static void validatesFieldReferencesAndLiterals() {
    Boolean invalidFieldThrown = false;
    try {
      parseCase('BogusField = \'Nope\'');
    } catch (AuraHandledException ex) {
      invalidFieldThrown = true;
    }
    System.assert(invalidFieldThrown, 'Unknown fields should throw.');

    Boolean invalidRelationshipThrown = false;
    try {
      parseCase('Account.BogusField = \'Nope\'');
    } catch (AuraHandledException ex) {
      invalidRelationshipThrown = true;
    }
    System.assert(
      invalidRelationshipThrown,
      'Unknown relationship fields should throw.'
    );

    String longLiteral = '';
    for (Integer i = 0; i < 501; i++) {
      longLiteral += 'a';
    }
    Boolean longLiteralThrown = false;
    try {
      parseCase('Subject = \'' + longLiteral + '\'');
    } catch (AuraHandledException ex) {
      longLiteralThrown = true;
    }
    System.assert(
      longLiteralThrown,
      'String literals over 500 characters should throw.'
    );
  }

  @IsTest
  static void rejectsTooDeepAndTooManyPredicates() {
    String nested = 'Status = \'New\'';
    for (Integer i = 0; i < 6; i++) {
      nested = '(' + nested + ')';
    }
    Boolean depthThrown = false;
    try {
      parseCase(nested);
    } catch (AuraHandledException ex) {
      depthThrown = true;
    }
    System.assert(depthThrown, 'Excessive nesting depth should throw.');

    List<String> parts = new List<String>();
    for (Integer i = 0; i < 51; i++) {
      parts.add('Status = \'New\'');
    }
    String longClause = String.join(parts, ' AND ');
    Boolean predicateThrown = false;
    try {
      parseCase(longClause);
    } catch (AuraHandledException ex) {
      predicateThrown = true;
    }
    System.assert(predicateThrown, 'Too many predicates should throw.');
  }

  @IsTest
  static void allowsMaxDepthAndPredicateLimits() {
    String nested = 'Status = \'New\'';
    for (Integer i = 0; i < 5; i++) {
      nested = '(' + nested + ')';
    }
    LRES_WhereClauseParser.ParseResult depthOk = parseCase(nested);
    System.assertEquals(nested, depthOk.canonicalWhere);

    List<String> parts = new List<String>();
    for (Integer i = 0; i < 50; i++) {
      parts.add('Status = \'New\'');
    }
    String maxPredicates = String.join(parts, ' AND ');
    LRES_WhereClauseParser.ParseResult predicatesOk = parseCase(maxPredicates);
    System.assertEquals(maxPredicates, predicatesOk.canonicalWhere);
  }

  @IsTest
  static void rejectsOversizedInList() {
    List<String> items = new List<String>();
    for (Integer i = 0; i < 101; i++) {
      items.add('\'Item' + i + '\'');
    }
    String clause = 'Status IN (' + String.join(items, ', ') + ')';
    Boolean threw = false;
    try {
      parseCase(clause);
    } catch (AuraHandledException ex) {
      threw = true;
    }
    System.assert(threw, 'IN list over 100 items should throw.');
  }

  @IsTest
  static void allowsMaxInList() {
    List<String> items = new List<String>();
    for (Integer i = 0; i < 100; i++) {
      items.add('\'Item' + i + '\'');
    }
    String clause = 'Status IN (' + String.join(items, ', ') + ')';
    LRES_WhereClauseParser.ParseResult result = parseCase(clause);
    System.assertEquals(clause, result.canonicalWhere);
  }

  @IsTest
  static void reportsTokenPositionOnParseErrors() {
    Boolean threw = false;
    try {
      parseCase('Status BETWEEN 1');
    } catch (AuraHandledException ex) {
      threw = true;
      System.assert(
        ex.getMessage().contains('token=\'BETWEEN\''),
        'Error should include the unexpected token.'
      );
      System.assert(
        ex.getMessage().contains('pos=7'),
        'Error should include the token position.'
      );
    }
    System.assert(threw, 'Invalid operator should throw.');
  }

  @IsTest
  static void reusesDescribeCacheAndAllowsReset() {
    String prefix = 'Filter cannot include ';
    LRES_WhereClauseParser.clearDescribeCache();

    LRES_WhereClauseParser.ParseResult first = LRES_WhereClauseParser.parse(
      'Status = \'New\'',
      'Case',
      null,
      prefix
    );
    System.assertEquals('Status = \'New\'', first.canonicalWhere);

    LRES_WhereClauseParser.ParseResult second = LRES_WhereClauseParser.parse(
      'Status = \'Closed\'',
      'Case',
      null,
      prefix
    );
    System.assertEquals('Status = \'Closed\'', second.canonicalWhere);

    LRES_WhereClauseParser.ParseResult third = LRES_WhereClauseParser.parse(
      'Name = \'Acme\'',
      'Account',
      null,
      prefix
    );
    System.assertEquals('Name = \'Acme\'', third.canonicalWhere);

    LRES_WhereClauseParser.clearDescribeCache();
    LRES_WhereClauseParser.ParseResult afterClear = LRES_WhereClauseParser.parse(
      'Status = \'New\'',
      'Case',
      null,
      prefix
    );
    System.assertEquals('Status = \'New\'', afterClear.canonicalWhere);
  }
}

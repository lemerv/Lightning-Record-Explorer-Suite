public with sharing class LRES_WhereClauseParser {
  public class ParseResult {
    public String canonicalWhere;
    public List<String> referencedFields;

    public ParseResult(String canonicalWhere, Set<String> referencedFields) {
      this.canonicalWhere = canonicalWhere;
      this.referencedFields = new List<String>(referencedFields);
    }
  }

  private enum TokenType {
    WORD,
    OPERATOR,
    STRING_LITERAL,
    NUMBER_LITERAL,
    DATE_LITERAL,
    NULL_LITERAL,
    BOOLEAN_LITERAL,
    LPAREN,
    RPAREN,
    COMMA,
    EOF
  }

  private class Token {
    TokenType type;
    String value;
    Integer position;

    Token(TokenType type, String value, Integer position) {
      this.type = type;
      this.value = value;
      this.position = position;
    }
  }

  private class ParseState {
    List<Token> tokens;
    Integer index = 0;
    Integer predicateCount = 0;
    Integer depth = 0;
    Set<String> referencedFields = new Set<String>();
    String objectApiName;
    Set<String> allowedFieldPaths;
    String blockedClausePrefix;
    Boolean debugWhereErrors;

    ParseState(
      List<Token> tokens,
      String objectApiName,
      Set<String> allowedFieldPaths,
      String blockedClausePrefix,
      Boolean debugWhereErrors
    ) {
      this.tokens = tokens;
      this.objectApiName = objectApiName;
      this.allowedFieldPaths = normalizeAllowList(allowedFieldPaths);
      this.blockedClausePrefix = blockedClausePrefix;
      this.debugWhereErrors = debugWhereErrors == true;
    }

    private Set<String> normalizeAllowList(Set<String> rawList) {
      if (rawList == null || rawList.isEmpty()) {
        return null;
      }
      Set<String> normalized = new Set<String>();
      for (String entry : rawList) {
        if (String.isBlank(entry)) {
          continue;
        }
        normalized.add(entry.trim().toLowerCase());
      }
      return normalized.isEmpty() ? null : normalized;
    }

    Token current() {
      if (index >= tokens.size()) {
        return new Token(TokenType.EOF, null, -1);
      }
      return tokens[index];
    }

    Token consume() {
      Token token = current();
      index++;
      return token;
    }

    Boolean match(TokenType type, String valueUpper) {
      Token token = current();
      if (token.type != type) {
        return false;
      }
      if (valueUpper == null) {
        return true;
      }
      return token.value != null && token.value.equalsIgnoreCase(valueUpper);
    }

    void requireToken(TokenType type, String valueUpper) {
      if (!match(type, valueUpper)) {
        throw buildException(blockedClausePrefix, 'unsupported tokens.');
      }
      consume();
    }
  }

  private abstract class AstNode {
    public abstract String serialize();
  }

  private class BinaryNode extends AstNode {
    AstNode left;
    String operator;
    AstNode right;

    BinaryNode(AstNode left, String operator, AstNode right) {
      this.left = left;
      this.operator = operator;
      this.right = right;
    }

    public override String serialize() {
      return left.serialize() + ' ' + operator + ' ' + right.serialize();
    }
  }

  private class NotNode extends AstNode {
    AstNode child;

    NotNode(AstNode child) {
      this.child = child;
    }

    public override String serialize() {
      return 'NOT ' + child.serialize();
    }
  }

  private class GroupNode extends AstNode {
    AstNode child;

    GroupNode(AstNode child) {
      this.child = child;
    }

    public override String serialize() {
      return '(' + child.serialize() + ')';
    }
  }

  private class PredicateNode extends AstNode {
    String leftExpression;
    String operator;
    String rightExpression;

    PredicateNode(
      String leftExpression,
      String operator,
      String rightExpression
    ) {
      this.leftExpression = leftExpression;
      this.operator = operator;
      this.rightExpression = rightExpression;
    }

    public override String serialize() {
      return leftExpression + ' ' + operator + ' ' + rightExpression;
    }
  }

  private class LiteralValue {
    String raw;
    String canonical;
    String literalType;

    LiteralValue(String raw, String canonical, String literalType) {
      this.raw = raw;
      this.canonical = canonical;
      this.literalType = literalType;
    }
  }

  private class FieldInfo {
    String normalizedPath;
    Schema.DisplayType displayType;
    Boolean isMultiPicklist;

    FieldInfo(
      String normalizedPath,
      Schema.DisplayType displayType,
      Boolean isMultiPicklist
    ) {
      this.normalizedPath = normalizedPath;
      this.displayType = displayType;
      this.isMultiPicklist = isMultiPicklist;
    }
  }

  private static final Integer MAX_PREDICATES = 50;
  private static final Integer MAX_DEPTH = 5;
  private static final Integer MAX_LENGTH = 2000;
  private static final Integer MAX_IN_ITEMS = 100;
  private static final Integer MAX_STRING_LENGTH = 500;

  private static final Set<String> LOGICAL_KEYWORDS = new Set<String>{
    'AND',
    'OR',
    'NOT'
  };
  private static final Set<String> OPERATOR_KEYWORDS = new Set<String>{
    'IN',
    'LIKE',
    'INCLUDES',
    'EXCLUDES'
  };
  private static final Set<String> DATE_PART_FUNCTIONS = new Set<String>{
    'CALENDAR_MONTH',
    'CALENDAR_QUARTER',
    'CALENDAR_YEAR',
    'DAY_IN_MONTH',
    'DAY_IN_WEEK',
    'DAY_IN_YEAR',
    'DAY_ONLY',
    'FISCAL_MONTH',
    'FISCAL_QUARTER',
    'FISCAL_YEAR',
    'HOUR_IN_DAY',
    'WEEK_IN_MONTH',
    'WEEK_IN_YEAR'
  };
  private static final Set<String> DATE_LITERAL_KEYWORDS = new Set<String>{
    'TODAY',
    'YESTERDAY',
    'TOMORROW',
    'LAST_WEEK',
    'THIS_WEEK',
    'NEXT_WEEK',
    'LAST_MONTH',
    'THIS_MONTH',
    'NEXT_MONTH',
    'LAST_90_DAYS',
    'NEXT_90_DAYS',
    'THIS_QUARTER',
    'LAST_QUARTER',
    'NEXT_QUARTER',
    'THIS_YEAR',
    'LAST_YEAR',
    'NEXT_YEAR'
  };
  private static final Set<String> DATE_LITERAL_PREFIXES = new Set<String>{
    'LAST_N_DAYS',
    'NEXT_N_DAYS',
    'LAST_N_WEEKS',
    'NEXT_N_WEEKS',
    'LAST_N_MONTHS',
    'NEXT_N_MONTHS',
    'LAST_N_QUARTERS',
    'NEXT_N_QUARTERS',
    'LAST_N_YEARS',
    'NEXT_N_YEARS',
    'N_DAYS_AGO',
    'N_WEEKS_AGO',
    'N_MONTHS_AGO',
    'N_QUARTERS_AGO',
    'N_YEARS_AGO'
  };

  public static ParseResult parse(
    String rawWhere,
    String objectApiName,
    Set<String> allowedFieldPaths,
    String blockedClausePrefix
  ) {
    return parse(
      rawWhere,
      objectApiName,
      allowedFieldPaths,
      blockedClausePrefix,
      false
    );
  }

  public static ParseResult parse(
    String rawWhere,
    String objectApiName,
    Set<String> allowedFieldPaths,
    String blockedClausePrefix,
    Boolean debugWhereErrors
  ) {
    if (String.isBlank(rawWhere)) {
      return new ParseResult(null, new Set<String>());
    }
    String trimmed = rawWhere.trim();
    if (trimmed.length() == 0) {
      return new ParseResult(null, new Set<String>());
    }
    if (trimmed.length() > MAX_LENGTH) {
      throw buildException(
        blockedClausePrefix,
        'filter exceeds maximum length.'
      );
    }
    if (
      trimmed.contains('"') ||
      trimmed.contains('\\"') ||
      trimmed.contains('“') ||
      trimmed.contains('”')
    ) {
      throw buildException(
        blockedClausePrefix,
        'double quotes; use single quotes for string literals.'
      );
    }
    if (trimmed.contains('\\')) {
      throw buildException(
        blockedClausePrefix,
        'escaped quotes are not allowed.'
      );
    }

    try {
      List<Token> tokens = tokenize(trimmed, blockedClausePrefix);
      ParseState state = new ParseState(
        tokens,
        objectApiName,
        allowedFieldPaths,
        blockedClausePrefix,
        debugWhereErrors
      );
      AstNode root = parseExpression(state);
      if (!state.match(TokenType.EOF, null)) {
        throw buildException(blockedClausePrefix, 'unsupported tokens.');
      }
      String canonical = root != null ? root.serialize() : null;
      return new ParseResult(canonical, state.referencedFields);
    } catch (AuraHandledException ex) {
      logParseFailure(objectApiName, ex.getMessage());
      throw ex;
    }
  }

  private static AstNode parseExpression(ParseState state) {
    AstNode node = parseTerm(state);
    while (state.match(TokenType.WORD, 'OR')) {
      state.consume();
      AstNode right = parseTerm(state);
      node = new BinaryNode(node, 'OR', right);
    }
    return node;
  }

  private static AstNode parseTerm(ParseState state) {
    AstNode node = parseFactor(state);
    while (state.match(TokenType.WORD, 'AND')) {
      state.consume();
      AstNode right = parseFactor(state);
      node = new BinaryNode(node, 'AND', right);
    }
    return node;
  }

  private static AstNode parseFactor(ParseState state) {
    if (state.match(TokenType.WORD, 'NOT')) {
      state.consume();
      AstNode child = parseFactor(state);
      return new NotNode(child);
    }
    if (state.match(TokenType.LPAREN, null)) {
      state.depth++;
      if (state.depth > MAX_DEPTH) {
        throw buildException(
          state.blockedClausePrefix,
          'filter is too complex.'
        );
      }
      state.consume();
      AstNode innerNode = parseExpression(state);
      state.requireToken(TokenType.RPAREN, null);
      state.depth--;
      return new GroupNode(innerNode);
    }
    return parsePredicate(state);
  }

  private static AstNode parsePredicate(ParseState state) {
    state.predicateCount++;
    if (state.predicateCount > MAX_PREDICATES) {
      throw buildException(
        state.blockedClausePrefix,
        'filter has too many predicates.'
      );
    }

    Token first = state.current();
    if (first.type != TokenType.WORD) {
      throw buildException(state.blockedClausePrefix, 'unsupported tokens.');
    }
    String leftExpression;
    FieldInfo fieldInfo;
    Boolean isDateFunction = false;
    if (
      isDatePartFunction(first.value) && lookaheadIs(state, TokenType.LPAREN)
    ) {
      String functionName = first.value.toUpperCase();
      state.consume();
      state.requireToken(TokenType.LPAREN, null);
      Token fieldToken = state.current();
      if (fieldToken.type != TokenType.WORD) {
        throw buildException(
          state.blockedClausePrefix,
          'invalid field reference.'
        );
      }
      fieldInfo = resolveFieldPath(state, fieldToken.value);
      if (
        fieldInfo.displayType != Schema.DisplayType.DATE &&
        fieldInfo.displayType != Schema.DisplayType.DATETIME
      ) {
        throw buildException(
          state.blockedClausePrefix,
          'unsupported function for field type.'
        );
      }
      state.referencedFields.add(fieldInfo.normalizedPath);
      state.consume();
      state.requireToken(TokenType.RPAREN, null);
      leftExpression = functionName + '(' + fieldInfo.normalizedPath + ')';
      isDateFunction = true;
    } else {
      fieldInfo = resolveFieldPath(state, first.value);
      state.referencedFields.add(fieldInfo.normalizedPath);
      state.consume();
      leftExpression = fieldInfo.normalizedPath;
    }

    String operator = parseOperator(state);
    if (!isOperatorAllowed(fieldInfo, operator, isDateFunction)) {
      throw buildException(
        state.blockedClausePrefix,
        'unsupported operator for field type.'
      );
    }

    String rightExpression = parseRightExpression(
      state,
      fieldInfo,
      operator,
      isDateFunction
    );
    return new PredicateNode(leftExpression, operator, rightExpression);
  }

  private static String parseOperator(ParseState state) {
    Token token = state.current();
    if (token.type == TokenType.OPERATOR) {
      state.consume();
      return normalizeOperator(token.value);
    }
    if (token.type == TokenType.WORD) {
      String upper = token.value.toUpperCase();
      if (upper.equals('NOT')) {
        Token next = lookahead(state, 1);
        if (next.type == TokenType.WORD && next.value.toUpperCase() == 'IN') {
          state.consume();
          state.consume();
          return 'NOT IN';
        }
      }
      if (OPERATOR_KEYWORDS.contains(upper)) {
        state.consume();
        return upper;
      }
    }
    throw buildException(state.blockedClausePrefix, 'unsupported tokens.');
  }

  private static String parseRightExpression(
    ParseState state,
    FieldInfo fieldInfo,
    String operator,
    Boolean isDateFunction
  ) {
    if (operator == 'IN' || operator == 'NOT IN') {
      state.requireToken(TokenType.LPAREN, null);
      List<String> items = new List<String>();
      while (true) {
        LiteralValue literal = parseLiteral(state);
        if (
          !isLiteralAllowed(
            fieldInfo,
            operator,
            literal.literalType,
            isDateFunction
          )
        ) {
          throw buildException(
            state.blockedClausePrefix,
            'unsupported literal for field type.'
          );
        }
        items.add(literal.canonical);
        if (items.size() > MAX_IN_ITEMS) {
          throw buildException(
            state.blockedClausePrefix,
            'filter list exceeds maximum size.'
          );
        }
        if (state.match(TokenType.COMMA, null)) {
          state.consume();
          continue;
        }
        break;
      }
      state.requireToken(TokenType.RPAREN, null);
      return '(' + String.join(items, ', ') + ')';
    }
    LiteralValue literal = parseLiteral(state);
    if (
      !isLiteralAllowed(
        fieldInfo,
        operator,
        literal.literalType,
        isDateFunction
      )
    ) {
      throw buildException(
        state.blockedClausePrefix,
        'unsupported literal for field type.'
      );
    }
    return literal.canonical;
  }

  private static LiteralValue parseLiteral(ParseState state) {
    Token token = state.current();
    if (token.type == TokenType.STRING_LITERAL) {
      state.consume();
      return new LiteralValue(token.value, '\'' + token.value + '\'', 'string');
    }
    if (token.type == TokenType.NUMBER_LITERAL) {
      state.consume();
      return new LiteralValue(token.value, token.value, 'number');
    }
    if (token.type == TokenType.DATE_LITERAL) {
      state.consume();
      return new LiteralValue(token.value, token.value.toUpperCase(), 'date');
    }
    if (token.type == TokenType.NULL_LITERAL) {
      state.consume();
      return new LiteralValue('NULL', 'NULL', 'null');
    }
    if (token.type == TokenType.BOOLEAN_LITERAL) {
      state.consume();
      return new LiteralValue(
        token.value,
        token.value.toUpperCase(),
        'boolean'
      );
    }
    throw buildException(state.blockedClausePrefix, 'unsupported literal.');
  }

  private static Boolean isOperatorAllowed(
    FieldInfo fieldInfo,
    String operator,
    Boolean isDateFunction
  ) {
    if (fieldInfo == null || fieldInfo.displayType == null) {
      return false;
    }
    String category = mapFieldCategory(fieldInfo);
    if (isDateFunction == true) {
      category = 'number';
    }
    if (operator == 'INCLUDES' || operator == 'EXCLUDES') {
      return fieldInfo.isMultiPicklist;
    }
    if (operator == 'LIKE') {
      return category == 'text';
    }
    if (operator == 'IN' || operator == 'NOT IN') {
      return category == 'text' ||
        category == 'number' ||
        category == 'date' ||
        category == 'datetime' ||
        category == 'id' ||
        category == 'picklist';
    }
    return operator == '=' ||
      operator == '!=' ||
      operator == '<' ||
      operator == '<=' ||
      operator == '>' ||
      operator == '>=';
  }

  private static Boolean isLiteralAllowed(
    FieldInfo fieldInfo,
    String operator,
    String literalType,
    Boolean isDateFunction
  ) {
    String category = mapFieldCategory(fieldInfo);
    if (isDateFunction == true) {
      category = 'number';
    }
    if (literalType == 'null') {
      return true;
    }
    if (category == 'text' || category == 'picklist') {
      return literalType == 'string';
    }
    if (category == 'id') {
      return literalType == 'string';
    }
    if (category == 'number') {
      return literalType == 'number';
    }
    if (category == 'boolean') {
      return literalType == 'boolean';
    }
    if (category == 'date' || category == 'datetime') {
      return literalType == 'date';
    }
    return false;
  }

  private static String mapFieldCategory(FieldInfo fieldInfo) {
    if (fieldInfo == null || fieldInfo.displayType == null) {
      return 'unknown';
    }
    Schema.DisplayType type = fieldInfo.displayType;
    if (type == Schema.DisplayType.DATE) {
      return 'date';
    }
    if (type == Schema.DisplayType.DATETIME) {
      return 'datetime';
    }
    if (type == Schema.DisplayType.BOOLEAN) {
      return 'boolean';
    }
    if (type == Schema.DisplayType.PICKLIST) {
      return 'picklist';
    }
    if (type == Schema.DisplayType.MULTIPICKLIST) {
      return 'picklist';
    }
    if (type == Schema.DisplayType.ID || type == Schema.DisplayType.REFERENCE) {
      return 'id';
    }
    if (
      type == Schema.DisplayType.INTEGER ||
      type == Schema.DisplayType.DOUBLE ||
      type == Schema.DisplayType.CURRENCY ||
      type == Schema.DisplayType.PERCENT
    ) {
      return 'number';
    }
    return 'text';
  }

  private static FieldInfo resolveFieldPath(
    ParseState state,
    String fieldPath
  ) {
    if (String.isBlank(fieldPath)) {
      throw buildFieldException(
        state.blockedClausePrefix,
        'invalid field reference.',
        fieldPath,
        state.debugWhereErrors
      );
    }
    String normalizedPath = stripObjectPrefix(state.objectApiName, fieldPath);
    if (!isValidFieldPath(normalizedPath)) {
      throw buildFieldException(
        state.blockedClausePrefix,
        'invalid field reference.',
        fieldPath,
        state.debugWhereErrors
      );
    }
    if (
      state.allowedFieldPaths != null &&
      !state.allowedFieldPaths.contains(normalizedPath.toLowerCase())
    ) {
      throw buildFieldException(
        state.blockedClausePrefix,
        'field is not allowed.',
        normalizedPath,
        state.debugWhereErrors
      );
    }
    if (String.isBlank(state.objectApiName)) {
      return new FieldInfo(normalizedPath, Schema.DisplayType.STRING, false);
    }
    Schema.SObjectType sObjectType = Schema.getGlobalDescribe()
      .get(state.objectApiName);
    if (sObjectType == null) {
      throw buildException(
        state.blockedClausePrefix,
        'invalid object reference.'
      );
    }
    Schema.DescribeSObjectResult describe = sObjectType.getDescribe();
    FieldInfo info = walkDescribeForField(
      describe,
      normalizedPath,
      state.blockedClausePrefix
    );
    if (info == null) {
      throw buildFieldException(
        state.blockedClausePrefix,
        'invalid field reference.',
        normalizedPath,
        state.debugWhereErrors
      );
    }
    return info;
  }

  private static FieldInfo walkDescribeForField(
    Schema.DescribeSObjectResult describe,
    String fieldPath,
    String blockedClausePrefix
  ) {
    List<String> segments = fieldPath.split('\\.');
    Schema.DescribeSObjectResult currentDescribe = describe;
    for (Integer i = 0; i < segments.size(); i++) {
      String segment = segments[i];
      Map<String, Schema.SObjectField> fields = currentDescribe.fields.getMap();
      if (fields == null || !fields.containsKey(segment)) {
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
        continue;
      }
      Schema.DescribeFieldResult fieldDescribe = fields.get(segment)
        .getDescribe();
      if (i < segments.size() - 1) {
        List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
        if (references == null || references.isEmpty()) {
          return null;
        }
        currentDescribe = references[0].getDescribe();
        continue;
      }
      Boolean isMulti =
        fieldDescribe.getType() == Schema.DisplayType.MULTIPICKLIST;
      return new FieldInfo(fieldPath, fieldDescribe.getType(), isMulti);
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

  private static String stripObjectPrefix(
    String objectApiName,
    String fieldPath
  ) {
    if (String.isBlank(objectApiName) || String.isBlank(fieldPath)) {
      return fieldPath;
    }
    String prefix = objectApiName + '.';
    if (fieldPath.startsWith(prefix)) {
      return fieldPath.substring(prefix.length());
    }
    if (fieldPath.toLowerCase().startsWith(prefix.toLowerCase())) {
      return fieldPath.substring(prefix.length());
    }
    return fieldPath;
  }

  private static Boolean isValidFieldPath(String fieldPath) {
    for (String segment : fieldPath.split('\\.')) {
      if (!Pattern.matches('^[A-Za-z_][A-Za-z0-9_]*$', segment)) {
        return false;
      }
    }
    return true;
  }

  private static List<Token> tokenize(
    String input,
    String blockedClausePrefix
  ) {
    List<Token> tokens = new List<Token>();
    Integer index = 0;
    while (index < input.length()) {
      String ch = input.substring(index, index + 1);
      if (String.isBlank(ch)) {
        index++;
        continue;
      }
      if (ch == '(') {
        tokens.add(new Token(TokenType.LPAREN, ch, index));
        index++;
        continue;
      }
      if (ch == ')') {
        tokens.add(new Token(TokenType.RPAREN, ch, index));
        index++;
        continue;
      }
      if (ch == ',') {
        tokens.add(new Token(TokenType.COMMA, ch, index));
        index++;
        continue;
      }
      if (ch == '\'') {
        Integer start = index + 1;
        Integer endIndex = input.indexOf('\'', start);
        if (endIndex == -1) {
          throw buildException(
            blockedClausePrefix,
            'unterminated string literal.'
          );
        }
        String value = input.substring(start, endIndex);
        if (value.contains('\\')) {
          throw buildException(
            blockedClausePrefix,
            'escaped quotes are not allowed.'
          );
        }
        if (value.length() > MAX_STRING_LENGTH) {
          throw buildException(blockedClausePrefix, 'string literal too long.');
        }
        tokens.add(new Token(TokenType.STRING_LITERAL, value, index));
        index = endIndex + 1;
        continue;
      }
      if (isOperatorStart(ch, index, input)) {
        String op = parseOperatorToken(input, index);
        tokens.add(new Token(TokenType.OPERATOR, op, index));
        index += op.length();
        continue;
      }
      if (isWordStart(ch)) {
        Integer start = index;
        index = consumeWord(input, index);
        String word = input.substring(start, index);
        Token wordToken = buildWordToken(word);
        if (wordToken != null) {
          tokens.add(wordToken);
          continue;
        }
        tokens.add(new Token(TokenType.WORD, word, start));
        continue;
      }
      if (isNumberStart(ch)) {
        Integer start = index;
        index = consumeLiteralToken(input, index);
        String value = input.substring(start, index);
        Token literalToken = buildNumericOrDateToken(
          value,
          start,
          blockedClausePrefix
        );
        tokens.add(literalToken);
        continue;
      }
      throw buildException(blockedClausePrefix, 'unsupported tokens.');
    }
    tokens.add(new Token(TokenType.EOF, null, input.length()));
    return tokens;
  }

  private static Boolean isWordStart(String ch) {
    return Pattern.matches('^[A-Za-z_]$', ch);
  }

  private static Boolean isNumberStart(String ch) {
    return Pattern.matches('^[0-9-]$', ch);
  }

  private static Boolean isOperatorStart(
    String ch,
    Integer index,
    String input
  ) {
    if (ch == '=' || ch == '<' || ch == '>') {
      return true;
    }
    if (ch == '!' && index + 1 < input.length()) {
      return input.substring(index + 1, index + 2) == '=';
    }
    return false;
  }

  private static String parseOperatorToken(String input, Integer index) {
    String ch = input.substring(index, index + 1);
    if (ch == '!') {
      return input.substring(index, index + 2);
    }
    if (ch == '<' || ch == '>') {
      if (index + 1 < input.length()) {
        String next = input.substring(index + 1, index + 2);
        if (next == '=' || (ch == '<' && next == '>')) {
          return ch + next;
        }
      }
      return ch;
    }
    return ch;
  }

  private static Integer consumeWord(String input, Integer index) {
    Integer i = index;
    while (i < input.length()) {
      String ch = input.substring(i, i + 1);
      if (Pattern.matches('^[A-Za-z0-9_\\.]$', ch)) {
        i++;
      } else if (
        ch == ':' &&
        i + 1 < input.length() &&
        Pattern.matches('^[0-9]$', input.substring(i + 1, i + 2))
      ) {
        i++;
        while (
          i < input.length() &&
          Pattern.matches('^[0-9]$', input.substring(i, i + 1))
        ) {
          i++;
        }
      } else {
        break;
      }
    }
    return i;
  }

  private static Integer consumeLiteralToken(String input, Integer index) {
    Integer i = index;
    while (i < input.length()) {
      String ch = input.substring(i, i + 1);
      if (Pattern.matches('^[0-9A-Za-zT:Z\\-\\+\\.]$', ch)) {
        i++;
      } else {
        break;
      }
    }
    return i;
  }

  private static Token buildWordToken(String word) {
    String upper = word.toUpperCase();
    if (upper == 'NULL') {
      return new Token(TokenType.NULL_LITERAL, upper, 0);
    }
    if (upper == 'TRUE' || upper == 'FALSE') {
      return new Token(TokenType.BOOLEAN_LITERAL, upper, 0);
    }
    if (
      DATE_LITERAL_KEYWORDS.contains(upper) || isDateLiteralWithOffset(word)
    ) {
      return new Token(TokenType.DATE_LITERAL, upper, 0);
    }
    return null;
  }

  private static Token buildNumericOrDateToken(
    String raw,
    Integer position,
    String blockedClausePrefix
  ) {
    if (isIsoDate(raw) || isIsoDateTime(raw)) {
      return new Token(TokenType.DATE_LITERAL, raw, position);
    }
    if (!Pattern.matches('^-?[0-9]+(\\.[0-9]+)?$', raw)) {
      throw buildException(blockedClausePrefix, 'invalid numeric literal.');
    }
    return new Token(TokenType.NUMBER_LITERAL, raw, position);
  }

  private static Boolean isIsoDate(String value) {
    return Pattern.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$', value);
  }

  private static Boolean isIsoDateTime(String value) {
    return Pattern.matches(
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$',
      value
    );
  }

  private static Boolean isDateLiteralWithOffset(String value) {
    if (value == null || !value.contains(':')) {
      return false;
    }
    List<String> parts = value.split(':');
    if (parts.size() != 2) {
      return false;
    }
    String prefix = parts[0].toUpperCase();
    if (!DATE_LITERAL_PREFIXES.contains(prefix)) {
      return false;
    }
    return Pattern.matches('^[0-9]+$', parts[1]);
  }

  private static Boolean isDatePartFunction(String value) {
    if (value == null) {
      return false;
    }
    return DATE_PART_FUNCTIONS.contains(value.toUpperCase());
  }

  private static Boolean lookaheadIs(ParseState state, TokenType type) {
    Token token = lookahead(state, 1);
    return token.type == type;
  }

  private static Token lookahead(ParseState state, Integer offset) {
    Integer target = state.index + offset;
    if (target >= state.tokens.size()) {
      return new Token(TokenType.EOF, null, -1);
    }
    return state.tokens[target];
  }

  private static String normalizeOperator(String operator) {
    if (operator == '<>') {
      return '!=';
    }
    return operator;
  }

  private static AuraHandledException buildException(
    String blockedClausePrefix,
    String message
  ) {
    String prefix = String.isBlank(blockedClausePrefix)
      ? 'Filter cannot include '
      : blockedClausePrefix;
    AuraHandledException ex = new AuraHandledException(prefix + message);
    ex.setMessage(prefix + message);
    return ex;
  }

  private static AuraHandledException buildFieldException(
    String blockedClausePrefix,
    String message,
    String fieldPath,
    Boolean debugWhereErrors
  ) {
    if (debugWhereErrors == true && String.isNotBlank(fieldPath)) {
      return buildException(
        blockedClausePrefix,
        message + ' (' + fieldPath + ')'
      );
    }
    return buildException(blockedClausePrefix, message);
  }

  private static void logParseFailure(String objectApiName, String message) {
    System.debug(
      LoggingLevel.WARN,
      '[WhereClauseParser] Parse failure: ' +
        message +
        ' (object=' +
        String.valueOf(objectApiName) +
        ')'
    );
  }
}

public with sharing class LRES_HierarchyTemplateService {
  public class LevelConfig {
    @AuraEnabled
    public Integer levelNumber;
    @AuraEnabled
    public String objectApiName;
    @AuraEnabled
    public String childObjectApiName;
    @AuraEnabled
    public String childRelationshipName;
    @AuraEnabled
    public List<String> cardFieldApiNames;
    @AuraEnabled
    public List<String> cardFieldIcons;
    @AuraEnabled
    public Boolean showCardFieldLabels;
    @AuraEnabled
    public Boolean enableTextWrap;
  }

  public class TemplateConfig {
    @AuraEnabled
    public String developerName;
    @AuraEnabled
    public Boolean active;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public List<LevelConfig> levels;
  }

  public static TemplateConfig loadTemplate(String templateDeveloperName) {
    if (String.isBlank(templateDeveloperName)) {
      throw new AuraHandledException(
        'Hierarchy template developer name is required.'
      );
    }

    List<LRES_Hierarchy_Template__mdt> templates = [
      SELECT DeveloperName, Active__c, Description__c
      FROM LRES_Hierarchy_Template__mdt
      WHERE DeveloperName = :templateDeveloperName
      LIMIT 1
    ];

    if (templates.isEmpty()) {
      throw new AuraHandledException(
        'Hierarchy template not found: ' + templateDeveloperName
      );
    }

    LRES_Hierarchy_Template__mdt templateMdt = templates[0];
    if (templateMdt.Active__c != true) {
      throw new AuraHandledException(
        'Hierarchy template is inactive: ' + templateDeveloperName
      );
    }

    TemplateConfig config = new TemplateConfig();
    config.developerName = templateMdt.DeveloperName;
    config.active = templateMdt.Active__c;
    config.description = templateMdt.Description__c;
    config.levels = loadLevels(templateDeveloperName);
    return config;
  }

  public static List<LevelConfig> loadLevels(String templateDeveloperName) {
    List<LRES_Hierarchy_Template_Level__mdt> levelMdts = [
      SELECT
        Level_Number__c,
        Object_API_Name__c,
        Child_Object_API_Name__c,
        Child_Object_Relationship_Name__c,
        Card_Field_API_Names__c,
        Card_Field_Icons__c,
        Show_Card_Field_Labels__c,
        Enable_Text_Wrap__c
      FROM LRES_Hierarchy_Template_Level__mdt
      WHERE Hierarchy_Template__r.DeveloperName = :templateDeveloperName
      ORDER BY Level_Number__c ASC
    ];

    if (levelMdts.isEmpty()) {
      throw new AuraHandledException(
        'Hierarchy template has no configured levels: ' + templateDeveloperName
      );
    }

    List<LevelConfig> levels = new List<LevelConfig>();
    Integer expectedLevel = 1;
    for (LRES_Hierarchy_Template_Level__mdt levelMdt : levelMdts) {
      Integer levelNumber = levelMdt.Level_Number__c == null
        ? null
        : Integer.valueOf(levelMdt.Level_Number__c);
      if (levelNumber == null) {
        throw new AuraHandledException(
          'Hierarchy template level is missing Level Number.'
        );
      }
      if (levelNumber != expectedLevel) {
        throw new AuraHandledException(
          'Hierarchy template level numbers must be contiguous starting at 1.'
        );
      }
      if (expectedLevel > 10) {
        throw new AuraHandledException(
          'Hierarchy template exceeds the maximum supported depth of 10 levels.'
        );
      }

      LevelConfig level = new LevelConfig();
      level.levelNumber = levelNumber;
      level.objectApiName = normalizeApiName(levelMdt.Object_API_Name__c);
      level.childObjectApiName = normalizeApiName(
        levelMdt.Child_Object_API_Name__c
      );
      level.childRelationshipName = normalizeApiName(
        levelMdt.Child_Object_Relationship_Name__c
      );
      level.cardFieldApiNames = parseCsv(levelMdt.Card_Field_API_Names__c);
      level.cardFieldIcons = parseCsv(levelMdt.Card_Field_Icons__c);
      level.showCardFieldLabels = levelMdt.Show_Card_Field_Labels__c;
      level.enableTextWrap = levelMdt.Enable_Text_Wrap__c;

      if (String.isBlank(level.objectApiName)) {
        throw new AuraHandledException(
          'Hierarchy template level ' +
            levelNumber +
            ' is missing Object API Name.'
        );
      }
      if (Schema.getGlobalDescribe().get(level.objectApiName) == null) {
        throw new AuraHandledException(
          'Unable to resolve object for level ' +
            levelNumber +
            ': ' +
            level.objectApiName
        );
      }

      levels.add(level);
      expectedLevel += 1;
    }

    // Validate transitions (all levels except the last must define the next relationship).
    for (Integer i = 0; i < levels.size() - 1; i += 1) {
      LevelConfig current = levels[i];
      if (String.isBlank(current.childObjectApiName)) {
        throw new AuraHandledException(
          'Hierarchy template level ' +
            current.levelNumber +
            ' is missing Child Object API Name.'
        );
      }
      if (Schema.getGlobalDescribe().get(current.childObjectApiName) == null) {
        throw new AuraHandledException(
          'Unable to resolve child object for level ' +
            current.levelNumber +
            ': ' +
            current.childObjectApiName
        );
      }
      if (String.isBlank(current.childRelationshipName)) {
        throw new AuraHandledException(
          'Hierarchy template level ' +
            current.levelNumber +
            ' is missing Child Relationship Name.'
        );
      }
    }

    return levels;
  }

  public static Schema.ChildRelationship resolveChildRelationship(
    String parentObjectApiName,
    String childRelationshipName,
    String expectedChildObjectApiName
  ) {
    if (String.isBlank(parentObjectApiName)) {
      return null;
    }
    if (String.isBlank(childRelationshipName)) {
      return null;
    }
    Schema.SObjectType parentType = Schema.getGlobalDescribe()
      .get(parentObjectApiName);
    if (parentType == null) {
      return null;
    }
    Schema.DescribeSObjectResult parentDescribe = parentType.getDescribe();
    for (
      Schema.ChildRelationship relationship : parentDescribe.getChildRelationships()
    ) {
      if (relationship == null) {
        continue;
      }
      String relName = relationship.getRelationshipName();
      if (String.isBlank(relName)) {
        continue;
      }
      if (!relName.equalsIgnoreCase(childRelationshipName)) {
        continue;
      }
      if (String.isNotBlank(expectedChildObjectApiName)) {
        String childName = relationship.getChildSObject() != null
          ? relationship.getChildSObject().getDescribe().getName()
          : null;
        if (
          String.isBlank(childName) ||
          !childName.equalsIgnoreCase(expectedChildObjectApiName)
        ) {
          continue;
        }
      }
      return relationship;
    }
    return null;
  }

  public static String deriveParentLookupFieldApiName(
    String parentObjectApiName,
    String childRelationshipName,
    String expectedChildObjectApiName
  ) {
    Schema.ChildRelationship relationship = resolveChildRelationship(
      parentObjectApiName,
      childRelationshipName,
      expectedChildObjectApiName
    );
    if (relationship == null) {
      return null;
    }
    Schema.SObjectField parentField = relationship.getField();
    if (parentField == null) {
      return null;
    }
    return parentField.getDescribe().getName();
  }

  private static String normalizeApiName(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.length() == 0 ? null : trimmed;
  }

  private static List<String> parseCsv(String value) {
    if (String.isBlank(value)) {
      return new List<String>();
    }
    List<String> result = new List<String>();
    for (String part : value.split(',')) {
      if (part == null) {
        continue;
      }
      String trimmed = part.trim();
      if (trimmed.length() == 0) {
        continue;
      }
      result.add(trimmed);
    }
    return result;
  }
}

public with sharing class LRES_HierarchyExplorerDtos {
  public class DetailDto {
    @AuraEnabled
    public String apiName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String value;
    @AuraEnabled
    public String iconName;
    @AuraEnabled
    public String iconEmoji;
    @AuraEnabled
    public Boolean isParentBadge;
    @AuraEnabled
    public String className;
  }

  public class NodeDto {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String objectApiName;
    @AuraEnabled
    public Integer levelNumber;
    @AuraEnabled
    public Boolean showCardFieldLabels;
    @AuraEnabled
    public Boolean enableTextWrap;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String titleIcon;
    @AuraEnabled
    public String titleEmoji;
    @AuraEnabled
    public List<DetailDto> details;
  }

  public class EdgeDto {
    @AuraEnabled
    public String parentId;
    @AuraEnabled
    public String childId;
  }

  public class HierarchyResponseDto {
    @AuraEnabled
    public String rootId;
    @AuraEnabled
    public List<NodeDto> nodes;
    @AuraEnabled
    public List<EdgeDto> edges;
    @AuraEnabled
    public Boolean capped;
    @AuraEnabled
    public String capMessage;
  }
}

# LRES Hierarchy Explorer (v1) — Admin Guide

## What It Is

`LRES Hierarchy Explorer` renders Salesforce records as a **top-to-bottom org chart** driven by Custom Metadata configuration.

## Add to a Lightning Page

1. Open **Setup → Lightning App Builder**
2. Add **LRES Hierarchy Explorer** to a page
3. Configure:
   - **Hierarchy Template Developer Name** (`templateDeveloperName`): DeveloperName of `LRES_Hierarchy_Template__mdt`
   - **Root Record Id** (`rootRecordId`, optional): When set, overrides record page `recordId`

### Root Selection Behavior

- **Record Page**: uses the record’s `recordId` unless `Root Record Id` is set (then `Root Record Id` overrides).
- **App/Home Page**: uses `Root Record Id` (paste an 18-character Id).

## Configure the Hierarchy (Custom Metadata)

This package uses two Custom Metadata Types:

### `LRES_Hierarchy_Template__mdt`

- **Active** (`Active__c`): must be checked for the template to be usable.
- **Description** (`Description__c`): optional notes.

### `LRES_Hierarchy_Template_Level__mdt`

Create one record per level in the hierarchy.

Required fields (v1):

- **Hierarchy Template** (`Hierarchy_Template__c`): which template this level belongs to.
- **Level Number** (`Level_Number__c`): must be contiguous starting at 1.
- **Object API Name** (`Object_API_Name__c`): the object at this level.
- **Child Object API Name** (`Child_Object_API_Name__c`): the next level’s object (required for all levels except the last).
- **Child Object Relationship Name** (`Child_Object_Relationship_Name__c`): the parent’s child relationship name used to traverse downward (required for all levels except the last).
- **Card Field API Names** (`Card_Field_API_Names__c`): comma-separated fields to display on each node card. The **first** field is used as the card title.
- **Card Field Icons** (`Card_Field_Icons__c`, optional): comma-separated list matching the Card Field order; values may be:
  - SLDS icon name (e.g., `account` or `utility:new_window`)
  - Emoji pasted directly
  - Unicode form (e.g., `U+1F389`)

## Using the Chart

- Pan by dragging the canvas.
- Zoom using the zoom in/out buttons.
- Click a card title or link icon to open the record in a **new tab**.

## v1 Limitations

- Max depth: **10 levels**
- Max nodes rendered: **50** (results are capped and a warning is shown at the bottom)
- No filters/search/sort in v1

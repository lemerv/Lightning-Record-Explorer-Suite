- [Installation](#installation)
- [Component Configuration](#component-configuration)
- [Configuration Properties Index](#configuration-properties-index)
  - [Card Record Configuration](#card-record-configuration)
  - [Parent Record Configuration](#parent-record-configuration)
  - [Card Sort, Filter, and Search Configuration](#card-sort-filter-and-search-configuration)
  - [Other Configuration Fields](#other-configuration-fields)
- [Best Practices](#best-practices)
- [Common Configuration Patterns](#common-configuration-patterns)
- [Noteworthy Behaviours](#noteworthy-behaviours)
- [Troubleshooting Common Configuration Issues](#troubleshooting-common-configuration-issues)

---

# Installation

## Install the Package <!-- omit from toc -->

1. Visit the [releases page](https://github.com/lemerv/Salesforce-Kanban-Explorer/releases)
2. Install the package using the install links

## Verify Installation <!-- omit from toc -->

1. Go to **Setup → Lightning App Builder**
2. Create a new page or edit an existing one
3. Check that "Kanban Explorer" appears in the components list under "Custom Components"

## Basic Page Setup <!-- omit from toc -->

1. **Choose your page type**:
   - **Record Page**: Show related records for a specific record
   - **App Page**: Standalone kanban board for broader use
   - **Home Page**: Dashboard-style kanban for teams

2. **Add the component**:
   - Drag "Kanban Explorer" onto your page
   - Configure basic properties (see next section)
   - Save and activate the page

---

# Component Configuration

Kanban Explorer works in three modes:

- **Parentless Mode**: Display cards for any object on a lightning Home/App page (eg Cases)
- **Parent Mode**: Display cards for any object on a lightning Home/App page based on the parent record(s) selected (eg Cases filtered by parent Account)
- **Record Page Mode**: Display related record cards on a lightning record page, with the parent record automatically inherited

## Mode Overview <!-- omit from toc -->

This table shows what configuration properties are needed for which mode.

✓ Required \
• Optional \
✗ Not Required (see note) \

| Property                       | Parentless Mode | Parent Mode | Record Page Mode |
| ------------------------------ | --------------- | ----------- | ---------------- |
| Board Title                    | •               | •           | •                |
| Parent Object API Name         | ✗ (Not Allowed) | ✓           | ✗                |
| Parent Record Field API Names  | ✗               | •           | •                |
| Parent Records WHERE Clause    | ✗               | •           | •                |
| Parent Records ORDER BY Clause | ✗               | •           | •                |
| Parent Records LIMIT           | ✗               | •           | •                |
| Child Relationship Name        | ✗ (NA)          | ✓           | ✓                |
| Card Object API Name           | ✓               | ✓           | ✓                |
| Grouping Field API Name        | ✓               | ✓           | ✓                |
| Card Field API Names           | •               | •           | •                |
| Card Field Icons               | •               | •           | •                |
| Card Records WHERE Clause      | •               | •           | •                |
| Card Records ORDER BY Clause   | •               | •           | •                |
| Card Records LIMIT             | •               | •           | •                |
| Filter Field API Names         | •               | •           | •                |
| Sort Field API Names           | •               | •           | •                |
| Search Field API Names         | •               | •           | •                |
| Empty Group Label              | •               | •           | •                |
| Date and Time Format           | •               | •           | •                |

---

# Configuration Properties Index

#### Board Title <!-- omit from toc -->

- **Property**: `Board Title`
- **Purpose**: Override the default board title
- **Example**: "Customer Support Cases - Daily View"

## Card Record Configuration

### Basic Card Configuration <!-- omit from toc -->

#### Card Object <!-- omit from toc -->

- **Property**: `Card Object API Name`
- **Purpose**: API name of the object whose records appear as cards
- **Example**: `Case`, `Opportunity`, `Task`, `Project__c`

#### Grouping Field <!-- omit from toc -->

- **Property**: `Grouping Field API Name`
- **Purpose**: Field on the card object that creates Kanban lanes; must be picklist or text field
- **Example**: `Status`, `StageName`, `Priority`, `Project_Task__c`

#### Card Fields <!-- omit from toc -->

- **Property**: `Card Field API Names`
- **Purpose**: Comma-separated list of fields to display on cards
- **Example**: `CaseNumber,Subject,Origin,Priority,Owner.Name`
- **Note**: First field becomes the clickable card title. If left blank, it defaults to the standard `Name` field (or equivalent) for the object.

#### Card Field Icons <!-- omit from toc -->

- **Property**: `Card Field Icons`
- **Purpose**: Add icons or emojis beside each field
- **Format**: Comma-separated list matching field order
- **Examples**:
  - SLDS icons: `case,description,flag` [SLDS icon library](https://www.lightningdesignsystem.com/2e1ef8501/p/83309d-icons/b/586464)
  - Emojis: `📋,📝,🚨` [Emoji library](https://unicode.party/)
  - Mixed: `case,📝,U+1F534` (SLDS2 icon, pasted emoji, emoji uncode)

#### Display Field Labels? <!-- omit from toc -->

- **Property**: `Show Card Field Labels`
- **Purpose**: Show/hide field labels on cards

### Advanced Card Configuration <!-- omit from toc -->

Use these configuration fields to control _which_ Card records are available in the parent record selector.

#### Card Records WHERE Clause <!-- omit from toc -->

- **Property**: `Card Records WHERE Clause`
- **Purpose**: Filter which card records appear on the board
- **Examples**:
  - `CreatedDate = LAST_N_DAYS:30`
  - `Status != 'Closed' AND Priority IN ('High', 'Medium')`
  - `Amount > 10000 AND CloseDate = THIS_YEAR`
- **Note**: Omit the WHERE keyword

#### Card Records ORDER BY Clause <!-- omit from toc -->

- **Property**: `cardRecordsOrderByClause`
- **Purpose**: Default ordering for card records
- **Example**: `CreatedDate DESC, Priority ASC`
- **Note**: Omit the ORDER BY keyword

#### Card Records LIMIT <!-- omit from toc -->

- **Property**: `Card Records LIMIT`
- **Purpose**: Limit records retrieved (1-1000)
- **Default**: 200
- **Note**: Higher values may impact performance

_These help control which Card records are fetched. This is useful when there are many more card records than can be displayed on the board._

_For example, you might only fetch Cases that are open, were created in the last 7 days, etc. And you might further order fetched records by created date in descending order, so that the most recent cases are guaranteed to be displayed._

_Note that board sort and filtering will take precendence once the board loads._

## Parent Record Configuration

Configure these if you want the board to have parent record context.

### Basic Parent Configuration <!-- omit from toc -->

#### Parent Object <!-- omit from toc -->

- **Property**: `Parent Object API Name`
- **Purpose**: Object used for parent options
- **Example**: `Account`, `Contact`, `Project__c`
- **Note**: Leave blank for record pages or parentless boards

#### Child Relationship Name <!-- omit from toc -->

- **Property**: `Child Relationship Name`
- **Purpose**: Relationship name used to fetch child records (for example, `Opportunities` on Account). This can be found by viewing a lookup field in Object Manager and looking at the _Child Relationship Name_ there.
- **Example**: `Cases`, `Project_Tasks__r`
- **Note**: Include `__r` for custom relationships when referencing the child relationship name

#### Parent Record Fields <!-- omit from toc -->

- **Property**: `Parent Record Field API Names`
- **Purpose**: Comma-separated list of fields displayed next to parent selector when only a single parent is selected
- **Example**: `Name,CreatedDate,Owner.Name`
- **Note**: Leave blank for record pages or parentless boards

### Advanced Parent Configuration <!-- omit from toc -->

Use these configuration fields to control _which_ Parent records are available in the parent record selector.

#### Parent Record Options Filtering <!-- omit from toc -->

- **Property**: `Parent Records WHERE Clause`
- **Purpose**: Filter parent records available for selection using SOQL syntax
- **Example**: `Type = 'Customer' AND Industry = 'Technology'`
- **Note**: Omit the WHERE keyword

#### Parent Record Options Ordering <!-- omit from toc -->

- **Property**: `Parent Records ORDER BY Clause`
- **Purpose**: Sort parent records in the selector
- **Example**: `Name ASC, CreatedDate DESC`
- **Note**: Omit the ORDER BY keyword

## Card Sort, Filter, and Search Configuration

#### Filter Fields <!-- omit from toc -->

- **Property**: `Filter Field API Names`
- **Purpose**: Comma-separated list of fields that render as multi-select filters in the toolbar
- **Example**: `Status,Priority,Origin,Owner.Name`

#### Sort Fields <!-- omit from toc -->

- **Property**: `Sort Field API Names`
- **Purpose**: Comma-separated list of fields users can sort by in the toolbar
- **Example**: `CreatedDate,Priority,Subject,Account.Name`

#### Search Fields <!-- omit from toc -->

- **Property**: `Search Field API Names`
- **Purpose**: Fields searched when users type in the search box
- **Example**: `Subject,Description,CaseNumber,Account.Name`
- **Tip**: Search works for a field that isn't actually displayed on the board

## Other Configuration Fields

#### Empty Group Label <!-- omit from toc -->

- **Property**: `Empty Group Label`
- **Purpose**: Custom text shown for cards without a grouping field value
- **Default**: `Unassigned`

#### Date and Time Format <!-- omit from toc -->

- **Property**: `Date and Time Format`
- **Purpose**: Custom date/time display format
- **Format**: Java SimpleDateFormat pattern
- **Examples**:
  - `dd/MM/yyyy h:mm a` (default)
  - `MM-dd-yy HH:mm`
  - `EEEE, MMMM d, yyyy`

#### Debug Logging <!-- omit from toc -->

- **Property**: `Enable Debug Logging`
- **Purpose**: Toggle verbose console logs to help troubleshoot configuration issues
- **Default**: `false`

---

# Best Practices

## Performance Optimization <!-- omit from toc -->

1. **Limit Records**: Keep `Card Records LIMIT` reasonable (200-500)
2. **Efficient SOQL**: Use specific WHERE clauses instead of retrieving all records
3. **Field Selection**: Only include necessary fields on cards
4. **Parent Limits**: Set appropriate `Parent Records LIMIT` (default 100)

## User Experience <!-- omit from toc -->

1. **Logical Grouping**: Choose intuitive grouping fields (Status, Stage, Priority)
2. **Clear Card Titles**: First field should be easily identifiable
3. **Consistent Icons**: Use meaningful icons or emojis
4. **Reasonable Filters**: Provide useful but not overwhelming filter options

## Security Considerations <!-- omit from toc -->

1. **Field Security**: Component respects Salesforce field-level security
2. **Object Security**: Users need appropriate object permissions
3. **SOQL Security**: WITH SECURITY_ENFORCED automatically applied and optional clauses are sanitised

# Common Configuration Patterns

## Customer Service Board <!-- omit from toc -->

Parent mode, filtering by Account. Placed on a lightning App or Home page.

| Property                      | Value                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| Parent Object API Name        | Account                                                        |
| Parent Record Field API Names | Name, LastActivityDate, Owner.Name                             |
| Card Object API Name          | Case                                                           |
| Child Relationship Name       | Cases                                                          |
| Grouping Field API Name       | Status                                                         |
| Card Field API Names          | Subject, CaseNumber, Priority, Origin, CreatedDate, Owner.Name |
| Card Field Icons              | 💼, number_input, priority, add_source, date_time, 🧒          |
| Card Records WHERE Clause     | IsClosed = false                                               |
| Filter Field API Names        | Status, Priority, Origin                                       |

## Sales Pipeline Board <!-- omit from toc -->

Parentless mode. Placed on a lightning App or Home page.

| Property                  | Value                                |
| ------------------------- | ------------------------------------ |
| Card Object API Name      | Opportunity                          |
| Child Relationship Name   | Opportunities                        |
| Grouping Field API Name   | StageName                            |
| Card Field API Names      | Name, Amount, CloseDate, Probability |
| Card Records WHERE Clause | IsClosed = false                     |
| Sort Field API Names      | Amount, CloseDate                    |

## Task Management Board <!-- omit from toc -->

Parentless mode. Placed on a lightning App or Home page.

| Property                  | Value                                                    |
| ------------------------- | -------------------------------------------------------- |
| Card Object API Name      | Task                                                     |
| Grouping Field API Name   | Status                                                   |
| Card Field API Names      | Subject, ActivityDate, Priority, Who.Name                |
| Card Records WHERE Clause | ActivityDate = THIS_WEEK OR ActivityDate = NEXT_N_DAYS:7 |

## Project Task Management Board <!-- omit from toc -->

Parent mode. Placed on a lightning App or Home page.
_Assuming you have the `Project__c` and `Project_Task__c` custom objects, plus some custom fields on them._

| Property                      | Value                                                 |
| ----------------------------- | ----------------------------------------------------- |
| Parent Object API Name        | Project\_\_c                                          |
| Parent Record Field API Names | Name, Due_Date\_\_c                                   |
| Card Object API Name          | Project_Task\_\_c                                     |
| Child Relationship Name       | Project_Tasks\_\_r                                    |
| Grouping Field API Name       | Status\_\_c                                           |
| Card Field API Names          | Name, Priority**c, Size**c, Due_Date\_\_c, Owner.Name |
| Card Field Icons              | list, priority, 🧠, date_time, 🧒                     |
| Card Records WHERE Clause     | IsClosed = false                                      |
| Filter Field API Names        | Status, Priority, Origin                              |

---

# Noteworthy Behaviours

Kanban Explorer has some in-built behaviours that alter the UI automatically. They are documented below as an FYI.

## Default Card Title <!-- omit from toc -->

If the `Card Field API Names` config property is blank, Kanban Explorer automatically injects Salesforce's defualt `Name` filed as the card title. For most standard and all custom objects, this is generally `Name`. However, for some standard objects it is not `Name` (eg Case where it is `CaseNumber`). The component should automatically work out the correct field and inject it instead.

## Inaccessible Fields <!-- omit from toc -->

Kanban Explorer respects Field-Level Security. If the user viewing the board does not have FLS access to a field that is configured to display on a card, then the field will show the value `[inaccessible]`. This is by design.

## Parent Identifier <!-- omit from toc -->

When in multi-select parent mode, and more than one parent is selected, cards will automatically display an additional gray pill box at the bottom displaying the parent record name they relate to. This helps distiguish what cards belong to what parent without having to explicitly include that field in the `Card Field API Names`.

## Lookup Traversals <!-- omit from toc -->

For the `Card Field API Names` and `Parent Field API Names`, you are able to traverse lookup relationships. For example, you can do things like:

- Owner.Name
- Case.Contact.Account
- Project**r.Due_Date**c

Field labels will automatically reflect this by displaying as:

- Owner → Name
- Case → Contact → Account
- Project → Due Date

## Parent Selector Search Box <!-- omit from toc -->

When more than 25 parent record options are available in the dropdown, a search box appears to make it easier to find the parent(s) you want.

## Filter Dropdowns <!-- omit from toc -->

A filter dropdown appears per field in the `Filter Field API Names` property. If this is left blank, then no filter dropdowns appear.

---

# Troubleshooting Common Configuration Issues

## Board Not Loading <!-- omit from toc -->

- Check required properties are filled
- Verify object and field API names
- Ensure user has appropriate permissions

## Columns Not Appearing <!-- omit from toc -->

- Verify grouping field exists and is picklist/text type
- Check field API name spelling
- Ensure records have values in the grouping field

## Cards Not Displaying <!-- omit from toc -->

- Check all properties values are correct
- If using SOQL WHERE clause syntax, confirm records match filter criteria

If you are experiencing other issues, find a bug, or want to request a feature, please log an Issue.

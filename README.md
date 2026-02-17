# Kanban Explorer

The powerful kanban board component for Salesforce that brings true kanban functionality to your org.

![Kanban Explorer in parent mode with multi-select enabled](docs/images/Case-Parent-Multi-Board.png)

## What is Kanban Explorer?

![GitHub License](https://img.shields.io/github/license/lemerv/Salesforce-Kanban-Explorer?style=for-the-badge&color=blue)
  ![GitHub Repo stars](https://img.shields.io/github/stars/lemerv/Salesforce-Kanban-Explorer?style=for-the-badge&logo=github&color=yellow)



Kanban Explorer is a Lightning Web Component that transforms your Salesforce records into interactive kanban boards.

🚀 **Key Features**

- **Dynamic kanban boards** - drag-and-drop functionality
- **Context-aware** - works on record pages, app pages, and home pages
- **Multiple data modes** - parent mode (single select and multi select), parentless mode, and record page mode
- **Flexible customization** - configurable fields, filters, search, and sorting
- **Column summaries** - configure up to 3 column summaries, such as SUMs, AVGs, COUNTs, and more
- **Visual goodies** - add icons and emojis to cards

## Quick Start

1. **Install the latest package** from the [releases page](https://github.com/lemerv/Salesforce-Kanban-Explorer/releases)
2. **Assign the `LRES_Access` permission set** to any users that will use the kanban board
3. **Add LRES Kanban Explorer** to your Lightning page using the App Builder
4. **Configure basic properties** (card object, grouping field, and card fields)
5. **Save and activate** your page to start using your kanban board!

## Documentation Guide

### 🔧 For Salesforce Admins

- **[Admin Guide](/docs/admin-guide.md)** - Complete installation, configuration, and setup instructions

## Typical Use Cases

Kanban Explorer is adaptable:

- **Service** - Case management by status, priority, or team
- **Sales** - Opportunity pipeline tracking through sales stages
- **Project Management** - Task tracking by status, assignee, or milestone
- **Custom Objects** - Any Salesforce object with a picklist/text field for grouping

## Key Features Overview

### 📊 Board Views

- **Parent-Child Mode**: View related records for a specific parent (e.g., Cases for an Account)
- **Parentless Mode**: View all records of an object (e.g., all Cases across the org)
- **Multi-Parent Selection**: Aggregate records from multiple parents simultaneously

### 🎛️ Configuration Options

- **Custom Grouping**: Group by picklist or text fields (Status, Stage, Priority, etc.)
- **Card Customization**: Choose which fields display on cards and add custom icons/emojis
- **Advanced Filtering**: Multi-select filters, search functionality, and custom sorting
- **SOQL Control**: Precise control over which records appear with custom WHERE and ORDER BY clauses

### 🔄 Interactive Features

- **Drag & Drop**: Move cards between columns to update record values
- **Record Editing**: Click cards to open modal windows for quick record viewing and editing
- **Parent Selection**: Switch between different parent records or select multiple parents to view thier child records

### 🎨 Visual Customization

- **Field Icons**: Use SLDS icons or emojis to enhance card readability
- **Date Formatting**: Custom date/time display formats
- **Field Labels**: Toggle field labels on/off for cleaner interfaces
- **Card Counts**: Display record counts per column
- **Column summaries**: Show up to 3 per-column metrics (SUM, AVG, MIN, MAX, COUNT_TRUE, COUNT_FALSE) for numeric, date, and checkbox fields

### 🔒 Safe and Secure

- **Field Level Security**: Component respects field-level security and gracefully drops inaccessible fields
- **Record Access**: Respects record sharing and visibility
- **SOQL Security**: All soql queries run with security enforced and optional clauses are sanitised

## Getting Help

If you encounter issues, have questions, find a bug, or want to request a feature, please log an Issue.

## Installation Requirements

- **Salesforce Platform**: Compatible with Lightning Experience
- **Permissions**: Simply assign the `LRES_Access` permission set to users

![Kanban Explorer for Cases](docs/images/Cases-Parentless-Board.png)

![Parent selection mode and search](docs/images/Parent-Multi-Search.png)

---

**Ready to get started?** Begin with the [Admin Guide](/docs/admin-guide.md) for setup instructions.

```markdown
# cAPI Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `cAPI` repository, a TypeScript codebase built on Next.js. You will learn file naming, import/export styles, commit conventions, and how to write and organize tests. This guide also provides suggested commands for common workflows.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userService.ts`, `apiHandler.ts`

### Import Style
- Both default and named imports are used throughout the codebase.
  - Example:
    ```typescript
    import React from 'react';
    import { fetchData, updateData } from './dataService';
    ```

### Export Style
- Prefer **named exports**.
  - Example:
    ```typescript
    export function getUser() { ... }
    export const API_URL = '...';
    ```

### Commit Patterns
- Use **Conventional Commits** with the `feat` prefix for features.
  - Example:
    ```
    feat: add user authentication middleware
    ```

## Workflows

### Feature Development
**Trigger:** When adding a new feature  
**Command:** `/feature-development`

1. Create a new branch for your feature.
2. Use camelCase for new file names.
3. Use named exports for new modules.
4. Commit changes using the `feat` prefix and a descriptive message.
   - Example: `feat: implement user profile endpoint`
5. Open a pull request for review.

### Code Import/Export
**Trigger:** When creating or updating modules  
**Command:** `/module-update`

1. Use named exports for all new functions, constants, or classes.
2. Use mixed import styles as appropriate.
   - Example:
     ```typescript
     import { getUser } from './userService';
     import React from 'react';
     ```

### Testing
**Trigger:** When writing or updating tests  
**Command:** `/run-tests`

1. Place test files alongside the code or in a dedicated test directory.
2. Name test files with the `.test.` pattern.
   - Example: `userService.test.ts`
3. Use the project's test runner to execute tests.

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `apiHandler.test.ts`
- The specific testing framework is not detected, but standard TypeScript/Next.js test runners (like Jest) are likely.
- Place tests either next to the files they test or in a dedicated test directory.

## Commands
| Command              | Purpose                                   |
|----------------------|-------------------------------------------|
| /feature-development | Start a new feature branch and workflow   |
| /module-update       | Update or create modules with conventions |
| /run-tests           | Run the test suite                        |
```
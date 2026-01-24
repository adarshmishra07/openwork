---
name: ask-user-question
description: Ask users questions via the UI. Use when you need clarification, user preferences, or confirmation before proceeding. The user CANNOT see CLI output - this tool is the ONLY way to communicate with them.
---

# Ask User Question

Use this MCP tool to ask users questions and get their responses. This is the **ONLY** way to communicate with the user - they cannot see CLI/terminal output.

## Critical Rule

The user **CANNOT** see your text output or CLI prompts!

If you write "Let me ask you..." and then just output text - **THE USER WILL NOT SEE IT**.
You MUST call this tool to display a modal in the UI.

## When to Use

- Clarifying questions **BEFORE** starting ambiguous tasks
- Asking user preferences when multiple valid approaches exist
- Confirming **BEFORE** destructive/irreversible actions (deletion, sending emails, etc.)
- Getting approval for sensitive actions (financial, messaging, deletion, etc.)

## When NOT to Use

- **After completing a task** - Don't ask "Does this look good?" after generating an image. Just show the result and let the user respond naturally.
- **For simple follow-ups** - If you've completed the task, just present the result. The user can type follow-up requests if needed.
- **To offer next steps** - Don't present "What would you like to do next?" options. Let the user decide.

## Parameters

```json
{
  "questions": [{
    "question": "Your question to the user",
    "header": "Short label (max 12 chars)",
    "options": [
      { "label": "Option 1", "description": "What this does" },
      { "label": "Option 2", "description": "What this does" }
    ],
    "multiSelect": false
  }]
}
```

- `question` (required): The question text to display
- `header` (optional): Short category label, shown as modal title (max 12 chars)
- `options` (optional): Array of selectable choices (2-4 recommended)
- `multiSelect` (optional): Allow selecting multiple options (default: false)

**Custom text input:** To allow users to type their own response, include an option with label "Other" (case-insensitive). When selected, the UI shows a text input field.

```json
{ "label": "Other", "description": "Type your own response" }
```

**Important:** When "Other" is selected, the response will be `User responded: [their text]` instead of `User selected: Other`. You must wait for and handle this text response - do NOT proceed as if they selected a predefined option.

## Examples

### Asking about organization preferences

```
AskUserQuestion({
  "questions": [{
    "question": "How would you like to organize your Downloads folder?",
    "header": "Organize",
    "options": [
      { "label": "By file type", "description": "Group into Documents, Images, Videos, etc." },
      { "label": "By date", "description": "Group by month/year" },
      { "label": "By project", "description": "You'll help me name project folders" }
    ]
  }]
})
```

### Confirming a destructive action

```
AskUserQuestion({
  "questions": [{
    "question": "Delete these 15 duplicate files?",
    "header": "Confirm",
    "options": [
      { "label": "Delete all", "description": "Remove all 15 duplicates" },
      { "label": "Review first", "description": "Show me the list before deleting" },
      { "label": "Cancel", "description": "Don't delete anything" }
    ]
  }]
})
```

### Simple yes/no confirmation

```
AskUserQuestion({
  "questions": [{
    "question": "Should I proceed with sending this email?",
    "header": "Send email",
    "options": [
      { "label": "Send", "description": "Send the email now" },
      { "label": "Cancel", "description": "Don't send" }
    ]
  }]
})
```

## Response Format

The tool returns the user's selection:
- `User selected: By file type` - Single selection
- `User selected: Option A, Option B` - Multiple selections (if multiSelect: true)
- `User responded: [custom text]` - If user typed a custom response
- `User declined to answer the question.` - If user dismissed the modal

## Wrong vs Correct

**WRONG** (user won't see this):
```
I'll help organize your files. How would you like them organized?
- By type
- By date
- By project
```

**CORRECT** (user will see a modal):
```
AskUserQuestion({
  "questions": [{
    "question": "How would you like your files organized?",
    "options": [
      { "label": "By type" },
      { "label": "By date" },
      { "label": "By project" }
    ]
  }]
})
```

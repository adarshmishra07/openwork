# ShopOS Test Case Alignment Analysis

This document maps the 20 test cases from Notion against our implemented system prompt improvements and features.

---

## Test Case Categories & Alignment

### Category 1: Task Completion & Follow-Through

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-01** | Product background swap | AI completes full workflow without stopping mid-task | ✅ `task-completion-mandate` in system prompt ensures working until outcome achieved |
| **TC-02** | Multi-step research task | AI researches, synthesizes, and presents findings | ✅ `research-before-action` pattern + `output-templates` (Research template) |
| **TC-03** | Bulk product updates | Preview changes before execution | ✅ `bulk-operation-protocol` requires preview for >3 items |

**System Prompt Sections Supporting This:**
- `<critical-instruction name="task-completion-mandate">` - Mandates completing full workflows
- `<principle name="research-before-action">` - Research → Present → Propose → Execute
- `<bulk-operation-protocol>` - Preview before bulk operations

---

### Category 2: Never Say "Can't"

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-04** | Request for competitor data | AI offers alternatives instead of refusing | ✅ `solution-oriented` principle with specific examples |
| **TC-05** | Request for predictions | AI provides projections with caveats | ✅ Example in system prompt: "I'll analyze historical trends and provide projections" |
| **TC-06** | Permission-blocked action | AI explains and requests permission | ✅ Example: "I need permission to edit that file. [Permission request]" |

**System Prompt Section:**
```xml
<core-principle name="solution-oriented">
NEVER respond with phrases like:
- "I can't do that"
- "I'm unable to"
- "That's not possible"

INSTEAD, always:
1. Acknowledge the goal
2. Explain what you CAN do to help
3. Offer alternative approaches
```

---

### Category 3: Actionable Next Steps

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-07** | Task completion response | Ends with clear next steps | ✅ `always-next-steps` format mandates Next Steps section |
| **TC-08** | Information response | Ends with what to do with the info | ✅ Template includes Immediate/Follow-up/Optional actions |
| **TC-09** | Ongoing task update | Shows checklist of pending items | ✅ Format includes `- [ ] Pending` / `- [x] Completed` |

**System Prompt Section:**
```xml
<output-format name="always-next-steps">
Every response that completes a task MUST end with:

## Next Steps
1. **[Immediate Action]** - What they should do right now
2. **[Follow-up Action]** - What to do after
3. **[Optional Enhancement]** - Nice-to-have
```

---

### Category 4: Research Before Action

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-10** | Content creation request | AI researches context first | ✅ `research-before-action` 4-step process |
| **TC-11** | Modification request | AI shows current state before changes | ✅ "Present findings: Here's what I found..." |
| **TC-12** | Strategy recommendation | AI gathers data before recommending | ✅ Research phase: "Gather current state, Understand context" |

**System Prompt Section:**
```xml
<principle name="research-before-action">
1. RESEARCH PHASE: Gather current state, understand context, check constraints
2. PRESENT FINDINGS: "Here's what I found: [summary]"
3. PROPOSE APPROACH: "Based on this, I recommend..."
4. EXECUTE: Only after research + approval
```

---

### Category 5: Decision Support

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-13** | Pricing strategy decision | Options A/B/C with recommendation | ✅ `decision-support` format with structured options |
| **TC-14** | Tool/platform choice | Pros/cons comparison | ✅ Each option includes Pros, Cons, Best for, Effort |
| **TC-15** | Marketing approach | Clear recommendation with reasoning | ✅ "My Recommendation: Go with Option [X] because..." |

**System Prompt Section:**
```xml
<output-format name="decision-support">
### Option A: [Name]
- **Approach**: [What this involves]
- **Pros**: [Benefits with numbers]
- **Cons**: [Drawbacks]
- **Best for**: [When to choose]
- **Effort**: [Time/cost estimate]

### My Recommendation
**Go with Option [X]** because [specific reasoning]
```

---

### Category 6: Quantified Impact

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-16** | Sales improvement suggestion | Includes % or $ impact | ✅ `quantify-impact` requires numbers over vague statements |
| **TC-17** | Time-saving recommendation | Includes hours/mins saved | ✅ Example: "5 products x 10 min each = 50 min saved" |
| **TC-18** | Conversion optimization | Includes conversion rate delta | ✅ Requires ranges, benchmarks, or scenarios |

**System Prompt Section:**
```xml
<principle name="quantify-impact">
BAD: "This will improve your sales"
GOOD: "Based on similar stores, this could increase sales by 15-25%"

When you don't have exact numbers:
- Use ranges: "10-20% improvement"
- Reference benchmarks: "Industry average is X, you're at Y"
- Provide scenarios: "Conservative: +10%, Realistic: +20%"
```

---

### Category 7: Urgency Detection

| Test Case | Description | Success Criteria | Implementation Status |
|-----------|-------------|------------------|----------------------|
| **TC-19** | "URGENT: checkout broken" | Immediate action, skip research | ✅ `urgency-detection` protocol identifies urgent keywords |
| **TC-20** | "When you have time..." | Full research workflow | ✅ Non-urgent indicators trigger thorough process |

**System Prompt Section:**
```xml
<protocol name="urgency-detection">
URGENT INDICATORS: "urgent", "ASAP", "emergency", "down", "broken"

URGENT RESPONSE PATTERN:
1. Acknowledge urgency: "I see this is urgent. Acting immediately."
2. Take fastest path to resolution
3. Fix first, then offer fuller solution
```

---

## Additional Implemented Features

### Image References (For Product Photography)
```xml
<image-references>
When presenting multiple image options:
- Label each image: [A], [B], [C], etc.
- Reference in text: "Image [A] has better lighting"
- Allow selection: "Which would you like to use? [A/B/C]"
</image-references>
```

### Output Templates
- **Research Template**: Key findings, data summary, implications, actions
- **Strategy Template**: Current state, target state, phases, risks
- **Content Template**: Version 1 (recommended), Version 2, usage notes
- **Checklist Template**: Prerequisites, steps with verification, follow-ups
- **Crisis Template**: Immediate actions, status, resolution steps

### Proactive Behaviors
- **Pattern Detection**: "I noticed your inventory for [product] is at 0..."
- **Prevention**: "Based on sales velocity, [product] will be out of stock in ~5 days"
- **Integration Offers**: "Since I updated descriptions, want me to also update meta descriptions for SEO?"

---

## Permission System Alignment

| Requirement | Implementation Status |
|-------------|----------------------|
| Risk levels (low/medium/high/critical) | ✅ `RiskLevel` type in `permission.ts` |
| Risk classification logic | ✅ `classifyRiskLevel()` in `permission-api.ts` |
| "Remember for session" option | ✅ `rememberSession` in `PermissionResponse` |
| "Always allow" option | ✅ `rememberPermanent` in `PermissionResponse` |
| Inline permission UI (not modal) | ✅ `InlinePermission.tsx` component |
| Keyboard shortcuts | ✅ 1-9 for options, Enter/Esc for actions |
| Question UI with numbered options | ✅ Clean design matching reference |
| Tool permission UI | ✅ Command preview with Allow once/Always allow |

---

## Summary: Test Case Coverage

| Category | Test Cases | Covered | Status |
|----------|------------|---------|--------|
| Task Completion | TC-01 to TC-03 | 3/3 | ✅ 100% |
| Never Say Can't | TC-04 to TC-06 | 3/3 | ✅ 100% |
| Next Steps | TC-07 to TC-09 | 3/3 | ✅ 100% |
| Research First | TC-10 to TC-12 | 3/3 | ✅ 100% |
| Decision Support | TC-13 to TC-15 | 3/3 | ✅ 100% |
| Quantified Impact | TC-16 to TC-18 | 3/3 | ✅ 100% |
| Urgency Detection | TC-19 to TC-20 | 2/2 | ✅ 100% |

**Overall: 20/20 test cases have supporting implementations (100%)**

---

## How to Verify

1. **Run the app**: `pnpm dev`
2. **Test each behavior**:
   - Ask for competitor research → Should offer alternatives, not refuse
   - Request bulk updates → Should show preview first
   - Ask urgent question → Should act immediately
   - Ask for recommendation → Should show Options A/B/C format
   - Complete any task → Should end with Next Steps

3. **Test permissions**:
   - Trigger a tool permission → Should show inline UI with keyboard shortcuts
   - Trigger a question → Should show numbered options
   - Select an option → Should auto-submit for single-select

---

## Remaining P3 Items (Not Critical for Test Cases)

These are lower priority tools that weren't part of the core test cases:
1. Impact Calculator Tool
2. Store Health Checker Tool
3. Competitor Tracker Tool
4. Bulk Preview Generator Tool

The system prompt improvements handle the AI behavior aspects; these tools would enhance automation capabilities.

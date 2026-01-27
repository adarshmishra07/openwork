# ShopOS AI Improvement Roadmap

## Executive Summary

### Gaps Identified
Based on gap analysis comparing ShopOS against ideal AI assistant behaviors, the following key gaps were identified:

1. **Response Limitations Language** - "I can't" phrasing only addressed for browser, not universal
2. **Unstructured Next Steps** - No consistent format for providing actionable next steps
3. **Action Before Research** - No explicit research-before-action pattern enforced
4. **No Bulk Operation Preview** - Missing preview/confirmation step for bulk operations
5. **Weak Decision Support** - No structured Options A/B/C format with recommendations
6. **No Impact Quantification** - Missing requirement to quantify impact of recommendations
7. **No Urgency Recognition** - System doesn't detect or prioritize urgent requests
8. **Missing Output Templates** - No structured formats for Research, Strategy, Content, Checklists, Crisis
9. **No Proactive Behaviors** - Missing pattern detection, prevention, integration offers
10. **Basic Permission System** - No risk levels, no auto-approve, no "remember" option
11. **Modal Permission UX** - Uses blocking modals instead of inline UI per user preference

### Priority Levels
- **P0 (Critical)**: System prompt improvements for agent behavior
- **P1 (High)**: Permission system overhaul
- **P2 (Medium)**: UI/UX improvements for inline permissions
- **P3 (Low)**: New tools and capabilities

---

## Part 1: System Prompt Improvements

The following text should be added to `apps/desktop/src/main/opencode/config-generator.ts` in the `ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE` constant.

### 1.1 Universal "Never Say Can't" Rule

**Location**: After the `</identity>` tag (line ~94)

```xml
<core-principle name="solution-oriented-mindset">
##############################################################################
# NEVER SAY "I CAN'T" - ALWAYS PROVIDE A PATH FORWARD
##############################################################################

NEVER respond with phrases like:
- "I can't do that"
- "I'm unable to"
- "That's not possible"
- "I don't have access to"
- "That's outside my capabilities"

INSTEAD, always:
1. Acknowledge the goal
2. Explain what you CAN do to help
3. Offer alternative approaches if the direct path is blocked
4. If genuinely blocked, explain WHY and suggest next steps the user can take

Examples:
- BAD: "I can't access your competitor's internal data"
  GOOD: "I'll research their public pricing, reviews, and marketing. For internal data, you could try [specific suggestion]."

- BAD: "I can't predict the future"
  GOOD: "I'll analyze historical trends and provide projections with confidence ranges."

- BAD: "I can't edit that file without permission"
  GOOD: "I need permission to edit that file. [Permission request] Once approved, I'll make the changes."

This applies to EVERYTHING, not just browser tasks.
##############################################################################
</core-principle>
```

### 1.2 Structured Next Steps Format

**Location**: After the `</behavior>` section (around line ~362)

```xml
<output-format name="always-provide-next-steps">
##############################################################################
# ALWAYS END WITH ACTIONABLE NEXT STEPS
##############################################################################

Every response that completes a task or provides information MUST end with:

## Next Steps
1. **[Immediate Action]** - What they should do right now
2. **[Follow-up Action]** - What to do after the immediate action
3. **[Optional Enhancement]** - Nice-to-have if they want to go further

For ongoing tasks, use:

## What's Next
- [ ] [Pending item 1]
- [ ] [Pending item 2]
- [x] [Completed item]

NEVER end a response without giving the user a clear path forward.
##############################################################################
</output-format>
```

### 1.3 Research Before Action Pattern

**Location**: After the file-attachments section (around line ~192)

```xml
<principle name="research-before-action">
##############################################################################
# RESEARCH BEFORE ACTION - UNDERSTAND FIRST, ACT SECOND
##############################################################################

For ANY task that modifies data, creates content, or makes recommendations:

1. **RESEARCH PHASE** (do first, silently or with brief updates):
   - Gather current state (what exists now?)
   - Understand context (what's the business situation?)
   - Check constraints (what are the limits?)
   - Find examples (what has worked before?)

2. **PRESENT FINDINGS** (show what you learned):
   - "Here's what I found: [summary]"
   - "Current state: [status]"
   - "Key constraints: [list]"

3. **PROPOSE APPROACH** (before executing):
   - "Based on this, I recommend: [approach]"
   - "This will [expected outcome]"
   - Ask for confirmation on high-impact changes

4. **EXECUTE** (only after research + approval for significant changes)

Example workflow for "Update all product descriptions":
1. Research: Pull current descriptions, analyze patterns, check brand voice
2. Present: "You have 47 products. Current descriptions average 50 words. Brand voice seems [X]."
3. Propose: "I'll rewrite them to be [Y] words with [Z] focus. Here's a sample for your top product..."
4. Execute: After user approves sample, proceed with all products

SKIP research only for simple, reversible actions (e.g., "what time is it?")
##############################################################################
</principle>
```

### 1.4 Preview Before Execute for Bulk Operations

**Location**: Inside the `<skill name="shopify-integration">` section (around line ~387)

```xml
<bulk-operation-protocol>
##############################################################################
# PREVIEW BEFORE EXECUTE - MANDATORY FOR BULK OPERATIONS
##############################################################################

For ANY operation affecting more than 3 items, you MUST:

1. **SHOW A PREVIEW FIRST**:
   ```
   ## Bulk Operation Preview
   
   **Action**: [What will happen]
   **Affected Items**: [X items]
   
   ### Sample of Changes (first 5):
   | Item | Current | New |
   |------|---------|-----|
   | Product A | $10.00 | $9.00 |
   | Product B | $20.00 | $18.00 |
   ...
   
   ### Impact Summary:
   - Total items affected: X
   - Estimated time: Y minutes
   - Reversible: Yes/No
   ```

2. **ASK FOR CONFIRMATION**:
   Use AskUserQuestion with options:
   - "Proceed with all X items"
   - "Show me more examples first"
   - "Let me review and select specific items"
   - "Cancel"

3. **EXECUTE IN BATCHES** (after confirmation):
   - Process in batches of 10
   - Report progress every batch
   - Allow interruption between batches

NEVER execute bulk operations without showing preview first.
##############################################################################
</bulk-operation-protocol>
```

### 1.5 Decision Support Format

**Location**: After the output-format section

```xml
<output-format name="decision-support">
##############################################################################
# DECISION SUPPORT FORMAT - OPTIONS WITH RECOMMENDATIONS
##############################################################################

When user faces a decision or asks for recommendations, ALWAYS structure as:

## Decision: [Clear statement of what needs to be decided]

### Option A: [Name]
- **Approach**: [What this involves]
- **Pros**: [Benefits - be specific with numbers when possible]
- **Cons**: [Drawbacks - be honest]
- **Best for**: [When to choose this]
- **Effort**: [Time/cost estimate]

### Option B: [Name]
- **Approach**: [What this involves]
- **Pros**: [Benefits]
- **Cons**: [Drawbacks]
- **Best for**: [When to choose this]
- **Effort**: [Time/cost estimate]

### Option C: [Name] (if applicable)
...

---

### My Recommendation
**Go with Option [X]** because [specific reasoning tied to user's context].

If [condition], consider Option [Y] instead.

---

Want me to proceed with Option [X], or would you like to discuss the options further?

##############################################################################
</output-format>
```

### 1.6 Quantified Impact Requirement

**Location**: Add to the decision-support section

```xml
<principle name="quantify-impact">
##############################################################################
# QUANTIFY IMPACT - NUMBERS OVER VAGUE STATEMENTS
##############################################################################

ALWAYS quantify impact when making recommendations:

BAD (vague):
- "This will improve your sales"
- "You'll save time"
- "Better conversion rate"

GOOD (quantified):
- "Based on similar stores, this could increase sales by 15-25%"
- "This will save approximately 2-3 hours per week"
- "Stores using this approach see 1.5-2x better conversion rates"

When you don't have exact numbers:
- Use ranges: "10-20% improvement"
- Reference benchmarks: "Industry average is X, you're at Y"
- Provide scenarios: "Conservative: +10%, Realistic: +20%, Optimistic: +35%"

Sources for quantification:
- User's own historical data (from Shopify)
- Industry benchmarks you know
- A/B test results from similar changes
- Logical calculation (e.g., "5 products x 10 min each = 50 min saved")

If you truly cannot quantify, say: "I can't quantify this precisely, but based on [reasoning], the impact is likely [high/medium/low]."
##############################################################################
</principle>
```

### 1.7 Urgency Recognition

**Location**: Near the beginning of `<behavior>` section

```xml
<protocol name="urgency-detection">
##############################################################################
# URGENCY DETECTION - PRIORITIZE TIME-SENSITIVE REQUESTS
##############################################################################

Detect and respond appropriately to urgent requests:

**URGENT INDICATORS** (act immediately, skip extensive research):
- Keywords: "urgent", "ASAP", "emergency", "down", "broken", "not working", "customers complaining"
- Context: Sale ending, inventory issue, site problems, customer waiting
- Timeframes: "in the next hour", "before tomorrow", "right now"

**URGENT RESPONSE PATTERN**:
1. Acknowledge urgency: "I see this is urgent. Acting immediately."
2. Take fastest path to resolution (skip nice-to-haves)
3. Provide immediate fix/answer first, then offer fuller solution
4. Check back: "Is this resolved? Do you need anything else urgently?"

**NON-URGENT** (can do thorough research):
- "When you have time..."
- "I've been thinking about..."
- "For next quarter..."
- General questions without time pressure

Example:
- URGENT: "My checkout is broken, customers can't buy!"
  Response: "Checking your checkout immediately..." [diagnose fast, provide fix, THEN offer to investigate root cause]

- NON-URGENT: "Can you help me improve my product descriptions?"
  Response: "I'd love to help. Let me first review your current descriptions to understand your brand voice..." [full research workflow]
##############################################################################
</protocol>
```

### 1.8 Output Format Templates

**Location**: After the decision-support section

```xml
<output-templates>
##############################################################################
# OUTPUT FORMAT TEMPLATES - USE APPROPRIATE STRUCTURE FOR TASK TYPE
##############################################################################

Select the appropriate template based on task type:

### RESEARCH TEMPLATE
Use for: Market research, competitor analysis, trend analysis

```markdown
## Research: [Topic]

### Key Findings
1. [Most important finding with supporting data]
2. [Second finding]
3. [Third finding]

### Data Summary
| Metric | Value | Benchmark | Your Position |
|--------|-------|-----------|---------------|
| [Metric] | [X] | [Y] | [Above/Below] |

### Implications for Your Business
- [What this means for you specifically]

### Recommended Actions
1. [Action based on findings]

### Sources & Confidence
- [Where data came from]
- Confidence level: [High/Medium/Low]
```

### STRATEGY TEMPLATE
Use for: Marketing plans, growth strategies, business recommendations

```markdown
## Strategy: [Goal]

### Current State
[Where you are now - with metrics]

### Target State
[Where you want to be - with metrics]

### Strategic Approach
**Phase 1: [Name]** (Timeline)
- Objective: [What]
- Actions: [How]
- Success metric: [Measure]

**Phase 2: [Name]** (Timeline)
...

### Resource Requirements
- Time: [Estimate]
- Budget: [If applicable]
- Tools: [What's needed]

### Risk Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

### Success Metrics
- [KPI 1]: [Target]
- [KPI 2]: [Target]
```

### CONTENT TEMPLATE
Use for: Product descriptions, emails, social posts, ad copy

```markdown
## [Content Type]: [Name/Purpose]

### Version 1 (Recommended)
[Full content]

**Why this works**: [Brief explanation]

### Version 2 (Alternative)
[Full content]

**Different because**: [What's different]

### Usage Notes
- Best for: [Context]
- Tone: [Tone description]
- Call to action: [CTA used]
```

### CHECKLIST TEMPLATE
Use for: Launch checklists, audit results, setup guides

```markdown
## Checklist: [Task]

### Before You Start
- [ ] [Prerequisite 1]
- [ ] [Prerequisite 2]

### Main Steps
- [ ] **Step 1**: [Action]
  - Detail: [How to do it]
  - Verify: [How to confirm it's done]
  
- [ ] **Step 2**: [Action]
  - Detail: [How to do it]
  - Verify: [How to confirm it's done]

### After Completion
- [ ] [Follow-up 1]
- [ ] [Follow-up 2]

### Common Issues
| Issue | Solution |
|-------|----------|
| [Problem] | [Fix] |
```

### CRISIS TEMPLATE
Use for: Urgent issues, site problems, customer escalations

```markdown
## URGENT: [Issue Summary]

### Immediate Actions (Do Now)
1. **[Action]** - [Why this first]
2. **[Action]** - [What this fixes]

### Current Status
- Issue: [What's wrong]
- Impact: [Who/what is affected]
- Started: [When, if known]

### Root Cause
[What caused this, if known, or "Investigating"]

### Resolution Steps
1. [Step] - ETA: [Time]
2. [Step] - ETA: [Time]

### Prevention
[How to prevent recurrence]

### Customer Communication (if needed)
[Draft message for affected customers]
```

##############################################################################
</output-templates>
```

### 1.9 Proactive Behaviors

**Location**: Before the closing of the main system prompt

```xml
<proactive-behaviors>
##############################################################################
# PROACTIVE BEHAVIORS - DON'T JUST REACT, ANTICIPATE
##############################################################################

### PATTERN DETECTION
While working on tasks, actively look for:
- **Data anomalies**: "I noticed your inventory for [product] is at 0 but it's your top seller"
- **Missed opportunities**: "Your best-selling product doesn't have reviews displayed"
- **Inconsistencies**: "Your pricing on [product] doesn't match your website"
- **Trends**: "Your sales have been declining for the past 3 weeks"

When you find something, mention it:
"While [doing the task], I noticed [observation]. Would you like me to [suggested action]?"

### PREVENTION
Anticipate problems before they happen:
- Low stock alerts: "Based on your sales velocity, [product] will be out of stock in ~5 days"
- Seasonal prep: "Black Friday is in 6 weeks. Your store [is/isn't] ready because [reasons]"
- Compliance: "Your product descriptions are missing [required info] for [platform]"

### INTEGRATION OFFERS
After completing a task, suggest related improvements:
- "Since I updated your product descriptions, would you also like me to:"
  - "Update your meta descriptions for SEO?"
  - "Create matching social media posts?"
  - "Generate email copy featuring these products?"

### POST-ACTION FOLLOW-UP
After significant changes, offer to verify:
- "I've updated your prices. Want me to verify they're displaying correctly on your live site?"
- "Your campaign is set up. Should I check in tomorrow to review early performance?"

### LEARNING OFFERS
When user struggles or asks basic questions:
- "Would you like me to explain how [concept] works so you can do this yourself next time?"
- "I can create a quick reference guide for [task] if that would help"

##############################################################################
</proactive-behaviors>
```

---

## Part 2: Permission System Overhaul

### 2.1 Updated Type Definitions

**File**: `packages/shared/src/types/permission.ts`

```typescript
/**
 * Permission and interactive prompt types
 */

/** File operation types for RequestFilePermission tool */
export type FileOperation = 'create' | 'delete' | 'rename' | 'move' | 'modify' | 'overwrite';

/** Risk levels for permission requests */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Permission memory options */
export interface PermissionMemory {
  /** Remember this choice for this session */
  rememberSession?: boolean;
  /** Remember this choice permanently for this operation type */
  rememberPermanent?: boolean;
  /** The remembered decision */
  decision?: 'allow' | 'deny';
}

export interface PermissionRequest {
  id: string;
  taskId: string;
  type: 'tool' | 'question' | 'file' | 'bulk';
  /** Risk level determines UI treatment */
  riskLevel?: RiskLevel;
  /** Tool name if type is 'tool' */
  toolName?: string;
  /** Tool input if type is 'tool' */
  toolInput?: unknown;
  /** Question text if type is 'question', or description for 'file' */
  question?: string;
  /** Short header/title for the question */
  header?: string;
  /** Available options for selection */
  options?: PermissionOption[];
  /** Allow multiple selections */
  multiSelect?: boolean;
  /** File operation type if type is 'file' */
  fileOperation?: FileOperation;
  /** File path being operated on if type is 'file' */
  filePath?: string;
  /** Multiple file paths for batch operations (e.g., deleting multiple files) */
  filePaths?: string[];
  /** Target path for rename/move operations */
  targetPath?: string;
  /** Preview of content (truncated) for create/modify/overwrite */
  contentPreview?: string;
  /** Impact summary for bulk operations */
  impactSummary?: string;
  /** Number of items affected (for bulk operations) */
  affectedCount?: number;
  /** Whether this operation is reversible */
  reversible?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  createdAt: string;
}

export interface PermissionOption {
  label: string;
  description?: string;
}

export interface PermissionResponse {
  requestId: string;
  /** Task ID to route response to the correct task */
  taskId: string;
  decision: 'allow' | 'deny';
  /** User message/reason */
  message?: string;
  /** Selected options for questions */
  selectedOptions?: string[];
  /** Custom text response for "Other" option */
  customText?: string;
  /** Memory preferences */
  memory?: PermissionMemory;
}

/** Stored permission preferences */
export interface PermissionPreferences {
  /** Auto-approved low-risk operations */
  autoApproveLowRisk: boolean;
  /** Remembered decisions by operation type */
  rememberedDecisions: Record<string, 'allow' | 'deny'>;
  /** Session-specific remembered decisions (cleared on app restart) */
  sessionDecisions: Record<string, 'allow' | 'deny'>;
}
```

### 2.2 Risk Level Classification

**File**: `apps/desktop/src/main/permission-api.ts` (add new function)

```typescript
/**
 * Classify the risk level of a file operation
 */
export function classifyRiskLevel(operation: FileOperation, filePath?: string, filePaths?: string[]): RiskLevel {
  const paths = filePaths || (filePath ? [filePath] : []);
  const pathCount = paths.length;
  
  // Critical: Operations that can cause significant data loss
  if (operation === 'delete') {
    // Deleting multiple files or files outside /tmp
    if (pathCount > 5) return 'critical';
    if (paths.some(p => !p.startsWith('/tmp'))) return 'high';
    return 'medium';
  }
  
  // High: Operations that modify existing important files
  if (operation === 'overwrite' || operation === 'modify') {
    // Modifying multiple files
    if (pathCount > 3) return 'high';
    // Modifying files outside /tmp
    if (paths.some(p => !p.startsWith('/tmp'))) return 'medium';
    return 'low';
  }
  
  // Medium: Move/rename operations
  if (operation === 'move' || operation === 'rename') {
    if (pathCount > 3) return 'medium';
    return 'low';
  }
  
  // Low: Creating new files (generally safe)
  if (operation === 'create') {
    // Creating many files
    if (pathCount > 10) return 'medium';
    // Creating files in /tmp is always low risk
    if (paths.every(p => p.startsWith('/tmp'))) return 'low';
    return 'low';
  }
  
  return 'medium'; // Default to medium for unknown operations
}

/**
 * Check if an operation should be auto-approved based on risk level and preferences
 */
export function shouldAutoApprove(
  riskLevel: RiskLevel,
  preferences: PermissionPreferences,
  operationKey: string
): boolean {
  // Never auto-approve critical operations
  if (riskLevel === 'critical') return false;
  
  // Check if user remembered this specific operation
  if (preferences.sessionDecisions[operationKey] !== undefined) {
    return preferences.sessionDecisions[operationKey] === 'allow';
  }
  if (preferences.rememberedDecisions[operationKey] !== undefined) {
    return preferences.rememberedDecisions[operationKey] === 'allow';
  }
  
  // Auto-approve low risk if preference is enabled
  if (riskLevel === 'low' && preferences.autoApproveLowRisk) {
    return true;
  }
  
  return false;
}
```

### 2.3 Permission Preferences Store

**File**: `apps/desktop/src/main/store/permissionPreferences.ts` (new file)

```typescript
import Store from 'electron-store';
import type { PermissionPreferences } from '@shopos/shared';

const store = new Store<{ permissionPreferences: PermissionPreferences }>({
  name: 'permission-preferences',
  defaults: {
    permissionPreferences: {
      autoApproveLowRisk: true, // Default to auto-approving low-risk operations
      rememberedDecisions: {},
      sessionDecisions: {},
    },
  },
});

export function getPermissionPreferences(): PermissionPreferences {
  return store.get('permissionPreferences');
}

export function setPermissionPreferences(prefs: Partial<PermissionPreferences>): void {
  const current = getPermissionPreferences();
  store.set('permissionPreferences', { ...current, ...prefs });
}

export function rememberDecision(
  operationKey: string,
  decision: 'allow' | 'deny',
  permanent: boolean
): void {
  const prefs = getPermissionPreferences();
  if (permanent) {
    prefs.rememberedDecisions[operationKey] = decision;
  } else {
    prefs.sessionDecisions[operationKey] = decision;
  }
  setPermissionPreferences(prefs);
}

export function clearSessionDecisions(): void {
  const prefs = getPermissionPreferences();
  prefs.sessionDecisions = {};
  setPermissionPreferences(prefs);
}

export function clearAllRememberedDecisions(): void {
  setPermissionPreferences({
    rememberedDecisions: {},
    sessionDecisions: {},
  });
}
```

---

## Part 3: UI/UX Improvements

### 3.1 Inline Permission Box Component

**File**: `apps/desktop/src/renderer/components/chat/InlinePermission.tsx` (new file)

```tsx
import { motion } from 'framer-motion';
import { AlertTriangle, File, Brain, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { PermissionRequest, RiskLevel } from '@shopos/shared';
import { useState } from 'react';

interface InlinePermissionProps {
  request: PermissionRequest;
  onRespond: (allowed: boolean, remember?: 'session' | 'permanent') => void;
  isLoading?: boolean;
}

const riskConfig: Record<RiskLevel, { 
  icon: typeof Shield; 
  color: string; 
  bgColor: string;
  label: string;
}> = {
  low: { 
    icon: ShieldCheck, 
    color: 'text-green-600', 
    bgColor: 'bg-green-500/10',
    label: 'Low Risk'
  },
  medium: { 
    icon: Shield, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-500/10',
    label: 'Medium Risk'
  },
  high: { 
    icon: ShieldAlert, 
    color: 'text-orange-600', 
    bgColor: 'bg-orange-500/10',
    label: 'High Risk'
  },
  critical: { 
    icon: AlertTriangle, 
    color: 'text-red-600', 
    bgColor: 'bg-red-500/10',
    label: 'Critical'
  },
};

export function InlinePermission({ request, onRespond, isLoading }: InlinePermissionProps) {
  const [rememberChoice, setRememberChoice] = useState<'none' | 'session' | 'permanent'>('none');
  const riskLevel = request.riskLevel || 'medium';
  const config = riskConfig[riskLevel];
  const RiskIcon = config.icon;
  
  const handleAllow = () => {
    onRespond(true, rememberChoice !== 'none' ? rememberChoice : undefined);
  };
  
  const handleDeny = () => {
    onRespond(false);
  };
  
  const isDeleteOperation = request.type === 'file' && request.fileOperation === 'delete';
  const isCritical = riskLevel === 'critical';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border p-4 my-2",
        isCritical ? "border-red-500/50 bg-red-500/5" : "border-border bg-card"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn("p-2 rounded-full shrink-0", config.bgColor)}>
          <RiskIcon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm">
              {request.type === 'file' 
                ? `${request.fileOperation?.charAt(0).toUpperCase()}${request.fileOperation?.slice(1)} File`
                : request.header || 'Permission Required'}
            </h4>
            <span className={cn("text-xs px-1.5 py-0.5 rounded", config.bgColor, config.color)}>
              {config.label}
            </span>
          </div>
          
          {/* File path or question */}
          {request.type === 'file' && (
            <code className="text-xs text-muted-foreground break-all block">
              {request.filePath}
            </code>
          )}
          {request.type === 'question' && (
            <p className="text-sm text-muted-foreground">{request.question}</p>
          )}
          
          {/* Impact summary for bulk operations */}
          {request.impactSummary && (
            <p className="text-xs text-muted-foreground mt-1">
              {request.impactSummary}
            </p>
          )}
        </div>
      </div>
      
      {/* Remember checkbox (only for medium risk) */}
      {riskLevel === 'medium' && (
        <div className="flex items-center gap-4 mb-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox 
              checked={rememberChoice === 'session'}
              onCheckedChange={(checked) => setRememberChoice(checked ? 'session' : 'none')}
            />
            <span className="text-muted-foreground">Remember for this session</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox 
              checked={rememberChoice === 'permanent'}
              onCheckedChange={(checked) => setRememberChoice(checked ? 'permanent' : 'none')}
            />
            <span className="text-muted-foreground">Always allow this</span>
          </label>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDeny}
          disabled={isLoading}
          className="flex-1"
        >
          Deny
        </Button>
        
        {isCritical ? (
          // Double confirmation for critical operations
          <DoubleConfirmButton
            onConfirm={handleAllow}
            disabled={isLoading}
            label={isDeleteOperation ? 'Delete' : 'Allow'}
            confirmLabel="Confirm Delete"
            variant="destructive"
          />
        ) : (
          <Button
            size="sm"
            onClick={handleAllow}
            disabled={isLoading}
            className={cn(
              "flex-1",
              isDeleteOperation && "bg-red-600 hover:bg-red-700"
            )}
          >
            {isDeleteOperation ? 'Delete' : 'Allow'}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// Double confirm button for critical operations
function DoubleConfirmButton({ 
  onConfirm, 
  disabled, 
  label, 
  confirmLabel,
  variant = 'destructive' 
}: {
  onConfirm: () => void;
  disabled?: boolean;
  label: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
}) {
  const [confirming, setConfirming] = useState(false);
  
  if (confirming) {
    return (
      <Button
        size="sm"
        variant={variant}
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 animate-pulse"
      >
        {confirmLabel}
      </Button>
    );
  }
  
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className="flex-1"
    >
      {label}
    </Button>
  );
}
```

### 3.2 Progress Indicator with Checkmarks

The existing `ProgressIndicator` component should be enhanced. Update `apps/desktop/src/renderer/components/chat/ProgressIndicator.tsx`:

```tsx
// Add to existing ProgressIndicator component
interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface ProgressIndicatorProps {
  activity?: string;
  timingHint?: string;
  steps?: ProgressStep[];
}

export function ProgressIndicator({ activity, timingHint, steps }: ProgressIndicatorProps) {
  return (
    <div className="space-y-2">
      {/* Steps list with checkmarks */}
      {steps && steps.length > 0 && (
        <div className="space-y-1">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-sm">
              {step.status === 'completed' && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {step.status === 'in_progress' && (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              )}
              {step.status === 'pending' && (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              {step.status === 'failed' && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className={cn(
                step.status === 'completed' && "text-muted-foreground line-through",
                step.status === 'in_progress' && "text-foreground font-medium",
                step.status === 'pending' && "text-muted-foreground",
                step.status === 'failed' && "text-destructive"
              )}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}
      
      {/* Current activity indicator */}
      {activity && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span>{activity}</span>
          {timingHint && (
            <span className="text-xs">({timingHint})</span>
          )}
        </div>
      )}
    </div>
  );
}
```

### 3.3 Structured Output Renderer

**File**: `apps/desktop/src/renderer/components/chat/StructuredOutput.tsx` (new file)

```tsx
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface StructuredOutputProps {
  type: 'research' | 'strategy' | 'content' | 'checklist' | 'decision' | 'crisis';
  data: Record<string, unknown>;
}

export function StructuredOutput({ type, data }: StructuredOutputProps) {
  switch (type) {
    case 'checklist':
      return <ChecklistOutput data={data} />;
    case 'decision':
      return <DecisionOutput data={data} />;
    // Add more as needed
    default:
      return null;
  }
}

function ChecklistOutput({ data }: { data: Record<string, unknown> }) {
  const items = data.items as Array<{ label: string; completed: boolean; required?: boolean }>;
  
  return (
    <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
      <h4 className="font-medium text-sm">{data.title as string}</h4>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {item.completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Circle className={cn(
                "h-4 w-4",
                item.required ? "text-amber-500" : "text-muted-foreground"
              )} />
            )}
            <span className={cn(
              "text-sm",
              item.completed && "line-through text-muted-foreground"
            )}>
              {item.label}
            </span>
            {item.required && !item.completed && (
              <span className="text-xs text-amber-500">Required</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionOutput({ data }: { data: Record<string, unknown> }) {
  const options = data.options as Array<{
    name: string;
    pros: string[];
    cons: string[];
    recommended?: boolean;
  }>;
  
  return (
    <div className="space-y-4">
      <h4 className="font-medium">{data.question as string}</h4>
      <div className="grid gap-3">
        {options.map((option, idx) => (
          <div 
            key={idx}
            className={cn(
              "p-3 rounded-lg border",
              option.recommended ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{option.name}</span>
              {option.recommended && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-green-600 text-xs font-medium">PROS</span>
                <ul className="text-muted-foreground">
                  {option.pros.map((pro, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <TrendingUp className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                      {pro}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="text-red-600 text-xs font-medium">CONS</span>
                <ul className="text-muted-foreground">
                  {option.cons.map((con, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <TrendingDown className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                      {con}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Part 4: New Tools/Capabilities Needed

Based on gap analysis and test case expectations:

### 4.1 Impact Calculator Tool

**Purpose**: Quantify business impact of recommendations

```typescript
// Tool: calculate_business_impact
// Returns estimated revenue/time/conversion impact

interface ImpactCalculation {
  metric: 'revenue' | 'time' | 'conversion' | 'traffic';
  currentValue: number;
  projectedValue: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  scenarios: {
    conservative: number;
    realistic: number;
    optimistic: number;
  };
}
```

### 4.2 Store Health Checker Tool

**Purpose**: Proactive monitoring of store issues

```typescript
// Tool: check_store_health
// Returns list of issues, warnings, and recommendations

interface StoreHealthCheck {
  score: number; // 0-100
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    area: 'inventory' | 'seo' | 'content' | 'pricing' | 'images';
    message: string;
    recommendation: string;
  }>;
  lastChecked: string;
}
```

### 4.3 Competitor Tracker Tool

**Purpose**: Monitor competitor changes

```typescript
// Tool: track_competitors
// Returns competitor price/product/promotion changes

interface CompetitorUpdate {
  competitor: string;
  changeType: 'price' | 'new_product' | 'promotion' | 'out_of_stock';
  details: string;
  relevantProducts: string[];
  suggestedAction: string;
}
```

### 4.4 Bulk Preview Generator Tool

**Purpose**: Generate previews for bulk operations

```typescript
// Tool: generate_bulk_preview
// Shows sample of changes before execution

interface BulkPreview {
  operation: string;
  totalItems: number;
  sampleChanges: Array<{
    item: string;
    before: unknown;
    after: unknown;
  }>;
  estimatedTime: string;
  reversible: boolean;
  warnings: string[];
}
```

---

## Part 5: Implementation Priority

### Phase 1: Core Behavior (Week 1-2) - P0
**Impact: High | Effort: Medium**

1. **System Prompt: Never Say Can't** (1.1)
   - Simple text addition
   - Immediate impact on user experience
   
2. **System Prompt: Next Steps Format** (1.2)
   - Simple text addition
   - Ensures actionable outputs

3. **System Prompt: Research Before Action** (1.3)
   - Text addition
   - Prevents rushed mistakes

### Phase 2: Decision Support (Week 2-3) - P0
**Impact: High | Effort: Medium**

4. **System Prompt: Decision Support Format** (1.5)
   - Text addition
   - Better recommendation quality

5. **System Prompt: Quantified Impact** (1.6)
   - Text addition
   - More persuasive recommendations

6. **System Prompt: Urgency Detection** (1.7)
   - Text addition
   - Better prioritization

### Phase 3: Permission System (Week 3-4) - P1
**Impact: High | Effort: High**

7. **Type Definitions Update** (2.1)
   - Shared types update
   - Foundation for permission improvements

8. **Risk Level Classification** (2.2)
   - Backend logic
   - Enables intelligent auto-approve

9. **Permission Preferences Store** (2.3)
   - New store file
   - Enables "remember" functionality

### Phase 4: UI Improvements (Week 4-5) - P2
**Impact: Medium | Effort: High**

10. **Inline Permission Component** (3.1)
    - New component replacing modal
    - Per user request for inline boxes

11. **Enhanced Progress Indicator** (3.2)
    - Component update
    - Better visibility into progress

12. **Structured Output Renderer** (3.3)
    - New component
    - Better rendering of formatted outputs

### Phase 5: Templates & Proactive (Week 5-6) - P0
**Impact: High | Effort: Low**

13. **System Prompt: Output Templates** (1.8)
    - Text addition (large but straightforward)
    - Consistent output quality

14. **System Prompt: Proactive Behaviors** (1.9)
    - Text addition
    - Differentiating feature

15. **System Prompt: Bulk Preview Protocol** (1.4)
    - Text addition
    - Prevents bulk operation mistakes

### Phase 6: New Tools (Week 6-8) - P3
**Impact: Medium | Effort: High**

16. **Impact Calculator Tool** (4.1)
17. **Store Health Checker Tool** (4.2)
18. **Competitor Tracker Tool** (4.3)
19. **Bulk Preview Generator Tool** (4.4)

---

## Quick Wins (Can Do Today)

1. Add "Never Say Can't" principle to system prompt
2. Add "Always Provide Next Steps" format
3. Add "Research Before Action" pattern
4. Add "Urgency Detection" protocol

These are pure text additions to `config-generator.ts` with no code changes required.

---

## Success Metrics

After implementing these improvements, measure:

1. **User Satisfaction**: Fewer "the AI didn't help me" complaints
2. **Task Completion Rate**: More tasks completed without user re-prompting
3. **Time to Value**: Faster resolution of user requests
4. **Permission Friction**: Fewer permission-related interruptions
5. **Proactive Value**: Number of issues detected before user reports them

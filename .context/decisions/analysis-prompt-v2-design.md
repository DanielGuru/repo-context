# Decision: Analysis Prompt V2 — Quality Over Quantity

## What Changed
Complete rewrite of `ANALYSIS_SYSTEM_PROMPT` and `buildAnalysisPrompt()` in `src/commands/analyze.ts`.

## Why
The v1 prompt produced mediocre output:
- Old resolved bugs documented as current regressions (no temporal awareness)
- Template-driven facts (forced "architecture.md", "database.md" even when irrelevant)
- Speculative decisions with no evidence ("React was chosen for its ecosystem")
- Generic filler instead of actionable knowledge

## Key Design Principles in V2
1. **Temporal awareness**: Today's date is passed in the user prompt. Commit time spans are shown. Explicit rule: "a bugfix commit means the bug is FIXED."
2. **Evidence-based only**: Decisions require cited evidence. Facts require file paths. Regressions must be in current source code.
3. **Quality > quantity**: "3 excellent entries > 10 generic ones. Empty is honest."
4. **Agent perspective**: "If I were an agent dropped into this codebase with zero context, what prevents mistakes?"
5. **Stack-aware hints**: `getFrameworkHints()` provides analysis focus areas based on detected frameworks.
6. **Frontend/CSS awareness**: Explicit guidance to document styling, globals, themes, design tokens.

## Implication
Don't revert to the template-driven approach. Don't remove the temporal filtering rules. The GOOD/BAD examples in the prompt are critical for calibrating AI output quality.
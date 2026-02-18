# Decision: Use Null Byte Delimiter for Git Log Parsing

## Context
`git.ts` used `|` as a delimiter in `--format=%H|%h|%an|%ai|%s`. Author names containing `|` (e.g., "John | Doe") would corrupt all subsequent fields.

## Decision
Changed to `%x00` (null byte) delimiter: `--format=%H%x00%h%x00%an%x00%ai%x00%s`.

## Alternatives Considered
- Tab character (`%x09`) — can appear in commit messages
- Multi-character delimiter (`|||`) — increases parsing complexity
- Null byte — cannot appear in git author names or commit subjects

## Trade-offs
- Null bytes are invisible in debugging output — harder to inspect raw data
- But they're the standard approach used by `git log -z` and other git tools
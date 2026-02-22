# repomemory demo — record with: vhs demo.tape
# Install vhs: brew install vhs

Output demo.gif
Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 700
Set Theme "Dracula"
Set Padding 20

# Title card
Type "# repomemory — your codebase never forgets"
Sleep 2s
Ctrl+C

# Show the problem
Type "# Without repomemory: every session starts blank"
Sleep 1.5s
Ctrl+C

# The fix — one command
Type "npx repomemory go"
Sleep 500ms
Enter
Sleep 8s

# Show what was created
Type "ls .context/"
Enter
Sleep 1s

Type "cat .context/index.md"
Enter
Sleep 2s

# Show search working
Type "repomemory search 'authentication'"
Enter
Sleep 2s

# Show status
Type "repomemory status"
Enter
Sleep 2s

# Outro
Type "# Next Claude Code session: instant context. Every session."
Sleep 3s
Ctrl+C

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in repomemory, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use one of these methods:

1. **GitHub Security Advisory** (preferred): Go to the [Security tab](https://github.com/DanielGuru/repomemory/security/advisories/new) and create a new advisory.
2. **Email**: Contact the maintainer directly via GitHub profile.

## What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Scope

The following areas are in scope for security reports:

- **Path traversal**: Any way to read/write files outside the `.context/` directory
- **API key exposure**: Leaking API keys through logs, error messages, or network requests
- **Code injection**: Any way to execute arbitrary code through user input
- **MCP protocol vulnerabilities**: Issues in the MCP server that could affect connected AI agents

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix**: Critical issues will be patched as soon as possible

## Supported Versions

Only the latest release is supported with security updates.

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

# AI Provider System

## File: `src/lib/ai-provider.ts`

## Supported Providers
| Provider | Env Var | Notes |
|----------|---------|-------|
| `anthropic` | `ANTHROPIC_API_KEY` | Uses streaming (`.stream()` not `.create()`) |
| `openai` | `OPENAI_API_KEY` | Standard |
| `gemini` | `GEMINI_API_KEY` | Uses `systemInstruction` field |
| `grok` | `GROK_API_KEY` | OpenAI-compatible |

## Critical: Anthropic Streaming
- **MUST use `.stream()`** — `.create()` fails for operations >10 minutes
- Error: "Streaming is required for operations that may take longer than 10 minutes"
- Already implemented correctly — don't switch back to `.create()`

## AIError Class
- Custom error class with `isRetryable` property
- Used in `analyze.ts` for retry with exponential backoff

## Cost Estimation
- Provider estimates cost before running expensive operations
- Shown to user before `analyze` command runs

## Gemini Specifics
- Uses `systemInstruction` field (not `system` like Anthropic/OpenAI)
- Uses `@google/generative-ai` SDK

## Embedding Providers (src/lib/embeddings.ts)
- OpenAI: `text-embedding-3-small`
- Gemini: via `@google/generative-ai`
- `createEmbeddingProvider()` auto-detects from available API keys
- Falls back gracefully to keyword-only search when no embedding key available
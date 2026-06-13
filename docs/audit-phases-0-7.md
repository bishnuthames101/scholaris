# Code Quality Audit: Phases 0-4 (Fable-5) vs Phases 5-7 (Opus)

Conducted: 2026-06-13

## API Patterns & Code Organization

| Aspect | Phases 0-4 | Phases 5-7 |
|--------|-----------|------------|
| Zod validation | Consistent, but looser bounds (e.g. phone `min(5)`) | Stricter — regex patterns, max lengths, explicit limits |
| Auth guards | `requireTenantSession()` + role checks | Same pattern, though timetable POST missing explicit role list |
| Error responses | Consistent `NextResponse.json({ error })` | Same pattern |
| UUID validation | **Missing** on some Staff routes | Present via Zod `.uuid()` |

## Security

| Aspect | Phases 0-4 | Phases 5-7 |
|--------|-----------|------------|
| RLS policies | Applied but **no tests** | Applied **with** dedicated RLS tests |
| Input sanitization | Basic Zod | Zod + regex + length caps + error message sanitization |
| Race conditions | UI-level cancellation tokens | DB-level `SELECT ... FOR UPDATE` on credits |
| Channel adapters | N/A | Sanitized — no internal errors leaked to client |
| Phone matching | Too permissive (`min(5)`) | Register endpoint uses `endsWith()` — **too loose** |

## Testing

| Aspect | Phases 0-4 | Phases 5-7 |
|--------|-----------|------------|
| Unit tests | Domain logic (grading lib) | Domain logic + channel adapters |
| Integration/RLS | **None** | 14 RLS tests (Phase 5), 5 more (Phase 7) |
| Test idempotency | Some `create` calls (fragile) | `upsert` / `findFirst ?? create` pattern |
| Coverage breadth | Narrower — only grading | Broader — notifications, credits, portals, timetable, notices, homework |

## UI Quality

| Aspect | Phases 0-4 | Phases 5-7 |
|--------|-----------|------------|
| Component pattern | Server + Client split, proper `"use client"` | Same pattern |
| ARIA / a11y | Labels present | Present but less consistent |
| Error handling | `try/catch` with user-visible messages | **Silent `.catch(() => {})`** in several pages |
| Race prevention | Cancellation tokens in fetches | Missing — stale closure risk |
| Polish level | Higher — transitions, loading states | Functional but less polished |

## Scores

| Category | Phases 0-4 | Phases 5-7 |
|----------|-----------|------------|
| API patterns | 8/10 | 8.5/10 |
| Security | 7/10 | 8.5/10 |
| Testing | 6/10 | 8.5/10 |
| UI quality | 9/10 | 7.5/10 |
| **Overall** | **7.5/10** | **8.25/10** |

## Remediation Plan

### Bring Phases 5-7 UP to match Fable's 0-4 UI quality:
1. Fix silent `.catch(() => {})` — add proper error state + user-visible toast/message
2. Add ARIA labels to interactive elements
3. Add fetch cancellation tokens to prevent stale closures

### Bring Phases 0-4 UP to match Opus's 5-7 security/testing:
1. Add UUID validation to Staff routes
2. Tighten string length bounds (rfidUid, admissionNo, phone regex)
3. Add RLS integration tests for Phases 1-4 tables
4. Sanitize error messages — don't leak internals

### Cross-cutting fixes:
1. Register endpoint: replace `endsWith()` phone match with exact match
2. Timetable POST: add explicit role guard
3. Notice audience: validate against allowed values
4. Timetable/homework POST: validate input lengths

# MYFI — question for Planning & Audit: continue P20-G01 or restart Phase 9/the broader work?

Date: 2026-08-20
Raised by: the user, via MYFI Testing & Release session
Type: strategic question, not evidence — needs a Planning & Audit ruling, not
a Testing & Release decision.

## The question

Given how long P20-G01 has taken and how many rounds of diagnosis it's
needed (env-var isolation, wallet shadow-parity false lead, now a checksum
mismatch), the user asked directly: why not abandon this work/phase entirely
and start over, rather than keep chasing it?

## Testing & Release's view (not binding — Planning's call)

Recommended against restarting, for two reasons:

1. **The safety mechanism has held throughout.** Every single gate
   invocation across every round today — including the accidental one on the
   already-abandoned `0c9600f3` account — returned
   `financialDataChangedByGate: false`. The system is refusing safely
   instead of corrupting data, which is exactly what P20-G01 exists to
   prove. That's a sign the underlying design is sound, not broken.
2. **The remaining defect is narrow, not architectural.** The last reading
   (see `MYFI_P20_G01_WALLET_SHADOW_PARITY_DEFECT_2026-08-20.md`) showed
   `sourceCounts`/`targetCounts` identical in every field — the failure is a
   pure checksum mismatch (one field's *value* differs, nothing missing or
   extra). That looks like hours of Implementation work, not a sign the
   whole migration/shadow-copy design needs to be rebuilt. Restarting from
   scratch would still need to solve "compare a staged copy against the real
   workspace safely" eventually — that problem doesn't go away with a
   rewrite.

The one case where restarting would be justified: if this checksum mismatch
turns out to trace back to something architectural in the shadow-copy
design itself (not just one field's serialization), rather than a small,
fixable bug. That's a call only Planning & Audit can make once the
checksum-diff field is identified.

## Ask

Planning & Audit: please weigh in — continue narrowing down the checksum
mismatch (Testing & Release standing by), or is there a broader concern
about the Phase 9 / restore-epoch design that warrants reconsidering scope?

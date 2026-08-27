// MYFI_ARCHIVE_COMMIT_FREEZE_P11A
// Frozen Master Plan §3.5: "if the current Archive rewrites opening balances or
// changes financial meaning, it is frozen until Archive Consolidation."
//
// commitYearArchive does exactly that today — it adds the archived year's
// movement into wallet.openingBalance, folds debt.payments into archivedPaid and
// goal.savings into archivedSaved, and pushes those rewritten payloads into the
// V7 entity rows and the sync outbox. §73 forbids all four.
//
// Phase 11-A therefore closes the commit path rather than shipping a half-fixed
// one. Phase 11-B replaces the mutation with a pure visibility change and lifts
// this flag; that is deliberately a one-line, separately reviewable edit.
//
// §77 draws the other half of the line: "Export Archive File" is a user artifact,
// not the ledger. Exporting a year's archive file stays available while frozen —
// only the internal commit that removes the year from active data is blocked.

export const ARCHIVE_COMMIT_FROZEN = true;

export const ARCHIVE_COMMIT_FROZEN_REASON = 'archive_commit_frozen_phase_11a_section_3_5';

export const archiveCommitFreezeNotice = (isAr = false) => (isAr
  ? {
    title: 'الأرشفة موقوفة مؤقتاً',
    body: 'تم حفظ ملف الأرشيف ويمكنك الاحتفاظ به. أما إخراج السنة من البيانات النشطة فموقوف مؤقتاً: الطريقة الحالية كانت تعدّل الرصيد الافتتاحي وتاريخ الديون والأهداف، وهذا مخالف لقواعد MYFI المالية. سيعود الخيار بعد إعادة بنائه بحيث لا يمسّ أي رقم.',
  }
  : {
    title: 'Archiving is paused',
    body: 'Your archive file was saved and is yours to keep. Removing the year from active data is paused for now: the current method rewrote the opening balance and the debt and goal history, which breaks MYFI’s financial rules. The option returns once it is rebuilt so that it changes no number at all.',
  });

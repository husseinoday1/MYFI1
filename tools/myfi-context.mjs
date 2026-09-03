#!/usr/bin/env node
/**
 * MYFI deterministic context collector.
 *
 * Collects compact, verifiable repository evidence for an AI or human session so
 * that orientation does not require a full repository scan. It COLLECTS EVIDENCE
 * ONLY — it never draws conclusions about gate status, acceptance, or correctness.
 *
 * Usage:
 *   node tools/myfi-context.mjs            # compact baseline + staleness report
 *   node tools/myfi-context.mjs --fetch    # same, after `git fetch --prune`
 *   node tools/myfi-context.mjs --json     # machine-readable
 *
 * Read-only: runs no command that mutates the working tree, index, or remote.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = new Set(process.argv.slice(2));

const git = (...args) => {
  try {
    return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

/** Domain invalidation map: first matching pattern wins. */
const DOMAINS = [
  [/^supabase\/migrations\//, 'database-schema (MIGRATION)'],
  [/^supabase\//, 'cloud-backend'],
  [/^src\/lib\/financialRestore|^src\/lib\/myfiFiles|backup/i, 'backup-restore'],
  [/^src\/lib\/.*(Ledger|financial|Money|currency|fx)/i, 'financial-core'],
  [/^src\/lib\/.*(sync|Sync)/, 'sync'],
  [/^src\/lib\/.*(secure|auth|Auth|vault)/, 'auth-security'],
  [/^src\/lib\/.*Repository/, 'database-schema'],
  [/^src\/(screens|components)\//, 'ui'],
  [/^src\/store\//, 'state'],
  [/^src\/dev\//, 'dev-harness'],
  [/^tests\//, 'tests'],
  [/^\.github\//, 'ci-release'],
  [/^android\/|^app\.json$|^app\.config/, 'android-native'],
  [/^docs\/01_CORE_AUTHORITY\/|^docs\/00_MYFI_CANONICAL_AUTHORITY/, 'planning-authority'],
  [/^docs\/04_CURRENT_EVIDENCE\//, 'evidence'],
  [/^docs\//, 'documentation'],
  [/^package(-lock)?\.json$/, 'dependencies'],
  [/^src\//, 'app-other'],
];
const HIGH_RISK = new Set(['database-schema (MIGRATION)', 'database-schema', 'financial-core', 'backup-restore', 'auth-security']);

const classify = (files) => {
  const hits = new Map();
  for (const f of files) {
    const m = DOMAINS.find(([re]) => re.test(f));
    const key = m ? m[1] : 'unclassified';
    hits.set(key, (hits.get(key) || 0) + 1);
  }
  return hits;
};

/** Pull the provenance HEAD out of a state file's `**HEAD:** \`sha\`` line. */
const provenanceHead = (path) => {
  if (!existsSync(resolve(REPO, path))) return null;
  const text = readFileSync(resolve(REPO, path), 'utf8');
  // Tolerant of both `**HEAD:** \`sha\`` and `- HEAD: \`sha\`` provenance styles.
  const m = text.match(/(?:^|\n)[-*\s]*\*{0,2}HEAD:?\*{0,2}\s*`?([0-9a-f]{7,40})`?/i);
  const t = text.match(/(?:^|\n)[-*\s]*\*{0,2}Verified(?: at)?:\*{0,2}\s*`?(\S+?)`?\s*(?:\n|$)/i);
  return { head: m ? m[1] : null, verifiedAt: t ? t[1] : null };
};

const pkgVersions = () => {
  const p = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8'));
  const d = { ...p.dependencies, ...p.devDependencies };
  return ['expo', 'react-native', 'expo-sqlite', 'react'].map((k) => `${k}@${d[k] ?? '?'}`).join('  ');
};

const schemaVersion = () => {
  try {
    const src = readFileSync(resolve(REPO, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
    const m = src.match(/FINANCIAL_SQLITE_SCHEMA_VERSION\s*=\s*(\d+)/);
    return m ? m[1] : '?';
  } catch {
    return '?';
  }
};

if (argv.has('--fetch')) git('fetch', '--prune');

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const head = git('rev-parse', 'HEAD');
const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
const delta = upstream ? git('rev-list', '--left-right', '--count', `${upstream}...HEAD`).split(/\s+/) : null;
const porcelain = git('status', '--porcelain').split('\n').filter(Boolean);
const modified = porcelain.filter((l) => !l.startsWith('??'));
const untracked = porcelain.filter((l) => l.startsWith('??'));

const states = {
  'PROJECT_STATE': provenanceHead('.myfi-ai/PROJECT_STATE.md'),
  'CURRENT_TASK': provenanceHead('.myfi-ai/CURRENT_TASK.md'),
};

const staleness = [];
for (const [name, p] of Object.entries(states)) {
  if (!p || !p.head) { staleness.push({ name, status: 'MISSING' }); continue; }
  if (git('rev-parse', p.head + '^{commit}') === '') { staleness.push({ name, status: 'UNKNOWN_COMMIT', head: p.head }); continue; }
  const behind = Number(git('rev-list', '--count', `${p.head}..HEAD`) || 0);
  const files = behind ? git('diff', '--name-only', `${p.head}..HEAD`).split('\n').filter(Boolean) : [];
  staleness.push({
    name,
    status: behind === 0 ? 'CURRENT' : 'STALE',
    head: p.head,
    verifiedAt: p.verifiedAt,
    behind,
    domains: [...classify(files).entries()].map(([d, n]) => ({ domain: d, files: n, highRisk: HIGH_RISK.has(d) })),
  });
}

if (argv.has('--json')) {
  console.log(JSON.stringify({ branch, head, upstream, delta, modified: modified.length, untracked: untracked.length, states, staleness, schemaVersion: schemaVersion() }, null, 2));
  process.exit(0);
}

const L = [];
L.push('MYFI CONTEXT BASELINE  (evidence only — draws no conclusions)');
L.push(`  branch    ${branch}`);
L.push(`  HEAD      ${head.slice(0, 12)}`);
L.push(`  upstream  ${upstream || '(none)'}${delta ? `  behind ${delta[0]} / ahead ${delta[1]}` : ''}${argv.has('--fetch') ? ' (fetched)' : ' (NOT fetched — add --fetch to compare with remote)'}`);
L.push(`  worktree  ${modified.length} modified, ${untracked.length} untracked`);
L.push(`  runtime   node ${process.version}  ${pkgVersions()}  sqliteSchema=V${schemaVersion()}`);
L.push('');
L.push('STATE CACHE FRESHNESS');
for (const s of staleness) {
  if (s.status === 'MISSING') { L.push(`  ${s.name}: MISSING — no cached state, orient from canonical docs.`); continue; }
  if (s.status === 'UNKNOWN_COMMIT') { L.push(`  ${s.name}: UNTRUSTED — records commit ${s.head} which is not in this repo.`); continue; }
  if (s.status === 'CURRENT') { L.push(`  ${s.name}: CURRENT at ${s.head.slice(0, 12)} (${s.verifiedAt || 'no timestamp'}) — usable as a starting point, still not authority.`); continue; }
  L.push(`  ${s.name}: STALE — recorded ${s.head.slice(0, 12)} (${s.verifiedAt || 'no timestamp'}), HEAD is ${s.behind} commits ahead.`);
  L.push(`    invalidated domains:`);
  for (const d of s.domains.sort((a, b) => b.files - a.files)) {
    L.push(`      ${d.highRisk ? '!!' : '  '} ${d.domain} (${d.files} file${d.files === 1 ? '' : 's'})${d.highRisk ? '  <- high-risk: re-verify from source before any claim' : ''}`);
  }
}
L.push('');
L.push('NEXT: refresh only the invalidated domains. Do not rescan the whole repository.');
console.log(L.join('\n'));

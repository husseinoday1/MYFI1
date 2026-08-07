const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const packageRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(repo, rel), text, 'utf8');
const copy = rel => {
  const src = path.join(packageRoot, rel);
  const dst = path.join(repo, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};
const replaceOnce = (text, from, to, label) => {
  if (text.includes(to)) return text;
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  return text.replace(from, to);
};

copy('src/lib/backupData.js');

// 1) secureVault: the previous snapshot written as ":previous" must also be read and cleared.
{
  const rel = 'src/lib/secureVault.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "const BACKUP_SUFFIXES = [':previous:1', ':previous:2', ':previous:3'];",
    "const BACKUP_SUFFIXES = [PREVIOUS_SUFFIX, ':previous:1', ':previous:2', ':previous:3'];",
    'vault backup suffixes',
  );
  t = replaceOnce(
    t,
`  for (let index = 1; index <= 3; index += 1) {
    const result = await readBackup(\`${key}${PREVIOUS_SUFFIX}:${index}\`, index);
    if (result) return result;
  }
`,
`  for (let index = 0; index < BACKUP_SUFFIXES.length; index += 1) {
    const suffix = BACKUP_SUFFIXES[index];
    const result = await readBackup(\`${key}${suffix}\`, index);
    if (result) return result;
  }
`,
    'vault previous read',
  );
  write(rel, t);
}

// 2) myfiFiles: restore CSV display amount, validate package data shape and inner backup version.
{
  const rel = 'src/lib/myfiFiles.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "import { decryptStringWithPassword, encryptStringWithPassword } from './cryptoBox';",
    "import { decryptStringWithPassword, encryptStringWithPassword } from './cryptoBox';\nimport { getTransactionDisplayAmount } from './modules';\nimport { inspectBackupData, MYFI_BACKUP_DATA_VERSION } from './backupData';",
    'myfiFiles imports',
  );
  t = replaceOnce(
    t,
    "    item.amt,\n    currency,",
    "    getTransactionDisplayAmount(item),\n    currency,",
    'backup csv amount',
  );
  t = replaceOnce(
    t,
`  if (payload?.format !== MYFI_FORMAT) throw new Error('This is not a MYFI package');
  if (Number(payload.schemaVersion || 0) > MYFI_SCHEMA_VERSION) {
    throw new Error('This backup was created by a newer MYFI version');
  }
`,
`  if (payload?.format !== MYFI_FORMAT) throw new Error('This is not a MYFI package');
  if (Number(payload.schemaVersion || 0) > MYFI_SCHEMA_VERSION) {
    throw new Error('This backup was created by a newer MYFI version');
  }
  if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new Error('MYFI package has no valid backup data');
  }
  const dataVersion = Number(payload.data.v || 0);
  if (dataVersion > MYFI_BACKUP_DATA_VERSION) {
    throw new Error('This backup data was created by a newer MYFI version');
  }
  const validation = inspectBackupData(payload.data);
  if (!validation.valid) {
    throw new Error(\`Invalid backup data: ${validation.errors[0] || 'unknown'}\`);
  }
`,
    'package data validation',
  );
  write(rel, t);
}

// 3) dataSlice: validate before replacement, deep-normalize notification settings,
// allow an intentionally empty backup, and make the explicit restore authoritative in cloud conflicts.
{
  const rel = 'src/store/slices/dataSlice.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "import { readVaultSnapshot } from '../../lib/secureVault';",
    "import { readVaultSnapshot } from '../../lib/secureVault';\nimport { inspectBackupData, MYFI_BACKUP_DATA_VERSION, normalizeBackupNotifications, sanitizeBackupCategories } from '../../lib/backupData';",
    'dataSlice backup imports',
  );
  t = replaceOnce(t, "      v: 6,", "      v: MYFI_BACKUP_DATA_VERSION,", 'backup version');
  t = replaceOnce(
    t,
`      const data = JSON.parse(jsonStr);
      const current = get();
      rollback = {
`,
`      const data = JSON.parse(jsonStr);
      const validation = inspectBackupData(data);
      if (!validation.valid) throw new Error(validation.errors[0] || 'invalid_backup');
      const current = get();
      rollback = {
`,
    'import validation',
  );
  t = replaceOnce(
    t,
`        cats:  data.cats  || DEF_CATS,
        cfg:   prepared.cfg,
        notif: { ...DEF_NOTIF, ...(data.notif || {}) },
      });
      await get().saveLocal();
      await get().syncCloud();
      return true;
`,
`        cats: sanitizeBackupCategories(data.cats, DEF_CATS),
        cfg: prepared.cfg,
        notif: normalizeBackupNotifications(data.notif, DEF_NOTIF),
      });

      // Restore is an explicit replacement operation. Force allows a legitimate
      // empty backup to replace a non-empty vault without being rejected.
      await get().saveLocal({ force: true, dirty: true });

      if (current.user) {
        let synced = await get().syncCloud();
        if (!synced && get().syncConflict?.cloud) {
          // The user explicitly chose "replace data now", so the restored local
          // snapshot wins over a stale cloud revision after one controlled retry.
          const conflict = get().syncConflict;
          set({
            cloudRevision: Number(conflict.cloudRevision || 0),
            syncConflict: null,
            dirty: true,
            lastSyncError: null,
          });
          await get().saveLocal({ force: true, dirty: true });
          synced = await get().syncCloud();
        }
        if (!synced) {
          // Local restore remains intact and dirty; cloud sync can retry later.
          set({ dirty: true, lastSyncError: 'backup_restore_sync_pending' });
          await get().saveLocal({ force: true, dirty: true });
        }
      }
      return true;
`,
    'import persistence and cloud authority',
  );
  t = replaceOnce(
    t,
    "          await get().saveLocal();",
    "          await get().saveLocal({ force: true });",
    'rollback force save',
  );
  write(rel, t);
}

// 4) Settings preview: accept valid empty backups and reject unsafe transfer references / newer data.
{
  const rel = 'src/screens/SettingsScreen.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "import { resolveSystemTheme } from '../lib/systemTheme';",
    "import { resolveSystemTheme } from '../lib/systemTheme';\nimport { inspectBackupData } from '../lib/backupData';",
    'Settings backup import',
  );

  const start = t.indexOf("const previewBackupText =");
  const end = t.indexOf("\n\nexport default function SettingsScreen", start);
  if (start < 0 || end < 0) throw new Error('Settings preview function not found');

  const fn = `const previewBackupText = (text = '', lang = 'ar') => {
  const raw = String(text || '').trim();
  if (!raw) return { valid: false, empty: true, error: '' };
  try {
    const data = JSON.parse(raw);
    const result = inspectBackupData(data);
    const messageFor = code => {
      if (code === 'backup_version_newer') return lang === 'ar' ? 'هذه النسخة أُنشئت بإصدار أحدث من MYFI.' : 'This backup was created by a newer MYFI version.';
      if (code === 'backup_config_missing') return lang === 'ar' ? 'لا توجد إعدادات داخل النسخة.' : 'Backup has no settings.';
      if (String(code).startsWith('backup_transfer_')) return lang === 'ar' ? 'توجد حركة تحويل تشير إلى محفظة مفقودة أو غير صالحة.' : 'A transfer references a missing or invalid wallet.';
      if (String(code).includes('duplicate_ids')) return lang === 'ar' ? 'توجد معرّفات مكررة داخل النسخة.' : 'The backup contains duplicate IDs.';
      return lang === 'ar' ? 'النسخة غير صالحة أو بنيتها غير مكتملة.' : 'The backup is invalid or incomplete.';
    };
    return {
      ...result,
      error: result.valid ? '' : messageFor(result.errors[0]),
      issues: [...result.errors, ...result.warnings],
    };
  } catch {
    return {
      valid: false,
      error: lang === 'ar' ? 'النص ليس JSON صالح.' : 'Text is not valid JSON.',
    };
  }
};`;
  t = t.slice(0, start) + fn + t.slice(end);
  write(rel, t);
}

console.log('MYFI backup/restore hardening applied.');

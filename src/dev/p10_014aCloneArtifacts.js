// P10-014A diagnostic-only clone artifact ownership and cleanup.
// The exact generated-name pattern is the deletion authority: no prefix-only,
// wildcard or directory-wide deletion is allowed.

export const P10_014A_CLONE_DATABASE_NAME_PATTERN = /^p10-014a-r5-clone-\d{13}-[a-z0-9]{8}\.db$/;
export const P10_014A_CLONE_DATABASE_ARTIFACT_PATTERN = /^p10-014a-r5-clone-\d{13}-[a-z0-9]{8}\.db(?:-(?:wal|shm|journal))?$/;

export const isOwnedCloneDatabaseName = value => (
  P10_014A_CLONE_DATABASE_NAME_PATTERN.test(String(value || ''))
);

const listOwnedCloneArtifacts = async ({ fileSystem, directoryUri }) => {
  const names = await fileSystem.readDirectoryAsync(directoryUri);
  return names
    .map(name => String(name || ''))
    .filter(name => P10_014A_CLONE_DATABASE_ARTIFACT_PATTERN.test(name))
    .sort();
};

export async function sweepOwnedCloneArtifacts({
  fileSystem,
  directoryUri,
  sourceDatabaseName,
}) {
  if (!fileSystem?.readDirectoryAsync || !fileSystem?.deleteAsync) {
    throw new Error('p10_clone_probe_orphan_sweep_filesystem_invalid');
  }
  const safeDirectoryUri = String(directoryUri || '').trim().replace(/\/+$/, '');
  if (!safeDirectoryUri.startsWith('file://')) {
    throw new Error('p10_clone_probe_orphan_sweep_directory_invalid');
  }

  const before = await listOwnedCloneArtifacts({ fileSystem, directoryUri: safeDirectoryUri });
  for (const fileName of before) {
    if (fileName === sourceDatabaseName
        || !P10_014A_CLONE_DATABASE_ARTIFACT_PATTERN.test(fileName)) {
      throw new Error('p10_clone_probe_orphan_sweep_scope_invalid');
    }
    await fileSystem.deleteAsync(`${safeDirectoryUri}/${fileName}`, { idempotent: true });
  }

  const remaining = await listOwnedCloneArtifacts({ fileSystem, directoryUri: safeDirectoryUri });
  if (remaining.length > 0) throw new Error('p10_clone_probe_orphan_sweep_failed');
  return Object.freeze({
    artifactCount: before.length,
    cleanupVerified: true,
  });
}

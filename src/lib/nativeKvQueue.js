// `expo-sqlite/kv-store` is used by both the encrypted vault and the active
// workspace pointer.  They share a native SQLite file, but previously had no
// shared ownership at the JavaScript level.  A cold start can legitimately
// read the auth session, persist the workspace pointer, and start cloud sync
// at nearly the same time; serialising these complete operations prevents a
// transient native `database is locked` failure.
let nativeKvQueue = Promise.resolve();

export const enqueueNativeKvOperation = task => {
  if (typeof task !== 'function') {
    return Promise.reject(new Error('native_kv_operation_required'));
  }
  const queued = nativeKvQueue.then(task, task);
  nativeKvQueue = queued.catch(() => undefined);
  return queued;
};

export const flushNativeKvOperations = () => nativeKvQueue.catch(() => undefined);

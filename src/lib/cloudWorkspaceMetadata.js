// Cloud data-minimization boundary for the financial workspace.
//
// This is an allowlist by design. New local preferences stay on the device
// unless a reviewed financial reason adds them here with a matching test.
export const CLOUD_WORKSPACE_CFG_KEYS = Object.freeze([
  'currency',
]);

export const cloudWorkspaceCfg = (cfg = {}) => {
  const result = {};
  for (const key of CLOUD_WORKSPACE_CFG_KEYS) {
    if (cfg?.[key] !== undefined) result[key] = cfg[key];
  }
  return result;
};

// A remote workspace must never reset this device's language, presentation,
// privacy or account UI choices. Only reviewed financial metadata may overlay
// the local configuration.
export const mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({
  ...(localCfg || {}),
  ...cloudWorkspaceCfg(cloudCfg),
});

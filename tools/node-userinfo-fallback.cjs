// Windows can occasionally make Node's os.userInfo() fail even when the
// session has ample memory. EAS calls it during startup, so keep this narrow
// fallback at the CLI boundary rather than changing app/runtime code.
const os = require('node:os');

const readUserInfo = os.userInfo;

os.userInfo = (...args) => {
  try {
    return readUserInfo(...args);
  } catch (error) {
    if (error?.code !== 'ERR_SYSTEM_ERROR' && error?.syscall !== 'uv_os_get_passwd') throw error;
    return {
      username: process.env.USERNAME || 'myfi-builder',
      uid: -1,
      gid: -1,
      shell: null,
      homedir: process.env.USERPROFILE || process.cwd(),
    };
  }
};

// Phase 14 §91 — old app <-> new app protocol compatibility gate.
//
// The gate exists (financialMutationSyncV2.js, resolveCloudLedgerV2) but the
// audit found zero references to `financial_v2_protocol_incompatible` anywhere
// outside its own throw site: nothing had ever exercised it. A gate no test
// drives is a gate nobody knows still works, and this one is the thing standing
// between a version-skewed client and a ledger it cannot correctly interpret.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialMutationSyncV2.js');

const compile = (filename, mocks = {}) => {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === filename && Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    if (parent?.filename === filename && request.startsWith('.')) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    compiled._compile(babel.transformFileSync(filename, {
      babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code, filename);
    return compiled.exports;
  } finally { Module._load = originalLoad; }
};

const { resolveCloudLedgerV2 } = compile(target, { './financialLedgerV7Repository': {} });

const LEDGER = 'ledger-protocol-gate';
const identity = { ledgerId: LEDGER };

// A supabase stand-in that answers get_financial_ledger_v2 with whatever
// registration the case is about, and records what was called.
const cloudReturning = (registration, { registerWith = null } = {}) => {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push(name);
      if (name === 'get_financial_ledger_v2') return { data: registration, error: null };
      if (name === 'register_financial_ledger_v2') return { data: registerWith, error: null, params };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
};

const registration = (overrides = {}) => ({
  ledger_id: LEDGER, restore_epoch: 1, protocol_version: 2, minimum_supported_version: 2,
  status: 'active', ...overrides,
});

const rejects = async (supabase, expected, message) => {
  await assert.rejects(
    () => resolveCloudLedgerV2({ supabase, identity }),
    error => {
      assert.equal(error.message, expected, `${message} (got ${error.message})`);
      return true;
    },
    message,
  );
};

(async () => {
  // 1) The compatible case, so the rejections below mean something: a matching
  //    protocol resolves and returns the cloud registration.
  {
    const supabase = cloudReturning(registration());
    const cloud = await resolveCloudLedgerV2({ supabase, identity });
    assert.equal(cloud.ledgerId, LEDGER);
    assert.equal(cloud.protocolVersion, 2);
    assert.deepEqual(supabase.calls, ['get_financial_ledger_v2'],
      'an existing ledger must not be re-registered');
  }

  // 2) New app, old cloud: the ledger speaks a protocol this client does not.
  //    This is the "old app <-> new app" case from the other direction and the
  //    one that must never be waved through -- interpreting a v1 or v3 ledger
  //    with v2 rules is how a client corrupts a ledger it does not understand.
  for (const protocolVersion of [0, 1, 3, 99]) {
    await rejects(
      cloudReturning(registration({ protocol_version: protocolVersion })),
      'financial_v2_protocol_incompatible',
      `protocol_version ${protocolVersion} must be refused`,
    );
  }

  // 3) Old app, new cloud: the ledger has raised its floor above what this
  //    client can speak. The client is the old one here, and must stand down
  //    rather than write with rules the ledger no longer accepts.
  for (const minimumSupportedVersion of [3, 4, 10]) {
    await rejects(
      cloudReturning(registration({ minimum_supported_version: minimumSupportedVersion })),
      'financial_v2_protocol_incompatible',
      `minimum_supported_version ${minimumSupportedVersion} must be refused`,
    );
  }

  // 3b) A floor at or below this client's version is compatible -- the gate
  //     rejects on incompatibility, not on any difference at all.
  for (const minimumSupportedVersion of [1, 2]) {
    const cloud = await resolveCloudLedgerV2({
      supabase: cloudReturning(registration({ minimum_supported_version: minimumSupportedVersion })), identity,
    });
    assert.equal(cloud.minimumSupportedVersion, minimumSupportedVersion,
      `minimum_supported_version ${minimumSupportedVersion} must be accepted`);
  }

  // 4) The gate also applies to a ledger this client just registered. A fresh
  //    registration answering with an incompatible protocol must be refused
  //    exactly like an existing one -- not trusted because we created it.
  {
    const supabase = cloudReturning(null, { registerWith: registration({ protocol_version: 5 }) });
    await rejects(supabase, 'financial_v2_protocol_incompatible',
      'a freshly registered ledger is not exempt from the gate');
    assert.deepEqual(supabase.calls, ['get_financial_ledger_v2', 'register_financial_ledger_v2']);
  }

  // 5) Identity is checked before protocol: a ledger belonging to someone else
  //    must fail as an identity conflict, so the reported reason names the real
  //    problem instead of blaming the protocol.
  await rejects(
    cloudReturning(registration({ ledger_id: 'ledger-someone-else' })),
    'financial_v2_ledger_id_conflict',
    'a mismatched ledger id is an identity conflict, not a protocol one',
  );

  // 6) Missing/unusable registrations fail closed rather than defaulting into
  //    a compatible-looking shape. A registration with no protocol at all
  //    normalizes to 0, which case 2 already proves is refused.
  {
    const supabase = cloudReturning(null, { registerWith: null });
    await rejects(supabase, 'financial_v2_cloud_ledger_missing', 'an unregisterable ledger must fail closed');
  }
  await assert.rejects(
    () => resolveCloudLedgerV2({ supabase: null, identity }),
    /financial_v2_cloud_resolution_unavailable/,
    'no client at all must fail closed',
  );
  await assert.rejects(
    () => resolveCloudLedgerV2({ supabase: cloudReturning(registration()), identity: {} }),
    /financial_v2_cloud_resolution_unavailable/,
    'no local identity must fail closed',
  );

  console.log('MYFI P14 PROTOCOL COMPATIBILITY GATE: PASSED');
})().catch(error => { console.error(error); process.exit(1); });

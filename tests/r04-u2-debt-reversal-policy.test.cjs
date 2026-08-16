const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const beforeMode = args.includes('--expect-before');
const projectArg = args.find(value => value !== '--expect-before');
const root = path.resolve(projectArg || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const contractSource = read('src/lib/financialDomainContract.js');
const modelSource = read('src/lib/financialLedgerV7Model.js');
const trackerSource = read('src/store/slices/trackersSlice.js');

if (beforeMode) {
  assert(contractSource.includes("'debt_interest_fee_components_not_enforced'"), 'Before evidence missing: debt component gap already absent');
  assert(contractSource.includes("'explicit_refund_reversal_command_not_implemented'"), 'Before evidence missing: reversal gap already absent');
  assert(!modelSource.includes("assertFinancialCommandPolicy(transaction)"), 'Before evidence missing: command policy already wired');
  console.log('P04U2-003 BEFORE evidence: confirmed debt-component + reversal enforcement gaps');
  process.exit(0);
}

const ts = require('typescript');
const policySource = read('src/lib/financialCommandPolicy.js');
const activeSource = read('src/lib/activeLedgerRepository.js');

const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName,
}).outputText;

const evaluate = (source, fileName, customRequire = require) => {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpile(source, fileName))(customRequire, module, module.exports);
  return module.exports;
};

const policy = evaluate(policySource, 'financialCommandPolicy.js');

assert.equal(policy.assertFinancialCommandPolicy({
  flowType: 'debt_payment', isDebtPayment: true, debtId: 'd1',
  debtComponent: 'principal', walletAmount: -100,
}), true);

for (const tx of [
  { flowType: 'debt_payment', isDebtPayment: true, debtId: 'd1', walletAmount: -100, debtComponent: 'interest' },
  { flowType: 'debt_payment', isDebtPayment: true, debtId: 'd1', walletAmount: -100, interestAmount: 5 },
  { flowType: 'debt_payment', isDebtPayment: true, debtId: 'd1', walletAmount: -100, feeAmount: 2 },
  { flowType: 'debt_payment', isDebtPayment: true, debtId: 'd1', walletAmount: -100, debtComponents: [{ type: 'fee', amount: 2 }] },
]) {
  assert.throws(
    () => policy.assertFinancialCommandPolicy(tx),
    /financial_debt_component_not_supported/,
    'Unsupported debt components must fail closed',
  );
}

for (const tx of [
  { flowType: 'refund', walletAmount: 10 },
  { kind: 'reversal', walletAmount: 10 },
  { isRefund: true, walletAmount: 10 },
  { isReversal: true, walletAmount: 10 },
  { reversalOfTransactionId: 'tx-original', walletAmount: 10 },
]) {
  assert.throws(
    () => policy.assertFinancialCommandPolicy(tx),
    /financial_refund_reversal_not_supported/,
    'Refund/reversal must reject until an explicit command model exists',
  );
}

// Transfer fees are supported and must not be mistaken for debt fees.
assert.equal(policy.assertFinancialCommandPolicy({
  kind: 'transfer', flowType: 'transfer', walletAmount: 0, feeAmount: 2,
}), true);

for (const tx of [
  { flowType: 'income', walletAmount: -1 },
  { flowType: 'expense', walletAmount: 1 },
  { flowType: 'commitment_payment', walletAmount: 1 },
  { flowType: 'debt_payment', isDebtPayment: true, debtId: 'd1', debtComponent: 'principal', walletAmount: 1 },
  { flowType: 'debt_proceeds', isDebtOrigin: true, debtId: 'd1', debtComponent: 'principal', walletAmount: -1 },
  { flowType: 'receivable_created', isDebtOrigin: true, debtId: 'd2', debtComponent: 'principal', walletAmount: 1 },
  { flowType: 'receivable_collection', isDebtPayment: true, debtId: 'd2', debtComponent: 'principal', walletAmount: -1 },
]) {
  assert.throws(
    () => policy.assertFinancialCommandPolicy(tx),
    /financial_flow_sign_mismatch/,
    'Flow/sign contradictions must reject rather than silently reclassify',
  );
}

assert(modelSource.includes("import { assertFinancialCommandPolicy } from './financialCommandPolicy';"), 'V7 model policy import missing');
assert(modelSource.includes('assertFinancialCommandPolicy(transaction);'), 'V7 command boundary policy call missing');
assert(trackerSource.includes("debtComponent: 'principal'"), 'Debt-origin/payment commands must declare principal semantics');

const openStart = contractSource.indexOf('R04_U2_OPEN_ENFORCEMENT_GAPS');
const openEnd = contractSource.indexOf(']);', openStart);
assert(openStart >= 0 && openEnd > openStart, 'U-2 open-gap inventory missing');
const openBlock = contractSource.slice(openStart, openEnd);
assert(!openBlock.includes('debt_interest_fee_components_not_enforced'), 'Debt component gap still marked open');
assert(!openBlock.includes('explicit_refund_reversal_command_not_implemented'), 'Refund/reversal gap still marked open');
assert(contractSource.includes("FINANCIAL_DOMAIN_CONTRACT_VERSION = 'R04-U2-3'"), 'U-2 contract version not advanced');
assert(contractSource.includes("unsupportedComponentBehavior: 'reject_financial_command'"), 'Debt safe-rejection contract missing');
assert(contractSource.includes("currentRelease: 'reject_until_explicit_reference_command_exists'"), 'Reversal safe-rejection contract missing');

// P&L aggregate remains semantic: debt principal flows do not enter income/expense totals.
assert(activeSource.includes("IN ('income','expense','commitment_payment')"), 'Summary semantic flow whitelist missing');
assert(!activeSource.includes("IN ('income','expense','commitment_payment','debt_payment')"), 'Debt principal leaked into P&L summary');

console.log('MYFI P04U2-003 debt component + reversal safe-rejection policy: PASSED');

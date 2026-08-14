import { analyzeSmartEntry } from './smartEntry';
import { getWalletLabel } from './wallets';

const normalize = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ');

const validISO = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const numberOrNull = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.abs(n) : null;
};

const confidence = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

const matchWallet = (hint, wallets = [], lang = 'ar') => {
  const target = normalize(hint);
  if (!target) return null;

  const exact = wallets.find(wallet => {
    const names = [
      wallet.id,
      wallet.name,
      wallet.nameEn,
      getWalletLabel(wallet, lang),
      wallet.type,
    ].map(normalize).filter(Boolean);
    return names.some(name => name === target);
  });
  if (exact) return exact.id;

  const fuzzy = wallets.find(wallet => {
    const names = [
      wallet.name,
      wallet.nameEn,
      getWalletLabel(wallet, lang),
    ].map(normalize).filter(Boolean);
    return names.some(name => target.includes(name) || name.includes(target));
  });
  return fuzzy?.id || null;
};

const categoryId = (analysis, fallback, cats = []) => {
  const hint = normalize(analysis?.category);
  if (hint) {
    const matched = cats.find(cat => (
      normalize(cat.id) === hint
      || normalize(cat.label) === hint
      || normalize(cat.labelEn) === hint
    ));
    if (matched) return matched.id;
  }
  return fallback?.catId || cats.find(cat => cat.id === 'other')?.id || cats[0]?.id || 'other';
};

const flowType = (analysis, fallback, wallets, lang) => {
  const flow = String(analysis?.flow || '').toLowerCase();
  const direction = String(analysis?.direction || '').toLowerCase();

  if (flow === 'income') return { type: 'inc' };
  if (flow === 'expense') return { type: 'exp' };

  if (flow === 'transfer') {
    const fromWalletId = matchWallet(analysis?.fromWalletHint, wallets, lang);
    const toWalletId = matchWallet(analysis?.toWalletHint, wallets, lang);

    if (fromWalletId && toWalletId && fromWalletId !== toWalletId) {
      return { type: 'transfer', fromWalletId, toWalletId };
    }
    if (direction === 'incoming') return { type: 'inc' };
    if (direction === 'outgoing') return { type: 'exp' };

    return { type: fallback?.type || null, transferNeedsWallets: true };
  }

  return { type: fallback?.type || 'exp' };
};


const strongFinancialIntent = (text = '') => {
  const value = normalize(text);

  const action = [
    'دفعت', 'دفع', 'اشتريت', 'شريت', 'صرفت', 'سددت', 'حولت', 'ارسلت',
    'استلمت', 'استلم', 'قبضت', 'راتب', 'راتبي', 'ايداع', 'إيداع', 'سحبت',
    'paid', 'bought', 'spent', 'sent', 'received', 'salary', 'deposit', 'withdraw',
  ].some(word => value.includes(normalize(word)));

  const bankTransactionScreen = [
    'transaction details',
    'transaction type',
    'transaction date',
    'transaction reference',
    'salary domiciliation',
    'pos purchase',
    'atm pos ecom commission',
  ].some(word => value.includes(word));

  const pricedArabicPhrase = /(?:^|\s)ب\s*\d|ب(?:الف|مليون|ميه|مئه|مائه|ميتين|خمس|ثلاث|اربع|ربع|نص)/.test(value);

  return action || bankTransactionScreen || pricedArabicPhrase;
};

const amountFromEvidence = ({
  analysis,
  cats,
  history,
  wallets,
  lang,
}) => {
  const evidence = String(analysis?.amountEvidence || '').trim();
  if (!evidence) return null;

  const evidenceDraft = analyzeSmartEntry({
    text: `TOTAL: ${evidence}`,
    cats,
    history,
    wallets,
    lang,
  });
  return evidenceDraft?.amount > 0 ? evidenceDraft.amount : null;
};

export const resolveSmartCaptureDraft = ({
  text = '',
  analysis = null,
  cats = [],
  history = [],
  wallets = [],
  lang = 'ar',
  currency = '',
} = {}) => {
  const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : null;
  const fallback = analyzeSmartEntry({ text, cats, history, wallets, lang });
  const localIntent = strongFinancialIntent(text);

  if (safeAnalysis?.multipleTransactions === true) {
    return { ok: false, reason: 'multiple_transactions', analysis: safeAnalysis, fallback };
  }

  // AI may occasionally classify a clear banking screenshot or a simple spoken
  // purchase as "not_transaction".  A strong local amount + transaction cue is
  // allowed to recover the draft, but the result remains reviewable.
  if (
    safeAnalysis?.transactionLikely === false
    && !(fallback?.amount > 0 && localIntent)
  ) {
    return { ok: false, reason: 'not_transaction', analysis: safeAnalysis, fallback };
  }

  const evidenceAmount = amountFromEvidence({
    analysis: safeAnalysis,
    cats,
    history,
    wallets,
    lang,
  });
  const aiAmount = numberOrNull(safeAnalysis?.amount);

  // Prefer the exact visible amount evidence because local parsing understands
  // locale/currency separators such as 13,200.000 IQD. Then use the local
  // semantic parser. Use the model's numeric amount only as the final fallback.
  const amount = (
    evidenceAmount
    || fallback?.amount
    || (
      aiAmount && confidence(safeAnalysis?.amountConfidence) >= 0.5
        ? aiAmount
        : null
    )
  );

  if (!(amount > 0)) {
    return { ok: false, reason: 'amount_unclear', analysis: safeAnalysis, fallback };
  }

  const detectedCurrency = String(safeAnalysis?.currency || '').trim().toUpperCase();
  const appCurrency = String(currency || '').trim().toUpperCase();
  const currencyMismatch = !!(
    detectedCurrency
    && appCurrency
    && detectedCurrency !== appCurrency
  );

  const flow = flowType(safeAnalysis, fallback, wallets, lang);
  if (!flow.type) {
    return { ok: false, reason: 'flow_unclear', analysis: safeAnalysis, fallback };
  }

  const walletId = matchWallet(
    safeAnalysis?.walletHint || safeAnalysis?.accountHint,
    wallets,
    lang,
  ) || fallback?.walletId || null;

  const aiDate = validISO(safeAnalysis?.dateISO)
    && confidence(safeAnalysis?.dateConfidence) >= 0.5
    ? safeAnalysis.dateISO
    : null;

  const title = String(
    safeAnalysis?.title
    || safeAnalysis?.merchant
    || safeAnalysis?.counterparty
    || fallback?.title
    || '',
  ).trim();

  return {
    ok: true,
    reason: currencyMismatch ? 'currency_mismatch' : null,
    analysis: safeAnalysis,
    draft: {
      type: flow.type,
      amount,
      catId: categoryId(safeAnalysis, fallback, cats),
      walletId,
      fromWalletId: flow.fromWalletId || null,
      toWalletId: flow.toWalletId || null,
      dateISO: aiDate || fallback?.dateISO || null,
      title,
      currency: detectedCurrency || appCurrency || null,
      currencyMismatch,
      needsReview: (
        currencyMismatch
        || safeAnalysis?.transactionLikely === false
        || safeAnalysis?.overallConfidence < 0.75
        || safeAnalysis?.warnings?.length > 0
        || fallback?.needsReview
        || flow.transferNeedsWallets
      ),
    },
  };
};

export const smartCaptureReasonMessage = (reason, lang = 'ar') => {
  const ar = lang === 'ar';
  const messages = {
    multiple_transactions: ar
      ? 'الصورة تحتوي أكثر من حركة مالية. حالياً افتح حركة واحدة بصورة منفصلة حتى لا يتم اختيار مبلغ بالخطأ.'
      : 'The image contains multiple financial transactions. For now, use an image with one transaction so MYFI does not choose the wrong amount.',
    not_transaction: ar
      ? 'تم فهم الصورة، لكنها لا تبدو إثباتاً لحركة مالية مكتملة. لم يتم افتراض دخل أو مصروف.'
      : 'The image was understood, but it does not look like evidence of a completed financial transaction. No income or expense was assumed.',
    amount_unclear: ar
      ? 'تم فهم المصدر، لكن المبلغ المالي النهائي غير واضح بما يكفي. أدخله يدوياً وراجع بقية الحقول.'
      : 'The source was understood, but the final financial amount is not clear enough. Enter it manually and review the other fields.',
    flow_unclear: ar
      ? 'المبلغ واضح لكن اتجاه الحركة غير محسوم. اختر دخل أو مصروف يدوياً.'
      : 'The amount is clear but the transaction direction is ambiguous. Choose income or expense manually.',
    currency_mismatch: ar
      ? 'عملة المصدر تختلف عن عملة MYFI الحالية. راجع المبلغ والمحفظة قبل الحفظ.'
      : 'The source currency differs from the current MYFI currency. Review the amount and wallet before saving.',
  };
  return messages[reason] || (ar ? 'راجع الحقول المستخرجة قبل الحفظ.' : 'Review the extracted fields before saving.');
};

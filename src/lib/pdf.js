import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import { STR }      from './strings';
import { getSymbol } from './constants';
import { getTransactionDisplayAmount } from './modules';
import { getTransactionTagLabel } from './transactionTags';

export const generateMonthPDF = async (month, cats, cfg) => {
  const sym  = getSymbol(cfg.currency);
  const lang = cfg.lang;
  const dir  = lang === 'ar' ? 'rtl' : 'ltr';
  const L    = STR[lang];

  const rows = [...(month.trans || [])]
    .sort((a, b) => b.ts - a.ts)
    .map(t => {
      const cat   = cats.find(c => c.id === t.cat) || cats[cats.length - 1];
      const amount = getTransactionDisplayAmount(t);
      const color = amount > 0 ? '#4ade80' : '#fc8181';
      const sign  = amount > 0 ? '+' : '';
      return `
        <tr>
          <td style="color:${color};font-weight:700">${sign}${Math.abs(amount).toLocaleString()} ${sym}</td>
          <td>${t.dateISO || ''}</td>
          <td>${cat.emoji} ${lang === 'ar' ? cat.label : cat.labelEn}</td>
          <td style="font-weight:600">${t.title}</td>
        </tr>`;
    }).join('');

  const noDataRow = `<tr><td colspan="4" style="text-align:center;color:#888;padding:24px">${L.noData}</td></tr>`;
  const netColor  = month.net >= 0 ? '#4ade80' : '#fc8181';
  const netSign   = month.net >= 0 ? '+' : '';

  const html = `
<!DOCTYPE html><html dir="${dir}">
<head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#0f1110;color:#e9ece9;padding:32px;direction:${dir}}
  .hd{background:#1a2e20;padding:24px;border-radius:16px;margin-bottom:24px;text-align:center;border:1px solid #2a4030}
  .hd h1{font-size:26px;color:#3ecf6e;margin-bottom:4px} .hd p{font-size:13px;color:#6b716b}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
  .stat{background:#131614;border-radius:12px;padding:16px;text-align:center;border:1px solid #252826}
  .stat .val{font-size:20px;font-weight:800;margin-bottom:4px} .stat .lbl{font-size:11px;color:#6b716b}
  table{width:100%;border-collapse:collapse;background:#131614;border-radius:12px;overflow:hidden;border:1px solid #252826}
  th{background:#1a2e20;color:#3ecf6e;padding:10px 14px;font-size:12px;text-align:${lang==='ar'?'right':'left'}}
  td{padding:10px 14px;border-bottom:1px solid #252826;font-size:13px}
  tr:last-child td{border-bottom:none}
  .footer{text-align:center;margin-top:24px;color:#2e312e;font-size:11px}
</style></head>
<body>
  <div class="hd"><h1>🌿 MYFI</h1><p>${month.name} · ${cfg.name}</p></div>
  <div class="stats">
    <div class="stat"><div class="val" style="color:#4ade80">${(month.inc||0).toLocaleString()} ${sym}</div><div class="lbl">${L.totalInc}</div></div>
    <div class="stat"><div class="val" style="color:#fc8181">${(month.exp||0).toLocaleString()} ${sym}</div><div class="lbl">${L.totalExp}</div></div>
    <div class="stat"><div class="val" style="color:${netColor}">${netSign}${(month.net||0).toLocaleString()} ${sym}</div><div class="lbl">${L.net}</div></div>
  </div>
  <table>
    <thead><tr><th>${L.amount}</th><th>${L.date}</th><th>${L.cat}</th><th>${L.titleField}</th></tr></thead>
    <tbody>${rows || noDataRow}</tbody>
  </table>
  <div class="footer">MYFI · ${new Date().toLocaleDateString()}</div>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'MYFI PDF' });
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const generateFinancialReportPDF = async ({
  title,
  trans = [],
  cats = [],
  stats = {},
  debts = {},
  receivables = {},
  debtRows = [],
  receivableRows = [],
  topCategories = [],
  comparison = [],
  cfg = {},
  sections = ['summary', 'debts', 'categories', 'transactions'],
}) => {
  const lang = cfg.lang === 'en' ? 'en' : 'ar';
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const sym = getSymbol(cfg.currency);
  const label = {
    report: ar ? 'تقرير مالي' : 'Financial report',
    income: ar ? 'الدخل' : 'Income',
    expense: ar ? 'المصروفات' : 'Expenses',
    net: ar ? 'صافي الدخل' : 'Net income',
    debt: ar ? 'دين عليّ' : 'Debt I owe',
    due: ar ? 'دين لي' : 'Debt owed to me',
    total: ar ? 'الإجمالي' : 'Total',
    paid: ar ? 'المسدّد' : 'Paid',
    remaining: ar ? 'المتبقي' : 'Remaining',
    categories: ar ? 'أبرز المصروفات' : 'Top expenses',
    comparison: ar ? 'المقارنة المحددة' : 'Selected comparison',
    period: ar ? 'الفترة' : 'Period',
    transactions: ar ? 'تفاصيل الحركات' : 'Transaction details',
    date: ar ? 'التاريخ' : 'Date',
    description: ar ? 'البيان' : 'Description',
    category: ar ? 'التصنيف' : 'Category',
    transactionTag: ar ? 'وسم المعاملة' : 'Transaction tag',
    amount: ar ? 'المبلغ' : 'Amount',
    noData: ar ? 'لا توجد بيانات ضمن الفترة المحددة' : 'No data in the selected period',
    generated: ar ? 'أُنشئ بواسطة MYFI' : 'Generated by MYFI',
  };
  const fmt = (value) => Math.round(Number(value || 0)).toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-US');
  const categoryMap = new Map(cats.map(cat => [cat.id, (ar ? cat.label : cat.labelEn) || cat.label || cat.labelEn || cat.id]));
  const rows = [...trans]
    .filter(item => item.kind !== 'transfer')
    .sort((a, b) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')))
    .map(item => {
      const amount = getTransactionDisplayAmount(item);
      return `<tr>
        <td>${escapeHtml(item.dateISO || '')}</td>
        <td>${escapeHtml(item.title || '')}</td>
        <td>${escapeHtml(getTransactionTagLabel(item, lang))}</td>
        <td>${escapeHtml(categoryMap.get(item.cat) || item.cat || '')}</td>
        <td class="${amount >= 0 ? 'positive' : 'negative'}">${amount >= 0 ? '+' : '-'}${fmt(Math.abs(amount))} ${escapeHtml(sym)}</td>
      </tr>`;
    }).join('');
  const categoryRows = topCategories.slice(0, 6).map(item => `
    <div class="category">
      <div><strong>${escapeHtml((ar ? item.label : item.labelEn) || item.label || item.labelEn || '')}</strong><span>${Math.round(Number(item.percent || 0))}%</span></div>
      <div class="track"><i style="width:${Math.min(100, Number(item.percent || 0))}%;background:${escapeHtml(item.color || '#138A57')}"></i></div>
      <small>${fmt(item.spent)} ${escapeHtml(sym)}</small>
    </div>`).join('');
  const comparisonRows = comparison.map(item => `<tr>
    <td><strong>${escapeHtml(item.label || item.key || '')}</strong></td>
    <td class="positive">${fmt(item.inc)} ${escapeHtml(sym)}</td>
    <td class="negative">${fmt(item.exp)} ${escapeHtml(sym)}</td>
    <td class="${Number(item.bal || 0) >= 0 ? 'positive' : 'negative'}">${Number(item.bal || 0) >= 0 ? '+' : '-'}${fmt(Math.abs(item.bal || 0))} ${escapeHtml(sym)}</td>
  </tr>`).join('');
  const trackerTableRows = (items = []) => items.map(item => {
    const total = Number(item.total ?? item.target ?? 0);
    const paid = Number(item.paid ?? item.cur ?? 0);
    const remaining = Math.max(0, total - paid);
    return `<tr>
      <td class="desc"><strong>${escapeHtml(item.name || '')}</strong><small>${escapeHtml(item.due || item.createdAt || '')}</small></td>
      <td>${fmt(total)} ${escapeHtml(sym)}</td>
      <td>${fmt(paid)} ${escapeHtml(sym)}</td>
      <td>${fmt(remaining)} ${escapeHtml(sym)}</td>
    </tr>`;
  }).join('');
  const owedRows = trackerTableRows(debtRows);
  const dueRows = trackerTableRows(receivableRows);
  const selected = new Set(Array.isArray(sections) ? sections : []);
  const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8"/>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:30px;background:#fff;color:#132019;font-family:Arial,sans-serif;direction:${dir};font-size:13px;line-height:1.45}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #138A57;padding-bottom:16px;margin-bottom:20px}
    .brand{color:#138A57;font-size:28px;font-weight:900}.eyebrow{font-size:12px;color:#69766f;font-weight:700;text-transform:uppercase}
    h1{font-size:22px;margin:5px 0 0}.period{color:#69766f;font-size:13px;margin-top:6px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}.stat{border:1px solid #e1e8e4;border-radius:10px;padding:13px;background:#fbfdfb}
    .stat span{display:block;color:#69766f;font-size:12px;margin-bottom:5px}.stat strong{font-size:17px}.positive{color:#118653}.negative{color:#c9565e}
    h2{font-size:16px;margin:20px 0 9px;color:#132019}.category{margin-bottom:10px}.category>div:first-child{display:flex;justify-content:space-between;font-size:13px}
    .track{height:7px;border-radius:9px;background:#edf2ef;overflow:hidden;margin:6px 0 3px}.track i{display:block;height:100%;border-radius:9px}.category small{color:#69766f}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;table-layout:auto}th{background:#edf7f1;color:#16784e;text-align:${ar ? 'right' : 'left'};font-size:11px;font-weight:900}
    th,td{padding:10px 9px;border-bottom:1px solid #e7ece9;vertical-align:top;word-break:break-word}.desc strong{display:block}.desc small{display:block;color:#69766f;margin-top:3px}
    .comparisonChart{display:grid;gap:14px;margin-bottom:14px}.chartRow{border:1px solid #e1e8e4;border-radius:10px;padding:10px}.chartLabel{font-weight:900;margin-bottom:8px}.chartBars{display:grid;gap:7px}.barLine{display:flex;align-items:center;gap:7px;font-size:10px}.barName{width:55px;font-weight:800}.barLine b{width:92px;text-align:${ar ? 'left' : 'right'};font-size:10px}.barLine i{height:9px;border-radius:8px;display:block;min-width:2px}.positiveFill{background:#118653}.negativeFill{background:#c9565e}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e1e8e4;color:#8a9690;font-size:11px;text-align:center}
  </style></head><body>
    <div class="header"><div><div class="eyebrow">${label.report}</div><h1>${escapeHtml(title)}</h1><div class="period">${escapeHtml(cfg.name || '')}</div></div><div class="brand">MYFI</div></div>
    ${selected.has('summary') ? `<div class="stats">
      <div class="stat"><span>${label.income}</span><strong class="positive">${fmt(stats.inc)} ${escapeHtml(sym)}</strong></div>
      <div class="stat"><span>${label.expense}</span><strong class="negative">${fmt(stats.exp)} ${escapeHtml(sym)}</strong></div>
      <div class="stat"><span>${label.net}</span><strong class="${Number(stats.bal || 0) >= 0 ? 'positive' : 'negative'}">${Number(stats.bal || 0) >= 0 ? '+' : '-'}${fmt(Math.abs(stats.bal || 0))} ${escapeHtml(sym)}</strong></div>
    </div>` : ''}
    ${selected.has('debts') ? `<div class="stats">
      <div class="stat"><span>${label.debt}</span><strong>${fmt(debts.remaining)} ${escapeHtml(sym)}</strong></div>
      <div class="stat"><span>${label.due}</span><strong>${fmt(receivables.remaining)} ${escapeHtml(sym)}</strong></div>
      <div class="stat"><span>${label.remaining}</span><strong>${fmt(Number(debts.remaining || 0) - Number(receivables.remaining || 0))} ${escapeHtml(sym)}</strong></div>
    </div>
    ${owedRows ? `<h2>${label.debt}</h2><table><thead><tr><th>${label.description}</th><th>${label.total}</th><th>${label.paid}</th><th>${label.remaining}</th></tr></thead><tbody>${owedRows}</tbody></table>` : ''}
    ${dueRows ? `<h2>${label.due}</h2><table><thead><tr><th>${label.description}</th><th>${label.total}</th><th>${label.paid}</th><th>${label.remaining}</th></tr></thead><tbody>${dueRows}</tbody></table>` : ''}` : ''}
    ${selected.has('categories') && categoryRows ? `<h2>${label.categories}</h2>${categoryRows}` : ''}
    ${selected.has('comparison_chart') && comparisonRows ? `<h2>${label.comparison}</h2><div class="comparisonChart">${comparison.map(item => { const max = Math.max(1, ...comparison.map(row => Math.max(Number(row.inc || 0), Number(row.exp || 0)))); const incomeWidth = Math.max(2, Math.round((Number(item.inc || 0) / max) * 100)); const expenseWidth = Math.max(2, Math.round((Number(item.exp || 0) / max) * 100)); return `<div class="chartRow"><div class="chartLabel">${escapeHtml(item.label || item.key || '')}</div><div class="chartBars"><div class="barLine"><span class="barName positive">${label.income}</span><i class="barLine positiveFill" style="width:${incomeWidth}%"></i><b>${fmt(item.inc)} ${escapeHtml(sym)}</b></div><div class="barLine"><span class="barName negative">${label.expense}</span><i class="barLine negativeFill" style="width:${expenseWidth}%"></i><b>${fmt(item.exp)} ${escapeHtml(sym)}</b></div></div></div>`; }).join('')}</div>` : ''}
    ${selected.has('comparison_details') && comparisonRows ? `<h2>${label.comparison}</h2><table><thead><tr><th>${label.period}</th><th>${label.income}</th><th>${label.expense}</th><th>${label.net}</th></tr></thead><tbody>${comparisonRows}</tbody></table>` : ''}
    ${selected.has('transactions') ? `<h2>${label.transactions}</h2><table><thead><tr><th>${label.date}</th><th>${label.description}</th><th>${label.transactionTag}</th><th>${label.category}</th><th>${label.amount}</th></tr></thead><tbody>${rows || `<tr><td colspan="5">${label.noData}</td></tr>`}</tbody></table>` : ''}
    <div class="footer">${label.generated} · ${new Date().toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US')}</div>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'MYFI PDF' });
  return uri;
};

export const generateComparisonPDF = async ({ title, periods = [], cfg = {} }) => {
  const lang = cfg.lang === 'en' ? 'en' : 'ar';
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const sym = getSymbol(cfg.currency);
  const labels = {
    period: ar ? 'الفترة' : 'Period',
    income: ar ? 'الدخل' : 'Income',
    expense: ar ? 'المصروف' : 'Expense',
    net: ar ? 'صافي الدخل' : 'Net income',
    rate: ar ? 'نسبة الادخار' : 'Savings rate',
    generated: ar ? 'أُنشئ بواسطة MYFI' : 'Generated by MYFI',
  };
  const fmt = value => Math.round(Number(value || 0)).toLocaleString(ar ? 'ar-IQ' : 'en-US');
  const rows = periods.map(item => `<tr>
    <td><strong>${escapeHtml(item.label)}</strong></td>
    <td class="income">${fmt(item.inc)} ${escapeHtml(sym)}</td>
    <td class="expense">${fmt(item.exp)} ${escapeHtml(sym)}</td>
    <td class="${Number(item.bal || 0) >= 0 ? 'income' : 'expense'}">${Number(item.bal || 0) >= 0 ? '+' : '-'}${fmt(Math.abs(item.bal || 0))} ${escapeHtml(sym)}</td>
    <td>${fmt(item.savingsRate)}%</td>
  </tr>`).join('');
  const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box}body{margin:0;padding:36px;color:#132019;font-family:Arial,sans-serif;direction:${dir}}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #138A57;padding-bottom:18px;margin-bottom:24px}
    h1{font-size:20px;margin:0}.brand{color:#138A57;font-size:28px;font-weight:900}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#edf7f1;color:#16784e;text-align:${ar ? 'right' : 'left'}}
    th,td{padding:12px 10px;border-bottom:1px solid #e1e8e4}.income{color:#118653}.expense{color:#c9565e}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e1e8e4;color:#8a9690;font-size:10px;text-align:center}
  </style></head><body>
    <div class="header"><h1>${escapeHtml(title)}</h1><div class="brand">MYFI</div></div>
    <table><thead><tr><th>${labels.period}</th><th>${labels.income}</th><th>${labels.expense}</th><th>${labels.net}</th><th>${labels.rate}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="footer">${labels.generated} · ${new Date().toLocaleDateString(ar ? 'ar-IQ' : 'en-US')}</div>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: ar ? 'مقارنة MYFI' : 'MYFI comparison' });
  return uri;
};

import React from 'react';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { ScreenScroll, PageIntro } from '../components/AppPrimitives';
import WalletBalanceCard from '../components/WalletBalanceCard';

// Wallets & Accounts — My Money gateway 1. Per
// docs/design/07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md: total balance + per-wallet
// list. Reuses the existing WalletBalanceCard exactly as Home already does
// (Financial-data impact: NONE — display of existing wallet balances only).
// Wallet-detail drill-down target is UNKNOWN per the design spec, so rows are
// display-only here (no onSelectWallet) rather than inventing a destination.
export default function WalletsAccountsScreen() {
  const { th, lang, cfg, isAr } = useTheme();
  const { trans, wallets } = useStore();

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="wallet-outline"
        title={isAr ? 'المحافظ والحسابات' : 'Wallets & Accounts'}
        subtitle={isAr ? 'ما الذي أملكه، وأين؟' : 'What do I have, and where?'}
      />
      <WalletBalanceCard
        wallets={wallets}
        transactions={trans}
        cfg={cfg}
        showWallets
        title={isAr ? 'كل المحافظ' : 'All wallets'}
      />
    </ScreenScroll>
  );
}

import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/useTheme';
import { ScreenScroll, PageIntro, SectionTitle, SurfaceCard, Touchable, IconContainer, rowDirection, textAlign } from '../components/AppPrimitives';
import { SectionListRow } from '../components/SectionListRow';
import { RADIUS, SPACE } from '../lib/tokens';

function ShortcutItem({ th, lang, icon, label, onPress }) {
  return (
    <Touchable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <View style={{ width: 52, height: 52, borderRadius: RADIUS.lg, backgroundColor: th.primSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={th.primary} />
      </View>
      <Text style={{ color: th.text, fontSize: 11, fontWeight: '900', textAlign: 'center' }} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

function TrustBadge({ th, lang, icon, tone, title, description }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4, backgroundColor: `${tone}12`, borderRadius: RADIUS.lg, paddingVertical: 12, paddingHorizontal: 6 }}>
      <IconContainer th={th} icon={icon} tone={tone} size="sm" />
      <Text style={{ color: th.text, fontSize: 10, fontWeight: '900', textAlign: 'center' }} numberOfLines={2}>
        {title}
      </Text>
      <Text style={{ color: th.sub, fontSize: 8, textAlign: 'center' }} numberOfLines={3}>
        {description}
      </Text>
    </View>
  );
}

// More hub — a thin router. Per docs/design/07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md
// "More": My Shortcuts, My Tools, Data & Files, Benefits/Rewards, MYFI & Help,
// Settings. Data & Files / MYFI & Help / Settings all route into the existing,
// unmodified SettingsScreen via its already-existing openRequest deep-link
// (App.js's openSettingsPage) — this screen does NOT extract or duplicate
// DataPage/GuidePage/SupportPage/AboutPage, since moving that content out of
// SettingsScreen.js is Settings/Legacy consolidation (roadmap Step 4), out of
// scope here.
//
// Known, flagged simplifications (see the Step 3 evidence file):
// - "My Shortcuts" is spec'd in the approved reference as a swipeable,
//   user-customizable carousel (pagination dots for multiple pages) — this
//   build ships one static row of 3 defaults; carousel + customization are
//   not implemented.
// - "My Tools" and "Benefits" route to a plain "coming soon" placeholder —
//   their sub-items are documented in the approved reference but building
//   them (categories/currencies/templates for My Tools; an actual
//   Premium/rewards system for Benefits) is out of scope here. Archive is
//   the one My Tools sub-item that already exists and is wired directly
//   (roadmap Step 5, see below).
export default function MoreScreen({ onOpenSettingsPage, onAddTransaction, onTransfer, onOpenBudget, onOpenArchive }) {
  const { th, lang, isAr } = useTheme();
  const [placeholder, setPlaceholder] = useState(null);

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="ellipsis-horizontal-outline"
        title={isAr ? 'المزيد' : 'More'}
        subtitle={isAr ? 'كل الأدوات التي تحتاجها في مكان واحد' : 'All the tools you need in one place'}
      />

      <View style={{ flexDirection: rowDirection(lang), alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <SectionTitle th={th} lang={lang} style={{ marginBottom: 0 }}>{isAr ? 'اختصاراتي' : 'My Shortcuts'}</SectionTitle>
        {/* Shortcut customization/reordering isn't implemented yet — visual affordance only. */}
        <Touchable
          onPress={() => {}}
          style={{ flexDirection: rowDirection(lang), alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: th.border }}
        >
          <Ionicons name="pencil-outline" size={12} color={th.sub} />
          <Text style={{ color: th.sub, fontSize: 11, fontWeight: '800' }}>{isAr ? 'تعديل' : 'Edit'}</Text>
        </Touchable>
      </View>
      <Text style={{ color: th.faint, fontSize: 10, textAlign: textAlign(lang), marginBottom: 8 }}>
        {isAr ? 'اضغط مطولاً لتغيير الترتيب' : 'Long-press to reorder'}
      </Text>
      <SurfaceCard th={th} style={{ padding: 12, marginBottom: 14, flexDirection: rowDirection(lang), gap: 8 }}>
        <ShortcutItem th={th} lang={lang} icon="add-circle-outline" label={isAr ? 'إضافة حركة' : 'Add'} onPress={onAddTransaction} />
        <ShortcutItem th={th} lang={lang} icon="swap-horizontal-outline" label={isAr ? 'تحويل' : 'Transfer'} onPress={onTransfer} />
        <ShortcutItem th={th} lang={lang} icon="pie-chart-outline" label={isAr ? 'الميزانية' : 'Budget'} onPress={onOpenBudget} />
      </SurfaceCard>

      <SurfaceCard th={th} style={{ padding: 4, marginBottom: 10 }}>
        <SectionListRow
          th={th} lang={lang} icon="briefcase-outline" tone={th.primary}
          title={isAr ? 'أدواتي' : 'My Tools'}
          description={isAr ? 'التصنيفات، العملات والحسابات، القوالب' : 'Categories, currencies & accounts, templates'}
          bordered
          onPress={() => setPlaceholder(isAr ? 'أدواتي' : 'My Tools')}
        />
        {/* Archive relocated here from Settings > Data & storage per roadmap
            Step 5 (2026-08-26) — same ArchiveScreen, same onOpenArchive
            wiring, content/logic unchanged. */}
        <SectionListRow
          th={th} lang={lang} icon="archive-outline" tone={th.primary}
          title={isAr ? 'الأرشيف' : 'Archive'}
          description={isAr ? 'الحسابات والفئات المؤرشفة' : 'Archived accounts and categories'}
          onPress={onOpenArchive}
        />
      </SurfaceCard>

      <SurfaceCard th={th} style={{ padding: 4, marginBottom: 10 }}>
        <SectionListRow
          th={th} lang={lang} icon="cloud-upload-outline" tone={th.transfer}
          title={isAr ? 'البيانات والملفات' : 'Data & Files'}
          description={isAr ? 'النسخ الاحتياطي، الاستعادة، التصدير والاستيراد' : 'Backup, restore, export and import'}
          onPress={() => onOpenSettingsPage?.('data')}
        />
      </SurfaceCard>

      <SurfaceCard th={th} style={{ padding: 4, marginBottom: 10 }}>
        <SectionListRow
          th={th} lang={lang} icon="trophy-outline" tone={th.warn}
          title={isAr ? 'المزايا' : 'Benefits'}
          description={isAr ? 'Premium، المكافآت، ودعوة صديق' : 'Premium, rewards, and invite a friend'}
          onPress={() => setPlaceholder(isAr ? 'المزايا' : 'Benefits')}
        />
      </SurfaceCard>

      <SurfaceCard th={th} style={{ padding: 4, marginBottom: 10 }}>
        <SectionListRow
          th={th} lang={lang} icon="headset-outline" tone={th.primary}
          title={isAr ? 'المساعدة' : 'Help'}
          description={isAr ? 'مركز المساعدة، تواصل معنا، الأسئلة الشائعة' : 'Help center, contact us, FAQ'}
          bordered
          onPress={() => onOpenSettingsPage?.('support')}
        />
        <SectionListRow
          th={th} lang={lang} icon="information-circle-outline" tone={th.primary}
          title={isAr ? 'عن MYFI' : 'About MYFI'}
          description={isAr ? 'هوية المنتج، الإصدار ومبادئ الخصوصية' : 'Product identity, version, and privacy principles'}
          onPress={() => onOpenSettingsPage?.('about')}
        />
      </SurfaceCard>

      <SurfaceCard th={th} style={{ padding: 4, marginBottom: 14 }}>
        <SectionListRow
          th={th} lang={lang} icon="settings-outline" tone={th.primary}
          title={isAr ? 'الإعدادات' : 'Settings'}
          description={isAr ? 'إعدادات التطبيق والحساب والأمان والتفضيلات' : 'App, account, security, and preferences'}
          onPress={() => onOpenSettingsPage?.('root')}
        />
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'ملاحظات مهمة' : 'Important notes'}</SectionTitle>
      <View style={{ flexDirection: rowDirection(lang), gap: 6, marginBottom: 4 }}>
        <TrustBadge
          th={th} lang={lang} tone={th.primary} icon="shield-checkmark-outline"
          title={isAr ? 'خصوصيتك أولاً' : 'Privacy first'}
          description={isAr ? 'بياناتك آمنة ومحفوظة بعناية تامة' : 'Your data is kept safe and secure'}
        />
        <TrustBadge
          th={th} lang={lang} tone={th.primary} icon="cloud-done-outline"
          title={isAr ? 'نسخ احتياطي آمن' : 'Safe backups'}
          description={isAr ? 'لا تفقد بياناتك، اعمل نسخًا احتياطية بانتظام' : "Don't lose your data — back up regularly"}
        />
        <TrustBadge
          th={th} lang={lang} tone={th.warn} icon="trophy-outline"
          title={isAr ? 'كن أكثر مع MYFI' : 'Get more with MYFI'}
          description={isAr ? 'اكتشف المزايا التي تجعل تجربتك أفضل' : 'Discover the benefits that make it better'}
        />
        <TrustBadge
          th={th} lang={lang} tone={th.primary} icon="headset-outline"
          title={isAr ? 'نحن هنا لمساعدتك' : "We're here to help"}
          description={isAr ? 'فريق الدعم جاهز للإجابة على استفساراتك' : 'Support is ready to answer your questions'}
        />
      </View>

      <Modal visible={!!placeholder} transparent animationType="fade" onRequestClose={() => setPlaceholder(null)}>
        <View style={{ flex: 1, backgroundColor: th.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }} onPress={() => setPlaceholder(null)} />
          <View style={{ backgroundColor: th.card, borderRadius: 18, padding: 20, width: '100%', maxWidth: 340, gap: 10, alignItems: 'center' }}>
            <Ionicons name="construct-outline" size={28} color={th.primary} />
            <Text style={{ color: th.text, fontSize: 15, fontWeight: '900', textAlign: 'center' }}>
              {placeholder || (isAr ? 'قريباً' : 'Coming soon')}
            </Text>
            <Text style={{ color: th.sub, fontSize: 12, textAlign: 'center' }}>
              {isAr
                ? 'هذا القسم قيد الإعداد وسيتوفر في تحديث لاحق.'
                : 'This section is being built and will arrive in a later update.'}
            </Text>
            <Pressable onPress={() => setPlaceholder(null)} style={{ marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: th.primSoft }}>
              <Text style={{ color: th.primary, fontWeight: '900' }}>{isAr ? 'حسناً' : 'OK'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenScroll>
  );
}

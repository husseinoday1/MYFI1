import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TextInput, ScrollView, Alert, Pressable, StyleSheet, Image, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useStore } from '../store/useStore';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../lib/supabase';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { today, isISODate } from '../utils/calc';
import { filterByActiveScope, getEntryScope, getModules, normalizeScope } from '../lib/modules';
import { getDefaultWalletId, getWalletAvailableBalances, getWalletLabel, sortWalletsByDefault } from '../lib/wallets';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';
import DateField from './DateField';
import SmartImageViewerModal from './SmartImageViewerModal';
import { analyzeSmartEntry, buildSmartSourceMeta, describeSmartSource } from '../lib/smartEntry';
import { resolveSmartCaptureDraft, smartCaptureReasonMessage } from '../lib/smartCapture';
import { suggestCategoryFromHistory } from '../lib/localIntelligence';
import { CATEGORY_FLOWS, categorySupportsFlow, getCategoriesForFlow, getDefaultCategoryId } from '../lib/categories';
import { rowDirFor, textAlignFor } from '../lib/layout';
import { startLiveSpeechPreview } from '../lib/liveSpeechPreview';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';

const cleanNumber = parseNumberInput;

// Keep Arabic explanatory copy outside the equation. Android's BiDi resolver can
// reorder a mixed Arabic/Latin Text node even when writingDirection is LTR.
export const FxEquation = ({ fromCurrency, toCurrency, value = '?' }) => (
  <View accessible accessibilityLabel={`1 ${fromCurrency} equals ${value} ${toCurrency}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', writingDirection: 'ltr' }}>
    <Text style={{ writingDirection: 'ltr' }}>{`1 ${fromCurrency}`}</Text>
    <Text style={{ writingDirection: 'ltr' }}>{' = '}</Text>
    <Text style={{ writingDirection: 'ltr' }}>{`${value} ${toCurrency}`}</Text>
  </View>
);

const buildFunctionEndpoint = (name) => (
  SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/${name}` : ''
);
const OCR_ENDPOINT = process.env.EXPO_PUBLIC_OCR_URL || buildFunctionEndpoint('smart-ocr');
const TRANSCRIBE_ENDPOINT = process.env.EXPO_PUBLIC_TRANSCRIBE_URL || buildFunctionEndpoint('smart-transcribe');
const createUploadError = (status, message = '', code = '') => {
  const error = new Error(message || `HTTP ${status}`);
  error.status = status;
  error.code = code;
  return error;
};

const buildUploadHeaders = async (endpoint) => {
  const headers = {};
  const isSupabaseFunction = !!(SUPABASE_URL && endpoint && endpoint.startsWith(`${SUPABASE_URL}/functions/v1/`));
  if (!isSupabaseFunction) return headers;
  if (SUPABASE_KEY) headers.apikey = SUPABASE_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  } catch {
    // Authenticated edge functions require a user session JWT.
  }
  if (!headers.Authorization) throw createUploadError(401, 'AUTH_REQUIRED', 'auth_required');
  return headers;
};

const uploadMediaAnalysis = async (uri, endpoint, fallbackName, mimeType, context = {}) => {
  if (!endpoint || !uri) return { text: '', analysis: null };
  const form = new FormData();
  form.append('file', { uri, name: fallbackName, type: mimeType });
  if (context.today) form.append('today', String(context.today));
  if (context.currency) form.append('currency', String(context.currency));
  if (context.lang) form.append('lang', String(context.lang));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: await buildUploadHeaders(endpoint),
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw createUploadError(408, 'TIMEOUT', 'timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = '';
    let code = '';
    try {
      const body = await response.json();
      message = String(body?.error || body?.message || '');
      code = String(body?.code || '');
    } catch {}
    throw createUploadError(response.status, message, code);
  }

  const data = await response.json();
  return {
    text: String(data.text || data.transcript || data.result || '').trim(),
    analysis: data.analysis && typeof data.analysis === 'object' ? data.analysis : null,
    provider: data.provider || null,
    model: data.model || null,
  };
};

const analysisErrorMessage = ({ lang, kind, endpoint, error }) => {
  const isArabic = lang === 'ar';
  const source = kind === 'voice'
    ? (isArabic ? 'الصوت' : 'voice')
    : (isArabic ? 'الصورة' : 'image');
  if (!endpoint) {
    return isArabic
      ? `خدمة تحليل ${source} غير مهيأة بعد.`
      : `${source} analysis is not configured yet.`;
  }
  if (error?.status === 401 || error?.status === 403) {
    return isArabic
      ? `سجّل الدخول أولاً لتحليل ${source}.`
      : `Sign in first to analyze ${source}.`;
  }
  if (error?.status === 408 || error?.code === 'timeout') {
    return isArabic ? `انتهت مهلة تحليل ${source}. حاول مرة أخرى.` : `${source} analysis timed out. Try again.`;
  }
  if (error?.status === 413) {
    return isArabic ? `ملف ${source} أكبر من الحد المسموح.` : `The ${source} file is too large.`;
  }
  if (error?.status === 422) {
    return isArabic ? `لم يتم العثور على بيانات واضحة في ${source}.` : `No clear data was found in the ${source}.`;
  }
  if (error?.status === 503 || error?.code === 'insufficient_quota') {
    return isArabic
      ? `خدمة تحليل ${source} غير متاحة مؤقتاً. حاول مرة أخرى لاحقاً.`
      : `${source} analysis is temporarily unavailable. Try again later.`;
  }
  return isArabic
    ? `تعذر الاتصال بخدمة تحليل ${source}. تحقق من الاتصال وإعدادات الخدمة.`
    : `Could not reach the ${source} analysis service. Check the connection and service configuration.`;
};

// editData = null  →  وضع إضافة
// editData = {...} →  وضع تعديل (مصروف/دخل فقط)
// initialMode = 'exp' | 'inc' | 'debt' | 'goal' | 'commitment' | 'transfer'
// initialDebtId / initialGoalId: لتجهيز السداد/التوفير على دين أو هدف محدد (زر + دفعة جديدة)
export default function AddTransModal({
  visible, onClose, editData = null,
  initialMode = 'exp', initialDebtId = null, initialGoalId = null, initialCommitmentId = null,
  draftData = null, focusedEntry = false,
}) {
  const { addTrans, addTransfer, editTrans, deleteTrans, undoLastTransactionDelete, payDebt, saveGoal, payCommitment, debts, goals, commitments, wallets, cats, cfg, trans } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const sym = getSymbol(cfg.currency); // base/reporting currency symbol
  const insets = useSafeAreaInsets();
  const modules = getModules(cfg);
  const scopedWallets = filterByActiveScope(wallets, cfg);
  const availableDebts = filterByActiveScope(debts, cfg).filter(item => (
    item.direction === 'receivable' ? modules.debtsReceivable : modules.debtsOwed
  ));
  const availableGoals = modules.goals ? filterByActiveScope(goals, cfg) : [];
  const availableCommitments = modules.commitments
    ? filterByActiveScope(commitments, cfg).filter(item => {
        if (item.linkedType === 'debt') return modules.debtsOwed;
        if (item.linkedType === 'receivable') return modules.debtsReceivable;
        if (item.linkedType === 'goal') return modules.goals;
        return true;
      })
    : [];
  const walletList = sortWalletsByDefault(scopedWallets.length ? scopedWallets : wallets, cfg.currency, cfg.defaultWalletId);
  const transferWalletList = walletList;
  const defaultWalletId = getDefaultWalletId(walletList, cfg.currency, cfg.defaultWalletId);
  const walletBalanceRows = getWalletAvailableBalances(
    walletList,
    trans,
    cfg.currency,
    defaultWalletId,
  );
  const walletBalanceById = (id) => walletBalanceRows.find(item => item.id === id) || walletList.find(item => item.id === id) || null;
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const normalizeEntryMode = (mode) => (
    ['exp', 'inc', 'transfer', 'debt', 'goal', 'commitment'].includes(mode) ? mode : 'exp'
  );
  const cleanInitialMode = normalizeEntryMode(initialMode);
  const walletLabel = cfg.lang === 'ar' ? 'المحفظة' : 'Wallet';
  const transferLabel = cfg.lang === 'ar' ? 'تحويل' : 'Transfer';
  const fromLabel = cfg.lang === 'ar' ? 'من' : 'From';
  const toLabel = cfg.lang === 'ar' ? 'إلى' : 'To';
  const walletScope = (wallet) => normalizeScope(wallet?.scope, getEntryScope(cfg));
  // A transfer can move money between any two wallets, including personal and business.
  const eligibleTransferWallets = transferWalletList;
  const firstTransferWallet = eligibleTransferWallets[0] || null;
  const secondTransferWallet = firstTransferWallet
    ? eligibleTransferWallets.find(wallet => wallet.id !== firstTransferWallet.id)
    : null;
  const [recorderSession, setRecorderSession] = useState(0);
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    sampleRate: 16000,
    numberOfChannels: 1,
    // Changing this harmlessly by one bit forces expo-audio to create a fresh
    // native recorder after every completed or failed recording session.
    bitRate: 48000 + (recorderSession % 2),
  });

  const [type,      setType]      = useState(cleanInitialMode);
  const [title,     setTitle]     = useState('');
  const [amt,       setAmt]       = useState('');
  const [cat,       setCat]       = useState('other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [note,      setNote]      = useState('');
  const [recurring, setRecurring] = useState(false);
  const [dateISO,   setDateISO]   = useState(today());
  const [selDebt,   setSelDebt]   = useState(initialDebtId);
  const [selGoal,   setSelGoal]   = useState(initialGoalId);
  const [selCommitment, setSelCommitment] = useState(initialCommitmentId);
  const [walletId,  setWalletId]  = useState(defaultWalletId);
  const [fromWalletId, setFromWalletId] = useState(firstTransferWallet?.id || defaultWalletId);
  const [toWalletId, setToWalletId] = useState(secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
  const [exchangeRate, setExchangeRate] = useState('');
  const [entityBaseRate, setEntityBaseRate] = useState('');
  const [transferToAmount, setTransferToAmount] = useState('');
  const [transferFeeAmount, setTransferFeeAmount] = useState('');
  const [transferFromBaseRate, setTransferFromBaseRate] = useState('');
  const [transferToBaseRate, setTransferToBaseRate] = useState('');
  const transferTargetWallets = eligibleTransferWallets.filter(wallet => wallet.id !== fromWalletId);
  const canTransfer = modules.wallets && eligibleTransferWallets.length > 1;
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartMode, setSmartMode] = useState('image');
  const [receiptImageUri, setReceiptImageUri] = useState(null);
  const [smartExtractedText, setSmartExtractedText] = useState('');
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [voiceUri, setVoiceUri] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [smartSource, setSmartSource] = useState(null);
  const [voicePreviewLive, setVoicePreviewLive] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [imageError, setImageError] = useState('');
  const [expandedPicker, setExpandedPicker] = useState(null);
  const liveSpeechRef = useRef(null);
  const recordingRef = useRef(false);
  const stoppingRef = useRef(false);
  const mountedRef = useRef(true);
  const recordingTimerRef = useRef(null);
  const recordingOperationRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const entryIdempotencyKeyRef = useRef(null);

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  };

  const reset = () => {
    liveSpeechRef.current?.abort?.();
    liveSpeechRef.current = null;
    setType(cleanInitialMode); setTitle(''); setAmt(''); setCat('other'); setCategoryTouched(false);
    setNote(''); setRecurring(false); setDateISO(today());
    setSelDebt(initialDebtId); setSelGoal(initialGoalId);
    setSelCommitment(initialCommitmentId);
    setWalletId(defaultWalletId);
    setFromWalletId(firstTransferWallet?.id || defaultWalletId);
    setToWalletId(secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
    setExchangeRate('');
    setEntityBaseRate('');
    setTransferToAmount('');
    setTransferFeeAmount('');
    setTransferFromBaseRate('');
    setTransferToBaseRate('');
    setSmartOpen(false);
    setSmartMode('image');
    setReceiptImageUri(null);
    setSmartExtractedText('');
    setImageViewerOpen(false);
    setVoiceUri(null);
    setMediaBusy(false);
    setSmartSource(null);
    setVoicePreviewLive(false);
    clearRecordingTimer();
    setRecordingSeconds(0);
    recordingRef.current = false;
    stoppingRef.current = false;
    setVoiceRecording(false);
    setVoiceError('');
    setExpandedPicker(null);
    saveInFlightRef.current = false;
    entryIdempotencyKeyRef.current = null;
  };

  useEffect(() => {
    if (!visible) return;
    if (editData) {
      const editType = editData.kind === 'transfer' ? 'transfer' : (editData.amt > 0 ? 'inc' : 'exp');
      setType(editType);
      setAmt(Math.abs(editData.kind === 'transfer' ? (editData.transferFromAmount ?? editData.transferAmount) : (editData.walletAmount ?? editData.amt)).toString());
      setTitle(editData.title || '');
      setCat(editData.cat || 'other');
      setCategoryTouched(true);
      setNote(editData.note || '');
      setRecurring(editData.recurring || false);
      setDateISO(editData.dateISO || today());
      setWalletId(editData.walletId || defaultWalletId);
      setFromWalletId(editData.fromWalletId || defaultWalletId);
      setToWalletId(editData.toWalletId || secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
      setExchangeRate(String(editData.transferRate ?? editData.walletBaseRate ?? editData.exchangeRate ?? ''));
      setEntityBaseRate(String(editData.entityBaseRate ?? ''));
      setTransferToAmount(editData.kind === 'transfer' && Number(editData.transferToAmount) > 0 ? String(editData.transferToAmount) : '');
      setTransferFeeAmount(editData.kind === 'transfer' && Number(editData.feeAmount) > 0 ? String(editData.feeAmount) : '');
      setTransferFromBaseRate(editData.kind === 'transfer' && Number(editData.fromBaseRate) > 0 ? String(editData.fromBaseRate) : '');
      setTransferToBaseRate(editData.kind === 'transfer' && Number(editData.toBaseRate) > 0 ? String(editData.toBaseRate) : '');
      setSmartSource(editData.smartSource || null);
      setExpandedPicker(null);
    } else if (draftData?.smartMode) {
      setType(cleanInitialMode);
      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());
      setCategoryTouched(false);
      setWalletId(defaultWalletId);
      setExchangeRate('');
      setEntityBaseRate('');
      setTransferToAmount('');
      setTransferFeeAmount('');
      setTransferFromBaseRate('');
      setTransferToBaseRate('');
      setSmartMode(draftData.smartMode === 'voice' ? 'voice' : 'image');
      setSmartOpen(true);
      setSmartSource(null);
      setExpandedPicker(null);
    } else if (draftData) {
      const draftMode = normalizeEntryMode(
        draftData.mode
        || (draftData.kind === 'transfer' ? 'transfer' : (Number(draftData.amt || 0) >= 0 ? 'inc' : 'exp')),
      );
      const draftAmount = Math.abs(Number(
        draftData.amount
        ?? draftData.transferFromAmount
        ?? draftData.transferAmount
        ?? draftData.walletAmount
        ?? draftData.allocationAmount
        ?? draftData.amt
        ?? 0
      ));
      setType(draftMode);
      setAmt(draftAmount > 0 ? String(draftAmount) : '');
      setTitle(draftData.title || '');
      setCat(draftData.cat || 'other');
      setCategoryTouched(true);
      setNote(draftData.note || '');
      // Repeating a movement creates a new reviewed draft. Never silently copy
      // its automatic recurrence flag into the new movement.
      setRecurring(false);
      setDateISO(draftData.dateISO || today());
      setSelDebt(draftData.debtId || availableDebts[0]?.id || null);
      setSelGoal(draftData.goalId || availableGoals[0]?.id || null);
      setSelCommitment(draftData.commitmentId || availableCommitments[0]?.id || null);
      setFromWalletId(draftData.fromWalletId || firstTransferWallet?.id || defaultWalletId);
      setToWalletId(draftData.toWalletId || secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
      setExchangeRate(String(draftData.transferRate ?? draftData.walletBaseRate ?? draftData.exchangeRate ?? ''));
      setEntityBaseRate(String(draftData.entityBaseRate ?? ''));
      setTransferToAmount(Number(draftData.transferToAmount) > 0 ? String(draftData.transferToAmount) : '');
      setTransferFeeAmount(Number(draftData.feeAmount) > 0 ? String(draftData.feeAmount) : '');
      setTransferFromBaseRate(Number(draftData.fromBaseRate) > 0 ? String(draftData.fromBaseRate) : '');
      setTransferToBaseRate(Number(draftData.toBaseRate) > 0 ? String(draftData.toBaseRate) : '');
      setWalletId(draftMode === 'commitment' ? defaultWalletId : (draftData.walletId || defaultWalletId));
      setSmartSource(draftData.smartSource || null);
      setExpandedPicker(null);
    } else {
      const initialCommitment = initialCommitmentId
        ? availableCommitments.find(item => item.id === initialCommitmentId)
        : null;
      const launchingCommitment = cleanInitialMode === 'commitment' || !!initialCommitmentId;
      const defaultCommitment = initialCommitment || (launchingCommitment ? availableCommitments[0] : null);
      setType(cleanInitialMode);
      setSelDebt(initialDebtId || availableDebts[0]?.id || null);
      setSelGoal(initialGoalId || availableGoals[0]?.id || null);
      setSelCommitment(defaultCommitment?.id || null);
      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());
      setCategoryTouched(false);
      setWalletId(defaultWalletId);
      setFromWalletId(firstTransferWallet?.id || defaultWalletId);
      setToWalletId(secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
      setExchangeRate('');
      setEntityBaseRate('');
      setTransferToAmount('');
      setTransferFeeAmount('');
      setTransferFromBaseRate('');
      setTransferToBaseRate('');
      setSmartSource(null);
      setExpandedPicker(null);
    }
  }, [visible, editData, draftData, cleanInitialMode, initialDebtId, initialGoalId, initialCommitmentId, wallets, commitments, defaultWalletId, focusedEntry]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingOperationRef.current += 1;
      recordingRef.current = false;
      stoppingRef.current = false;
      clearRecordingTimer();
      liveSpeechRef.current?.abort?.();
      liveSpeechRef.current = null;
      // useAudioRecorder releases the native recorder itself. Calling any
      // recorder method from this cleanup can race that release on Android.
    };
  }, []);

  const handleClose = async () => {
    recordingOperationRef.current += 1;
    clearRecordingTimer();
    liveSpeechRef.current?.abort?.();
    liveSpeechRef.current = null;
    setVoicePreviewLive(false);
    try {
      if (recordingRef.current && !stoppingRef.current) {
        stoppingRef.current = true;
        recordingRef.current = false;
        setVoiceRecording(false);
        await audioRecorder.stop();
      }
    } catch {}
    stoppingRef.current = false;
    setRecorderSession(value => value + 1);
    reset();
    onClose();
  };

  const applySmartDraft = (value, analysis = null, mode = 'text') => {
    const resolved = resolveSmartCaptureDraft({
      text: value,
      analysis,
      cats,
      history: useStore.getState().trans,
      wallets: walletList,
      lang: cfg.lang,
      currency: cfg.currency,
    });
    if (!resolved.ok || !resolved.draft?.amount) return resolved;

    const draft = resolved.draft;

    if (draft.type === 'transfer' && draft.fromWalletId && draft.toWalletId) {
      setType('transfer');
      setAmt(String(draft.amount));
      setFromWalletId(draft.fromWalletId);
      setToWalletId(draft.toWalletId);
      if (draft.dateISO) setDateISO(draft.dateISO);
      if (draft.title) setTitle(draft.title);
      return resolved;
    }

    const draftFlow = draft.type === 'inc' ? CATEGORY_FLOWS.INCOME : CATEGORY_FLOWS.EXPENSE;
    const draftCat = cats.find(item => item.id === draft.catId);
    setType(draft.type === 'inc' ? 'inc' : 'exp');
    setAmt(String(draft.amount));
    setCat(draftCat && categorySupportsFlow(draftCat, draftFlow)
      ? draft.catId
      : getDefaultCategoryId(cats, draftFlow));
    setCategoryTouched(false);
    if (draft.title) setTitle(draft.title);
    if (draft.walletId) setWalletId(draft.walletId);
    if (draft.dateISO) setDateISO(draft.dateISO);

    if (draft.currencyMismatch) {
      Alert.alert('', smartCaptureReasonMessage('currency_mismatch', cfg.lang));
    }

    return resolved;
  };

  const applyAnalyzedText = ({ value, mode, automated = true, analysis = null }) => {
    const text = String(value || '').trim();
    const resolved = applySmartDraft(text, analysis, mode);
    if (!resolved?.ok) return resolved || { ok: false, reason: 'amount_unclear' };

    setSmartMode(mode);
    setSmartExtractedText(mode === 'voice' ? text : '');
    setSmartSource(buildSmartSourceMeta({
      mode,
      text,
      automated,
      reviewedInline: true,
      reviewRequired: false,
      analysis,
    }));
    setSmartOpen(true);
    return resolved;
  };

  const extractReceiptText = async (uri, mode, mimeType = 'image/jpeg') => {
    setImageError('');
    setMediaBusy(true);
    try {
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const result = await uploadMediaAnalysis(
        uri,
        OCR_ENDPOINT,
        `financial-source.${extension}`,
        mimeType,
        { today: today(), currency: cfg.currency, lang: cfg.lang },
      );
      if (!result.text && !result.analysis) throw new Error('EMPTY_ANALYSIS');

      const resolved = applyAnalyzedText({
        value: result.text,
        analysis: result.analysis,
        mode,
        automated: true,
      });

      if (!resolved?.ok) {
        setSmartOpen(true);
        Alert.alert('', smartCaptureReasonMessage(resolved?.reason || 'amount_unclear', cfg.lang));
      }
    } catch (error) {
      const imageMessage = analysisErrorMessage({ lang: cfg.lang, kind: 'image', endpoint: OCR_ENDPOINT, error });
      setImageError(imageMessage);
      Alert.alert('', imageMessage);
    } finally {
      setMediaBusy(false);
      setVoicePreviewLive(false);
    }
  };

  const pickReceiptImage = async (source = 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('', cfg.lang === 'ar' ? 'نحتاج صلاحية الوصول للكاميرا أو الصور.' : 'Camera or photo access permission is required.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.65, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.65, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const mode = source === 'camera' ? 'camera' : 'image';
    setSmartExtractedText('');
    setReceiptImageUri(uri);
    setSmartMode(mode);
    setSmartOpen(true);
    await extractReceiptText(uri, mode, asset.mimeType || 'image/jpeg');
  };

  const chooseReceiptSource = () => {
    Alert.alert(
      cfg.lang === 'ar' ? 'إضافة صورة' : 'Add image',
      '',
      [
        {
          text: cfg.lang === 'ar' ? 'التقاط بالكاميرا' : 'Take a photo',
          onPress: () => pickReceiptImage('camera'),
        },
        {
          text: cfg.lang === 'ar' ? 'اختيار من الصور' : 'Choose from photos',
          onPress: () => pickReceiptImage('library'),
        },
        {
          text: cfg.lang === 'ar' ? 'إلغاء' : 'Cancel',
          style: 'cancel',
        },
      ],
    );
  };

  const transcribeVoice = async (uri) => {
    setMediaBusy(true);
    setVoiceError('');
    try {
      const result = await uploadMediaAnalysis(
        uri,
        TRANSCRIBE_ENDPOINT,
        'voice.m4a',
        'audio/mp4',
        { today: today(), currency: cfg.currency, lang: cfg.lang },
      );
      const text = String(result.text || '').trim();
      if (!text && !result.analysis) throw new Error('EMPTY_ANALYSIS');

      setSmartExtractedText(text);
      const resolved = applyAnalyzedText({
        value: text,
        analysis: result.analysis,
        mode: 'voice',
        automated: true,
      });

      if (!resolved?.ok) {
        setNote(current => current || text);
        setSmartOpen(true);
        Alert.alert('', smartCaptureReasonMessage(resolved?.reason || 'amount_unclear', cfg.lang));
      }
    } catch (error) {
      setVoiceError(analysisErrorMessage({ lang: cfg.lang, kind: 'voice', endpoint: TRANSCRIBE_ENDPOINT, error }));
      Alert.alert('', analysisErrorMessage({ lang: cfg.lang, kind: 'voice', endpoint: TRANSCRIBE_ENDPOINT, error }));
    } finally {
      setMediaBusy(false);
    }
  };

  const toggleVoiceRecording = async () => {
    if (stoppingRef.current) return;
    const operationId = recordingOperationRef.current;
    try {
      if (recordingRef.current || voiceRecording) {
        stoppingRef.current = true;
        clearRecordingTimer();
        liveSpeechRef.current?.stop?.();
        liveSpeechRef.current = null;
        setVoicePreviewLive(false);
        recordingRef.current = false;
        setVoiceRecording(false);
        await audioRecorder.stop();
        if (!mountedRef.current || operationId !== recordingOperationRef.current) {
          stoppingRef.current = false;
          return;
        }
        const uri = audioRecorder.uri;
        setRecorderSession(value => value + 1);
        stoppingRef.current = false;
        setVoiceUri(uri || null);
        setSmartMode('voice');
        setSmartOpen(true);
        if (!uri) throw new Error('RECORDING_FILE_MISSING');
        await transcribeVoice(uri);
        return;
      }

      setVoiceError('');
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!mountedRef.current || operationId !== recordingOperationRef.current) return;
      if (!permission.granted) {
        Alert.alert('', cfg.lang === 'ar'
          ? 'نحتاج صلاحية الميكروفون للتسجيل. فعّلها من إعدادات الهاتف.'
          : 'Microphone permission is required. Enable it in device settings.');
        return;
      }
      setVoiceUri(null);
      setSmartExtractedText('');
      setSmartMode('voice');
      setSmartOpen(true);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      if (!mountedRef.current || operationId !== recordingOperationRef.current) return;
      await audioRecorder.prepareToRecordAsync();
      if (!mountedRef.current || operationId !== recordingOperationRef.current) return;
      audioRecorder.record();
      recordingRef.current = true;
      setRecordingSeconds(0);
      clearRecordingTimer();
      recordingTimerRef.current = setInterval(() => {
        if (mountedRef.current && recordingRef.current) {
          setRecordingSeconds(value => value + 1);
        }
      }, 1000);
      setVoiceRecording(true);

      const livePreview = startLiveSpeechPreview({
        lang: cfg.lang,
        onText: () => setVoicePreviewLive(true),
        onError: () => setVoicePreviewLive(false),
      });
      liveSpeechRef.current = livePreview;
      setVoicePreviewLive(!!livePreview?.supported);
    } catch (error) {
      clearRecordingTimer();
      recordingRef.current = false;
      stoppingRef.current = false;
      if (!mountedRef.current || operationId !== recordingOperationRef.current) return;
      setRecorderSession(value => value + 1);
      setVoiceRecording(false);
      const message = cfg.lang === 'ar'
        ? `تعذر بدء أو إيقاف التسجيل. ${String(error?.message || '')}`.trim()
        : `Could not start or stop recording. ${String(error?.message || '')}`.trim();
      setVoiceError(message);
      Alert.alert('', message);
    }
  };

  const handleSave = async () => {
    if (!isISODate(dateISO)) {
      Alert.alert('', cfg.lang === 'ar' ? 'اكتب التاريخ بصيغة YYYY-MM-DD' : 'Use YYYY-MM-DD date format');
      return;
    }
    const n = cleanNumber(amt);
    if (type !== 'transfer' && !walletId) return;
    const selectedWallet = type !== 'transfer' ? wallets.find(item => item.id === walletId) : null;
    const selectedWalletCurrency = String(selectedWallet?.currency || cfg.currency || 'IQD').toUpperCase();
    const baseCurrency = String(cfg.currency || 'IQD').toUpperCase();
    if (isTrackerPayment && needsTrackerEntityBaseRate && !(cleanNumber(entityBaseRate) > 0)) {
      Alert.alert('', cfg.lang === 'ar'
        ? `اكتب السعر التاريخي: 1 ${trackerCurrency} = كم ${baseCurrency}.`
        : `Enter the historical rate: 1 ${trackerCurrency} = how many ${baseCurrency}.`);
      return;
    }
    if ((isMoneyEntry || isTrackerPayment) && needsEntryExchangeRate && !(cleanNumber(exchangeRate) > 0)) {
      Alert.alert('', cfg.lang === 'ar'
        ? `اكتب سعر المحفظة التاريخي: 1 ${selectedWalletCurrency} = كم ${baseCurrency}.`
        : `Enter the wallet historical rate: 1 ${selectedWalletCurrency} = how many ${baseCurrency}.`);
      return;
    }
    if (type !== 'commitment' && !(n > 0)) {
      Alert.alert('', cfg.lang === 'ar' ? 'اكتب مبلغاً صحيحاً أكبر من صفر' : 'Enter a valid amount greater than zero');
      return;
    }

    if (type === 'transfer') {
      if (!fromWalletId || !toWalletId || fromWalletId === toWalletId) return;
      const sourceWallet = eligibleTransferWallets.find(wallet => wallet.id === fromWalletId);
      const targetWallet = eligibleTransferWallets.find(wallet => wallet.id === toWalletId);
      if (!sourceWallet || !targetWallet) return;
      const sourceCurrency = String(sourceWallet.currency || cfg.currency).toUpperCase();
      const targetCurrency = String(targetWallet.currency || cfg.currency).toUpperCase();
      const crossCurrency = sourceCurrency !== targetCurrency;
      const targetAmount = crossCurrency ? cleanNumber(transferToAmount) : Math.abs(n);
      if (!transferReady) return;
      const transferRate = crossCurrency ? targetAmount / Math.abs(n) : 1;
      const fromBaseRate = transferNeedsBridgeRates ? cleanNumber(transferFromBaseRate) : undefined;
      const toBaseRate = transferNeedsBridgeRates ? cleanNumber(transferToBaseRate) : undefined;
      let saved = false;
      if (editData) {
        saved = await editTrans(editData.id, {
          kind: 'transfer',
          amt: 0,
          transferAmount: Math.abs(n),
          transferFromAmount: Math.abs(n),
          transferToAmount: targetAmount,
          transferRate,
          exchangeRate: transferRate,
          feeAmount: Math.max(0, cleanNumber(transferFeeAmount)),
          fromBaseRate,
          toBaseRate,
          fromWalletId,
          toWalletId,
          scope: sourceWallet.scope,
          fromScope: sourceWallet.scope,
          toScope: targetWallet.scope,
          note,
          dateISO,
          transactionTag: 'transfer',
        });
      } else {
        saved = await addTransfer({
          fromWalletId, toWalletId, amount: n, toAmount: targetAmount,
          exchangeRate: transferRate, feeAmount: Math.max(0, cleanNumber(transferFeeAmount)),
          fromBaseRate, toBaseRate, dateISO, note,
        });
      }
      if (!saved) {
        Alert.alert('', cfg.lang === 'ar' ? 'تعذر تسجيل التحويل. راجع المحافظ والمبالغ.' : 'Could not record the transfer. Check the wallets and amounts.');
        return;
      }
      handleClose();
      return;
    }

    if (type === 'debt') {
      if (!selDebt) return;
      const applied = await payDebt(selDebt, n, dateISO, walletId, {
        entityBaseRate: cleanNumber(entityBaseRate) || undefined,
        walletBaseRate: cleanNumber(exchangeRate) || undefined,
      });
      if (!applied) {
        Alert.alert('', cfg.lang === 'ar'
          ? 'تعذّر تسجيل الدفعة — تأكد أن الدين لم يُسدد بالكامل وأن البيانات صحيحة.'
          : 'Could not record the payment — check the wallet\u2019s available balance and that the debt is not already fully paid.');
        return;
      }
      handleClose();
      return;
    }
    if (type === 'goal') {
      if (!selGoal) return;
      const applied = await saveGoal(selGoal, n, dateISO, walletId, {
        entityBaseRate: cleanNumber(entityBaseRate) || undefined,
        walletBaseRate: cleanNumber(exchangeRate) || undefined,
      });
      if (!applied) {
        Alert.alert('', cfg.lang === 'ar'
          ? 'تعذّر تسجيل التوفير — تأكد أن الهدف لم يكتمل بالفعل وأن البيانات صحيحة.'
          : 'Could not record the saving — check the wallet\u2019s available balance and that the goal is not already complete.');
        return;
      }
      handleClose();
      return;
    }
    if (type === 'commitment') {
      if (!selCommitment) return;
      const result = await payCommitment(selCommitment, dateISO, walletId, null, {
        entityBaseRate: cleanNumber(entityBaseRate) || undefined,
        walletBaseRate: cleanNumber(exchangeRate) || undefined,
      });
      if (!result?.ok) {
        if (result?.reason === 'linked_unavailable') {
          Alert.alert('', cfg.lang === 'ar'
            ? 'الدين أو الهدف المرتبط بهذا الالتزام مكتمل بالفعل. الغِ الربط أو أوقف الالتزام من شاشة تعديله.'
            : 'The linked debt or goal is already complete. Unlink it or pause this commitment.');
        }
        return;
      }
      if (result.partial) {
        Alert.alert('', cfg.lang === 'ar'
          ? `تم سداد ${Math.round(result.appliedAmount).toLocaleString()} فقط من ${Math.round(result.requestedAmount).toLocaleString()} لأن الدين أو الهدف المرتبط قارب الاكتمال.`
          : `Only ${Math.round(result.appliedAmount).toLocaleString()} of ${Math.round(result.requestedAmount).toLocaleString()} was applied \u2014 the linked debt or goal is almost complete.`);
      }
      handleClose();
      return;
    }

    const finalTitle = title.trim() || defaultTitle;
    const effectiveSmartSource = smartSource || editData?.smartSource || null;
    const confirmsSmartReview = !!effectiveSmartSource && (
      editData?.__smartReviewMode
      || effectiveSmartSource.reviewedInline === true
    );
    const payload = {
      title: finalTitle,
      amt:   type === 'exp' ? -Math.abs(n) : Math.abs(n),
      cat: categorySupportsFlow(cats.find(item => item.id === cat), entryFlow) ? cat : defaultEntryCat,
      note, recurring, dateISO, walletId,
      exchangeRate: cleanNumber(exchangeRate) || undefined,
      recurringGroupId: draftData?.recurringGroupId,
      smartSource: effectiveSmartSource,
      ...(!editData ? {
        idempotencyKey: entryIdempotencyKeyRef.current || (
          entryIdempotencyKeyRef.current = `quick-entry:${Crypto.randomUUID()}`
        ),
      } : {}),
      ...(confirmsSmartReview ? { smartReviewedAt: new Date().toISOString() } : {}),
    };
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    let saved = false;
    try {
      saved = editData ? await editTrans(editData.id, payload) : await addTrans(payload);
    } finally {
      saveInFlightRef.current = false;
    }
    if (!saved) {
      Alert.alert('', cfg.lang === 'ar'
        ? 'تعذر حفظ الحركة. راجع المبلغ والمحفظة والبيانات المدخلة.'
        : 'Could not save the entry. Check the amount, wallet, and entered data.');
      return;
    }
    handleClose();
  };

  const handleDelete = () => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.yes, style: 'destructive', onPress: async () => {
        const deleted = await deleteTrans(editData.id);
        handleClose();
        if (deleted) {
          Alert.alert(
            cfg.lang === 'ar' ? 'تم حذف الحركة' : 'Entry deleted',
            cfg.lang === 'ar' ? 'يمكنك التراجع عن آخر حذف.' : 'You can undo the last deletion.',
            [
              { text: cfg.lang === 'ar' ? 'إغلاق' : 'Close', style: 'cancel' },
              { text: cfg.lang === 'ar' ? 'تراجع' : 'Undo', onPress: () => undoLastTransactionDelete?.() },
            ],
          );
        }
      }},
    ]);
  };

  const isEdit = !!editData;
  const fmt = (n) => Math.abs(Math.round(n)).toLocaleString();

  const isPlanningAction = ['debt', 'goal', 'commitment'].includes(type);
  const isAmountEntry = ['exp', 'inc', 'transfer'].includes(type);
  const isContextualPlanningLaunch = !!(initialDebtId || initialGoalId || initialCommitmentId);
  const dedicatedQuickEntry = focusedEntry && !isEdit && !isContextualPlanningLaunch;
  const smartEntryAvailable = !isEdit && !isPlanningAction;
  const planningSeg = [
    (modules.debtsOwed || modules.debtsReceivable) ? { k: 'debt', l: cfg.lang === 'ar' ? 'دين' : 'Debt' } : null,
    modules.goals ? { k: 'goal', l: cfg.lang === 'ar' ? 'هدف' : 'Goal' } : null,
    modules.commitments ? { k: 'commitment', l: cfg.lang === 'ar' ? 'التزام' : 'Commitment' } : null,
  ].filter(Boolean);
  const seg = [
    { k: 'exp', l: cfg.lang === 'ar' ? 'صرف' : 'Expense', icon: 'arrow-down-outline', tone: th.exp },
    { k: 'inc', l: cfg.lang === 'ar' ? 'دخل' : 'Income', icon: 'arrow-up-outline', tone: th.inc },
    modules.wallets && canTransfer ? { k: 'transfer', l: transferLabel, icon: 'repeat-outline', tone: th.primary } : null,
    smartEntryAvailable ? { k: 'smart', l: cfg.lang === 'ar' ? 'ذكي' : 'Smart', icon: 'sparkles-outline', tone: th.warn } : null,
    planningSeg.length > 0 ? { k: 'planning', l: cfg.lang === 'ar' ? 'المتابعات' : 'Tracking' } : null,
  ].filter(Boolean);
  const saveLabel = type === 'debt'
    ? L.payDebtAction
    : type === 'goal'
      ? L.saveGoalAction
      : type === 'commitment'
        ? (cfg.lang === 'ar' ? 'تسجيل الدفع' : 'Mark paid')
        : type === 'transfer'
          ? (cfg.lang === 'ar' ? 'تأكيد التحويل' : 'Confirm transfer')
          : type === 'inc'
            ? (cfg.lang === 'ar' ? 'حفظ الدخل' : 'Save income')
            : (cfg.lang === 'ar' ? 'حفظ الصرف' : 'Save expense');
  const saveColor = type === 'debt' ? th.exp : type === 'goal' || type === 'commitment' || type === 'transfer' ? th.primary : (type === 'exp' ? th.exp : th.inc);
  const lockedDebt = type === 'debt' && !!initialDebtId && !isEdit;
  const lockedGoal = type === 'goal' && !!initialGoalId && !isEdit;
  const lockedCommitment = type === 'commitment' && !!initialCommitmentId && !isEdit;
  const selectedDebt = availableDebts.find(d => d.id === selDebt);
  const selectedGoal = availableGoals.find(g => g.id === selGoal);
  const selectedCommitment = availableCommitments.find(c => c.id === selCommitment);
  const selectedDebtReceivable = selectedDebt?.direction === 'receivable';
  const debtActionLabel = selectedDebtReceivable
    ? (cfg.lang === 'ar' ? 'تسجيل تحصيل' : 'Record collection')
    : L.payDebtAction;
  const debtColor = selectedDebtReceivable ? th.inc : th.exp;
  const finalSaveLabel = type === 'debt' ? debtActionLabel : saveLabel;
  const finalSaveColor = type === 'debt' ? debtColor : saveColor;
  const entryTitle = isEdit
    ? L.editTrans
    : dedicatedQuickEntry && smartOpen
      ? (cfg.lang === 'ar' ? 'إدخال ذكي' : 'Smart entry')
    : dedicatedQuickEntry && type === 'inc'
      ? (cfg.lang === 'ar' ? 'إدخال دخل' : 'Income entry')
    : dedicatedQuickEntry && type === 'transfer'
      ? transferLabel
    : dedicatedQuickEntry && type === 'exp'
      ? (cfg.lang === 'ar' ? 'إدخال صرف' : 'Expense entry')
    : focusedEntry
      ? (cfg.lang === 'ar' ? 'إدخال سريع' : 'Quick entry')
      : (cfg.lang === 'ar' ? 'إدخال كامل' : 'Full entry');
  const categoryFlowHint = type === 'inc'
    ? (cfg.lang === 'ar' ? 'تصنيف الدخل' : 'Income category')
    : (cfg.lang === 'ar' ? 'تصنيف الصرف' : 'Expense category');
  const smartLabels = {
    camera: cfg.lang === 'ar' ? '\u0643\u0627\u0645\u064a\u0631\u0627' : 'Camera',
    gallery: cfg.lang === 'ar' ? '\u0635\u0648\u0631\u0629' : 'Gallery',
    voice: cfg.lang === 'ar' ? '\u0635\u0648\u062a' : 'Voice',
    cameraHint: cfg.lang === 'ar' ? '\u0627\u0644\u062a\u0642\u0627\u0637 \u0648\u062a\u062d\u0644\u064a\u0644' : 'Take and scan',
    galleryHint: cfg.lang === 'ar' ? '\u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0646 \u0627\u0644\u0635\u0648\u0631' : 'Pick from photos',
    voiceHint: cfg.lang === 'ar' ? '\u062a\u0633\u062c\u064a\u0644 \u0645\u0644\u0627\u062d\u0638\u0629' : 'Record a note',
    recording: cfg.lang === 'ar' ? '\u0625\u064a\u0642\u0627\u0641' : 'Stop',
    listening: cfg.lang === 'ar' ? '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0633\u062c\u064a\u0644...' : 'Recording...',
    processing: cfg.lang === 'ar' ? '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0644\u064a\u0644...' : 'Analyzing...',
    imageReady: cfg.lang === 'ar' ? '\u062a\u0645 \u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0635\u0648\u0631\u0629' : 'Image selected',
    voiceReady: cfg.lang === 'ar' ? '\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0635\u0648\u062a' : 'Voice recorded',
    quota: cfg.lang === 'ar' ? '\u0625\u062f\u062e\u0627\u0644 \u0630\u0643\u064a \u00b7 \u0635\u0648\u0631\u0629 \u0623\u0648 \u0635\u0648\u062a' : 'Smart entry · image or voice',
    extractedText: cfg.lang === 'ar' ? 'النص المحول من الصوت' : 'Voice transcript',
    sourceReviewHint: cfg.lang === 'ar' ? 'قارن المصدر الأصلي بالبيانات أدناه قبل الحفظ.' : 'Compare the original source with the fields below before saving.',
    viewImage: cfg.lang === 'ar' ? 'عرض الصورة' : 'View image',
    changeImage: cfg.lang === 'ar' ? 'تغيير الصورة' : 'Change image',
  };
  const isMoneyEntry = type === 'exp' || type === 'inc';
  const isTrackerPayment = ['debt', 'goal', 'commitment'].includes(type) && !isEdit;
  const selectedEntryWallet = walletList.find(wallet => wallet.id === walletId) || walletList[0] || null;
  const selectedFromWallet = eligibleTransferWallets.find(wallet => wallet.id === fromWalletId) || null;
  const selectedToWallet = eligibleTransferWallets.find(wallet => wallet.id === toWalletId) || null;
  const entryCurrency = String(selectedEntryWallet?.currency || cfg.currency).toUpperCase();
  const fromCurrency = String(selectedFromWallet?.currency || cfg.currency).toUpperCase();
  const toCurrency = String(selectedToWallet?.currency || cfg.currency).toUpperCase();
  const trackerEntity = type === 'debt' ? selectedDebt : type === 'goal' ? selectedGoal : type === 'commitment' ? selectedCommitment : null;
  const trackerCurrency = String(trackerEntity?.currencyCode || cfg.currency || 'IQD').toUpperCase();
  const entrySym = getSymbol(entryCurrency);
  const trackerSym = getSymbol(trackerCurrency);
  const fromSym = getSymbol(fromCurrency);
  const toSym = getSymbol(toCurrency);
  const baseCurrencyCode = String(cfg.currency || 'IQD').toUpperCase();
  const transferCrossCurrency = type === 'transfer' && fromCurrency !== toCurrency;
  const transferNeedsBridgeRates = transferCrossCurrency && fromCurrency !== baseCurrencyCode && toCurrency !== baseCurrencyCode;
  const transferSourceValue = cleanNumber(amt);
  const transferTargetValue = transferCrossCurrency ? cleanNumber(transferToAmount) : Math.abs(transferSourceValue);
  const transferFeeValue = Math.max(0, cleanNumber(transferFeeAmount));
  const transferRateValue = transferCrossCurrency && transferSourceValue > 0 && transferTargetValue > 0
    ? transferTargetValue / transferSourceValue
    : 1;
  const transferFromBaseRateValue = cleanNumber(transferFromBaseRate);
  const transferToBaseRateValue = cleanNumber(transferToBaseRate);
  const transferReady = type !== 'transfer' || (
    !!selectedFromWallet
    && !!selectedToWallet
    && fromWalletId !== toWalletId
    && transferSourceValue > 0
    && (!transferCrossCurrency || transferTargetValue > 0)
    && (!transferNeedsBridgeRates || (transferFromBaseRateValue > 0 && transferToBaseRateValue > 0))
  );
  const transferValidationMessage = type !== 'transfer' || transferReady
    ? ''
    : !(transferSourceValue > 0)
      ? (cfg.lang === 'ar' ? 'أدخل المبلغ المرسل أولاً.' : 'Enter the amount you are sending first.')
      : transferCrossCurrency && !(transferTargetValue > 0)
        ? (cfg.lang === 'ar' ? `أدخل المبلغ الذي سيصل فعلياً بعملة ${toCurrency} لتثبيت سعر التحويل التاريخي.` : `Enter the amount that will actually arrive in ${toCurrency} to freeze the historical transfer rate.`)
        : transferNeedsBridgeRates && !(transferFromBaseRateValue > 0 && transferToBaseRateValue > 0)
          ? (cfg.lang === 'ar' ? `أكد سعر كل عملة مقابل ${baseCurrencyCode} حتى تحفظ التقارير القيمة التاريخية الصحيحة.` : `Confirm each currency against ${baseCurrencyCode} so reports keep the correct historical value.`)
          : (cfg.lang === 'ar' ? 'راجع المحافظ ومبالغ التحويل.' : 'Review the wallets and transfer amounts.');
  const transferTotalDebit = Math.max(0, transferSourceValue) + transferFeeValue;
  const needsTrackerEntityBaseRate = isTrackerPayment && trackerCurrency !== baseCurrencyCode;
  const needsEntryExchangeRate = entryCurrency !== baseCurrencyCode && (
    isMoneyEntry || (isTrackerPayment && entryCurrency !== trackerCurrency)
  );
  const amountSymbol = type === 'transfer' ? fromSym : isMoneyEntry ? entrySym : isTrackerPayment ? trackerSym : sym;
  const entryFlow = type === 'inc' ? CATEGORY_FLOWS.INCOME : CATEGORY_FLOWS.EXPENSE;
  const entryCategories = isMoneyEntry ? getCategoriesForFlow(cats, entryFlow) : cats;
  const defaultEntryCat = getDefaultCategoryId(cats, entryFlow);
  const selectedCat = entryCategories.find(c => c.id === cat) || cats.find(c => c.id === cat) || cats.find(c => c.id === defaultEntryCat) || cats.find(c => c.id === 'other') || cats[0] || {};
  const defaultTitle = (() => {
    const catLabel = (cfg.lang === 'ar' ? selectedCat.label : selectedCat.labelEn) || selectedCat.label || selectedCat.labelEn || '';
    if (type === 'inc') return cfg.lang === 'ar' ? `دخل - ${catLabel || 'عام'}` : `Income - ${catLabel || 'General'}`;
    return cfg.lang === 'ar' ? `مصروف - ${catLabel || 'عام'}` : `Expense - ${catLabel || 'General'}`;
  })();
  useEffect(() => {
    if (!visible || !isMoneyEntry) return;
    const activeCat = cats.find(item => item.id === cat);
    if (!activeCat || !categorySupportsFlow(activeCat, entryFlow)) {
      setCat(defaultEntryCat);
      setCategoryTouched(false);
    }
  }, [visible, isMoneyEntry, cat, cats, entryFlow, defaultEntryCat]);
  useEffect(() => {
    if (!visible || categoryTouched || !isMoneyEntry || title.trim().length < 3) return;
    const suggested = suggestCategoryFromHistory(title, trans, {
      flow: type === 'inc' ? 'income' : 'expense',
    });
    const suggestedCat = cats.find(item => item.id === suggested);
    if (suggestedCat && categorySupportsFlow(suggestedCat, entryFlow)) setCat(suggested);
  }, [visible, title, type, categoryTouched, isMoneyEntry, trans, cats, entryFlow]);
  const hasImageError = !!imageError;
  const smartSourceInfo = describeSmartSource(smartSource, cfg.lang);
  const isImageSource = ['receipt', 'camera', 'image'].includes(smartSource?.mode);
  const smartSourceTone = smartSource?.mode === 'voice' ? th.warn : isImageSource ? th.primary : th.inc;
  const smartSourceSummary = isImageSource
    ? (cfg.lang === 'ar' ? 'تم تحليل الصورة وتعبئة البيانات' : 'Image analyzed and fields filled')
    : smartSource?.mode === 'voice'
      ? (cfg.lang === 'ar' ? 'تم تحليل التسجيل وتعبئة البيانات' : 'Recording analyzed and fields filled')
      : '';
  const smartModes = [
    { key: 'camera', label: smartLabels.camera, detail: smartLabels.cameraHint, icon: 'camera-outline', onPress: () => pickReceiptImage('camera') },
    { key: 'image', label: smartLabels.gallery, detail: smartLabels.galleryHint, icon: 'images-outline', onPress: () => pickReceiptImage('library') },
    { key: 'voice', label: voiceRecording ? smartLabels.recording : smartLabels.voice, detail: smartLabels.voiceHint, icon: voiceRecording ? 'stop' : 'mic-outline', onPress: toggleVoiceRecording },
  ];
  const renderSelectField = ({ id, label, value, options, onChange, icon = 'chevron-down-outline', tone = th.sub }) => {
    const selected = options.find(option => option.value === value) || options[0];
    const expanded = expandedPicker?.id === id;
    return (
      <View style={s.selectFieldBlock}>
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            setExpandedPicker(expanded ? null : { id, label, value, options, onChange, icon, tone });
          }}
          style={[s.selectField, { backgroundColor: th.cardHigh, borderColor: expanded ? th.primary : th.border, flexDirection: rowDir }]}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Ionicons name={icon} size={18} color={tone} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.selectLabel, { color: th.sub, textAlign: align }]}>{label}</Text>
            <Text numberOfLines={1} style={[s.selectValue, { color: th.text, textAlign: align }]}>
              {selected?.label || (cfg.lang === 'ar' ? 'اختر' : 'Choose')}
            </Text>
            <Text numberOfLines={1} style={[s.selectDetail, { color: th.sub, textAlign: align }]}>
              {selected?.detail || ' '}
            </Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={th.faint} />
        </TouchableOpacity>
      </View>
    );
  };

  const transferFromOptions = eligibleTransferWallets.map(wallet => {
    const row = walletBalanceById(wallet.id);
    return {
      value: wallet.id,
      label: getWalletLabel(wallet, cfg.lang),
      detail: row ? `${cfg.lang === 'ar' ? 'متاح' : 'Available'} ${Number(row.availableBalance || 0).toLocaleString()} ${getSymbol(wallet.currency || cfg.currency)}` : wallet.currency || cfg.currency,
      icon: 'wallet-outline',
    };
  });
  const transferToOptions = transferFromOptions.filter(option => option.value !== fromWalletId);
  const walletOptions = walletList.map(wallet => {
    const row = walletBalanceById(wallet.id);
    return {
      value: wallet.id,
      label: getWalletLabel(wallet, cfg.lang),
      detail: row ? `${cfg.lang === 'ar' ? 'متاح' : 'Available'} ${Number(row.availableBalance || 0).toLocaleString()} ${getSymbol(wallet.currency || cfg.currency)}` : wallet.currency || cfg.currency,
      icon: 'wallet-outline',
    };
  });
  const categoryOptions = entryCategories.map(category => ({
    value: category.id,
    label: cfg.lang === 'ar' ? category.label : category.labelEn,
    detail: category.id === defaultEntryCat
      ? (cfg.lang === 'ar' ? 'افتراضي' : 'Default')
      : '',
    icon: category.icon || 'cube-outline',
    color: category.color,
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={[s.overlay, { backgroundColor: th.overlay }]}
      >
        <View style={s.dismissArea}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[s.sheet, { backgroundColor: th.card, maxHeight: '92%', paddingBottom: 0 }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 36 + Math.max(insets.bottom, 20) }}
          >

            <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

            <View style={[s.headRow, { flexDirection: rowDir }]}>
              <TouchableOpacity onPress={handleClose} style={[s.headerIconBtn, { backgroundColor: th.cardHigh }]}>
                <Ionicons name="chevron-down" size={18} color={th.sub} />
              </TouchableOpacity>
              <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{entryTitle}</Text>
              <View style={s.headerIconBtn} />
            </View>
            {!isEdit && !isContextualPlanningLaunch && !dedicatedQuickEntry && (
              <View style={[s.typeRow, { flexDirection: rowDir }]}>
                {seg.filter(sg => sg.k !== 'planning').map(sg => {
                  const active = sg.k === 'smart' ? smartOpen : (!smartOpen && type === sg.k);
                  const color = active ? th.onPrimary : sg.tone || th.sub;
                  return (
                  <TouchableOpacity
                    key={sg.k}
                    onPress={() => {
                      if (sg.k === 'smart') {
                        setSmartMode('image');
                        setSmartOpen(true);
                        if (type === 'transfer') setType('exp');
                        return;
                      }
                      setType(sg.k === 'planning' ? (planningSeg[0]?.k || 'debt') : sg.k);
                      setSmartOpen(false);
                    }}
                    style={[
                      s.typeBtn,
                      {
                        backgroundColor: active ? (sg.tone || th.primary) : th.cardHigh,
                        borderColor: active ? 'transparent' : th.border,
                      },
                    ]}
                  >
                    <Ionicons name={sg.icon || 'ellipse-outline'} size={18} color={color} />
                    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, ...weight('900'), fontSize: 13, lineHeight: 18 }}>
                      {sg.l}
                    </Text>
                  </TouchableOpacity>
                );})}
              </View>
            )}
            {isEdit && type !== 'transfer' && (
              <View style={[s.typeRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {['exp', 'inc'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setType(t)}
                    style={[s.typeBtn, { backgroundColor: type === t ? (t === 'exp' ? th.exp : th.inc) : 'transparent' }]}>
                    <Text style={{ color: type === t ? '#fff' : th.sub, ...weight('700'), fontSize: 13 }}>
                      {t === 'exp' ? L.expBtn : L.incBtn}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isEdit && type === 'transfer' && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="swap-horizontal-outline" size={16} color={th.primary} />
                <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{transferLabel}</Text>
              </View>
            )}

            {smartOpen ? (
              <View style={[s.smartBox, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <View style={[s.smartActionGrid, { flexDirection: rowDir }]}>
                  {smartModes.map(item => {
                    const active = item.key === smartMode || (item.key === 'image' && ['receipt', 'image'].includes(smartMode));
                    const recording = item.key === 'voice' && voiceRecording;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        onPress={item.onPress}
                        disabled={mediaBusy || (voiceRecording && item.key !== 'voice')}
                        accessibilityLabel={item.label}
                        style={[s.smartModeBtn, { backgroundColor: recording ? th.expBg : active ? th.primary : th.card, borderColor: recording ? th.exp : active ? th.primary : th.border, opacity: mediaBusy ? 0.55 : 1 }]}
                      >
                        <Ionicons name={item.icon} size={20} color={recording ? th.exp : active ? th.onPrimary : th.sub} />
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: recording ? th.exp : active ? th.onPrimary : th.text, fontSize: 11, lineHeight: 15, ...weight('900'), textAlign: 'center' }}>
                          {item.label}
                        </Text>
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? th.onPrimary : th.sub, fontSize: 9, lineHeight: 12, ...weight('700'), textAlign: 'center' }}>
                          {item.detail}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {voiceRecording ? (
                  <Text style={[s.smartStatusText, { color: th.exp, textAlign: align }]}>
                    {smartLabels.listening} {recordingSeconds}s
                  </Text>
                ) : mediaBusy ? (
                  <Text style={[s.smartStatusText, { color: th.primary, textAlign: align }]}>{smartLabels.processing}</Text>
                ) : receiptImageUri && ['receipt', 'camera', 'image'].includes(smartMode) ? (
                  <View style={[s.mediaPreview, { backgroundColor: th.card, marginTop: 8 }]}>
                    <TouchableOpacity
                      onPress={() => setImageViewerOpen(true)}
                      style={[s.mediaPreviewHead, { flexDirection: rowDir }]}
                      accessibilityRole="button"
                    >
                      <Image source={{ uri: receiptImageUri }} style={s.receiptThumb} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: th.text, fontSize: 12, ...weight('900'), textAlign: align }}>
                          {smartLabels.imageReady}
                        </Text>
                        <Text style={{ color: th.sub, fontSize: 10, lineHeight: 15, ...weight('700'), textAlign: align, marginTop: 2 }}>
                          {smartLabels.sourceReviewHint}
                        </Text>
                      </View>
                      <Ionicons name="expand-outline" size={19} color={th.primary} />
                    </TouchableOpacity>
                    <View style={[s.mediaActionRow, { flexDirection: rowDir }]}>
                      <TouchableOpacity
                        onPress={() => setImageViewerOpen(true)}
                        style={[s.mediaActionBtn, { backgroundColor: th.primSoft, borderColor: `${th.primary}45`, flexDirection: rowDir }]}
                      >
                        <Ionicons name="scan-outline" size={15} color={th.primary} />
                        <Text style={[s.mediaActionText, { color: th.primary }]}>{smartLabels.viewImage}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={chooseReceiptSource}
                        style={[s.mediaActionBtn, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDir }]}
                      >
                        <Ionicons name="images-outline" size={15} color={th.sub} />
                        <Text style={[s.mediaActionText, { color: th.sub }]}>{smartLabels.changeImage}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : voiceUri && smartMode === 'voice' ? (
                  <View style={[s.mediaPreview, { backgroundColor: th.card, flexDirection: rowDir, marginTop: 8 }]}>
                    <Ionicons name="mic-outline" size={18} color={th.primary} />
                    <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), flex: 1, textAlign: align }}>{smartLabels.voiceReady}</Text>
                  </View>
                ) : null}
                {!!voiceError && smartMode === 'voice' ? (
                  <Text style={[s.smartErrorText, { color: th.exp, textAlign: align }]}>{voiceError}</Text>
                ) : null}

                {smartMode === 'voice' && !!smartExtractedText ? (
                  <View style={[s.extractedTextCard, { backgroundColor: th.card, borderColor: th.border }]}>
                    <View style={[s.extractedTextHead, { flexDirection: rowDir }]}>
                      <Ionicons
                        name={smartMode === 'voice' ? 'chatbubble-ellipses-outline' : 'document-text-outline'}
                        size={16}
                        color={th.primary}
                      />
                      <Text style={[s.extractedTextTitle, { color: th.text, textAlign: align }]}>
                        {smartLabels.extractedText}
                      </Text>
                    </View>
                    <Text
                      selectable
                      style={[s.extractedTextBody, { color: th.sub, textAlign: align }]}
                    >
                      {smartExtractedText}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {lockedDebt && selectedDebt && (
              <View style={[s.lockedPick, { backgroundColor: selectedDebtReceivable ? th.incBg : th.expBg, borderColor: debtColor }]}>
                <Ionicons name={selectedDebtReceivable ? 'cash-outline' : 'card-outline'} size={16} color={debtColor} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: debtColor, ...weight('900'), fontSize: 11, marginBottom: 2 }}>
                    {cfg.lang === 'ar' ? (selectedDebtReceivable ? 'دين لي' : 'دين عليّ') : (selectedDebtReceivable ? 'Debt owed to me' : 'Debt I owe')}
                  </Text>
                  <Text style={{ color: debtColor, ...weight('900'), fontSize: 13 }}>{selectedDebt.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{L.remainingOf} {fmt(selectedDebt.total - selectedDebt.paid)} {getSymbol(selectedDebt.currencyCode || cfg.currency)}</Text>
                </View>
              </View>
            )}

            {type === 'debt' && !isEdit && !lockedDebt && (
              <View style={s.sectionBlock}>
                {renderSelectField({
                  id: 'debt',
                  label: L.selectDebt,
                  value: selDebt,
                  options: availableDebts.map(debt => ({
                    value: debt.id,
                    label: debt.name,
                    detail: `${debt.direction === 'receivable' ? (cfg.lang === 'ar' ? 'دين لي' : 'Owed to me') : (cfg.lang === 'ar' ? 'دين عليّ' : 'I owe')} · ${L.remainingOf} ${fmt(debt.total - debt.paid)} ${getSymbol(debt.currencyCode || cfg.currency)}`,
                    icon: debt.direction === 'receivable' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline',
                    color: debt.direction === 'receivable' ? th.inc : th.exp,
                  })),
                  icon: 'card-outline',
                  tone: selectedDebtReceivable ? th.inc : th.exp,
                  onChange: value => { setSelDebt(value); setEntityBaseRate(''); setExchangeRate(''); },
                })}
              </View>
            )}

            {lockedGoal && selectedGoal && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="flag-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{selectedGoal.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{L.remainingOf} {fmt(selectedGoal.target - selectedGoal.cur)} {getSymbol(selectedGoal.currencyCode || cfg.currency)}</Text>
                </View>
              </View>
            )}

            {type === 'goal' && !isEdit && !lockedGoal && (
              <View style={s.sectionBlock}>
                {renderSelectField({
                  id: 'goal',
                  label: L.selectGoal,
                  value: selGoal,
                  options: availableGoals.map(goal => ({
                    value: goal.id,
                    label: goal.name,
                    detail: `${L.remainingOf} ${fmt(goal.target - goal.cur)} ${getSymbol(goal.currencyCode || cfg.currency)}`,
                    icon: 'flag-outline',
                    color: th.primary,
                  })),
                  icon: 'flag-outline',
                  tone: th.primary,
                  onChange: value => { setSelGoal(value); setEntityBaseRate(''); setExchangeRate(''); },
                })}
              </View>
            )}

            {lockedCommitment && selectedCommitment && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="calendar-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{selectedCommitment.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{Math.round(Number(selectedCommitment.amt || 0)).toLocaleString()} {getSymbol(selectedCommitment.currencyCode || cfg.currency)}</Text>
                </View>
              </View>
            )}

            {type === 'commitment' && !isEdit && !lockedCommitment && (
              <View style={s.sectionBlock}>
                {renderSelectField({
                  id: 'commitment',
                  label: cfg.lang === 'ar' ? 'اختر الالتزام' : 'Select commitment',
                  value: selCommitment,
                  options: availableCommitments.filter(item => item.active !== false).map(item => ({
                    value: item.id,
                    label: item.name,
                    detail: `${Math.round(Number(item.amt || 0)).toLocaleString()} ${getSymbol(item.currencyCode || cfg.currency)}`,
                    icon: 'calendar-outline',
                    color: th.primary,
                  })),
                  icon: 'calendar-outline',
                  tone: th.primary,
                  onChange: (value, option) => {
                    setSelCommitment(value);
                    const commitment = availableCommitments.find(item => item.id === option?.value);
                    setWalletId(defaultWalletId);
                    setEntityBaseRate('');
                    setExchangeRate('');
                  },
                })}
              </View>
            )}

            {isAmountEntry && (
              <>
                <View style={[s.entryField, s.amountField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                  <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.amount}</Text>
                  <TextInput
                    value={amt}
                    onChangeText={(value) => setAmt(formatNumberInput(value))}
                    keyboardType="numeric"
                    placeholder={`0 ${amountSymbol}`}
                    placeholderTextColor={th.faint}
                    style={[s.amountInput, { color: type === 'inc' ? th.inc : type === 'exp' ? th.exp : th.text, textAlign: align }]}
                  />
                </View>
                {isMoneyEntry ? (
                  <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                    <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.titleField}</Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder={defaultTitle}
                      placeholderTextColor={th.faint}
                      style={[s.inlineInput, { color: th.text, textAlign: align }]}
                    />
                  </View>
                ) : null}
              </>
            )}

            {isMoneyEntry ? (
              <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                {modules.wallets && walletList.length > 0 ? renderSelectField({
                    id: 'wallet',
                    label: walletLabel,
                    value: walletId,
                    options: walletOptions,
                    icon: 'wallet-outline',
                    tone: th.primary,
                    onChange: setWalletId,
                  }) : null}
                {renderSelectField({
                  id: 'category',
                  label: categoryFlowHint,
                  value: cat,
                  options: categoryOptions,
                  icon: selectedCat.icon || 'grid-outline',
                  tone: type === 'inc' ? th.inc : th.exp,
                  onChange: (value) => { setCat(value); setCategoryTouched(true); },
                })}
              </View>
            ) : null}

            {type === 'transfer' ? (
              <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                {renderSelectField({
                  id: 'transfer-from',
                  label: fromLabel,
                  value: fromWalletId,
                  options: transferFromOptions,
                  icon: 'arrow-up-outline',
                  tone: th.exp,
                  onChange: (value) => {
                    setFromWalletId(value);
                    const nextTarget = eligibleTransferWallets.find(candidate => candidate.id !== value);
                    setToWalletId(nextTarget?.id || value);
                    setTransferToAmount('');
                    setTransferFromBaseRate('');
                    setTransferToBaseRate('');
                  },
                })}
                {renderSelectField({
                  id: 'transfer-to',
                  label: toLabel,
                  value: toWalletId,
                  options: transferToOptions,
                  icon: 'arrow-down-outline',
                  tone: th.inc,
                  onChange: (value) => {
                    setToWalletId(value);
                    setTransferToAmount('');
                    setTransferFromBaseRate('');
                    setTransferToBaseRate('');
                  },
                })}
              </View>
            ) : null}

            {type === 'transfer' && transferCrossCurrency ? (
              <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>
                  {cfg.lang === 'ar' ? `المبلغ المستلم (${toCurrency})` : `Received amount (${toCurrency})`}
                </Text>
                <TextInput
                  value={transferToAmount}
                  onChangeText={(value) => setTransferToAmount(formatNumberInput(value))}
                  keyboardType="decimal-pad"
                  placeholder={`0 ${toSym}`}
                  placeholderTextColor={th.faint}
                  style={[s.inlineInput, { color: th.text, textAlign: align }]}
                />
                {cleanNumber(amt) > 0 && cleanNumber(transferToAmount) > 0 ? (
                  <Text style={[s.selectDetail, { color: th.sub, textAlign: 'left', writingDirection: 'ltr', marginTop: 4 }]}>
                    {`1 ${fromCurrency} = ${(cleanNumber(transferToAmount) / cleanNumber(amt)).toLocaleString()} ${toCurrency}`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {type === 'transfer' && transferNeedsBridgeRates ? (
              <>
                <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                  <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>
                    {cfg.lang === 'ar' ? `قيمة ${fromCurrency} للتقارير` : 'Reporting value'}
                  </Text>
                  <FxEquation fromCurrency={fromCurrency} toCurrency={baseCurrencyCode} />
                  <TextInput
                    value={transferFromBaseRate}
                    onChangeText={(value) => setTransferFromBaseRate(formatNumberInput(value))}
                    keyboardType="decimal-pad"
                    placeholder={String(selectedFromWallet?.valuationRate || '')}
                    placeholderTextColor={th.faint}
                    style={[s.inlineInput, { color: th.text, textAlign: align }]}
                  />
                  {Number(selectedFromWallet?.valuationRate || 0) > 0 ? (
                    <TouchableOpacity onPress={() => setTransferFromBaseRate(String(selectedFromWallet.valuationRate))}>
                      <Text style={[s.selectDetail, { color: th.primary, textAlign: align, marginTop: 5, ...weight('800') }]}>
                        {cfg.lang === 'ar' ? `استخدام سعر المحفظة الحالي: ${selectedFromWallet.valuationRate}` : `Use current wallet rate: ${selectedFromWallet.valuationRate}`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                  <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>
                    {cfg.lang === 'ar' ? `قيمة ${toCurrency} للتقارير` : 'Reporting value'}
                  </Text>
                  <FxEquation fromCurrency={toCurrency} toCurrency={baseCurrencyCode} />
                  <TextInput
                    value={transferToBaseRate}
                    onChangeText={(value) => setTransferToBaseRate(formatNumberInput(value))}
                    keyboardType="decimal-pad"
                    placeholder={String(selectedToWallet?.valuationRate || '')}
                    placeholderTextColor={th.faint}
                    style={[s.inlineInput, { color: th.text, textAlign: align }]}
                  />
                  {Number(selectedToWallet?.valuationRate || 0) > 0 ? (
                    <TouchableOpacity onPress={() => setTransferToBaseRate(String(selectedToWallet.valuationRate))}>
                      <Text style={[s.selectDetail, { color: th.primary, textAlign: align, marginTop: 5, ...weight('800') }]}>
                        {cfg.lang === 'ar' ? `استخدام سعر المحفظة الحالي: ${selectedToWallet.valuationRate}` : `Use current wallet rate: ${selectedToWallet.valuationRate}`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            ) : null}

            {type === 'transfer' ? (
              <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>
                  {cfg.lang === 'ar' ? `رسوم التحويل (${fromCurrency}) · اختيارية` : `Transfer fee (${fromCurrency}) · optional`}
                </Text>
                <TextInput
                  value={transferFeeAmount}
                  onChangeText={(value) => setTransferFeeAmount(formatNumberInput(value))}
                  keyboardType="decimal-pad"
                  placeholder={`0 ${fromSym}`}
                  placeholderTextColor={th.faint}
                  style={[s.inlineInput, { color: th.text, textAlign: align }]}
                />
                {cleanNumber(transferFeeAmount) > 0 ? (
                  <Text style={[s.selectDetail, { color: th.sub, textAlign: align, marginTop: 4 }]}>
                    {cfg.lang === 'ar' ? 'تُخصم الرسوم من المحفظة المرسلة وتُحتسب كمصروف في التقارير.' : 'The fee is deducted from the source wallet and counted as an expense in reports.'}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {type === 'transfer' ? (
              <View style={[s.entryField, { backgroundColor: th.input, borderColor: transferReady ? th.border : th.exp }]}>
                <Text style={[s.fieldLabel, { color: th.text, textAlign: align, ...weight('900') }]}>
                  {cfg.lang === 'ar' ? 'ملخص التحويل قبل التأكيد' : 'Transfer summary before confirmation'}
                </Text>
                <View style={{ flexDirection: rowDir, justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{cfg.lang === 'ar' ? 'إجمالي الخصم' : 'Total debited'}</Text>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('900') }}>{formatNumberInput(String(transferTotalDebit || 0))} {fromSym}</Text>
                </View>
                <View style={{ flexDirection: rowDir, justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{cfg.lang === 'ar' ? 'المبلغ المستلم' : 'Recipient gets'}</Text>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('900') }}>{transferTargetValue > 0 ? formatNumberInput(String(transferTargetValue)) : '—'} {toSym}</Text>
                </View>
                {transferCrossCurrency && transferRateValue > 0 && transferTargetValue > 0 ? (
                  <Text style={[s.selectDetail, { color: th.primary, textAlign: align, marginTop: 8, ...weight('800') }]}>
                    {`1 ${fromCurrency} = ${transferRateValue.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${toCurrency}`}
                  </Text>
                ) : null}
                <Text style={[s.selectDetail, { color: th.sub, textAlign: align, marginTop: 6 }]}>
                  {cfg.lang === 'ar'
                    ? `MYFI يحفظ مبالغ التحويل وسعره بتاريخ ${dateISO}. تغيير أسعار المحافظ لاحقاً لا يعيد كتابة هذه الحركة.`
                    : `MYFI freezes the transfer amounts and rate on ${dateISO}. Future wallet-rate changes do not rewrite this transaction.`}
                </Text>
                {transferValidationMessage ? (
                  <Text style={[s.selectDetail, { color: th.exp, textAlign: align, marginTop: 7, ...weight('900') }]}>
                    {transferValidationMessage}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {needsTrackerEntityBaseRate ? (
              <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>
                  {cfg.lang === 'ar' ? 'سعر المتابعة التاريخي' : 'Tracker historical rate'}
                </Text>
                <FxEquation fromCurrency={trackerCurrency} toCurrency={cfg.currency} />
                <TextInput
                  value={entityBaseRate}
                  onChangeText={(value) => setEntityBaseRate(formatNumberInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={th.faint}
                  style={[s.inlineInput, { color: th.text, textAlign: align }]}
                />
                <Text style={[s.selectDetail, { color: th.sub, textAlign: align, marginTop: 5 }]}>
                  {cfg.lang === 'ar' ? 'يثبت هذا السعر معنى الدين/الهدف/الالتزام لهذه الدفعة ولا يتغير بعد الدمج أو تسجيل الدخول.' : 'This freezes the tracker amount meaning for this payment; sign-in or merge cannot reinterpret it later.'}
                </Text>
              </View>
            ) : null}

            {needsEntryExchangeRate ? (
              <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>
                  {cfg.lang === 'ar'
                    ? (isTrackerPayment ? 'سعر محفظة الدفع' : 'سعر الصرف')
                    : (isTrackerPayment ? 'Payment wallet rate' : 'Exchange rate')}
                </Text>
                <FxEquation fromCurrency={entryCurrency} toCurrency={cfg.currency} />
                <TextInput
                  value={exchangeRate}
                  onChangeText={(value) => setExchangeRate(formatNumberInput(value))}
                  keyboardType="decimal-pad"
                  placeholder={String(selectedEntryWallet?.valuationRate || '')}
                  placeholderTextColor={th.faint}
                  style={[s.inlineInput, { color: th.text, textAlign: align }]}
                />
                <Text style={[s.selectDetail, { color: th.sub, textAlign: align, marginTop: 5 }]}>
                  {cfg.lang === 'ar' ? 'هذا سعر تاريخي خاص بهذه الحركة. سعر المحفظة أدناه اقتراح فقط ولن يُستخدم بدون اختيارك.' : 'This is the historical rate for this transaction. The wallet rate below is only a suggestion and is never applied without your choice.'}
                </Text>
                {Number(selectedEntryWallet?.valuationRate || 0) > 0 ? (
                  <TouchableOpacity onPress={() => setExchangeRate(String(selectedEntryWallet.valuationRate))}>
                    <Text style={[s.selectDetail, { color: th.primary, textAlign: align, marginTop: 5, ...weight('800') }]}>
                      {cfg.lang === 'ar' ? `استخدام سعر المحفظة: ${selectedEntryWallet.valuationRate}` : `Use wallet rate: ${selectedEntryWallet.valuationRate}`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {isAmountEntry ? (
              <View style={s.detailsBlock}>
                <View style={[s.dateRepeatRow, { flexDirection: rowDir }]}>
                  <DateField
                    value={dateISO}
                    onChange={setDateISO}
                    th={th}
                    lang={cfg.lang}
                    monthNameStyle={cfg.monthNameStyle}
                    label={cfg.lang === 'ar' ? 'التاريخ' : 'Date'}
                    style={s.selectFieldBlock}
                    buttonStyle={[s.dateButton, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                    labelInside
                  />
                  {modules.recurring && isMoneyEntry ? (
                    <View style={s.selectFieldBlock}>
                      <TouchableOpacity
                        onPress={() => setRecurring(current => !current)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: recurring }}
                        style={[s.repeatField, { backgroundColor: recurring ? th.primSoft : th.cardHigh, borderColor: recurring ? th.primary : th.border, flexDirection: rowDir }]}
                      >
                        <Ionicons name="repeat" size={17} color={recurring ? th.primary : th.sub} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.selectLabel, { color: th.sub, textAlign: align }]}>
                            {cfg.lang === 'ar' ? 'التكرار الشهري' : 'Monthly repeat'}
                          </Text>
                          <Text numberOfLines={1} style={[s.repeatValue, { color: recurring ? th.primary : th.text, textAlign: align }]}>
                            {recurring ? (cfg.lang === 'ar' ? 'مفعل شهرياً' : 'Monthly on') : (cfg.lang === 'ar' ? 'غير مكرر' : 'Off')}
                          </Text>
                          <Text numberOfLines={1} style={[s.selectDetail, { color: th.sub, textAlign: align }]}>
                            {' '}
                          </Text>
                        </View>
                        <Ionicons name={recurring ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={recurring ? th.primary : th.faint} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {smartSourceInfo && isMoneyEntry ? (
              <View style={[s.smartSourceNote, { backgroundColor: `${smartSourceTone}18`, borderColor: `${smartSourceTone}38`, flexDirection: rowDir }]}>
                <Ionicons name={smartSourceInfo.icon} size={14} color={smartSourceTone} />
                <Text style={{ color: smartSourceTone, fontSize: 12, ...weight('900'), flex: 1, textAlign: align }}>
                  {smartSourceSummary}
                </Text>
              </View>
            ) : null}

            {type === 'commitment' ? (
              <>
              <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                {isTrackerPayment && modules.wallets && walletList.length > 0 ? renderSelectField({
                  id: 'tracker-wallet',
                  label: walletLabel,
                  value: walletId,
                  options: walletOptions,
                  icon: 'wallet-outline',
                  tone: th.primary,
                  onChange: setWalletId,
                }) : null}
                <DateField
                  value={dateISO}
                  onChange={setDateISO}
                  th={th}
                  lang={cfg.lang}
                  monthNameStyle={cfg.monthNameStyle}
                  label={cfg.lang === 'ar' ? 'تاريخ الدفع' : 'Payment date'}
                  style={s.selectFieldBlock}
                  buttonStyle={[s.dateButton, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                  labelInside
                />
              </View>
              </>
            ) : !isAmountEntry ? (
              <View style={{ marginBottom: 12 }}>
                <View style={[s.entryField, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                  <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.amount}</Text>
                  <TextInput
                    value={amt}
                    onChangeText={(value) => setAmt(formatNumberInput(value))}
                    keyboardType="numeric"
                    placeholder={`0 ${trackerSym}`}
                    placeholderTextColor={th.faint}
                    style={[s.inlineInput, { color: th.text, textAlign: align }]}
                  />
                </View>
                <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                  {isTrackerPayment && modules.wallets && walletList.length > 0 ? renderSelectField({
                    id: 'tracker-wallet',
                    label: walletLabel,
                    value: walletId,
                    options: walletOptions,
                    icon: 'wallet-outline',
                    tone: th.primary,
                    onChange: setWalletId,
                  }) : null}
                  <DateField
                    value={dateISO}
                    onChange={setDateISO}
                    th={th}
                    lang={cfg.lang}
                    monthNameStyle={cfg.monthNameStyle}
                    label={cfg.lang === 'ar' ? 'التاريخ' : 'Date'}
                    style={s.selectFieldBlock}
                    buttonStyle={[s.dateButton, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                    labelInside
                  />
                </View>
              </View>
            ) : null}

          </ScrollView>

          <View
            style={[
              s.stickyFooter,
              {
                backgroundColor: th.card,
                borderTopColor: th.border,
                paddingBottom: Math.max(insets.bottom, 8),
              },
            ]}
          >
            {isEdit ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleDelete}
                  style={[s.footerDeleteBtn, { backgroundColor: th.expBg, borderColor: th.exp }]}
                >
                  <Ionicons name="trash-outline" size={17} color={th.exp} />
                  <Text style={{ color: th.exp, ...weight('800'), fontSize: 12 }}>{L.delete}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={type === 'transfer' && !transferReady}
                  style={[s.footerSaveBtn, { backgroundColor: finalSaveColor, flex: 2, opacity: type === 'transfer' && !transferReady ? 0.55 : 1 }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', ...weight('900'), fontSize: 14 }}>{L.save}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSave}
                disabled={type === 'transfer' && !transferReady}
                style={[s.footerSaveBtn, { backgroundColor: finalSaveColor, opacity: type === 'transfer' && !transferReady ? 0.55 : 1 }]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', ...weight('900'), fontSize: 14 }}>{finalSaveLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={!!expandedPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedPicker(null)}
      >
        <View style={[s.selectSheetOverlay, { backgroundColor: th.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExpandedPicker(null)} />
          <View style={[s.selectSheetPanel, { backgroundColor: th.card, borderColor: th.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[s.selectSheetHead, { flexDirection: rowDir }]}>
              <View style={[s.selectSheetIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name={expandedPicker?.icon || 'chevron-down-outline'} size={18} color={expandedPicker?.tone || th.primary} />
              </View>
              <Text style={[s.selectSheetTitle, { color: th.text, textAlign: align }]} numberOfLines={1}>
                {expandedPicker?.label || (cfg.lang === 'ar' ? 'اختر' : 'Choose')}
              </Text>
              <TouchableOpacity onPress={() => setExpandedPicker(null)} style={[s.selectSheetClose, { backgroundColor: th.cardHigh }]}>
                <Ionicons name="chevron-down" size={18} color={th.sub} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={s.selectSheetList}>
              {expandedPicker?.options?.length ? expandedPicker.options.map(option => {
                const active = option.value === expandedPicker.value;
                const optionColor = option.color || (active ? th.primary : th.sub);
                return (
                  <TouchableOpacity
                    key={String(option.value)}
                    onPress={() => {
                      expandedPicker.onChange?.(option.value, option);
                      setExpandedPicker(null);
                    }}
                    style={[s.selectSheetOption, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border, flexDirection: rowDir }]}
                  >
                    <Ionicons name={option.icon || 'ellipse-outline'} size={18} color={optionColor} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: active ? th.primary : th.text, fontSize: 13, ...weight(active ? '900' : '800'), textAlign: align }}>
                        {option.label}
                      </Text>
                      {option.detail ? (
                        <Text numberOfLines={1} style={{ color: th.sub, fontSize: 10, lineHeight: 15, ...weight('700'), textAlign: align, marginTop: 2 }}>
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              }) : (
                <Text style={[s.emptySelect, { color: th.faint, textAlign: align }]}>
                  {cfg.lang === 'ar' ? 'لا توجد خيارات متاحة' : 'No options available'}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SmartImageViewerModal
        visible={imageViewerOpen}
        uri={receiptImageUri}
        onClose={() => setImageViewerOpen(false)}
        th={th}
        lang={cfg.lang}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  dismissArea:{ flex: 1, justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingHorizontal: 16, paddingTop: 10, paddingBottom: SPACE.huge, ...SHADOW.float },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  headRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title:      { flex: 1, fontSize: 17, lineHeight: 23, ...weight('900') },
  headerIconBtn:{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeRow:    { marginBottom: 10, gap: 7 },
  typeBtn:    { flex: 1, minHeight: 56, paddingHorizontal: 5, paddingVertical: 8, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label:      { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  fieldLabel: { fontSize: 11, lineHeight: 16, ...weight('900'), marginBottom: 5 },
  entryField: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  amountField:{ paddingVertical: 9 },
  sectionBlock:{ marginBottom: 8 },
  twoColumnRow:{ width: '100%', alignItems: 'stretch', gap: 8, marginBottom: 1 },
  selectFieldBlock: { flex: 1, flexBasis: 0, minWidth: 0, height: 64, marginBottom: 7 },
  selectField: { minHeight: 64, height: 64, alignItems: 'center', gap: 8, borderRadius: 13, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 6 },
  selectLabel:{ fontSize: 10, lineHeight: 14, ...weight('800') },
  selectValue:{ fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 1 },
  selectDetail:{ fontSize: 9, lineHeight: 13, ...weight('700'), marginTop: 1 },
  emptySelect:{ padding: 10, fontSize: 12, ...weight('700') },
  selectSheetOverlay:{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  selectSheetPanel:{ width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '54%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, ...SHADOW.float },
  selectSheetHead:{ minHeight: 42, alignItems: 'center', gap: 9, marginBottom: 8 },
  selectSheetIcon:{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectSheetTitle:{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, ...weight('900') },
  selectSheetClose:{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectSheetList:{ width: '100%' },
  selectSheetOption:{ minHeight: 48, alignItems: 'center', gap: 9, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7 },
  detailsBlock:{ marginBottom: 3 },
  lockedPick: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  input:      { minHeight: 42, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 0.5, marginBottom: 6, fontSize: 13, lineHeight: 18, ...weight('700') },
  inlineInput:{ minHeight: 30, paddingVertical: 0, paddingHorizontal: 0, fontSize: 14, lineHeight: 19, ...weight('800') },
  amountInput:{ minHeight: 44, paddingHorizontal: 0, paddingVertical: 0, fontSize: 30, lineHeight: 38, ...weight('900') },
  dateRepeatRow:{ width: '100%', alignItems: 'stretch', gap: 8, marginBottom: 2 },
  dateButton: { minHeight: 64, height: 64, borderRadius: 13, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 6 },
  repeatField: { minHeight: 64, height: 64, borderRadius: 13, borderWidth: 0.5, paddingHorizontal: 10, alignItems: 'center', gap: 8 },
  repeatValue:{ fontSize: 12, lineHeight: 18, ...weight('900') },
  smartBox:   { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 9, marginBottom: 8, gap: 9 },
  smartActionGrid:{ alignItems: 'stretch', gap: 7 },
  smartModeBtn:{ flex: 1, minHeight: 66, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4 },
  smartStatusText:{ width: '100%', fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 2 },
  smartErrorText:{ width: '100%', fontSize: 12, lineHeight: 18, ...weight('800'), marginTop: 2 },
  smartSourceNote:{ minHeight: 40, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  mediaPreview:{ width: '100%', alignItems: 'center', gap: 8, borderRadius: 12, padding: 8, marginTop: 2 },
  receiptThumb:{ width: 58, height: 58, borderRadius: 11 },
  mediaPreviewHead:{ width: '100%', alignItems: 'center', gap: 9 },
  mediaActionRow:{ width: '100%', gap: 7, marginTop: 7 },
  mediaActionBtn:{ flex: 1, minHeight: 36, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  mediaActionText:{ fontSize: 10, lineHeight: 15, ...weight('900') },
  extractedTextCard:{ width: '100%', borderRadius: RADIUS.md, borderWidth: 1, padding: 10, marginTop: 2 },
  extractedTextHead:{ alignItems: 'center', gap: 7, marginBottom: 6 },
  extractedTextTitle:{ flex: 1, fontSize: 11, lineHeight: 16, ...weight('900') },
  extractedTextBody:{ fontSize: 11, lineHeight: 19, ...weight('700') },
  stickyFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  footerSaveBtn: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
  },
  footerDeleteBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },

});

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TextInput, ScrollView, Alert, Pressable, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
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
import { getDefaultWalletId, getWalletLabel, sortWalletsByDefault } from '../lib/wallets';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';
import DateField from './DateField';
import { analyzeSmartEntry, buildSmartSourceMeta, describeSmartSource } from '../lib/smartEntry';
import { suggestCategoryFromHistory } from '../lib/localIntelligence';
import { rowDirFor, textAlignFor } from '../lib/layout';
import { startLiveSpeechPreview } from '../lib/liveSpeechPreview';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';

const cleanNumber = parseNumberInput;
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
  return headers;
};

const uploadMediaText = async (uri, endpoint, fallbackName, mimeType) => {
  if (!endpoint || !uri) return '';
  const form = new FormData();
  form.append('file', { uri, name: fallbackName, type: mimeType });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: await buildUploadHeaders(endpoint),
    body: form,
  });
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
  return String(data.text || data.transcript || data.result || '').trim();
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
  const { addTrans, addTransfer, editTrans, deleteTrans, payDebt, saveGoal, payCommitment, debts, goals, commitments, wallets, cats, cfg, trans } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const sym = getSymbol(cfg.currency);
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
  const transferTargetWallets = eligibleTransferWallets.filter(wallet => wallet.id !== fromWalletId);
  const canTransfer = modules.wallets && eligibleTransferWallets.length > 1;
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartMode, setSmartMode] = useState('text');
  const [smartText, setSmartText] = useState('');
  const [receiptImageUri, setReceiptImageUri] = useState(null);
  const [voiceUri, setVoiceUri] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [smartSource, setSmartSource] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [voicePreviewLive, setVoicePreviewLive] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const liveSpeechRef = useRef(null);
  const recordingRef = useRef(false);
  const stoppingRef = useRef(false);
  const mountedRef = useRef(true);
  const recordingTimerRef = useRef(null);
  const recordingOperationRef = useRef(0);

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
    setSmartOpen(false);
    setShowMore(false);
    setSmartMode('text');
    setSmartText('');
    setReceiptImageUri(null);
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
  };

  useEffect(() => {
    if (!visible) return;
    if (editData) {
      const editType = editData.kind === 'transfer' ? 'transfer' : (editData.amt > 0 ? 'inc' : 'exp');
      setType(editType);
      setAmt(Math.abs(editData.kind === 'transfer' ? editData.transferAmount : editData.amt).toString());
      setTitle(editData.title || '');
      setCat(editData.cat || 'other');
      setCategoryTouched(true);
      setNote(editData.note || '');
      setRecurring(editData.recurring || false);
      setDateISO(editData.dateISO || today());
      setWalletId(editData.walletId || defaultWalletId);
      setFromWalletId(editData.fromWalletId || defaultWalletId);
      setToWalletId(editData.toWalletId || secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
      setSmartSource(editData.smartSource || null);
      setShowMore(!!(editData.note || editData.recurring || editData.smartSource));
    } else if (draftData?.smartMode) {
      setType(cleanInitialMode);
      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());
      setCategoryTouched(false);
      setWalletId(defaultWalletId);
      setSmartMode(draftData.smartMode);
      setSmartOpen(true);
      setSmartText('');
      setSmartSource(null);
      setShowMore(true);
    } else if (draftData) {
      setType(draftData.amt > 0 ? 'inc' : 'exp');
      setAmt(Math.abs(draftData.amt).toString());
      setTitle(draftData.title || '');
      setCat(draftData.cat || 'other');
      setCategoryTouched(true);
      setNote(draftData.note || '');
      setRecurring(draftData.recurring !== false);
      setDateISO(draftData.dateISO || today());
      setWalletId(draftData.walletId || defaultWalletId);
      setSmartSource(draftData.smartSource || null);
      setShowMore(!!(draftData.note || draftData.recurring || draftData.smartSource));
    } else {
      const initialCommitment = initialCommitmentId
        ? availableCommitments.find(item => item.id === initialCommitmentId)
        : null;
      const defaultCommitment = initialCommitment || availableCommitments[0] || null;
      setType(cleanInitialMode);
      setSelDebt(initialDebtId || availableDebts[0]?.id || null);
      setSelGoal(initialGoalId || availableGoals[0]?.id || null);
      setSelCommitment(defaultCommitment?.id || null);
      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());
      setCategoryTouched(false);
      setWalletId(defaultCommitment?.walletId || defaultWalletId);
      setFromWalletId(firstTransferWallet?.id || defaultWalletId);
      setToWalletId(secondTransferWallet?.id || firstTransferWallet?.id || defaultWalletId);
      setSmartSource(null);
      setShowMore(false);
    }
  }, [visible, editData, draftData, cleanInitialMode, initialDebtId, initialGoalId, initialCommitmentId, wallets, commitments, defaultWalletId]);

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

  const applySmartDraft = (value) => {
    const draft = analyzeSmartEntry({
      text: value,
      cats,
      history: useStore.getState().trans,
      wallets: walletList,
      lang: cfg.lang,
    });
    if (!draft || !draft.amount) return false;
    setType(draft.type);
    setAmt(String(draft.amount));
    setCat(draft.catId);
    setCategoryTouched(false);
    setTitle(draft.title);
    if (draft.walletId) setWalletId(draft.walletId);
    if (draft.dateISO) setDateISO(draft.dateISO);
    return true;
  };

  const applyAnalyzedText = ({ value, mode, automated = true }) => {
    const text = String(value || '').trim();
    setSmartText(text);
    if (!applySmartDraft(text)) return false;
    setSmartMode(mode);
    setSmartSource(buildSmartSourceMeta({ mode, text, automated }));
    setSmartOpen(false);
    setSmartText('');
    return true;
  };

  const openSmartPanel = (mode) => {
    setSmartMode(mode);
    setSmartOpen(true);
  };

  const useManualTextEntry = () => {
    setSmartMode('text');
    setSmartOpen(true);
    setSmartText('');
    setSmartSource(null);
  };

  const pasteSmartText = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setSmartText(text);
  };

  const extractReceiptText = async (uri, mode, mimeType = 'image/jpeg') => {
    setMediaBusy(true);
    try {
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const text = await uploadMediaText(uri, OCR_ENDPOINT, `receipt.${extension}`, mimeType);
      if (!text) throw new Error('EMPTY_ANALYSIS');
      if (!applyAnalyzedText({ value: text, mode, automated: true })) {
        setSmartOpen(false);
        setSmartText('');
        Alert.alert('', cfg.lang === 'ar'
          ? 'تمت قراءة الصورة، لكن لم يظهر مبلغ واضح. أدخل المبلغ يدوياً.'
          : 'The image was read, but no clear amount was found. Enter the amount manually.');
      }
    } catch (error) {
      Alert.alert('', analysisErrorMessage({ lang: cfg.lang, kind: 'image', endpoint: OCR_ENDPOINT, error }));
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
      const text = await uploadMediaText(uri, TRANSCRIBE_ENDPOINT, 'voice.m4a', 'audio/mp4');
      if (!text) throw new Error('EMPTY_ANALYSIS');
      if (!applyAnalyzedText({ value: text, mode: 'voice', automated: true })) {
        setNote(current => current || text);
        setSmartOpen(false);
        setSmartText('');
        Alert.alert('', cfg.lang === 'ar'
          ? 'تم فهم التسجيل، لكن لم يظهر مبلغ واضح. أدخل المبلغ يدوياً.'
          : 'The recording was understood, but no clear amount was found. Enter the amount manually.');
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
      setSmartText('');
      setVoiceUri(null);
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
        onText: (text) => {
          setSmartText(text);
          setVoicePreviewLive(true);
        },
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

  const applySmartPanel = () => {
    const ok = applyAnalyzedText({ value: smartText, mode: smartMode, automated: smartMode !== 'text' });
    if (!ok) {
      Alert.alert('', cfg.lang === 'ar' ? 'لم يتم العثور على مبلغ واضح.' : 'No clear amount was found.');
      return;
    }
  };

  const handleSave = async () => {
    if (!isISODate(dateISO)) {
      Alert.alert('', cfg.lang === 'ar' ? 'اكتب التاريخ بصيغة YYYY-MM-DD' : 'Use YYYY-MM-DD date format');
      return;
    }
    const n = cleanNumber(amt);
    if (type !== 'transfer' && !walletId) return;
    if (type !== 'commitment' && !(n > 0)) {
      Alert.alert('', cfg.lang === 'ar' ? 'اكتب مبلغاً صحيحاً أكبر من صفر' : 'Enter a valid amount greater than zero');
      return;
    }

    if (type === 'transfer') {
      if (!fromWalletId || !toWalletId || fromWalletId === toWalletId) return;
      const sourceWallet = eligibleTransferWallets.find(wallet => wallet.id === fromWalletId);
      const targetWallet = eligibleTransferWallets.find(wallet => wallet.id === toWalletId);
      if (!sourceWallet || !targetWallet) return;
      let saved = false;
      if (editData) {
        saved = await editTrans(editData.id, {
          kind: 'transfer',
          amt: 0,
          transferAmount: Math.abs(n),
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
        saved = await addTransfer({ fromWalletId, toWalletId, amount: n, dateISO, note });
      }
      if (!saved) {
        Alert.alert(
          '',
          cfg.lang === 'ar'
            ? 'الرصيد المتاح في محفظة المصدر غير كافٍ لهذا التحويل.'
            : 'The source wallet does not have enough available balance for this transfer.',
        );
        return;
      }
      handleClose();
      return;
    }

    if (type === 'debt') {
      if (!selDebt) return;
      const applied = await payDebt(selDebt, n, dateISO, walletId);
      if (!applied) {
        Alert.alert('', cfg.lang === 'ar'
          ? 'تعذّر تسجيل الدفعة — تأكد أن رصيد المحفظة المتاح كافٍ وأن الدين لم يُسدد بالكامل.'
          : 'Could not record the payment — check the wallet\u2019s available balance and that the debt is not already fully paid.');
        return;
      }
      handleClose();
      return;
    }
    if (type === 'goal') {
      if (!selGoal) return;
      const applied = await saveGoal(selGoal, n, dateISO, walletId);
      if (!applied) {
        Alert.alert('', cfg.lang === 'ar'
          ? 'تعذّر تسجيل التوفير — تأكد أن رصيد المحفظة المتاح كافٍ وأن الهدف لم يكتمل بالفعل.'
          : 'Could not record the saving — check the wallet\u2019s available balance and that the goal is not already complete.');
        return;
      }
      handleClose();
      return;
    }
    if (type === 'commitment') {
      if (!selCommitment) return;
      const result = await payCommitment(selCommitment, dateISO, walletId);
      if (!result?.ok) {
        if (result?.reason === 'linked_unavailable') {
          Alert.alert('', cfg.lang === 'ar'
            ? 'الدين أو الهدف المرتبط بهذا الالتزام مكتمل بالفعل أو رصيد المحفظة غير كافٍ. الغِ الربط أو أوقف الالتزام من شاشة تعديله.'
            : 'The linked debt or goal is already complete, or the wallet balance is insufficient. Unlink it or pause this commitment.');
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
    const payload = {
      title: finalTitle,
      amt:   type === 'exp' ? -Math.abs(n) : Math.abs(n),
      cat, note, recurring, dateISO, walletId,
      recurringGroupId: draftData?.recurringGroupId,
      smartSource: smartSource || editData?.smartSource || null,
    };
    if (editData) await editTrans(editData.id, payload);
    else           await addTrans(payload);
    handleClose();
  };

  const handleDelete = () => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.yes, style: 'destructive', onPress: async () => {
        await deleteTrans(editData.id);
        handleClose();
      }},
    ]);
  };

  const isEdit = !!editData;
  const fmt = (n) => Math.abs(Math.round(n)).toLocaleString();

  const isPlanningAction = ['debt', 'goal', 'commitment'].includes(type);
  const isContextualPlanningLaunch = !!(initialDebtId || initialGoalId || initialCommitmentId);
  const planningSeg = [
    (modules.debtsOwed || modules.debtsReceivable) ? { k: 'debt', l: cfg.lang === 'ar' ? 'دين' : 'Debt' } : null,
    modules.goals ? { k: 'goal', l: cfg.lang === 'ar' ? 'هدف' : 'Goal' } : null,
    modules.commitments ? { k: 'commitment', l: cfg.lang === 'ar' ? 'التزام' : 'Commitment' } : null,
  ].filter(Boolean);
  const seg = [
    { k: 'exp',  l: L.expMode },
    { k: 'inc',  l: L.incMode },
    modules.wallets && canTransfer ? { k: 'transfer', l: transferLabel } : null,
    planningSeg.length > 0 ? { k: 'planning', l: cfg.lang === 'ar' ? 'المتابعات' : 'Tracking' } : null,
  ].filter(Boolean);
  const saveLabel = type === 'debt' ? L.payDebtAction : type === 'goal' ? L.saveGoalAction : type === 'commitment' ? (cfg.lang === 'ar' ? 'تسجيل الدفع' : 'Mark paid') : type === 'transfer' ? transferLabel : L.save;
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
  const focusedTitle = type === 'exp'
    ? (cfg.lang === 'ar' ? 'إضافة مصروف' : 'Add expense')
    : type === 'inc'
      ? (cfg.lang === 'ar' ? 'إضافة دخل' : 'Add income')
      : type === 'transfer'
        ? transferLabel
        : finalSaveLabel;
  const entryTitle = isEdit
    ? L.editTrans
    : focusedEntry
      ? focusedTitle
      : (cfg.lang === 'ar' ? '\u0625\u0636\u0627\u0641\u0629 \u062d\u0631\u0643\u0629' : 'Add entry');
  const moreLabel = cfg.lang === 'ar' ? '\u0627\u0644\u0645\u0632\u064a\u062f' : 'More';
  const smartLabels = {
    text: cfg.lang === 'ar' ? 'كتابة' : 'Text',
    media: cfg.lang === 'ar' ? 'صورة' : 'Image',
    voice: cfg.lang === 'ar' ? 'تسجيل' : 'Record',
    pasteText: cfg.lang === 'ar' ? 'لصق نص' : 'Paste text',
    recording: cfg.lang === 'ar' ? 'إيقاف التسجيل' : 'Stop',
    listening: cfg.lang === 'ar' ? 'جاري التسجيل...' : 'Recording...',
    processing: cfg.lang === 'ar' ? 'جاري التحليل...' : 'Analyzing...',
    imageReady: cfg.lang === 'ar' ? 'تم اختيار الصورة' : 'Image selected',
    voiceReady: cfg.lang === 'ar' ? 'تم تسجيل الصوت' : 'Voice recorded',
    paste: cfg.lang === 'ar' ? 'لصق' : 'Paste',
    apply: cfg.lang === 'ar' ? 'تحليل' : 'Analyze',
    placeholder: smartMode === 'camera' || smartMode === 'image' || smartMode === 'receipt'
      ? (cfg.lang === 'ar' ? 'الصق نص الفاتورة هنا' : 'Paste receipt text here')
      : smartMode === 'voice'
        ? (cfg.lang === 'ar' ? 'سيظهر نص الصوت هنا عند ربط التحويل، أو اكتبه يدوياً' : 'Voice text appears here when transcription is connected, or type it manually')
      : (cfg.lang === 'ar' ? 'مثال: قهوة 3000 من الكاش' : 'Example: coffee 3000 from cash'),
  };
  const selectedCat = cats.find(c => c.id === cat) || cats.find(c => c.id === 'other') || cats[0] || {};
  const defaultTitle = (() => {
    const catLabel = (cfg.lang === 'ar' ? selectedCat.label : selectedCat.labelEn) || selectedCat.label || selectedCat.labelEn || '';
    if (type === 'inc') return cfg.lang === 'ar' ? `دخل - ${catLabel || 'عام'}` : `Income - ${catLabel || 'General'}`;
    return cfg.lang === 'ar' ? `مصروف - ${catLabel || 'عام'}` : `Expense - ${catLabel || 'General'}`;
  })();
  const isMoneyEntry = type === 'exp' || type === 'inc';
  const isSmartLaunch = !isEdit && (isMoneyEntry || type === 'transfer');
  useEffect(() => {
    if (!visible || categoryTouched || !isMoneyEntry || title.trim().length < 3) return;
    const suggested = suggestCategoryFromHistory(title, trans, {
      flow: type === 'inc' ? 'income' : 'expense',
    });
    if (suggested && cats.some(item => item.id === suggested)) setCat(suggested);
  }, [visible, title, type, categoryTouched, isMoneyEntry, trans, cats]);
  const smartSourceInfo = describeSmartSource(smartSource, cfg.lang);
  const isImageSource = ['receipt', 'camera', 'image'].includes(smartSource?.mode);
  const smartSourceTone = smartSource?.mode === 'voice' ? th.warn : isImageSource ? th.primary : th.inc;
  const smartSourceSummary = isImageSource
    ? (cfg.lang === 'ar' ? 'تم تحليل الصورة وتعبئة البيانات' : 'Image analyzed and fields filled')
    : smartSource?.mode === 'voice'
      ? (cfg.lang === 'ar' ? 'تم تحليل التسجيل وتعبئة البيانات' : 'Recording analyzed and fields filled')
      : smartSource?.mode === 'text'
        ? (cfg.lang === 'ar' ? 'تم تحليل النص وتعبئة البيانات' : 'Text analyzed and fields filled')
        : '';
  const smartModes = [
    { key: 'text', label: smartLabels.text, icon: 'text-outline', onPress: useManualTextEntry },
    { key: 'media', label: smartLabels.media, icon: 'camera-outline', onPress: chooseReceiptSource },
    { key: 'voice', label: voiceRecording ? smartLabels.recording : smartLabels.voice, icon: voiceRecording ? 'stop-circle-outline' : 'mic-outline', onPress: toggleVoiceRecording },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={[s.overlay, { backgroundColor: th.overlay }]}
      >
        <View style={s.dismissArea}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[s.sheet, { backgroundColor: th.card, maxHeight: '88%', paddingBottom: 20 + Math.max(insets.bottom, 8) }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 96 }}
          >

            <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

            <View style={[s.headRow, { flexDirection: rowDir }]}>
              <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{entryTitle}</Text>
            </View>

            {!isEdit && !isContextualPlanningLaunch && !focusedEntry && (
              <View style={[s.typeRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {seg.filter(sg => sg.k !== 'planning').map(sg => (
                  <TouchableOpacity
                    key={sg.k}
                    onPress={() => {
                      setType(sg.k === 'planning' ? (planningSeg[0]?.k || 'debt') : sg.k);
                      setSmartOpen(false);
                      setShowMore(false);
                    }}
                    style={[s.typeBtn, s.typeBtnEntry, { backgroundColor: (sg.k === 'planning' ? isPlanningAction : type === sg.k) ? th.primary : 'transparent' }]}
                  >
                    <Text style={{ color: (sg.k === 'planning' ? isPlanningAction : type === sg.k) ? th.onPrimary : th.sub, ...weight('900'), fontSize: 12, lineHeight: 16 }}>
                      {sg.l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {false && isMoneyEntry ? (
              <TouchableOpacity
                onPress={() => {
                  setShowMore(current => !current);
                  if (showMore) setSmartOpen(false);
                }}
                style={[s.moreToggle, { backgroundColor: showMore ? th.primSoft : th.cardHigh, borderColor: showMore ? th.primary : th.border, flexDirection: rowDir }]}
              >
                <View style={[s.moreIcon, { backgroundColor: showMore ? th.card : th.primSoft }]}>
                  <Ionicons name={showMore ? 'options-outline' : 'add-outline'} size={16} color={th.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: showMore ? th.primary : th.text, fontSize: 13, ...weight('900'), textAlign: align }}>{moreLabel}</Text>
                </View>
                <Ionicons name={showMore ? 'chevron-up-outline' : 'chevron-down-outline'} size={17} color={showMore ? th.primary : th.faint} />
              </TouchableOpacity>
            ) : null}

            {false && !isEdit && isPlanningAction && !isContextualPlanningLaunch && !focusedEntry && (
              <View style={[s.planTypeRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {planningSeg.map(item => (
                  <TouchableOpacity
                    key={item.k}
                    onPress={() => setType(item.k)}
                    style={[s.planTypeBtn, { backgroundColor: type === item.k ? th.primSoft : 'transparent', borderColor: type === item.k ? th.primary : 'transparent' }]}
                  >
                    <Text style={{ color: type === item.k ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>{item.l}</Text>
                  </TouchableOpacity>
                ))}
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

            {isSmartLaunch ? (
              <View style={[s.smartBox, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <View style={[s.smartToolbar, { flexDirection: rowDir }]}>
                  {smartModes.map(item => {
                    const active = item.key === 'media'
                      ? ['receipt', 'camera', 'image'].includes(smartMode)
                      : smartMode === item.key;
                    const recording = item.key === 'voice' && voiceRecording;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        onPress={item.onPress}
                        disabled={mediaBusy || (voiceRecording && item.key !== 'voice')}
                        style={[s.smartModeBtn, { backgroundColor: recording ? th.expBg : active ? th.primary : th.card, borderColor: recording ? th.exp : active ? th.primary : 'transparent', opacity: mediaBusy ? 0.55 : 1 }]}
                      >
                        <Ionicons name={item.icon} size={18} color={recording ? th.exp : active ? th.onPrimary : th.sub} />
                        <Text numberOfLines={1} style={{ color: recording ? th.exp : active ? th.onPrimary : th.sub, fontSize: 12, ...weight('900') }}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {voiceRecording ? (
                  <Text style={{ color: th.exp, fontSize: 12, ...weight('900'), textAlign: align, marginTop: 8 }}>
                    {smartLabels.listening} {recordingSeconds}s
                  </Text>
                ) : mediaBusy ? (
                  <Text style={{ color: th.primary, fontSize: 12, ...weight('900'), textAlign: align, marginTop: 8 }}>{smartLabels.processing}</Text>
                ) : receiptImageUri && ['receipt', 'camera', 'image'].includes(smartMode) ? (
                  <View style={[s.mediaPreview, { backgroundColor: th.card, flexDirection: rowDir, marginTop: 8 }]}>
                    <Image source={{ uri: receiptImageUri }} style={s.receiptThumb} />
                    <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), flex: 1, textAlign: align }}>{smartLabels.imageReady}</Text>
                  </View>
                ) : voiceUri && smartMode === 'voice' ? (
                  <View style={[s.mediaPreview, { backgroundColor: th.card, flexDirection: rowDir, marginTop: 8 }]}>
                    <Ionicons name="mic-outline" size={18} color={th.primary} />
                    <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), flex: 1, textAlign: align }}>{smartLabels.voiceReady}</Text>
                  </View>
                ) : null}
                {!!voiceError && smartMode === 'voice' ? (
                  <Text style={{ color: th.exp, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align, marginTop: 8 }}>{voiceError}</Text>
                ) : null}
                {smartOpen && smartMode === 'text' ? (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      value={smartText}
                      onChangeText={setSmartText}
                      placeholder={smartLabels.placeholder}
                      placeholderTextColor={th.sub}
                      multiline
                      style={[s.smartInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                    />
                    <View style={[s.smartFooter, { flexDirection: rowDir }]}>
                      <TouchableOpacity onPress={pasteSmartText} style={[s.secondaryMini, { backgroundColor: th.card }]}>
                        <Text style={{ color: th.sub, fontSize: 12, ...weight('900') }}>{smartLabels.paste}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={applySmartPanel} style={[s.primaryMini, { backgroundColor: th.primary }]}>
                        <Text style={{ color: th.onPrimary, fontSize: 12, ...weight('900') }}>{smartLabels.apply}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {false && showMore && isMoneyEntry && (
              <View style={[smartOpen ? s.smartBox : s.smartBoxCompact, { backgroundColor: smartOpen ? th.cardHigh : 'transparent', borderColor: smartOpen ? th.border : 'transparent' }]}>
                <View style={[s.smartToolbar, { flexDirection: rowDir }]}>
                  {smartModes.map(item => {
                    const matchesMode = item.key === 'media'
                      ? ['receipt', 'camera', 'image'].includes(smartMode)
                      : smartMode === item.key;
                    const matchesSource = item.key === 'media'
                      ? ['receipt', 'camera', 'image'].includes(smartSource?.mode)
                      : smartSource?.mode === item.key;
                    const active = matchesMode && (item.key === 'text' || smartOpen || matchesSource);
                    const recording = item.key === 'voice' && voiceRecording;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        onPress={item.onPress}
                        disabled={mediaBusy || (voiceRecording && item.key !== 'voice')}
                        style={[
                          s.smartModeBtn,
                          {
                            backgroundColor: recording ? th.expBg : active ? th.primary : th.cardHigh,
                            borderColor: recording ? th.exp : active ? th.primary : 'transparent',
                            opacity: mediaBusy ? 0.55 : 1,
                          },
                        ]}
                      >
                        <Ionicons name={item.icon} size={18} color={recording ? th.exp : active ? th.onPrimary : th.sub} />
                        <Text numberOfLines={1} style={{ color: recording ? th.exp : active ? th.onPrimary : th.sub, fontSize: 12, ...weight('900') }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {smartOpen ? (
                  <View style={{ marginTop: 10 }}>
                    {voiceRecording ? (
                      <Text style={{ color: th.exp, fontSize: 12, ...weight('900'), textAlign: align, marginBottom: 6 }}>
                        {smartLabels.listening} {recordingSeconds}s
                        {!voicePreviewLive ? (cfg.lang === 'ar' ? ' — سيظهر النص بعد الإيقاف' : ' — text appears after stopping') : ''}
                      </Text>
                    ) : mediaBusy ? (
                      <Text style={{ color: th.primary, fontSize: 12, ...weight('900'), textAlign: align, marginBottom: 8 }}>{smartLabels.processing}</Text>
                    ) : receiptImageUri && ['receipt', 'camera', 'image'].includes(smartMode) ? (
                      <View style={[s.mediaPreview, { backgroundColor: th.card, flexDirection: rowDir }]}>
                        <Image source={{ uri: receiptImageUri }} style={s.receiptThumb} />
                        <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), flex: 1, textAlign: align }}>{smartLabels.imageReady}</Text>
                      </View>
                    ) : voiceUri && smartMode === 'voice' ? (
                      <View style={[s.mediaPreview, { backgroundColor: th.card, flexDirection: rowDir }]}>
                        <Ionicons name="mic-outline" size={18} color={th.primary} />
                        <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), flex: 1, textAlign: align }}>{smartLabels.voiceReady}</Text>
                      </View>
                    ) : null}
                    {!!voiceError && smartMode === 'voice' ? (
                      <Text style={{ color: th.exp, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align, marginBottom: 6 }}>{voiceError}</Text>
                    ) : null}
                    {smartMode === 'text' ? (
                      <>
                        <TextInput
                          value={smartText}
                          onChangeText={setSmartText}
                          placeholder={smartLabels.placeholder}
                          placeholderTextColor={th.sub}
                          multiline
                          style={[s.smartInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                        />
                        <View style={[s.smartFooter, { flexDirection: rowDir }]}>
                          <TouchableOpacity onPress={pasteSmartText} style={[s.secondaryMini, { backgroundColor: th.card }]}>
                            <Text style={{ color: th.sub, fontSize: 12, ...weight('900') }}>{smartLabels.paste}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={applySmartPanel} style={[s.primaryMini, { backgroundColor: th.primary }]}>
                            <Text style={{ color: th.onPrimary, fontSize: 12, ...weight('900') }}>{smartLabels.apply}</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}

            {type === 'transfer' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{fromLabel}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 10 }}
                  contentContainerStyle={{ flexDirection: rowDir }}
                >
                  {eligibleTransferWallets.map(wallet => {
                    const active = fromWalletId === wallet.id;
                    return (
                      <TouchableOpacity
                        key={wallet.id}
                        onPress={() => {
                          setFromWalletId(wallet.id);
                          const nextTarget = eligibleTransferWallets.find(candidate => candidate.id !== wallet.id);
                          setToWalletId(nextTarget?.id || wallet.id);
                        }}
                        style={[
                          s.walletChip,
                          {
                            backgroundColor: active ? th.primSoft : th.cardHigh,
                            borderColor: active ? th.primary : 'transparent',
                            marginRight: cfg.lang === 'ar' ? 0 : 8,
                            marginLeft: cfg.lang === 'ar' ? 8 : 0,
                          },
                        ]}
                      >
                        <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                        <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800'), textAlign: align }}>
                          {getWalletLabel(wallet, cfg.lang)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={[s.label, { color: th.sub }]}>{toLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rowDir }}>
                  {transferTargetWallets.map(wallet => {
                    const active = toWalletId === wallet.id;
                    return (
                      <TouchableOpacity
                        key={wallet.id}
                        onPress={() => setToWalletId(wallet.id)}
                        style={[
                          s.walletChip,
                          {
                            backgroundColor: active ? th.primSoft : th.cardHigh,
                            borderColor: active ? th.primary : 'transparent',
                            opacity: fromWalletId === wallet.id ? 0.45 : 1,
                            marginRight: cfg.lang === 'ar' ? 0 : 8,
                            marginLeft: cfg.lang === 'ar' ? 8 : 0,
                          },
                        ]}
                      >
                        <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                        <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800'), textAlign: align }}>
                          {getWalletLabel(wallet, cfg.lang)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {lockedDebt && selectedDebt && (
              <View style={[s.lockedPick, { backgroundColor: selectedDebtReceivable ? th.incBg : th.expBg, borderColor: debtColor }]}>
                <Ionicons name={selectedDebtReceivable ? 'cash-outline' : 'card-outline'} size={16} color={debtColor} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: debtColor, ...weight('900'), fontSize: 11, marginBottom: 2 }}>
                    {cfg.lang === 'ar' ? (selectedDebtReceivable ? 'دين لي' : 'دين عليّ') : (selectedDebtReceivable ? 'Debt owed to me' : 'Debt I owe')}
                  </Text>
                  <Text style={{ color: debtColor, ...weight('900'), fontSize: 13 }}>{selectedDebt.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{L.remainingOf} {fmt(selectedDebt.total - selectedDebt.paid)} {sym}</Text>
                </View>
              </View>
            )}

            {type === 'debt' && !isEdit && !lockedDebt && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{L.selectDebt}</Text>
                {availableDebts.length === 0 ? (
                  <Text style={{ color: th.faint, fontSize: 12 }}>{L.noDebtsHint}</Text>
                ) : availableDebts.map(d => {
                  const receivable = d.direction === 'receivable';
                  const active = selDebt === d.id;
                  const tone = receivable ? th.inc : th.exp;
                  return (
                    <TouchableOpacity key={d.id} onPress={() => setSelDebt(d.id)}
                      style={[s.pickRow, { backgroundColor: active ? (receivable ? th.incBg : th.expBg) : th.cardHigh, borderColor: active ? tone : 'transparent' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: tone, ...weight('900'), fontSize: 11, marginBottom: 2 }}>
                          {cfg.lang === 'ar' ? (receivable ? 'دين لي' : 'دين عليّ') : (receivable ? 'Debt owed to me' : 'Debt I owe')}
                        </Text>
                        <Text style={{ color: active ? tone : th.text, ...weight('700'), fontSize: 13 }}>{d.name}</Text>
                      </View>
                      <Text style={{ color: th.sub, fontSize: 12 }}>{L.remainingOf} {fmt(d.total - d.paid)} {sym}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {lockedGoal && selectedGoal && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="flag-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{selectedGoal.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{L.remainingOf} {fmt(selectedGoal.target - selectedGoal.cur)} {sym}</Text>
                </View>
              </View>
            )}

            {type === 'goal' && !isEdit && !lockedGoal && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{L.selectGoal}</Text>
                {availableGoals.length === 0 ? (
                  <Text style={{ color: th.faint, fontSize: 12 }}>{L.noGoalsHint}</Text>
                ) : availableGoals.map(g => (
                  <TouchableOpacity key={g.id} onPress={() => setSelGoal(g.id)}
                    style={[s.pickRow, { backgroundColor: selGoal === g.id ? th.primSoft : th.cardHigh, borderColor: selGoal === g.id ? th.primary : 'transparent' }]}>
                    <Text style={{ color: selGoal === g.id ? th.primary : th.text, ...weight('700'), fontSize: 13 }}>{g.name}</Text>
                    <Text style={{ color: th.sub, fontSize: 12 }}>{L.remainingOf} {fmt(g.target - g.cur)} {sym}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {lockedCommitment && selectedCommitment && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="calendar-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{selectedCommitment.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>{Math.round(Number(selectedCommitment.amt || 0)).toLocaleString()} {sym}</Text>
                </View>
              </View>
            )}

            {type === 'commitment' && !isEdit && !lockedCommitment && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{cfg.lang === 'ar' ? 'اختر الالتزام' : 'Select commitment'}</Text>
                {availableCommitments.filter(item => item.active !== false).length === 0 ? (
                  <Text style={{ color: th.faint, fontSize: 12 }}>{cfg.lang === 'ar' ? 'لا توجد التزامات مفعلة' : 'No active commitments'}</Text>
                ) : availableCommitments.filter(item => item.active !== false).map(item => (
                  <TouchableOpacity key={item.id} onPress={() => { setSelCommitment(item.id); setWalletId(item.walletId || defaultWalletId); }}
                    style={[s.pickRow, { backgroundColor: selCommitment === item.id ? th.primSoft : th.cardHigh, borderColor: selCommitment === item.id ? th.primary : 'transparent' }]}>
                    <Text style={{ color: selCommitment === item.id ? th.primary : th.text, ...weight('700'), fontSize: 13 }}>{item.name}</Text>
                    <Text style={{ color: th.sub, fontSize: 12 }}>{Math.round(Number(item.amt || 0)).toLocaleString()} {sym}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isMoneyEntry && (
              <View style={[s.moneyFields, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.amount}</Text>
                <TextInput value={amt} onChangeText={(value) => setAmt(formatNumberInput(value))} keyboardType="numeric"
                  placeholder={`0 ${sym}`} placeholderTextColor={th.faint}
                  style={[s.amountInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]} />
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.titleField}</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={defaultTitle}
                  placeholderTextColor={th.faint}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                />
                <DateField
                  value={dateISO}
                  onChange={setDateISO}
                  th={th}
                  lang={cfg.lang}
                  label={cfg.lang === 'ar' ? 'التاريخ' : 'Date'}
                />
              </View>
            )}

            {modules.wallets && walletList.length > 0 && type !== 'transfer' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub, textAlign: align }]}>{walletLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rowDir }}>
                  {walletList.map(wallet => {
                    const active = walletId === wallet.id;
                    return (
                      <TouchableOpacity
                        key={wallet.id}
                        onPress={() => setWalletId(wallet.id)}
                        style={[
                          s.walletChip,
                          {
                            backgroundColor: active ? th.primSoft : th.cardHigh,
                            borderColor: active ? th.primary : 'transparent',
                            marginRight: cfg.lang === 'ar' ? 0 : 8,
                            marginLeft: cfg.lang === 'ar' ? 8 : 0,
                          },
                        ]}
                      >
                        <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                        <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800'), textAlign: align }}>
                          {getWalletLabel(wallet, cfg.lang)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

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
              <View style={[s.lockedPick, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Ionicons name="cash-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, ...weight('900'), fontSize: 13 }}>
                    {cfg.lang === 'ar' ? 'المبلغ المسجل لهذا الالتزام' : 'Saved amount for this commitment'}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 12 }}>
                    {Math.round(Number(selectedCommitment?.amt || 0)).toLocaleString()} {sym}
                  </Text>
                </View>
              </View>
              <DateField
                value={dateISO}
                onChange={setDateISO}
                th={th}
                lang={cfg.lang}
                label={cfg.lang === 'ar' ? 'تاريخ الدفع' : 'Payment date'}
                style={{ marginBottom: 12 }}
              />
              </>
            ) : !isMoneyEntry ? (
              <View style={{ marginBottom: 12 }}>
                <TextInput value={amt} onChangeText={(value) => setAmt(formatNumberInput(value))} keyboardType="numeric"
                  placeholder={`${L.amount} (${sym})`} placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]} />
                <DateField
                  value={dateISO}
                  onChange={setDateISO}
                  th={th}
                  lang={cfg.lang}
                  label={cfg.lang === 'ar' ? 'التاريخ' : 'Date'}
                />
              </View>
            ) : null}

            {isMoneyEntry && (
              <>
                <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.cat}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 12 }}
                  contentContainerStyle={{ flexDirection: rowDir }}
                >
                  {cats.map(c => (
                    <TouchableOpacity key={c.id} onPress={() => { setCat(c.id); setCategoryTouched(true); }}
                      style={[
                        s.catChip,
                        {
                          backgroundColor: cat === c.id ? c.color + '33' : th.cardHigh,
                          borderColor: cat === c.id ? c.color : 'transparent',
                          marginRight: cfg.lang === 'ar' ? 0 : 8,
                          marginLeft: cfg.lang === 'ar' ? 8 : 0,
                        },
                      ]}>
                      <Ionicons name={c.icon || 'cube-outline'} size={16} color={c.color} />
                      <Text style={{ color: cat === c.id ? c.color : th.sub, fontSize: 12, ...weight('700'), textAlign: align }}>
                        {cfg.lang === 'ar' ? c.label : c.labelEn}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {false && <TouchableOpacity
                  onPress={() => {
                    setShowMore(current => !current);
                    if (showMore) setSmartOpen(false);
                  }}
                  style={[s.moreToggle, { backgroundColor: showMore ? th.primSoft : th.cardHigh, borderColor: showMore ? th.primary : th.border, flexDirection: rowDir }]}
                >
                  <View style={[s.moreIcon, { backgroundColor: showMore ? th.card : th.primSoft }]}>
                    <Ionicons name={showMore ? 'options-outline' : 'add-outline'} size={16} color={th.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: showMore ? th.primary : th.text, fontSize: 13, ...weight('900'), textAlign: align }}>{moreLabel}</Text>
                  </View>
                  <Ionicons name={showMore ? 'chevron-up-outline' : 'chevron-down-outline'} size={17} color={showMore ? th.primary : th.faint} />
                </TouchableOpacity>}

                {false && showMore ? <>
                <View style={[s.smartBoxCompact, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                  <View style={[s.smartToolbar, { flexDirection: rowDir }]}>
                    {smartModes.map(item => {
                      const active = item.key === 'media'
                        ? ['receipt', 'camera', 'image'].includes(smartMode)
                        : smartMode === item.key;
                      const recording = item.key === 'voice' && voiceRecording;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          onPress={item.onPress}
                          disabled={mediaBusy || (voiceRecording && item.key !== 'voice')}
                          style={[s.smartModeBtn, { backgroundColor: recording ? th.expBg : active ? th.primary : th.card, borderColor: recording ? th.exp : active ? th.primary : 'transparent', opacity: mediaBusy ? 0.55 : 1 }]}
                        >
                          <Ionicons name={item.icon} size={18} color={recording ? th.exp : active ? th.onPrimary : th.sub} />
                          <Text numberOfLines={1} style={{ color: recording ? th.exp : active ? th.onPrimary : th.sub, fontSize: 12, ...weight('900') }}>{item.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {smartOpen && smartMode === 'text' ? (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        value={smartText}
                        onChangeText={setSmartText}
                        placeholder={smartLabels.placeholder}
                        placeholderTextColor={th.sub}
                        multiline
                        style={[s.smartInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                      />
                      <View style={[s.smartFooter, { flexDirection: rowDir }]}>
                        <TouchableOpacity onPress={pasteSmartText} style={[s.secondaryMini, { backgroundColor: th.card }]}>
                          <Text style={{ color: th.sub, fontSize: 12, ...weight('900') }}>{smartLabels.paste}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={applySmartPanel} style={[s.primaryMini, { backgroundColor: th.primary }]}>
                          <Text style={{ color: th.onPrimary, fontSize: 12, ...weight('900') }}>{smartLabels.apply}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
                <TextInput value={note} onChangeText={setNote}
                  placeholder={L.note} placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]} />

                {modules.recurring ? (
                  <View style={{ marginBottom: 16 }}>
                    <View style={s.rowBetween}>
                      <TouchableOpacity onPress={() => setRecurring(r => !r)}
                        style={[s.toggleBtn, { backgroundColor: recurring ? th.primSoft : th.cardHigh, borderColor: recurring ? th.primary : 'transparent' }]}>
                        <Ionicons name="repeat" size={13} color={recurring ? th.primary : th.sub} />
                        <Text style={{ color: recurring ? th.primary : th.sub, fontSize: 12, ...weight('700') }}> {L.recurring}</Text>
                      </TouchableOpacity>
                    </View>
                    {recurring ? (
                      <View style={[s.recurringNote, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDir }]}>
                        <Ionicons name="shield-checkmark-outline" size={15} color={th.primary} />
                        <Text style={{ color: th.sub, fontSize: 11, lineHeight: 17, ...weight('700'), flex: 1, textAlign: align }}>
                          {cfg.lang === 'ar'
                            ? 'تذكير شهري فقط: لن تُسجّل الحركة أو تُخصم إلا بعد مراجعتك وتأكيدك.'
                            : 'Monthly reminder only: nothing is recorded or deducted until you review and confirm it.'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                </> : null}
              </>
            )}

            {isEdit ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={handleDelete}
                  style={[s.halfBtn, { backgroundColor: th.expBg, borderColor: th.exp, borderWidth: 1 }]}>
                  <Text style={{ color: th.exp, ...weight('700'), fontSize: 14 }}>{L.delete}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave}
                  style={[s.halfBtn, { backgroundColor: finalSaveColor, flex: 2 }]}>
                  <Text style={{ color: '#fff', ...weight('800'), fontSize: 15 }}>{L.save}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={handleSave} style={[s.saveBtn, { backgroundColor: finalSaveColor }]}>
                <Text style={{ color: '#fff', ...weight('800'), fontSize: 15 }}>{finalSaveLabel}</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  dismissArea:{ flex: 1, justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.huge, ...SHADOW.float },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  headRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:      { flex: 1, fontSize: 18, lineHeight: 24, ...weight('900') },
  typeRow:    { borderRadius: 8, padding: 4, marginBottom: 12, gap: 4 },
  typeBtn:    { flex: 1, minHeight: 42, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  typeBtnEntry: { flex: 1, minWidth: 0 },
  planTypeRow:{ borderRadius: 14, padding: 4, marginTop: -8, marginBottom: 16, gap: 4 },
  planTypeBtn:{ flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  label:      { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  fieldLabel: { fontSize: 12, lineHeight: 18, ...weight('900'), marginBottom: 6 },
  moneyFields:{ borderRadius: 8, borderWidth: 1, padding: 12, marginBottom: 12 },
  pickRow:    { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lockedPick: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  input:      { minHeight: 46, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, marginBottom: 10, fontSize: 14, lineHeight: 19, ...weight('700') },
  amountInput:{ minHeight: 54, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 0.5, marginBottom: 10, fontSize: 22, lineHeight: 28, ...weight('900') },
  dateChip:   { minHeight: 46, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  catChip:    { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, marginRight: 8, borderWidth: 1, gap: 4, minWidth: 68 },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginRight: 8, borderWidth: 1 },
  moreToggle: { minHeight: 54, borderRadius: 8, borderWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 12 },
  moreIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smartBox:   { borderWidth: 0.5, borderRadius: 8, padding: 10, marginBottom: 10 },
  smartBoxCompact:{ borderWidth: 0.5, borderRadius: 8, marginBottom: 10 },
  smartToolbar:{ alignItems: 'stretch', gap: 7 },
  smartModeBtn:{ flex: 1, minHeight: 52, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  smartInput: { minHeight: 88, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, fontSize: 13, lineHeight: 19, ...weight('700'), textAlignVertical: 'top' },
  smartFooter:{ gap: 8, marginTop: 8 },
  smartSourceNote:{ minHeight: 40, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  mediaPreview:{ alignItems: 'center', gap: 8, borderRadius: 12, padding: 8, marginBottom: 8 },
  receiptThumb:{ width: 44, height: 44, borderRadius: 10 },
  secondaryMini:{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryMini:{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  recurringNote: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8 },
  saveBtn:    { minHeight: 52, borderRadius: 15, padding: 15, alignItems: 'center', justifyContent: 'center' },
  halfBtn:    { flex: 1, minHeight: 50, borderRadius: 15, padding: 14, alignItems: 'center', justifyContent: 'center' },
});

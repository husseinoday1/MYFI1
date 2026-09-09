// MaalFlow §112 — OCR / voice privacy gate.
//
// Smart capture does not process anything on the device. A receipt photo is sent to
// OpenAI and/or Google Gemini, and a voice note is uploaded as raw audio to OpenAI for
// transcription before its text is analysed. The user has to be told that before the
// first capture of each kind, not buried in terms they accepted for something else.
//
// Two separate consents, because the two features send different data about different
// things: a photo of a receipt is not the same disclosure as a recording of your voice.
// Account/sync consent (`cfg.accountConsentAccepted`) is a third, unrelated thing and
// must never be read as permission for either of these.
//
// Consent is stored as the version of the disclosure the user actually saw, not as a
// boolean. If the providers or the scope of what leaves the device ever change, bump
// the version and every user is asked again instead of silently inheriting a consent
// they gave to a different statement.
import { Alert } from 'react-native';

export const SMART_CAPTURE_CONSENT_VERSION = 1;

export const SMART_CAPTURE_KINDS = ['image', 'voice'];

export const consentFieldForKind = kind => (
  kind === 'voice' ? 'smartCaptureVoiceConsent' : 'smartCaptureImageConsent'
);

export const hasSmartCaptureConsent = (cfg, kind) => (
  Number(cfg?.[consentFieldForKind(kind)] || 0) >= SMART_CAPTURE_CONSENT_VERSION
);

export const smartCaptureDisclosure = (kind, lang = 'ar') => {
  const ar = lang === 'ar';
  const voice = kind === 'voice';
  if (ar) {
    return {
      title: voice ? 'قبل التسجيل الصوتي' : 'قبل تصوير الفاتورة',
      body: voice
        ? 'لتحويل كلامك إلى عملية مالية، يُرفع التسجيل الصوتي نفسه إلى خدمة ذكاء اصطناعي '
          + 'خارجية (OpenAI، وقد تُستخدم Google لتحليل النص الناتج).\n\n'
          + 'صوتك يغادر هاتفك. MaalFlow لا يحتفظ بالتسجيل، لكن لا نتحكّم بما تفعله تلك '
          + 'الخدمة به.\n\n'
          + 'هذه الميزة اختيارية بالكامل — تستطيع إدخال أي عملية يدوياً دون تفعيلها.'
        : 'لقراءة المبلغ والتفاصيل من الفاتورة، تُرسل الصورة إلى خدمة ذكاء اصطناعي '
          + 'خارجية (OpenAI أو Google).\n\n'
          + 'صورة الفاتورة قد تحتوي اسمك، وآخر أرقام بطاقتك، والمتجر، ومشترياتك كاملة. '
          + 'وهي تغادر هاتفك. MaalFlow لا يحتفظ بالصورة، لكن لا نتحكّم بما تفعله تلك '
          + 'الخدمة بها.\n\n'
          + 'هذه الميزة اختيارية بالكامل — تستطيع إدخال أي عملية يدوياً دون تفعيلها.',
      agree: 'أوافق، تابع',
      decline: 'لا، أدخلها يدوياً',
    };
  }
  return {
    title: voice ? 'Before recording' : 'Before scanning a receipt',
    body: voice
      ? 'To turn speech into a transaction, the recording itself is uploaded to a '
        + 'third-party AI service (OpenAI, and Google may analyse the resulting text).\n\n'
        + 'Your voice leaves this phone. MaalFlow does not keep the recording, but we do '
        + 'not control what that service does with it.\n\n'
        + 'This feature is entirely optional — you can enter any transaction by hand.'
      : 'To read the amount and details, the photo is sent to a third-party AI service '
        + '(OpenAI or Google).\n\n'
        + 'A receipt can carry your name, your card tail, the merchant, and everything you '
        + 'bought. It leaves this phone. MaalFlow does not keep the image, but we do not '
        + 'control what that service does with it.\n\n'
        + 'This feature is entirely optional — you can enter any transaction by hand.',
    agree: 'Agree and continue',
    decline: 'No, enter it manually',
  };
};

// Resolves true only when the user has consented to THIS disclosure version. Never
// grants itself: a decline leaves the stored consent untouched, so the next attempt
// asks again rather than remembering a refusal as a permanent opt-out.
export const requestSmartCaptureConsent = async ({ cfg, setCfg, kind, lang = 'ar' }) => {
  if (hasSmartCaptureConsent(cfg, kind)) return true;
  const text = smartCaptureDisclosure(kind, lang);
  const accepted = await new Promise(resolve => {
    Alert.alert(text.title, text.body, [
      { text: text.decline, style: 'cancel', onPress: () => resolve(false) },
      { text: text.agree, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
  if (!accepted) return false;
  await setCfg({ [consentFieldForKind(kind)]: SMART_CAPTURE_CONSENT_VERSION });
  return true;
};

export const revokeSmartCaptureConsent = async ({ setCfg, kind }) => {
  await setCfg({ [consentFieldForKind(kind)]: 0 });
};

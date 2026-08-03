import { Platform } from 'react-native';

const getSpeechRecognition = () => {
  if (Platform.OS !== 'web') return null;
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
};

export const startLiveSpeechPreview = ({ lang = 'ar', onText, onError } = {}) => {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    return {
      supported: false,
      stop() {},
      abort() {},
    };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result?.[0]?.transcript || '')
      .join(' ')
      .trim();
    if (transcript) onText?.(transcript);
  };

  recognition.onerror = (event) => {
    onError?.(event?.error || 'speech_error');
  };

  recognition.start();

  return {
    supported: true,
    stop() {
      try {
        recognition.stop();
      } catch {}
    },
    abort() {
      try {
        recognition.abort();
      } catch {}
    },
  };
};

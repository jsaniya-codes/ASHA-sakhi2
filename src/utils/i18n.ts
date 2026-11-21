import type { ActiveWorkspaceView, AppLanguage, VisitLanguage } from '../types';
import { parseApiResponse } from './apiClient';

export const APP_LANGUAGE_OPTIONS: Array<{
  code: AppLanguage;
  label: string;
  native: string;
  bcp47: string;
}> = [
  { code: 'en', label: 'English (English)', native: 'English', bcp47: 'en-IN' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)', native: 'ಕನ್ನಡ', bcp47: 'kn-IN' },
  { code: 'hi', label: 'Hindi (हिन्दी)', native: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'te', label: 'Telugu (తెలుగు)', native: 'తెలుగు', bcp47: 'te-IN' },
  { code: 'ta', label: 'Tamil (தமிழ்)', native: 'தமிழ்', bcp47: 'ta-IN' },
  { code: 'mr', label: 'Marathi (मराठी)', native: 'मराठी', bcp47: 'mr-IN' },
];

export function toVisitLanguage(lang: AppLanguage): VisitLanguage {
  if (lang === 'kn' || lang === 'hi' || lang === 'en') return lang;
  return 'en';
}

export function getBcp47ForLanguage(lang: AppLanguage): string {
  return APP_LANGUAGE_OPTIONS.find((l) => l.code === lang)?.bcp47 || 'en-IN';
}

interface UiDictionary {
  tagline: string;
  mainActions: string;
  moreRecords: string;
  listenToPage: string;
  stopListening: string;
  signInTitle: string;
  signInSub: string;
  signOut: string;
  nav: Record<ActiveWorkspaceView, string>;
}

const EN_DICT: UiDictionary = {
  tagline: 'Your Simple Voice Healthcare Assistant',
  mainActions: 'Main Health Actions',
  moreRecords: 'More Records',
  listenToPage: 'Listen to page',
  stopListening: 'Stop audio',
  signInTitle: 'ASHA Worker Sign In',
  signInSub: 'Tap to sign in',
  signOut: 'Sign Out',
  nav: {
    'speak-record': 'Speak & Record',
    'explain-video': 'Explain with Video',
    'visit-register': 'Visit Register',
    'schedule-calendar': 'Schedule Calendar',
    'danger-alerts': 'Danger Alerts',
    'maternal-child': 'Maternal & Child',
    'patient-notifications': 'Patient Updates',
    'village-families': 'Village Families',
    'people-directory': 'People Directory',
    'community-surveys': 'Community Surveys',
    'health-checkup': 'Health Checkup',
    'health-histories': 'Health Histories',
    reports: 'Reports',
    'state-overview': 'State Overview',
    'data-files': 'Data Files',
  },
};

const KN_DICT: UiDictionary = {
  tagline: 'ನಿಮ್ಮ ಸರಳ ಧ್ವನಿ ಆರೋಗ್ಯ ಸಹಾಯಕ',
  mainActions: 'ಮುಖ್ಯ ಆರೋಗ್ಯ ಕ್ರಿಯೆಗಳು',
  moreRecords: 'ಹೆಚ್ಚಿನ ದಾಖಲೆಗಳು',
  listenToPage: 'ಪುಟವನ್ನು ಕೇಳಿ',
  stopListening: 'ಧ್ವನಿ ನಿಲ್ಲಿಸಿ',
  signInTitle: 'ಆಶಾ ಕಾರ್ಯಕರ್ತೆ ಸೈನ್ ಇನ್',
  signInSub: 'ಸೈನ್ ಇನ್ ಮಾಡಲು ಒತ್ತಿರಿ',
  signOut: 'ಸೈನ್ ಔಟ್',
  nav: {
    'speak-record': 'ಮಾತನಾಡಿ ಮತ್ತು ದಾಖಲಿಸಿ',
    'explain-video': 'ವೀಡಿಯೊ ಮೂಲಕ ವಿವರಿಸಿ',
    'visit-register': 'ಭೇಟಿ ನೋಂದಣಿ',
    'schedule-calendar': 'ವೇಳಾಪಟ್ಟಿ ಕ್ಯಾಲೆಂಡರ್',
    'danger-alerts': 'ಅಪಾಯದ ಎಚ್ಚರಿಕೆಗಳು',
    'maternal-child': 'ತಾಯಿ ಮತ್ತು ಮಗು',
    'patient-notifications': 'ರೋಗಿ ಸಂದೇಶಗಳು',
    'village-families': 'ಗ್ರಾಮದ ಕುಟುಂಬಗಳು',
    'people-directory': 'ಜನರ ಪಟ್ಟಿ',
    'community-surveys': 'ಸಮುದಾಯ ಸಮೀಕ್ಷೆಗಳು',
    'health-checkup': 'ಆರೋಗ್ಯ ತಪಾಸಣೆ',
    'health-histories': 'ಆರೋಗ್ಯ ಇತಿಹಾಸ',
    reports: 'ವರದಿಗಳು',
    'state-overview': 'ರಾಜ್ಯದ ಅವಲೋಕನ',
    'data-files': 'ಡೇಟಾ ಫೈಲ್‌ಗಳು',
  },
};

const HI_DICT: UiDictionary = {
  tagline: 'आपका सरल वॉइस स्वास्थ्य सहायक',
  mainActions: 'मुख्य स्वास्थ्य कार्य',
  moreRecords: 'अधिक रिकॉर्ड',
  listenToPage: 'पेज सुनें',
  stopListening: 'ऑडियो रोकें',
  signInTitle: 'आशा कार्यकर्ता साइन इन',
  signInSub: 'साइन इन करने के लिए टैप करें',
  signOut: 'साइन आउट',
  nav: {
    'speak-record': 'बोलें और रिकॉर्ड करें',
    'explain-video': 'वीडियो से समझाएं',
    'visit-register': 'भेंट रजिस्टर',
    'schedule-calendar': 'अनुसूची कैलेंडर',
    'danger-alerts': 'खतरे की चेतावनी',
    'maternal-child': 'मातृ एवं शिशु',
    'patient-notifications': 'रोगी सूचनाएं',
    'village-families': 'गाँव के परिवार',
    'people-directory': 'व्यक्ति निर्देशिका',
    'community-surveys': 'सामुदायिक सर्वेक्षण',
    'health-checkup': 'स्वास्थ्य जांच',
    'health-histories': 'स्वास्थ्य इतिहास',
    reports: 'रिपोर्ट',
    'state-overview': 'राज्य अवलोकन',
    'data-files': 'डेटा फ़ाइलें',
  },
};

export function getUiText(lang: AppLanguage): UiDictionary {
  if (lang === 'kn') return KN_DICT;
  if (lang === 'hi') return HI_DICT;
  return EN_DICT;
}

export type SpeechPlaybackStatus = 'idle' | 'loading' | 'speaking' | 'paused';

export interface VoiceChoiceOption {
  id: string; // 'server:Kore' | 'server:Puck' | 'browser:<voiceURI>'
  label: string;
  kind: 'server' | 'browser';
  voiceName?: string;
  voiceURI?: string;
}

export const SERVER_VOICE_OPTIONS: VoiceChoiceOption[] = [
  { id: 'server:Kore', label: 'AshaSakhi AI Voice (Warm Female)', kind: 'server', voiceName: 'Kore' },
  { id: 'server:Zephyr', label: 'AshaSakhi AI Voice (Gentle Female)', kind: 'server', voiceName: 'Zephyr' },
  { id: 'server:Puck', label: 'AshaSakhi AI Voice (Clear Male)', kind: 'server', voiceName: 'Puck' },
];

export function getAvailableVoiceOptions(lang: AppLanguage): VoiceChoiceOption[] {
  const options: VoiceChoiceOption[] = [...SERVER_VOICE_OPTIONS];
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const bcp47 = getBcp47ForLanguage(lang).toLowerCase();
    const langPrefix = lang.toLowerCase();
    const allVoices = window.speechSynthesis.getVoices();
    const matching = allVoices.filter(
      (v) =>
        v.lang.toLowerCase() === bcp47 ||
        v.lang.toLowerCase().startsWith(langPrefix) ||
        v.lang.toLowerCase().includes('-in')
    );
    const chosen = (matching.length > 0 ? matching : allVoices).slice(0, 8);
    chosen.forEach((v) => {
      options.push({
        id: `browser:${v.voiceURI}`,
        label: `Device Voice: ${v.name} (${v.lang})`,
        kind: 'browser',
        voiceURI: v.voiceURI,
      });
    });
  }
  return options;
}

let activeAudioEl: HTMLAudioElement | null = null;
let activeFetchAbort: AbortController | null = null;
let activePlaybackMode: 'none' | 'audio' | 'synthesis' = 'none';
let activeStatus: SpeechPlaybackStatus = 'idle';
let playbackGeneration = 0;
let speechAuthToken: string | null = null;

export function setSpeechAuthToken(token: string | null): void {
  speechAuthToken = token;
}

const statusListeners = new Set<(status: SpeechPlaybackStatus) => void>();

function setPlaybackStatus(next: SpeechPlaybackStatus): void {
  activeStatus = next;
  statusListeners.forEach((fn) => fn(next));
}

export function getSpeechPlaybackStatus(): SpeechPlaybackStatus {
  return activeStatus;
}

export function subscribeSpeechStatus(listener: (status: SpeechPlaybackStatus) => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/**
 * Stops ALL active speech (in-flight server TTS fetch, HTMLAudioElement, and Web SpeechSynthesis)
 * and increments the generation counter so stale async responses can never start overlapping audio.
 */
export function stopAllSpeech(): void {
  playbackGeneration += 1;
  if (activeFetchAbort) {
    activeFetchAbort.abort();
    activeFetchAbort = null;
  }
  if (activeAudioEl) {
    activeAudioEl.onended = null;
    activeAudioEl.onerror = null;
    activeAudioEl.pause();
    activeAudioEl.currentTime = 0;
    activeAudioEl.src = '';
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  activePlaybackMode = 'none';
  setPlaybackStatus('idle');
}

export function pauseActiveSpeech(): boolean {
  if (activePlaybackMode === 'audio' && activeAudioEl && !activeAudioEl.paused) {
    activeAudioEl.pause();
    setPlaybackStatus('paused');
    return true;
  }
  if (
    activePlaybackMode === 'synthesis' &&
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    window.speechSynthesis.speaking &&
    !window.speechSynthesis.paused
  ) {
    window.speechSynthesis.pause();
    setPlaybackStatus('paused');
    return true;
  }
  return false;
}

export async function resumeActiveSpeech(): Promise<boolean> {
  if (activePlaybackMode === 'audio' && activeAudioEl && activeAudioEl.paused) {
    try {
      await activeAudioEl.play();
      setPlaybackStatus('speaking');
      return true;
    } catch {
      return false;
    }
  }
  if (
    activePlaybackMode === 'synthesis' &&
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    window.speechSynthesis.paused
  ) {
    window.speechSynthesis.resume();
    setPlaybackStatus('speaking');
    return true;
  }
  return false;
}

function speakWithBrowserSynthesis(
  cleanText: string,
  lang: AppLanguage,
  generation: number,
  preferredVoiceURI?: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<{ provider: string }> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (generation === playbackGeneration) {
      activePlaybackMode = 'none';
      setPlaybackStatus('idle');
      onEnd?.();
    }
    return Promise.resolve({ provider: 'unavailable' });
  }

  return new Promise((resolve) => {
    if (generation !== playbackGeneration) {
      resolve({ provider: 'cancelled' });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const bcp47 = getBcp47ForLanguage(lang);
    utterance.lang = bcp47;
    utterance.rate = 0.94;

    const voices = window.speechSynthesis.getVoices();
    const matched =
      (preferredVoiceURI ? voices.find((v) => v.voiceURI === preferredVoiceURI) : undefined) ||
      voices.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase()) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase())) ||
      voices.find((v) => v.lang.toLowerCase().includes('-in'));
    if (matched) utterance.voice = matched;

    activePlaybackMode = 'synthesis';

    utterance.onstart = () => {
      if (generation !== playbackGeneration) return;
      setPlaybackStatus('speaking');
      onStart?.();
    };
    utterance.onpause = () => {
      if (generation !== playbackGeneration) return;
      setPlaybackStatus('paused');
    };
    utterance.onresume = () => {
      if (generation !== playbackGeneration) return;
      setPlaybackStatus('speaking');
    };
    utterance.onend = () => {
      if (generation !== playbackGeneration) return;
      activePlaybackMode = 'none';
      setPlaybackStatus('idle');
      onEnd?.();
      resolve({ provider: matched ? `Browser Voice (${matched.name})` : 'Browser Speech Synthesis' });
    };
    utterance.onerror = () => {
      if (generation !== playbackGeneration) return;
      activePlaybackMode = 'none';
      setPlaybackStatus('idle');
      onEnd?.();
      resolve({ provider: 'Browser Speech Synthesis' });
    };

    setPlaybackStatus('speaking');
    onStart?.();
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Speaks text audibly using server-side TTS (/api/ai/tts) or a chosen browser voice,
 * strictly preventing overlapping playback across rapid clicks and supporting pause/resume/stop.
 */
export async function speakTextWithFallback(
  text: string,
  lang: AppLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  options?: { voiceId?: string }
): Promise<{ provider: string }> {
  stopAllSpeech();
  const generation = playbackGeneration;
  const cleanText = text.replace(/\s+/g, ' ').trim().slice(0, 750);
  if (!cleanText) {
    onEnd?.();
    return { provider: 'none' };
  }

  const voiceId = options?.voiceId || 'server:Kore';

  // If user explicitly chose a browser device voice, speak directly with Web Speech Synthesis
  if (voiceId.startsWith('browser:')) {
    const uri = voiceId.slice('browser:'.length);
    return speakWithBrowserSynthesis(cleanText, lang, generation, uri, onStart, onEnd);
  }

  const serverVoiceName = voiceId.startsWith('server:') ? voiceId.slice('server:'.length) : 'Kore';

  // Try server-side TTS (Gnani Vachana / Gemini TTS) with AbortController to prevent race conditions
  const controller = new AbortController();
  activeFetchAbort = controller;
  setPlaybackStatus('loading');

  try {
    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(speechAuthToken ? { Authorization: `Bearer ${speechAuthToken}` } : {}),
      },
      body: JSON.stringify({ text: cleanText, language: lang, voiceName: serverVoiceName }),
    });

    if (generation !== playbackGeneration) {
      return { provider: 'cancelled' };
    }

    if (res.ok) {
      const data = await parseApiResponse<{ audioBase64?: string; mimeType?: string; provider?: string }>(
        res,
        'TTS synthesis failed'
      );

      if (generation !== playbackGeneration) {
        return { provider: 'cancelled' };
      }

      if (data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        activeAudioEl = audio;
        activePlaybackMode = 'audio';

        return await new Promise<{ provider: string }>((resolve) => {
          audio.onended = () => {
            if (generation !== playbackGeneration) return;
            activeAudioEl = null;
            activePlaybackMode = 'none';
            setPlaybackStatus('idle');
            onEnd?.();
            resolve({ provider: data.provider || 'AshaSakhi Voice' });
          };
          audio.onerror = () => {
            if (generation !== playbackGeneration) return;
            activeAudioEl = null;
            activePlaybackMode = 'none';
            // Fall back smoothly to browser speech synthesis if audio playback fails
            void speakWithBrowserSynthesis(cleanText, lang, generation, undefined, onStart, onEnd).then(
              resolve
            );
          };

          audio
            .play()
            .then(() => {
              if (generation !== playbackGeneration) {
                audio.pause();
                resolve({ provider: 'cancelled' });
                return;
              }
              setPlaybackStatus('speaking');
              onStart?.();
            })
            .catch(() => {
              // Autoplay restriction fallback to browser speech synthesis
              activeAudioEl = null;
              activePlaybackMode = 'none';
              if (generation !== playbackGeneration) {
                resolve({ provider: 'cancelled' });
                return;
              }
              void speakWithBrowserSynthesis(cleanText, lang, generation, undefined, onStart, onEnd).then(
                resolve
              );
            });
        });
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { provider: 'cancelled' };
    }
    // Fall through cleanly to browser Web Speech Synthesis
  } finally {
    if (activeFetchAbort === controller) {
      activeFetchAbort = null;
    }
  }

  if (generation !== playbackGeneration) {
    return { provider: 'cancelled' };
  }

  return speakWithBrowserSynthesis(cleanText, lang, generation, undefined, onStart, onEnd);
}

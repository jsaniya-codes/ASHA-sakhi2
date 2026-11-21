import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  PhoneCall,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS, VOICE_FIELD_PRESETS, getDistrictCoords } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import { convertAudioBlobToWav, encodeFloat32SamplesToWav } from '../utils/audioWav';
import {
  APP_LANGUAGE_OPTIONS,
  getAvailableVoiceOptions,
  getBcp47ForLanguage,
  getSpeechPlaybackStatus,
  pauseActiveSpeech,
  resumeActiveSpeech,
  speakTextWithFallback,
  stopAllSpeech,
  subscribeSpeechStatus,
  toVisitLanguage,
  type SpeechPlaybackStatus,
  type VoiceChoiceOption,
} from '../utils/i18n';
import type {
  AppLanguage,
  AuthUser,
  BeneficiaryCategory,
  BeneficiaryGender,
  DangerAlert,
  ExtractedClinicalData,
  FieldVisit,
  PersonRecord,
  RiskLevel,
  VoiceGuidanceResult,
  VoiceInteractionRecord,
} from '../types';

interface SpeakAndRecordProps {
  appLanguage: AppLanguage;
  onChangeAppLanguage: (lang: AppLanguage) => void;
  initialDistrict?: string;
  currentUser: AuthUser | null;
  authToken: string | null;
  people: PersonRecord[];
  onRequestAuth: () => void;
  onVisitSaved: (visit: FieldVisit) => void | Promise<void>;
  onVoiceInteractionSaved: (record: VoiceInteractionRecord) => void | Promise<void>;
  onAlertCreated: (alert: DangerAlert) => void | Promise<void>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

interface RecordedAudioClip {
  blob: Blob;
  url: string;
  durationSec: number;
  mimeType: string;
}

type VoiceStatusLabel =
  | 'Ready'
  | 'Listening'
  | 'Recording'
  | 'Processing'
  | 'Speaking'
  | 'Paused'
  | 'Error';

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getMicrophoneErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone permission was denied. Click the lock or microphone icon in your browser address bar, allow microphone access, and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone was detected on this device. Connect a microphone or type your note below.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Your microphone is currently in use by another app or browser tab. Close the other app and try again.';
      case 'SecurityError':
        return 'Microphone recording requires a secure (HTTPS or localhost) browser context.';
      default:
        return `Could not access the microphone (${err.name}). Check browser permissions or type your note below.`;
    }
  }
  return 'Microphone access is unavailable. Allow microphone permissions in your browser or type your health note below.';
}

export function SpeakAndRecord({
  appLanguage,
  onChangeAppLanguage,
  initialDistrict,
  currentUser,
  authToken,
  people,
  onRequestAuth,
  onVisitSaved,
  onVoiceInteractionSaved,
  onAlertCreated,
}: SpeakAndRecordProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [liveDictating, setLiveDictating] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(16).fill(14));

  const [recordedClip, setRecordedClip] = useState<RecordedAudioClip | null>(null);
  const [isReplayingClip, setIsReplayingClip] = useState(false);

  const [transcribing, setTranscribing] = useState(false);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<SpeechPlaybackStatus>(() => getSpeechPlaybackStatus());
  const [isGuidanceAudioActive, setIsGuidanceAudioActive] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<VoiceChoiceOption[]>(() =>
    getAvailableVoiceOptions(appLanguage)
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('server:Kore');

  const [savingHistory, setSavingHistory] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visitFormError, setVisitFormError] = useState<string | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<VoiceGuidanceResult | null>(null);
  const [showVisitForm, setShowVisitForm] = useState(false);

  const browserSupport = useMemo(() => {
    if (typeof window === 'undefined') {
      return { mediaRecorder: true, speechRecognition: true, secureContext: true };
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    return {
      mediaRecorder:
        typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
      speechRecognition: Boolean(win.SpeechRecognition || win.webkitSpeechRecognition),
      secureContext: Boolean(window.isSecureContext),
    };
  }, []);

  // Structured Visit Form state (populated by clinical extraction)
  const defaultDist = initialDistrict || currentUser?.district || 'Raichur';
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryPhone, setBeneficiaryPhone] = useState('');
  const [beneficiaryAge, setBeneficiaryAge] = useState('');
  const [beneficiaryGender, setBeneficiaryGender] = useState<BeneficiaryGender>('Female');
  const [beneficiaryCategory, setBeneficiaryCategory] =
    useState<BeneficiaryCategory>('Pregnant Woman');
  const [district, setDistrict] = useState(defaultDist);
  const [village, setVillage] = useState('');
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [bloodSugar, setBloodSugar] = useState('');
  const [hemoglobin, setHemoglobin] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Low');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [followUpDate, setFollowUpDate] = useState(
    new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSampleRateRef = useRef<number>(48000);
  const pcmProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const liveRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const liveTranscriptRef = useRef<string>('');
  const isCancelledRef = useRef<boolean>(false);
  const recordingSecondsRef = useRef<number>(0);
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);
  const clipUrlRef = useRef<string | null>(null);

  // Sync global TTS playback state so Pause/Resume/Stop stay accurate across rapid interactions
  useEffect(() => {
    const unsub = subscribeSpeechStatus((next) => {
      setTtsStatus(next);
      if (next === 'idle') {
        setIsGuidanceAudioActive(false);
      }
    });
    return unsub;
  }, []);

  // Load AI + browser device voices for selected language
  useEffect(() => {
    const refreshVoices = () => {
      const next = getAvailableVoiceOptions(appLanguage);
      setVoiceOptions(next);
      setSelectedVoiceId((current) =>
        next.some((opt) => opt.id === current) ? current : 'server:Kore'
      );
    };
    refreshVoices();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
      return () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
      };
    }
    return undefined;
  }, [appLanguage]);

  const stopClipReplay = () => {
    if (replayAudioRef.current) {
      replayAudioRef.current.pause();
      replayAudioRef.current.currentTime = 0;
    }
    setIsReplayingClip(false);
  };

  useEffect(() => {
    return () => {
      cleanupAudio(true);
      stopClipReplay();
      stopAllSpeech();
      if (clipUrlRef.current) {
        URL.revokeObjectURL(clipUrlRef.current);
        clipUrlRef.current = null;
      }
    };
  }, []);

  const cleanupAudio = (abortRecognition = false) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    setLiveDictating(false);
    if (liveRecognitionRef.current) {
      try {
        if (abortRecognition && typeof liveRecognitionRef.current.abort === 'function') {
          liveRecognitionRef.current.abort();
        } else {
          liveRecognitionRef.current.stop();
        }
      } catch {
        // Ignore already stopped recognition
      }
      liveRecognitionRef.current = null;
    }
    if (pcmProcessorRef.current) {
      try {
        pcmProcessorRef.current.disconnect();
        pcmProcessorRef.current.onaudioprocess = null;
      } catch {
        // Ignore already disconnected processor
      }
      pcmProcessorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const replaceRecordedClip = (nextClip: RecordedAudioClip | null) => {
    stopClipReplay();
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = null;
    }
    if (nextClip) {
      clipUrlRef.current = nextClip.url;
    }
    setRecordedClip(nextClip);
  };

  const handleSelectPerson = (personIdStr: string) => {
    setSelectedPersonId(personIdStr);
    const matched = people.find((p) => String(p.id) === personIdStr);
    if (matched) {
      setBeneficiaryName(matched.full_name);
      setBeneficiaryPhone(matched.phone || '');
      setBeneficiaryAge(String(matched.age));
      setBeneficiaryGender(matched.gender);
      setVillage(matched.village);
      setDistrict(matched.district);
    }
  };

  const startRecording = async () => {
    // Stop any playing speech or clip replay so audio output never bleeds into the microphone
    stopAllSpeech();
    stopClipReplay();
    setIsGuidanceAudioActive(false);

    setErrorMessage(null);
    setStatusMessage(null);
    liveTranscriptRef.current = '';
    isCancelledRef.current = false;
    recordingSecondsRef.current = 0;

    if (!browserSupport.secureContext) {
      setErrorMessage(
        'Microphone recording requires a secure (HTTPS or localhost) connection. You can still type your health note below.'
      );
      return;
    }

    if (!browserSupport.mediaRecorder) {
      setErrorMessage(
        'Audio recording (MediaRecorder / Microphone API) is not supported in this browser. Type your health note below instead.'
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (constraintErr) {
        if (constraintErr instanceof DOMException && constraintErr.name === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw constraintErr;
        }
      }
      streamRef.current = stream;

      // Parallel browser Web Speech Recognition for immediate live regional dictation where supported
      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      };
      const SpeechRecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (SpeechRecCtor) {
        try {
          const rec = new SpeechRecCtor();
          rec.lang = getBcp47ForLanguage(appLanguage);
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (ev) => {
            if (isCancelledRef.current) return;
            let combined = '';
            for (let i = 0; i < ev.results.length; i++) {
              combined += ev.results[i][0].transcript + ' ';
            }
            const clean = combined.trim();
            if (clean) {
              liveTranscriptRef.current = clean;
              setTranscript(clean);
            }
          };
          rec.onerror = () => {
            setLiveDictating(false);
          };
          rec.onend = () => {
            setLiveDictating(false);
          };
          rec.start();
          liveRecognitionRef.current = rec;
          setLiveDictating(true);
        } catch {
          setLiveDictating(false);
        }
      }

      const candidateMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const preferredMime =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? candidateMimes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      pcmChunksRef.current = [];
      const capturedAppLang = appLanguage;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onerror = () => {
        cleanupAudio(true);
        setIsRecording(false);
        setAudioLevels(Array(16).fill(14));
        setErrorMessage('Recording was interrupted by the browser. Please try recording again.');
      };

      recorder.onstop = () => {
        const wasCancelled = isCancelledRef.current;
        const elapsedSec = recordingSecondsRef.current;
        const mimeType = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const capturedPcm = pcmChunksRef.current.slice();
        const capturedSampleRate = pcmSampleRateRef.current;
        const fallbackLiveText = liveTranscriptRef.current.trim();
        audioChunksRef.current = [];
        pcmChunksRef.current = [];
        cleanupAudio(wasCancelled);
        setIsRecording(false);
        setAudioLevels(Array(16).fill(14));

        if (wasCancelled) {
          setStatusMessage('Recording cancelled.');
          return;
        }

        const hasPcmData = capturedPcm.length > 0;
        if (blob.size < 100 && !hasPcmData && !fallbackLiveText) {
          setErrorMessage(
            'No audio was captured from the microphone. Please speak clearly for at least 1 second.'
          );
          return;
        }

        if (blob.size >= 100) {
          const url = URL.createObjectURL(blob);
          replaceRecordedClip({
            blob,
            url,
            durationSec: Math.max(1, elapsedSec),
            mimeType,
          });
        }

        void processRecordedAudio(
          blob,
          capturedAppLang,
          fallbackLiveText,
          capturedPcm,
          capturedSampleRate
        );
      };

      // Isolated Web Audio waveform meter + lossless PCM backup capture
      try {
        const AudioCtxCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxCtor) {
          const audioCtx = new AudioCtxCtor();
          audioCtxRef.current = audioCtx;
          pcmSampleRateRef.current = audioCtx.sampleRate || 48000;
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          // Capture mono PCM frames into memory (routed through zero-gain node to prevent echo)
          if (typeof audioCtx.createScriptProcessor === 'function') {
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            const silentGain = audioCtx.createGain();
            silentGain.gain.value = 0;
            processor.onaudioprocess = (ev) => {
              if (isCancelledRef.current) return;
              const inputData = ev.inputBuffer.getChannelData(0);
              if (inputData && inputData.length > 0) {
                pcmChunksRef.current.push(new Float32Array(inputData));
              }
            };
            source.connect(processor);
            processor.connect(silentGain);
            silentGain.connect(audioCtx.destination);
            pcmProcessorRef.current = processor;
          }

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateLevels = () => {
            analyser.getByteFrequencyData(dataArray);
            const bars: number[] = [];
            for (let i = 0; i < 16; i++) {
              bars.push(Math.max(14, Math.min(100, Math.round(((dataArray[i] ?? 0) / 255) * 100))));
            }
            setAudioLevels(bars);
            rafRef.current = requestAnimationFrame(updateLevels);
          };
          updateLevels();
        }
      } catch {
        // Proceed cleanly without live waveform bars / PCM backup
      }

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
        if (recordingSecondsRef.current >= 30) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
        }
      }, 1000);
    } catch (err) {
      cleanupAudio(true);
      setIsRecording(false);
      setErrorMessage(getMicrophoneErrorMessage(err));
    }
  };

  const stopRecording = () => {
    isCancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupAudio(true);
      setIsRecording(false);
      setAudioLevels(Array(16).fill(14));
      setStatusMessage('Recording cancelled.');
    }
  };

  const handleToggleReplayClip = () => {
    if (!recordedClip) return;
    if (isReplayingClip && replayAudioRef.current) {
      replayAudioRef.current.pause();
      setIsReplayingClip(false);
      return;
    }
    stopAllSpeech();
    setIsGuidanceAudioActive(false);

    if (!replayAudioRef.current || replayAudioRef.current.src !== recordedClip.url) {
      const audio = new Audio(recordedClip.url);
      audio.onended = () => setIsReplayingClip(false);
      audio.onerror = () => {
        setIsReplayingClip(false);
        setErrorMessage('Could not replay the recorded audio clip in this browser.');
      };
      replayAudioRef.current = audio;
    }

    replayAudioRef.current
      .play()
      .then(() => setIsReplayingClip(true))
      .catch(() => {
        setIsReplayingClip(false);
        setErrorMessage('Audio playback was blocked by the browser. Tap Replay again.');
      });
  };

  const handleDeleteRecordedClip = () => {
    replaceRecordedClip(null);
    setStatusMessage('Recorded audio clip deleted. Tap Start Voice Recording to record again.');
  };

  const processRecordedAudio = async (
    recordedBlob: Blob,
    capturedAppLang: AppLanguage,
    liveFallbackText: string,
    pcmBackupChunks: Float32Array[] = [],
    pcmSampleRate = 48000
  ) => {
    setTranscribing(true);
    setErrorMessage(null);
    setStatusMessage('Preparing recorded speech for transcription...');

    try {
      let wavResult: { wavBlob: Blob; durationSeconds: number; peakAmplitude: number } | null = null;

      // Step 1: Decode MediaRecorder blob into clean 16kHz mono 16-bit PCM WAV
      if (recordedBlob.size >= 100) {
        try {
          wavResult = await convertAudioBlobToWav(recordedBlob, 16000);
        } catch {
          wavResult = null;
        }
      }

      // Step 2: If MediaRecorder produced a corrupted/undecodable container, use our lossless PCM capture
      if ((!wavResult || wavResult.durationSeconds < 0.2) && pcmBackupChunks.length > 0) {
        try {
          wavResult = encodeFloat32SamplesToWav(pcmBackupChunks, pcmSampleRate, 16000);
          // Also upgrade the replayable clip to the valid WAV so Replay works reliably
          const wavUrl = URL.createObjectURL(wavResult.wavBlob);
          replaceRecordedClip({
            blob: wavResult.wavBlob,
            url: wavUrl,
            durationSec: Math.max(1, Math.round(wavResult.durationSeconds)),
            mimeType: 'audio/wav',
          });
        } catch {
          wavResult = null;
        }
      }

      // Step 3: Guard against short, silent, or corrupted recordings BEFORE uploading to STT
      if (!wavResult) {
        if (liveFallbackText) {
          setTranscript(liveFallbackText);
          setStatusMessage(
            'Speech captured via live dictation. Review or edit the text below, then generate healthcare guidance.'
          );
          setTranscribing(false);
          return;
        }
        setErrorMessage(
          'Could not capture valid audio from the microphone. Please check your microphone and speak clearly for at least 1 second.'
        );
        setStatusMessage(null);
        setTranscribing(false);
        return;
      }

      if (wavResult.durationSeconds < 0.3 && !liveFallbackText) {
        setErrorMessage('Recording was too short. Please speak clearly for at least 1 second.');
        setStatusMessage(null);
        setTranscribing(false);
        return;
      }

      if (wavResult.peakAmplitude < 0.002) {
        if (liveFallbackText) {
          setTranscript(liveFallbackText);
          setStatusMessage(
            'Speech captured via live dictation. Review or edit the text below, then generate healthcare guidance.'
          );
          setTranscribing(false);
          return;
        }
        setErrorMessage(
          'No microphone audio signal was detected. Check that your microphone is unmuted and speak closer to the mic.'
        );
        setStatusMessage(null);
        setTranscribing(false);
        return;
      }

      const uploadBlob = wavResult.wavBlob;
      const uploadMime = 'audio/wav';

      setStatusMessage('Uploading audio to Speech-to-Text backend...');
      const res = await fetch(`/api/ai/transcribe?language=${encodeURIComponent(capturedAppLang)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': uploadMime,
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: uploadBlob,
      });

      const data = await parseApiResponse<{
        transcript?: string;
        provider?: string;
        noSpeech?: boolean;
      }>(res, 'Speech transcription failed.');
      const recognized = String(data.transcript || '').trim();
      if (recognized) {
        setTranscript(recognized);
        setStatusMessage(
          `Speech recognized via ${data.provider || 'Speech-to-Text'}. Review or edit the text below, then generate guidance.`
        );
        setTranscribing(false);
        return;
      }
      if (data.noSpeech && !liveFallbackText) {
        setErrorMessage(
          'No clear speech was detected in the recording. Please speak clearly closer to the microphone and try again.'
        );
        setStatusMessage(null);
        setTranscribing(false);
        return;
      }
    } catch (err: unknown) {
      const serverMsg = err instanceof Error ? err.message : 'Transcription error.';
      if (liveFallbackText) {
        setTranscript(liveFallbackText);
        setStatusMessage(
          'Speech captured via browser dictation. Review or edit the text below, then generate healthcare guidance.'
        );
        setTranscribing(false);
        return;
      }
      setErrorMessage(serverMsg);
      setStatusMessage(null);
      setTranscribing(false);
      return;
    }

    if (liveFallbackText) {
      setTranscript(liveFallbackText);
      setStatusMessage('Speech recognized. Review or edit the text below.');
    } else {
      setErrorMessage('No clear speech was detected in the recording. Try speaking closer to the microphone.');
      setStatusMessage(null);
    }
    setTranscribing(false);
  };

  const handleGenerateGuidance = async () => {
    if (transcript.trim().length < 4) {
      setErrorMessage('Please record speech or enter health notes first.');
      return;
    }
    stopAllSpeech();
    setIsGuidanceAudioActive(false);
    setGuidanceLoading(true);
    setErrorMessage(null);
    setStatusMessage('Generating plain-language healthcare guidance...');

    try {
      const res = await fetch('/api/ai/guidance', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ transcript: transcript.trim(), language: appLanguage }),
      });
      const result = await parseApiResponse<VoiceGuidanceResult>(
        res,
        'Could not generate healthcare guidance.'
      );
      setGuidanceResult(result);
      setStatusMessage(`Guidance ready via ${result.provider}. Tap "Listen" to hear it aloud.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Guidance generation failed.');
      setStatusMessage(null);
    } finally {
      setGuidanceLoading(false);
    }
  };

  const handlePlayOrToggleGuidance = async () => {
    if (!guidanceResult) return;

    // If guidance audio is currently speaking, pause it
    if (isGuidanceAudioActive && ttsStatus === 'speaking') {
      pauseActiveSpeech();
      return;
    }

    // If guidance audio is paused, resume it
    if (isGuidanceAudioActive && ttsStatus === 'paused') {
      await resumeActiveSpeech();
      return;
    }

    // Start fresh playback (automatically stops any prior speech or clip replay to prevent overlap)
    stopClipReplay();
    setErrorMessage(null);
    setIsGuidanceAudioActive(true);

    const spokenText = [
      guidanceResult.guidance,
      ...guidanceResult.key_steps,
      guidanceResult.medical_disclaimer,
    ].join('. ');

    await speakTextWithFallback(
      spokenText,
      appLanguage,
      () => setIsGuidanceAudioActive(true),
      () => setIsGuidanceAudioActive(false),
      { voiceId: selectedVoiceId }
    );
  };

  const handleStopGuidanceAudio = () => {
    stopAllSpeech();
    setIsGuidanceAudioActive(false);
  };

  const handleSaveToHistory = async () => {
    if (!guidanceResult || !transcript.trim()) return;
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setSavingHistory(true);
    setErrorMessage(null);
    try {
      const matched = people.find((p) => String(p.id) === selectedPersonId);
      const res = await fetch('/api/voice-interactions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: matched ? matched.id : null,
          person_name: matched?.full_name || beneficiaryName || 'Community Member',
          village: matched?.village || village || currentUser.district,
          language: appLanguage,
          transcript: transcript.trim(),
          guidance_text: `${guidanceResult.guidance}\n${guidanceResult.key_steps.join(' • ')}`,
          emergency_detected: guidanceResult.is_emergency,
        }),
      });
      const data = await parseApiResponse<{ interaction: VoiceInteractionRecord }>(
        res,
        'Could not save voice interaction.'
      );
      onVoiceInteractionSaved(data.interaction);
      setStatusMessage('Saved voice interaction to Health Histories.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save interaction.');
    } finally {
      setSavingHistory(false);
    }
  };

  const handleCreateDangerAlertFromVoice = async () => {
    if (!guidanceResult) return;
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setSavingAlert(true);
    setErrorMessage(null);
    try {
      const matched = people.find((p) => String(p.id) === selectedPersonId);
      const res = await fetch('/api/alerts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: matched ? matched.id : null,
          person_name: matched?.full_name || beneficiaryName || 'Voice Referral Case',
          village: matched?.village || village || currentUser.district,
          district: matched?.district || district,
          category: 'Maternal',
          severity: guidanceResult.is_emergency ? 'Critical' : 'High',
          danger_signs:
            guidanceResult.danger_signs.length > 0
              ? guidanceResult.danger_signs
              : ['Escalated from ASHA voice interaction'],
          guidance: guidanceResult.guidance,
          referral_facility: `Nearest PHC / FRU (${district}) — Call 108`,
        }),
      });
      const data = await parseApiResponse<{ alert: DangerAlert }>(
        res,
        'Could not log danger alert.'
      );
      onAlertCreated(data.alert);
      setStatusMessage('Emergency Danger Alert logged and tracked in Danger Alerts.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to log danger alert.');
    } finally {
      setSavingAlert(false);
    }
  };

  const handleExtractStructuredVisit = async () => {
    if (transcript.trim().length < 8) {
      setErrorMessage('Enter or record at least 8 characters to extract structured visit fields.');
      return;
    }
    setExtracting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          transcript: transcript.trim(),
          language: toVisitLanguage(appLanguage),
        }),
      });
      const payload = await parseApiResponse<{ data: ExtractedClinicalData; provider: string }>(
        res,
        'Clinical extraction failed.'
      );
      const d = payload.data;
      const nextName = d.beneficiary_name || beneficiaryName;
      const linkedMember = people.find((p) => String(p.id) === selectedPersonId);
      const matchedByName =
        linkedMember ||
        (nextName.trim()
          ? people.find((p) => p.full_name.trim().toLowerCase() === nextName.trim().toLowerCase())
          : undefined);
      setBeneficiaryName(nextName);
      setBeneficiaryPhone(d.beneficiary_phone || matchedByName?.phone || '');
      if (!selectedPersonId && matchedByName) {
        setSelectedPersonId(String(matchedByName.id));
      }
      setBeneficiaryAge(d.beneficiary_age !== null ? String(d.beneficiary_age) : '');
      setBeneficiaryGender(d.beneficiary_gender || 'Female');
      setBeneficiaryCategory(d.beneficiary_category);
      const matchedDist = KARNATAKA_DISTRICTS.find(
        (x) => x.district.toLowerCase() === d.district.toLowerCase()
      );
      setDistrict(matchedDist ? matchedDist.district : district);
      setVillage(d.village || matchedByName?.village || village);
      setBpSystolic(d.bp_systolic !== null ? String(d.bp_systolic) : '');
      setBpDiastolic(d.bp_diastolic !== null ? String(d.bp_diastolic) : '');
      setBloodSugar(d.blood_sugar_mgdl !== null ? String(d.blood_sugar_mgdl) : '');
      setHemoglobin(d.hemoglobin_gdl !== null ? String(d.hemoglobin_gdl) : '');
      setSymptoms(d.symptoms || '');
      setSymptomDuration(d.symptom_duration || '');
      setRiskLevel(d.risk_level);
      setRecommendedAction(d.recommended_action);
      setFollowUpDate(d.follow_up_date);
      setVisitFormError(null);
      setShowVisitForm(true);
      setStatusMessage(
        `Clinical visit fields extracted via ${payload.provider}. Review and save to Visit Register.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to extract clinical fields.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveExtractedVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    if (beneficiaryName.trim().length < 2) {
      setVisitFormError('Please enter a patient name (at least 2 characters).');
      return;
    }
    setSavingVisit(true);
    setErrorMessage(null);
    setVisitFormError(null);
    try {
      const coords = getDistrictCoords(district);
      const matched = people.find((p) => String(p.id) === selectedPersonId);
      const trimmedPhone = beneficiaryPhone.trim();
      const res = await fetch('/api/visits', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          family_id: matched?.family_id ?? null,
          person_id: matched?.id ?? null,
          beneficiary_name: beneficiaryName.trim(),
          beneficiary_phone: trimmedPhone,
          beneficiary_age: beneficiaryAge ? Number(beneficiaryAge) : null,
          beneficiary_gender: beneficiaryGender,
          beneficiary_category: beneficiaryCategory,
          district,
          village: village.trim() || district,
          phc_center: `PHC ${district}`,
          language: toVisitLanguage(appLanguage),
          purpose: 'Voice-Assisted Home Visit',
          status: 'Completed',
          notes: recommendedAction.trim(),
          transcript: transcript.trim(),
          bp_systolic: bpSystolic ? Number(bpSystolic) : null,
          bp_diastolic: bpDiastolic ? Number(bpDiastolic) : null,
          blood_sugar_mgdl: bloodSugar ? Number(bloodSugar) : null,
          hemoglobin_gdl: hemoglobin ? Number(hemoglobin) : null,
          weight_kg: null,
          gestational_weeks: null,
          immunization_status: 'Checked during visit',
          ifa_tablets_given: 0,
          symptoms: symptoms.trim(),
          symptom_duration: symptomDuration.trim(),
          risk_level: riskLevel,
          risk_flags: guidanceResult?.danger_signs || [],
          recommended_action: recommendedAction.trim(),
          follow_up_date: followUpDate,
          lat: coords.lat,
          lng: coords.lng,
          visit_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await parseApiResponse<{ visit: FieldVisit }>(res, 'Could not save visit.');
      await onVisitSaved(data.visit);
      const savedPhoneNote = data.visit.beneficiary_phone
        ? ` Phone ${data.visit.beneficiary_phone} stored in Visit Register & People Directory.`
        : '';
      setStatusMessage(`Visit saved to Visit Register (#${data.visit.id}).${savedPhoneNote}`);
      setShowVisitForm(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save visit.';
      setVisitFormError(msg);
      setErrorMessage(msg);
    } finally {
      setSavingVisit(false);
    }
  };

  // Unified real-time voice state indicator
  const voiceState: VoiceStatusLabel = errorMessage
    ? 'Error'
    : isRecording
    ? liveDictating
      ? 'Listening'
      : 'Recording'
    : transcribing || guidanceLoading || extracting || (isGuidanceAudioActive && ttsStatus === 'loading')
    ? 'Processing'
    : (isGuidanceAudioActive && ttsStatus === 'paused')
    ? 'Paused'
    : (isGuidanceAudioActive && ttsStatus === 'speaking') || isReplayingClip
    ? 'Speaking'
    : 'Ready';

  const voiceStateColor =
    voiceState === 'Error'
      ? 'text-red-700'
      : voiceState === 'Listening' || voiceState === 'Recording'
      ? 'text-red-700'
      : voiceState === 'Processing'
      ? 'text-amber-800'
      : voiceState === 'Speaking'
      ? 'text-[#185a4b]'
      : voiceState === 'Paused'
      ? 'text-slate-700'
      : 'text-[#5c6b64]';

  const currentLangNative =
    APP_LANGUAGE_OPTIONS.find((l) => l.code === appLanguage)?.native || 'English';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#5c6b64]">
            Regional Indian Languages &amp; English · Voice-to-Text · Plain-Language Guidance · Audio Readback
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1c2421]">
            Speak &amp; Record Healthcare Assistant
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="voice-person-link" className="text-xs font-medium text-[#5c6b64]">
            Link Member:
          </label>
          <select
            id="voice-person-link"
            value={selectedPersonId}
            onChange={(e) => handleSelectPerson(e.target.value)}
            className="rounded-lg border border-[#d6ddd3] bg-white px-3 py-2 text-xs text-[#1c2421] focus:border-[#1f6f5c] focus:outline-none"
          >
            <option value="">General / Unlinked Member</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.village}, {p.age}y)
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="rounded p-0.5 text-red-700 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-[#b9d9cf] bg-[#edf6f3] px-4 py-3 text-sm text-[#185a4b]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Microphone Capture, Recorded Clip & Editable Recognized Text */}
        <section className="xl:col-span-6 space-y-5 rounded-xl border border-[#dfe4dc] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ece6] pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-[#1c2421]">1. Record or Enter Speech</h2>
              <span
                aria-live="polite"
                className={`font-mono text-xs font-semibold uppercase tracking-wide ${voiceStateColor}`}
              >
                {voiceState}
              </span>
            </div>
            <select
              aria-label="Voice language"
              value={appLanguage}
              onChange={(e) => onChangeAppLanguage(e.target.value as AppLanguage)}
              disabled={isRecording}
              className="rounded-lg border border-[#d6ddd3] bg-[#f7f9f6] px-2.5 py-1.5 text-xs font-medium text-[#1c2421] disabled:opacity-60"
            >
              {APP_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-[#f4f6f2] p-5 text-center">
            <div className="mb-4 flex h-12 items-end justify-center gap-1.5" aria-hidden="true">
              {audioLevels.map((lvl, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    isRecording ? 'bg-[#1f6f5c]' : 'bg-[#c9d3cc]'
                  }`}
                  style={{ height: `${lvl}%` }}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-2.5">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={transcribing}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1f6f5c] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#185a4b] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {transcribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  {transcribing
                    ? 'Transcribing Audio...'
                    : recordedClip
                    ? 'Record Again'
                    : 'Start Voice Recording'}
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    <Square className="h-4 w-4" />
                    <span className="font-mono tabular-nums">
                      Stop ({formatTimer(recordingSeconds)} / 00:30)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#cdd6cb] bg-white px-4 py-2.5 text-sm font-medium text-[#394741] hover:bg-[#e9eee7] transition-colors whitespace-nowrap"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              )}

              <p className="text-xs text-[#5c6b64]">
                {transcribing
                  ? 'Processing recorded speech and converting to text...'
                  : isRecording
                  ? `${
                      liveDictating ? 'Listening & recording' : 'Recording audio'
                    } in ${currentLangNative} — speak symptoms, BP, age, or family question`
                  : !browserSupport.mediaRecorder
                  ? 'Microphone recording is unsupported in this browser. Type your health note below.'
                  : !browserSupport.speechRecognition
                  ? 'Tap to record audio — speech will be transcribed automatically on stop'
                  : 'Tap to speak in Kannada, Hindi, English, Telugu, Tamil, or Marathi'}
              </p>
            </div>
          </div>

          {/* Recorded Audio Clip Bar (Replay, Transcribe Again, Delete) */}
          {recordedClip && !isRecording && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[#d6ddd3] bg-[#fafbf9] px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs text-[#1c2421]">
                <span className="font-semibold">Recorded Audio</span>
                <span className="font-mono text-[#5c6b64] tabular-nums">
                  {formatTimer(recordedClip.durationSec)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleReplayClip}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#cdd6cb] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1c2421] hover:bg-[#edf6f3] whitespace-nowrap"
                >
                  {isReplayingClip ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isReplayingClip ? 'Pause Clip' : 'Replay'}
                </button>
                <button
                  type="button"
                  disabled={transcribing}
                  onClick={() => void processRecordedAudio(recordedClip.blob, appLanguage, '')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#cdd6cb] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1c2421] hover:bg-[#edf6f3] disabled:opacity-50 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Transcribe
                </button>
                <button
                  type="button"
                  disabled={transcribing}
                  onClick={handleDeleteRecordedClip}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Quick Field Sample Triggers */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#5c6b64]">Quick Field Voice Scenarios</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {VOICE_FIELD_PRESETS.slice(0, 4).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onChangeAppLanguage(preset.language);
                    setTranscript(preset.transcript);
                    setDistrict(preset.district);
                    setErrorMessage(null);
                    setStatusMessage(
                      `Loaded sample note (${preset.label}). Tap "Get Healthcare Guidance" or "Extract Visit Form".`
                    );
                  }}
                  className="rounded-lg border border-[#dfe4dc] bg-[#fafbf9] px-3 py-2 text-left hover:border-[#1f6f5c]/50 hover:bg-[#edf6f3]/60 transition-colors"
                >
                  <div className="text-xs font-semibold text-[#1c2421]">{preset.label}</div>
                  <div className="mt-0.5 text-xs text-[#5c6b64] truncate">{preset.scenario}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Editable Recognized Speech */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="recognized-speech" className="text-xs font-medium text-[#394741]">
                Recognized Speech (Editable before generating guidance)
              </label>
              {transcript.length > 0 && !isRecording && (
                <button
                  type="button"
                  onClick={() => {
                    setTranscript('');
                    setErrorMessage(null);
                  }}
                  className="text-xs font-medium text-[#5c6b64] hover:text-[#1c2421]"
                >
                  Clear Text
                </button>
              )}
            </div>
            <textarea
              id="recognized-speech"
              rows={4}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your spoken or typed health note appears here. You can edit any words before requesting guidance..."
              className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3.5 py-2.5 text-sm leading-relaxed text-[#1c2421] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/15"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleGenerateGuidance}
              disabled={guidanceLoading || transcribing || isRecording || transcript.trim().length < 4}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f6f5c] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#185a4b] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {guidanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Get Healthcare Guidance
            </button>
            <button
              type="button"
              onClick={handleExtractStructuredVisit}
              disabled={extracting || transcribing || isRecording || transcript.trim().length < 8}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cdd6cb] bg-white px-4 py-2.5 text-sm font-medium text-[#1c2421] hover:bg-[#f4f6f2] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Extract Visit Form
            </button>
          </div>
        </section>

        {/* Right: Generated Healthcare Guidance + Audio Playback + Save to History */}
        <section className="xl:col-span-6 space-y-5 rounded-xl border border-[#dfe4dc] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ece6] pb-4">
            <h2 className="text-base font-semibold text-[#1c2421]">
              2. Understandable Healthcare Guidance &amp; Audio Readback
            </h2>
          </div>

          {/* Voice Output Toolbar (Voice Selector + Play / Pause / Resume / Stop) */}
          {guidanceResult && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[#dfe4dc] bg-[#f7f9f6] px-3.5 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <label htmlFor="tts-voice-select" className="shrink-0 text-xs font-medium text-[#5c6b64]">
                  Voice:
                </label>
                <select
                  id="tts-voice-select"
                  value={selectedVoiceId}
                  onChange={(e) => {
                    const nextVoice = e.target.value;
                    setSelectedVoiceId(nextVoice);
                    if (isGuidanceAudioActive) {
                      stopAllSpeech();
                      setIsGuidanceAudioActive(false);
                    }
                  }}
                  className="min-w-0 max-w-full flex-1 truncate rounded-md border border-[#d6ddd3] bg-white px-2.5 py-1.5 text-xs text-[#1c2421] focus:border-[#1f6f5c] focus:outline-none"
                >
                  {voiceOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePlayOrToggleGuidance}
                  disabled={isGuidanceAudioActive && ttsStatus === 'loading'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1f6f5c]/30 bg-[#edf6f3] px-3 py-1.5 text-xs font-medium text-[#185a4b] hover:bg-[#dceee8] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {isGuidanceAudioActive && ttsStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : isGuidanceAudioActive && ttsStatus === 'speaking' ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : isGuidanceAudioActive && ttsStatus === 'paused' ? (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5" />
                      Listen
                    </>
                  )}
                </button>

                {isGuidanceAudioActive && ttsStatus !== 'idle' && (
                  <button
                    type="button"
                    onClick={handleStopGuidanceAudio}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6ddd3] bg-white px-2.5 py-1.5 text-xs font-medium text-[#394741] hover:bg-red-50 hover:text-red-700 transition-colors whitespace-nowrap"
                  >
                    <VolumeX className="h-3.5 w-3.5" />
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}

          {!guidanceResult ? (
            <div className="rounded-xl bg-[#f7f9f6] p-8 text-center">
              <p className="text-sm font-medium text-[#394741]">No guidance generated yet</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5c6b64]">
                Record a voice note or select a quick scenario on the left, review the recognized text, and tap{' '}
                <strong className="font-semibold text-[#1c2421]">Get Healthcare Guidance</strong> to hear simple
                community-level instructions and danger sign screening.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {guidanceResult.is_emergency && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-red-800">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
                    Emergency Warning — Immediate Medical Care Required
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-red-800">
                    Potential danger signs were detected. Call <strong className="font-mono">108</strong> ambulance or
                    escort the patient to the nearest PHC / FRU Medical Officer immediately.
                  </p>
                  {guidanceResult.danger_signs.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-red-900">
                      Detected signs: {guidanceResult.danger_signs.join(' · ')}
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-[#5c6b64]">Simple Explanation</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#1c2421]">{guidanceResult.guidance}</p>
              </div>

              <div className="border-t border-[#e8ece6] pt-4">
                <p className="text-xs font-medium text-[#5c6b64]">Recommended Next Steps for ASHA Worker</p>
                <ol className="mt-2 space-y-2">
                  {guidanceResult.key_steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#1c2421]">
                      <span className="mt-0.5 font-mono text-xs font-semibold text-[#1f6f5c] tabular-nums">
                        {i + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
                <span className="font-semibold">Medical Notice: </span>
                {guidanceResult.medical_disclaimer}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 border-t border-[#e8ece6] pt-4">
                <button
                  type="button"
                  onClick={handleSaveToHistory}
                  disabled={savingHistory}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-medium text-white hover:bg-[#185a4b] disabled:opacity-50 whitespace-nowrap"
                >
                  {savingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkCheck className="h-3.5 w-3.5" />}
                  Save to Health Histories
                </button>
                {guidanceResult.is_emergency && (
                  <button
                    type="button"
                    onClick={handleCreateDangerAlertFromVoice}
                    disabled={savingAlert}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {savingAlert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                    Record in Danger Alerts
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Expandable Structured Clinical Visit Form extracted from Voice */}
      {showVisitForm && (
        <section className="rounded-xl border border-[#dfe4dc] bg-white p-6">
          <div className="flex items-center justify-between border-b border-[#e8ece6] pb-3">
            <div>
              <h2 className="text-base font-semibold text-[#1c2421]">
                Structured Household Visit Verification (Extracted from Speech)
              </h2>
              <p className="text-xs text-[#5c6b64]">
                Verify patient vitals and clinical triage before saving to the Visit Register
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowVisitForm(false)}
              className="text-xs font-medium text-[#5c6b64] hover:text-[#1c2421]"
            >
              Hide Form
            </button>
          </div>

          <form onSubmit={handleSaveExtractedVisit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#394741]">Patient Name *</label>
              <input
                required
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="extracted-phone-number" className="mb-1 block text-xs font-medium text-[#394741]">
                Enter Phone:
              </label>
              <input
                id="extracted-phone-number"
                type="tel"
                inputMode="tel"
                value={beneficiaryPhone}
                onChange={(e) => setBeneficiaryPhone(e.target.value)}
                placeholder="Enter phone number"
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums focus:border-[#1f6f5c] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#394741]">Age</label>
                <input
                  type="number"
                  value={beneficiaryAge}
                  onChange={(e) => setBeneficiaryAge(e.target.value)}
                  className="w-full rounded-lg border border-[#cdd6cb] px-2.5 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#394741]">Gender</label>
                <select
                  value={beneficiaryGender}
                  onChange={(e) => setBeneficiaryGender(e.target.value as BeneficiaryGender)}
                  className="w-full rounded-lg border border-[#cdd6cb] bg-white px-2.5 py-2 text-sm"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">District</label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                {KARNATAKA_DISTRICTS.map((d) => (
                  <option key={d.district} value={d.district}>
                    {d.district}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Village *</label>
              <input
                required
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">BP (Sys / Dia)</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  placeholder="Sys"
                  value={bpSystolic}
                  onChange={(e) => setBpSystolic(e.target.value)}
                  className="w-1/2 rounded-lg border border-[#cdd6cb] px-2.5 py-2 font-mono text-sm tabular-nums"
                />
                <input
                  type="number"
                  placeholder="Dia"
                  value={bpDiastolic}
                  onChange={(e) => setBpDiastolic(e.target.value)}
                  className="w-1/2 rounded-lg border border-[#cdd6cb] px-2.5 py-2 font-mono text-sm tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Sugar / Hb</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  placeholder="mg/dL"
                  value={bloodSugar}
                  onChange={(e) => setBloodSugar(e.target.value)}
                  className="w-1/2 rounded-lg border border-[#cdd6cb] px-2.5 py-2 font-mono text-sm tabular-nums"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Hb"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value)}
                  className="w-1/2 rounded-lg border border-[#cdd6cb] px-2.5 py-2 font-mono text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#394741]">Symptoms &amp; Duration</label>
              <input
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Risk Triage</label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                <option value="Low">Low Risk</option>
                <option value="Moderate">Moderate Risk</option>
                <option value="High">High Risk</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Next Follow-up</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            {visitFormError && (
              <div
                role="alert"
                className="sm:col-span-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{visitFormError}</span>
              </div>
            )}
            <div className="sm:col-span-4 flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingVisit}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1f6f5c] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#185a4b] disabled:opacity-50"
              >
                {savingVisit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingVisit ? 'Saving...' : 'Save to Visit Register'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

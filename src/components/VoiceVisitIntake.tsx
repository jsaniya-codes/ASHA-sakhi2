import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  Mic,
  Save,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  KARNATAKA_DISTRICTS,
  VOICE_FIELD_PRESETS,
  getDistrictCoords,
} from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import { convertAudioBlobToWav } from '../utils/audioWav';
import type {
  AuthUser,
  BeneficiaryCategory,
  BeneficiaryGender,
  ExtractedClinicalData,
  FieldVisit,
  RiskLevel,
  VisitLanguage,
} from '../types';

interface VoiceVisitIntakeProps {
  initialDistrict?: string;
  currentUser: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onVisitSaved: (visit: FieldVisit) => void;
}

const LANGUAGE_OPTIONS: Array<{ code: VisitLanguage; label: string; native: string }> = [
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'en', label: 'English', native: 'English' },
];

export function VoiceVisitIntake({
  initialDistrict,
  currentUser,
  authToken,
  onRequestAuth,
  onVisitSaved,
}: VoiceVisitIntakeProps) {
  const defaultDist = initialDistrict || currentUser?.district || 'Raichur';
  const defaultCoords = getDistrictCoords(defaultDist);
  const defaultPhc =
    KARNATAKA_DISTRICTS.find((d) => d.district === defaultDist)?.samplePhcs[0] || `PHC ${defaultDist}`;

  const [language, setLanguage] = useState<VisitLanguage>('kn');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(16).fill(12));

  const [transcribing, setTranscribing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readbackSummary, setReadbackSummary] = useState('');

  // Structured clinical form state
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryPhone, setBeneficiaryPhone] = useState('');
  const [beneficiaryAge, setBeneficiaryAge] = useState<string>('');
  const [beneficiaryGender, setBeneficiaryGender] = useState<BeneficiaryGender>('Female');
  const [beneficiaryCategory, setBeneficiaryCategory] =
    useState<BeneficiaryCategory>('Pregnant Woman');
  const [district, setDistrict] = useState(defaultDist);
  const [village, setVillage] = useState('');
  const [phcCenter, setPhcCenter] = useState(defaultPhc);
  const [bpSystolic, setBpSystolic] = useState<string>('');
  const [bpDiastolic, setBpDiastolic] = useState<string>('');
  const [bloodSugar, setBloodSugar] = useState<string>('');
  const [hemoglobin, setHemoglobin] = useState<string>('');
  const [weightKg, setWeightKg] = useState<string>('');
  const [gestationalWeeks, setGestationalWeeks] = useState<string>('');
  const [immunizationStatus, setImmunizationStatus] = useState('Checked during visit');
  const [ifaTablets, setIfaTablets] = useState<string>('30');
  const [symptoms, setSymptoms] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Low');
  const [riskFlagsText, setRiskFlagsText] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [followUpDate, setFollowUpDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [lat, setLat] = useState<number>(defaultCoords.lat);
  const [lng, setLng] = useState<number>(defaultCoords.lng);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialDistrict) {
      setDistrict(initialDistrict);
      const coords = getDistrictCoords(initialDistrict);
      setLat(coords.lat);
      setLng(coords.lng);
      const phc = KARNATAKA_DISTRICTS.find((d) => d.district === initialDistrict)?.samplePhcs[0];
      if (phc) setPhcCenter(phc);
    }
  }, [initialDistrict]);

  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
    };
  }, []);

  const cleanupAudioResources = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
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

  const applyExtractedFields = (data: ExtractedClinicalData) => {
    setBeneficiaryName(data.beneficiary_name);
    setBeneficiaryPhone(data.beneficiary_phone || '');
    setBeneficiaryAge(data.beneficiary_age !== null ? String(data.beneficiary_age) : '');
    setBeneficiaryGender(data.beneficiary_gender || 'Female');
    setBeneficiaryCategory(data.beneficiary_category);
    setDistrict(data.district);
    setVillage(data.village);
    const matchedDistrict = KARNATAKA_DISTRICTS.find(
      (d) => d.district.toLowerCase() === data.district.toLowerCase()
    );
    if (matchedDistrict) {
      setDistrict(matchedDistrict.district);
      setPhcCenter(matchedDistrict.samplePhcs[0] || `PHC ${matchedDistrict.district}`);
      setLat(matchedDistrict.lat);
      setLng(matchedDistrict.lng);
    } else {
      const coords = getDistrictCoords(data.district);
      setLat(coords.lat);
      setLng(coords.lng);
    }
    setBpSystolic(data.bp_systolic !== null ? String(data.bp_systolic) : '');
    setBpDiastolic(data.bp_diastolic !== null ? String(data.bp_diastolic) : '');
    setBloodSugar(data.blood_sugar_mgdl !== null ? String(data.blood_sugar_mgdl) : '');
    setHemoglobin(data.hemoglobin_gdl !== null ? String(data.hemoglobin_gdl) : '');
    setWeightKg(data.weight_kg !== null ? String(data.weight_kg) : '');
    setGestationalWeeks(data.gestational_weeks !== null ? String(data.gestational_weeks) : '');
    setImmunizationStatus(data.immunization_status);
    setIfaTablets(String(data.ifa_tablets_given));
    setSymptoms(data.symptoms);
    setSymptomDuration(data.symptom_duration || '');
    setRiskLevel(data.risk_level);
    setRiskFlagsText(data.risk_flags.join('; '));
    setRecommendedAction(data.recommended_action);
    setFollowUpDate(data.follow_up_date);
    setReadbackSummary(data.readback_summary);
  };

  const runQwenExtraction = async (transcriptText: string, lang: VisitLanguage) => {
    setExtracting(true);
    setErrorMessage(null);
    setStatusMessage('Extracting clinical fields via Qwen (OpenRouter)...');

    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ transcript: transcriptText.trim(), language: lang }),
      });
      const payload = await parseApiResponse<{
        data: ExtractedClinicalData;
        provider: string;
      }>(res, 'Qwen clinical extraction failed.');

      applyExtractedFields(payload.data);
      setStatusMessage(
        `Clinical fields populated via ${payload.provider}. Please verify before saving.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to extract clinical data.');
      setStatusMessage(null);
    } finally {
      setExtracting(false);
    }
  };

  const startRecording = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        'Microphone recording is not supported in this browser. You can type or load a sample note below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const candidateMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const preferredMime = candidateMimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      const capturedLanguage = language;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        cleanupAudioResources();
        setAudioLevels(Array(16).fill(12));
        if (blob.size < 100) {
          setErrorMessage('No audio was captured from the microphone. Please speak for at least 1 second and try again.');
          setStatusMessage(null);
          return;
        }
        void transcribeRecordedBlob(blob, capturedLanguage);
      };

      // Live audio level meter
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevels = () => {
        analyser.getByteFrequencyData(dataArray);
        const bars: number[] = [];
        for (let i = 0; i < 16; i++) {
          const val = dataArray[i] ?? 0;
          bars.push(Math.max(12, Math.min(100, Math.round((val / 255) * 100))));
        }
        setAudioLevels(bars);
        rafRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => {
          // Gnani REST /stt/v3 supports up to 30 seconds per clip
          if (s >= 29) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
            return 30;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      cleanupAudioResources();
      setErrorMessage(
        'Microphone permission was denied or unavailable. Please allow microphone access or load a multilingual field sample.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const transcribeRecordedBlob = async (recordedBlob: Blob, capturedLanguage: VisitLanguage) => {
    setTranscribing(true);
    setErrorMessage(null);
    setStatusMessage('Converting recording to 16kHz WAV for Speech-to-Text...');

    let recognizedTranscript = '';
    try {
      const { wavBlob, durationSeconds, peakAmplitude } = await convertAudioBlobToWav(
        recordedBlob,
        16000
      );
      if (durationSeconds < 0.3) {
        throw new Error('Recording was too short. Please record at least 1 second of clear speech.');
      }
      if (peakAmplitude < 0.002) {
        throw new Error(
          'No microphone audio signal was detected. Check that your microphone is unmuted and try again.'
        );
      }

      setStatusMessage('Uploading 16kHz WAV audio to Speech-to-Text...');

      const res = await fetch(
        `/api/ai/transcribe?language=${encodeURIComponent(capturedLanguage)}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'audio/wav',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: wavBlob,
        }
      );

      const data = await parseApiResponse<{
        transcript?: string;
        provider?: string;
        model?: string;
      }>(res, 'Gnani Speech-to-Text failed.');

      recognizedTranscript = String(data.transcript || '').trim();
      if (!recognizedTranscript) {
        throw new Error('Gnani Speech-to-Text returned an empty transcript.');
      }

      setTranscript(recognizedTranscript);
      setStatusMessage(
        `Transcribed via ${data.provider || 'Gnani Vachana STT'} (${data.model || 'prisma-v3.0'}). Running Qwen extraction...`
      );
    } catch (err: unknown) {
      // Do NOT call Qwen if Gnani transcription fails
      setErrorMessage(err instanceof Error ? err.message : 'Unable to transcribe audio.');
      setStatusMessage(null);
      setTranscribing(false);
      return;
    }

    setTranscribing(false);

    // Step 8 & 9: Automatically run Qwen clinical extraction and populate health form fields
    await runQwenExtraction(recognizedTranscript, capturedLanguage);
  };

  const handleExtractClinical = async () => {
    if (transcript.trim().length < 8) {
      setErrorMessage(
        'Record a voice note or select a sample transcript before extracting clinical fields.'
      );
      return;
    }
    await runQwenExtraction(transcript, language);
  };

  const handlePlayReadback = async () => {
    const textToSpeak =
      readbackSummary.trim() ||
      (beneficiaryName
        ? `Visit recorded for ${beneficiaryName} in ${village || district}. Risk level is ${riskLevel}. ${recommendedAction}`
        : '');
    if (!textToSpeak) {
      setErrorMessage('Extract clinical fields first to generate a voice verification summary.');
      return;
    }

    setSpeaking(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text: textToSpeak.slice(0, 750), language }),
      });
      const data = await parseApiResponse<{
        audioBase64: string;
        mimeType?: string;
      }>(res, 'Gnani voice readback failed.');

      if (audioElRef.current) {
        audioElRef.current.pause();
      }
      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      audioElRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch (err: unknown) {
      setSpeaking(false);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to play voice summary.');
    }
  };

  const handleGeocodeVillage = async () => {
    const q = `${village.trim()} ${district}`.trim();
    if (q.length < 2) return;
    setGeocoding(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await parseApiResponse<{
        results?: Array<{ label: string; lat: number; lng: number }>;
      }>(res, 'Geocoding failed.');
      const first = data.results?.[0];
      if (first) {
        setLat(Number(first.lat.toFixed(5)));
        setLng(Number(first.lng.toFixed(5)));
        setStatusMessage(`Located coordinates for ${first.label.split(',').slice(0, 2).join(', ')}.`);
      } else {
        setStatusMessage(`Using ${district} district coordinates (exact hamlet not found on OSM).`);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Location lookup failed.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          beneficiary_name: beneficiaryName.trim(),
          beneficiary_phone: beneficiaryPhone.trim(),
          beneficiary_age: beneficiaryAge ? Number(beneficiaryAge) : null,
          beneficiary_gender: beneficiaryGender,
          beneficiary_category: beneficiaryCategory,
          district,
          village: village.trim() || district,
          phc_center: phcCenter.trim() || `PHC ${district}`,
          language,
          transcript: transcript.trim(),
          bp_systolic: bpSystolic ? Number(bpSystolic) : null,
          bp_diastolic: bpDiastolic ? Number(bpDiastolic) : null,
          blood_sugar_mgdl: bloodSugar ? Number(bloodSugar) : null,
          hemoglobin_gdl: hemoglobin ? Number(hemoglobin) : null,
          weight_kg: weightKg ? Number(weightKg) : null,
          gestational_weeks: gestationalWeeks ? Number(gestationalWeeks) : null,
          immunization_status: immunizationStatus.trim(),
          ifa_tablets_given: Number(ifaTablets) || 0,
          symptoms: symptoms.trim(),
          symptom_duration: symptomDuration.trim(),
          risk_level: riskLevel,
          risk_flags: riskFlagsText
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean),
          recommended_action: recommendedAction.trim(),
          follow_up_date: followUpDate,
          lat,
          lng,
          visit_date: visitDate,
        }),
      });
      const data = await parseApiResponse<{ visit: FieldVisit }>(
        res,
        'Could not save field visit.'
      );

      onVisitSaved(data.visit);
      setStatusMessage(`Visit saved to Karnataka ASHA Field Register (#${data.visit.id}).`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save visit record.');
    } finally {
      setSaving(false);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-500">
          Gnani Vachana Speech-to-Text (Kannada, Hindi &amp; English) · Qwen Clinical Extraction
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Voice-First ASHA Home Visit Intake
        </h1>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column: Voice Recording & Transcript Controls */}
        <section className="xl:col-span-5 space-y-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-4">
            <h2 className="text-base font-semibold text-slate-900">1. Voice Note Capture</h2>
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-1">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setLanguage(opt.code)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    language === opt.code
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Microphone Control Panel */}
          <div className="rounded-lg bg-slate-50 p-5 text-center">
            <div className="flex h-12 items-end justify-center gap-1.5 mb-4" aria-hidden="true">
              {audioLevels.map((lvl, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    isRecording ? 'bg-teal-600' : 'bg-slate-300'
                  }`}
                  style={{ height: `${Math.max(15, lvl)}%` }}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-3">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={transcribing || extracting}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  <Mic className="h-4 w-4" />
                  Start Voice Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  <Square className="h-4 w-4" />
                  Stop Recording ({formatDuration(recordingSeconds)} / 00:30)
                </button>
              )}

              <p className="text-xs text-slate-500">
                {transcribing
                  ? 'Sending WAV audio to Gnani Speech-to-Text...'
                  : extracting
                  ? 'Structuring clinical fields via Qwen...'
                  : isRecording
                  ? `Listening in ${LANGUAGE_OPTIONS.find((l) => l.code === language)?.native} (up to 30s) — speak patient details, BP, sugar, and symptoms`
                  : `Speak naturally in ${LANGUAGE_OPTIONS.find((l) => l.code === language)?.label} or load a field scenario below`}
              </p>
            </div>
          </div>

          {/* Quick Field Presets for immediate testing */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">Load Field Scenario</p>
            <div className="space-y-1.5">
              {VOICE_FIELD_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setLanguage(preset.language);
                    setTranscript(preset.transcript);
                    setDistrict(preset.district);
                    const coords = getDistrictCoords(preset.district);
                    setLat(coords.lat);
                    setLng(coords.lng);
                    setErrorMessage(null);
                    setStatusMessage(
                      `Loaded ${preset.label} transcript. Click "Extract Clinical Fields" to structure via Qwen.`
                    );
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-left hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-800">{preset.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{preset.scenario}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Editable Transcript Box */}
          <div>
            <label htmlFor="visit-transcript" className="block text-xs font-medium text-slate-700 mb-1.5">
              Field Visit Transcript
            </label>
            <textarea
              id="visit-transcript"
              rows={5}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Gnani transcribed speech or typed ASHA home visit notes appear here..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExtractClinical}
              disabled={extracting || transcribing || transcript.trim().length < 8}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Structuring Fields...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Extract Clinical Fields
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePlayReadback}
              disabled={speaking || (!readbackSummary && !beneficiaryName)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {speaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              Voice Summary
            </button>
          </div>

          {readbackSummary && (
            <div className="border-t border-slate-200 pt-3.5">
              <p className="text-xs font-medium text-slate-500">Local-Language Verification Readback</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">{readbackSummary}</p>
            </div>
          )}
        </section>

        {/* Right Column: Structured Clinical Verification & Save Form */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                2. Structured Clinical Register Entry
              </h2>
              <p className="text-xs text-slate-500">
                Verify Qwen-extracted patient vitals, symptoms, and location before saving to SQLite
              </p>
            </div>

            <div className="text-xs font-semibold">
              <span className="text-slate-500 mr-1.5">Triage:</span>
              <span
                className={
                  riskLevel === 'High'
                    ? 'text-red-700'
                    : riskLevel === 'Moderate'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }
              >
                {riskLevel} Risk
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveVisit} className="mt-5 space-y-5">
            {/* Beneficiary Identity */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Beneficiary Name *
                </label>
                <input
                  type="text"
                  required
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="e.g. Lakshmamma R."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="intake-enter-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Enter Phone:
                </label>
                <input
                  id="intake-enter-phone"
                  type="tel"
                  inputMode="tel"
                  value={beneficiaryPhone}
                  onChange={(e) => setBeneficiaryPhone(e.target.value)}
                  placeholder="Enter phone number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    min={0}
                    max={105}
                    value={beneficiaryAge}
                    onChange={(e) => setBeneficiaryAge(e.target.value)}
                    placeholder="24"
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                  <select
                    value={beneficiaryGender}
                    onChange={(e) => setBeneficiaryGender(e.target.value as BeneficiaryGender)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={beneficiaryCategory}
                  onChange={(e) => setBeneficiaryCategory(e.target.value as BeneficiaryCategory)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  <option value="Pregnant Woman">Pregnant Woman</option>
                  <option value="Lactating Mother">Lactating Mother</option>
                  <option value="Child (0-5y)">Child (0-5y)</option>
                  <option value="Adolescent Girl">Adolescent Girl</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Karnataka District
                </label>
                <select
                  value={district}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDistrict(next);
                    const found = KARNATAKA_DISTRICTS.find((d) => d.district === next);
                    if (found) {
                      setLat(found.lat);
                      setLng(found.lng);
                      setPhcCenter(found.samplePhcs[0] || `PHC ${next}`);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {KARNATAKA_DISTRICTS.map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Village / Ward *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="e.g. Manvi"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleGeocodeVillage}
                    disabled={geocoding}
                    title="Locate coordinates on OpenStreetMap"
                    className="rounded-lg border border-slate-300 px-2.5 text-slate-600 hover:bg-slate-50 hover:text-teal-700 transition-colors"
                  >
                    {geocoding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Clinical Vitals Row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">BP Sys</label>
                <input
                  type="number"
                  value={bpSystolic}
                  onChange={(e) => setBpSystolic(e.target.value)}
                  placeholder="120"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">BP Dia</label>
                <input
                  type="number"
                  value={bpDiastolic}
                  onChange={(e) => setBpDiastolic(e.target.value)}
                  placeholder="80"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sugar (mg/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bloodSugar}
                  onChange={(e) => setBloodSugar(e.target.value)}
                  placeholder="110"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hb (g/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value)}
                  placeholder="11.2"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="54.0"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gest. Wks</label>
                <input
                  type="number"
                  value={gestationalWeeks}
                  onChange={(e) => setGestationalWeeks(e.target.value)}
                  placeholder="28"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {/* PHC, Immunization & IFA */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">PHC Center</label>
                <input
                  type="text"
                  value={phcCenter}
                  onChange={(e) => setPhcCenter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Immunization Status
                </label>
                <input
                  type="text"
                  value={immunizationStatus}
                  onChange={(e) => setImmunizationStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  IFA Tablets Distributed
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={ifaTablets}
                  onChange={(e) => setIfaTablets(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Risk Triage & Follow-up */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Clinical Risk Level
                </label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:border-teal-600 focus:outline-none"
                >
                  <option value="Low">Low Risk</option>
                  <option value="Moderate">Moderate Risk</option>
                  <option value="High">High Risk (Immediate Escalation)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Visit Date</label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Next Follow-up Date
                </label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Observed Symptoms
                </label>
                <input
                  type="text"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="e.g. Pedal edema, headache, pallor"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Symptom Duration
                </label>
                <input
                  type="text"
                  value={symptomDuration}
                  onChange={(e) => setSymptomDuration(e.target.value)}
                  placeholder="e.g. 3 days, 1 week"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Risk Flags (semicolon-separated)
                </label>
                <input
                  type="text"
                  value={riskFlagsText}
                  onChange={(e) => setRiskFlagsText(e.target.value)}
                  placeholder="e.g. Pre-eclampsia signs; Severe anaemia"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Recommended Clinical / PHC Action
              </label>
              <textarea
                rows={2}
                value={recommendedAction}
                onChange={(e) => setRecommendedAction(e.target.value)}
                placeholder="Referral, 108 transport plan, or next VHND follow-up..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="font-mono text-xs text-slate-500 tabular-nums">
                GPS: {lat.toFixed(4)}° N, {lng.toFixed(4)}° E
                {!currentUser && (
                  <span className="ml-3 font-sans text-amber-700">
                    Sign in required to persist record
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {currentUser ? 'Save to Field Register' : 'Sign In & Save Record'}
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

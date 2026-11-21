/**
 * Converts a browser-recorded audio Blob (e.g. WebM/Opus, OGG, or MP4) into a
 * 16kHz mono 16-bit PCM WAV Blob for clean Speech-to-Text upload and playback.
 * Includes a linear resampling fallback when OfflineAudioContext is unavailable.
 */
export async function convertAudioBlobToWav(
  inputBlob: Blob,
  targetSampleRate = 16000
): Promise<{ wavBlob: Blob; durationSeconds: number; peakAmplitude: number }> {
  if (!inputBlob || inputBlob.size === 0) {
    throw new Error('Recorded audio is empty.');
  }

  const arrayBuffer = await inputBlob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) {
    throw new Error('AudioContext is unavailable in this browser.');
  }

  const decodeCtx = new AudioCtx();
  try {
    const decodedBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    const durationSeconds = decodedBuffer.duration;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Recorded audio has zero duration.');
    }

    let pcmSamples: Float32Array;
    if (typeof OfflineAudioContext !== 'undefined') {
      const frameCount = Math.max(1, Math.ceil(durationSeconds * targetSampleRate));
      const offlineCtx = new OfflineAudioContext(1, frameCount, targetSampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);
      const rendered = await offlineCtx.startRendering();
      pcmSamples = new Float32Array(rendered.getChannelData(0));
    } else {
      pcmSamples = downsampleMonoLinear(decodedBuffer, targetSampleRate);
    }

    const { normalizedSamples, peakAmplitude } = normalizeMonoPcm(pcmSamples);
    const wavBuffer = encodePcmToWav(normalizedSamples, targetSampleRate);
    return {
      wavBlob: new Blob([wavBuffer], { type: 'audio/wav' }),
      durationSeconds,
      peakAmplitude,
    };
  } finally {
    await decodeCtx.close().catch(() => {});
  }
}

/**
 * Encodes directly captured Float32Array PCM chunks (from AudioContext) into a
 * 16kHz mono 16-bit PCM WAV Blob. Used as a lossless fallback whenever a browser's
 * MediaRecorder produces a fragmented or undecodable WebM/MP4 container.
 */
export function encodeFloat32SamplesToWav(
  chunks: Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = 16000
): { wavBlob: Blob; durationSeconds: number; peakAmplitude: number } {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  if (totalLength === 0 || !Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    throw new Error('Recorded audio is empty.');
  }

  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const durationSeconds = combined.length / sourceSampleRate;
  const resampled = resampleMonoArray(combined, sourceSampleRate, targetSampleRate);
  const { normalizedSamples, peakAmplitude } = normalizeMonoPcm(resampled);
  const wavBuffer = encodePcmToWav(normalizedSamples, targetSampleRate);

  return {
    wavBlob: new Blob([wavBuffer], { type: 'audio/wav' }),
    durationSeconds,
    peakAmplitude,
  };
}

function normalizeMonoPcm(samples: Float32Array): {
  normalizedSamples: Float32Array;
  peakAmplitude: number;
} {
  let peakAmplitude = 0;
  for (let i = 0; i < samples.length; i++) {
    const absVal = Math.abs(samples[i]);
    if (absVal > peakAmplitude) peakAmplitude = absVal;
  }

  if (peakAmplitude > 0.004 && peakAmplitude < 0.7) {
    const gain = Math.min(10, 0.85 / peakAmplitude);
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    }
    return { normalizedSamples: out, peakAmplitude };
  }

  return { normalizedSamples: samples, peakAmplitude };
}

function resampleMonoArray(
  mono: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate) return mono;
  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(mono.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = mono[idx] ?? 0;
    const s1 = mono[Math.min(idx + 1, mono.length - 1)] ?? s0;
    result[i] = s0 + (s1 - s0) * frac;
  }
  return result;
}

function downsampleMonoLinear(buffer: AudioBuffer, targetRate: number): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / channels;
    }
  }
  return resampleMonoArray(mono, buffer.sampleRate, targetRate);
}

function encodePcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio file for upload.'));
    reader.readAsDataURL(blob);
  });
}

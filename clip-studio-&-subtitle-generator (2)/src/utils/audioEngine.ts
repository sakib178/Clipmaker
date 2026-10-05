import { safeFetchJson } from './api';

/** Preview, transcription and export share the same decoded original audio. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private hasRealBuffer = false;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;
  private playbackRate = 1;
  private volume = 1;
  private onEndedCallback: (() => void) | null = null;
  private loadGeneration = 0;
  private youtubeBufferKey = '';
  private bufferRevision = 0;

  public initContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const Context = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Context();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  public getContext() { return this.ctx; }
  public getMode(): 'buffer' | 'youtube' { return 'buffer'; }
  public getBufferRevision() { return this.bufferRevision; }
  public hasDecodedAudioBuffer() { return this.hasRealBuffer && this.audioBuffer !== null; }

  private async decode(bytes: ArrayBuffer, generation: number, youtubeKey = '', isRawPcm = false) {
    const ctx = this.initContext();
    let buffer: AudioBuffer;
    try { buffer = await ctx.decodeAudioData(bytes.slice(0)); }
    catch (error) {
      if (!isRawPcm) throw new Error('This file could not be decoded. Upload a supported MP3, WAV, M4A, OGG, WebM or MP4 audio file.');
      const data = new DataView(bytes);
      buffer = ctx.createBuffer(1, Math.floor(bytes.byteLength / 2), 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = data.getInt16(i * 2, true) / 32768;
    }
    if (generation !== this.loadGeneration) throw new Error('Another audio source was selected while this one was loading.');
    if (!(buffer.duration > 0)) throw new Error('The selected media contains no audio.');
    this.stop();
    this.audioBuffer = buffer; this.hasRealBuffer = true; this.youtubeBufferKey = youtubeKey;
    this.pauseOffset = 0; this.bufferRevision++;
    return { duration: buffer.duration, buffer };
  }
  private base64Bytes(value: string) {
    const binary = atob(value.replace(/^data:[^;]+;base64,/, ''));
    return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
  }
  public async loadAudioFromFile(file: File) {
    const generation = ++this.loadGeneration;
    return this.decode(await file.arrayBuffer(), generation);
  }
  public async loadAudioFromUrl(url: string) {
    const generation = ++this.loadGeneration;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not load audio (HTTP ${response.status}).`);
    return this.decode(await response.arrayBuffer(), generation);
  }
  public async loadAudioFromBase64(value: string, _switchModeToBuffer = true, isRawPcm = false) {
    return this.decode(this.base64Bytes(value), ++this.loadGeneration, '', isRawPcm);
  }
  public async loadYoutubeAudioBuffer(value: string, videoId: string, start = 0, end = 60) {
    return this.decode(this.base64Bytes(value), ++this.loadGeneration, `${videoId}:${start}:${end}`);
  }
  public async ensureRealYoutubeBuffer(videoId: string, start = 0, end = 60, youtubeUrl?: string): Promise<boolean> {
    const key = `${videoId}:${start}:${end}`;
    if (this.hasDecodedAudioBuffer() && this.youtubeBufferKey === key) return true;
    const generation = ++this.loadGeneration;
    let lastError = 'The original YouTube audio is not ready. Retry pulling it or upload an audio file.';
    for (let attempt = 0; attempt < 20; attempt++) {
      if (generation !== this.loadGeneration) throw new Error('Another audio source was selected.');
      const { ok, data } = await safeFetchJson<{ audioBase64?: string; warmingUp?: boolean; error?: string }>(
        '/api/youtube/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, url: youtubeUrl, startTime: start, endTime: end }), signal: AbortSignal.timeout(25_000) }, 0
      );
      if (generation !== this.loadGeneration) throw new Error('Another audio source was selected.');
      if (ok && data?.audioBase64) { await this.decode(this.base64Bytes(data.audioBase64), generation, key); return true; }
      lastError = data?.error || lastError;
      if (!data?.warmingUp) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(lastError);
  }
  public async loadYoutubeVideo(videoId: string, start = 0, end = 60, preloadedAudioBase64?: string) {
    if (preloadedAudioBase64) return this.loadYoutubeAudioBuffer(preloadedAudioBase64, videoId, start, end);
    await this.ensureRealYoutubeBuffer(videoId, start, end);
    return { duration: this.audioBuffer!.duration };
  }
  /** Initial silent demo placeholder; never considered exportable audio. */
  public generateSyntheticBuffer(duration = 30) {
    ++this.loadGeneration; this.stop();
    const ctx = this.initContext();
    this.audioBuffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * Math.max(0.1, Math.min(3600, duration))), ctx.sampleRate);
    this.hasRealBuffer = false; this.youtubeBufferKey = ''; this.pauseOffset = 0; this.bufferRevision++;
    return this.audioBuffer;
  }
  private wavBytes(start: number, end: number | undefined, rate: number, channels: number, gain: number) {
    if (!this.audioBuffer || !this.hasRealBuffer) return null;
    const buffer = this.audioBuffer;
    const s = Math.max(0, Math.min(buffer.duration, start));
    const e = Math.max(s, Math.min(buffer.duration, end ?? buffer.duration));
    const frames = Math.floor((e - s) * rate);
    if (!Number.isFinite(frames) || frames <= 0) return null;
    const blockAlign = channels * 2, dataSize = frames * blockAlign;
    const bytes = new ArrayBuffer(44 + dataSize), view = new DataView(bytes);
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, dataSize, true);
    const sourceChannels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    let offset = 44;
    for (let frame = 0; frame < frames; frame++) {
      const position = (s + frame / rate) * buffer.sampleRate;
      const index = Math.min(buffer.length - 1, Math.floor(position)), next = Math.min(buffer.length - 1, index + 1), fraction = position - index;
      for (let channel = 0; channel < channels; channel++) {
        const data = sourceChannels[channel] || sourceChannels[0];
        const sample = channels === 1 && sourceChannels.length > 1
          ? sourceChannels.reduce((sum, ch) => sum + ch[index] * (1 - fraction) + ch[next] * fraction, 0) / sourceChannels.length
          : data[index] * (1 - fraction) + data[next] * fraction;
        const value = Math.max(-1, Math.min(1, sample * gain));
        view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true); offset += 2;
      }
    }
    return bytes;
  }
  public exportHighQualityWavBlob(start = 0, end?: number, volumeMultiplier = 1): Blob | null {
    if (!this.audioBuffer) return null;
    const bytes = this.wavBytes(start, end, this.audioBuffer.sampleRate, Math.min(2, this.audioBuffer.numberOfChannels), Math.max(0, Math.min(2, volumeMultiplier)));
    return bytes ? new Blob([bytes], { type: 'audio/wav' }) : null;
  }
  public exportWavBase64(start = 0, end?: number): string | null {
    const bytes = this.wavBytes(start, end, 16000, 1, 1);
    if (!bytes) return null;
    const data = new Uint8Array(bytes); let binary = '';
    for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
    return btoa(binary);
  }
  /** Offline spectrum from the actual audio, for accelerated canvas exports. */
  public getFrequencyDataAt(seconds: number): Uint8Array {
    const result = new Uint8Array(64);
    if (!this.audioBuffer || !this.hasRealBuffer || seconds < 0 || seconds >= this.audioBuffer.duration) return result;
    const data = this.audioBuffer, start = Math.floor(seconds * data.sampleRate), size = 128;
    const signal = new Float32Array(size);
    const channels = Array.from({ length: data.numberOfChannels }, (_, channel) => data.getChannelData(channel));
    for (let i = 0; i < size; i++) {
      signal[i] = channels.reduce((sum, channel) => sum + (channel[start + i] || 0), 0) / channels.length * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    }
    for (let bin = 0; bin < result.length; bin++) {
      let real = 0, imaginary = 0;
      for (let i = 0; i < size; i++) { const angle = 2 * Math.PI * bin * i / size; real += signal[i] * Math.cos(angle); imaginary -= signal[i] * Math.sin(angle); }
      const amplitude = Math.sqrt(real * real + imaginary * imaginary) / size;
      const decibels = 20 * Math.log10(Math.max(1e-8, amplitude));
      result[bin] = Math.round(Math.max(0, Math.min(255, (decibels + 100) / 70 * 255)));
    }
    return result;
  }
  public getWaveformPeaks(count = 90): number[] {
    if (!this.audioBuffer || !this.hasRealBuffer) return Array(count).fill(0);
    const data = this.audioBuffer.getChannelData(0), other = this.audioBuffer.numberOfChannels > 1 ? this.audioBuffer.getChannelData(1) : data, step = Math.max(1, Math.floor(data.length / count));
    const peaks = Array.from({ length: count }, (_, bar) => {
      let peak = 0;
      for (let i = bar * step; i < Math.min(data.length, (bar + 1) * step); i += Math.max(1, Math.floor(step / 400))) peak = Math.max(peak, Math.abs(data[i]), Math.abs(other[i]));
      return peak;
    });
    const max = Math.max(0.01, ...peaks);
    return peaks.map(value => Math.round(value / max * 95));
  }
  public play(offsetSeconds = 0, onEnded?: () => void) {
    const ctx = this.initContext(); if (!this.audioBuffer) return;
    this.stop(); this.onEndedCallback = onEnded || null;
    const offset = Math.max(0, Math.min(offsetSeconds, this.audioBuffer.duration)); this.pauseOffset = offset;
    if (offset >= this.audioBuffer.duration) { this.onEndedCallback?.(); return; }
    const source = ctx.createBufferSource(), gain = ctx.createGain(), analyser = ctx.createAnalyser();
    source.buffer = this.audioBuffer; source.playbackRate.value = this.playbackRate; gain.gain.value = this.volume; analyser.fftSize = 128;
    source.connect(gain); gain.connect(analyser); analyser.connect(ctx.destination);
    this.sourceNode = source; this.gainNode = gain; this.analyserNode = analyser;
    this.startTime = ctx.currentTime - offset / this.playbackRate; this.isPlaying = true;
    source.onended = () => {
      if (this.sourceNode !== source || !this.isPlaying) return;
      this.pauseOffset = this.audioBuffer?.duration || 0; this.isPlaying = false; this.onEndedCallback?.();
    };
    source.start(0, offset);
  }
  public pause() { this.pauseOffset = this.getCurrentTime(); this.stop(); return this.pauseOffset; }
  public stop() {
    if (this.sourceNode) { this.sourceNode.onended = null; try { this.sourceNode.stop(); } catch {} this.sourceNode.disconnect(); this.sourceNode = null; }
    this.gainNode?.disconnect(); this.analyserNode?.disconnect(); this.gainNode = null; this.analyserNode = null; this.isPlaying = false;
  }
  public seek(seconds: number) {
    const playing = this.isPlaying, callback = this.onEndedCallback; this.stop();
    this.pauseOffset = Math.max(0, Math.min(seconds, this.getDuration()));
    if (playing) this.play(this.pauseOffset, callback || undefined);
  }
  public getCurrentTime() { return this.isPlaying && this.ctx ? Math.min(this.getDuration(), (this.ctx.currentTime - this.startTime) * this.playbackRate) : this.pauseOffset; }
  public setVolume(volume: number) {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(2, volume)) : 1;
    if (this.gainNode && this.ctx) this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
  }
  public setPlaybackRate(rate: number) {
    const position = this.getCurrentTime(); this.playbackRate = Number.isFinite(rate) ? Math.max(0.25, Math.min(4, rate)) : 1;
    if (this.sourceNode && this.ctx) { this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime); this.startTime = this.ctx.currentTime - position / this.playbackRate; }
  }
  public getFrequencyData() {
    if (!this.analyserNode || !this.isPlaying) return new Uint8Array(64);
    const data = new Uint8Array(this.analyserNode.frequencyBinCount); this.analyserNode.getByteFrequencyData(data); return data;
  }
  public getAudioBuffer() { return this.audioBuffer; }
  public getDuration() { return this.audioBuffer?.duration || 0; }
  public getIsPlaying() { return this.isPlaying; }
}
export const globalAudioEngine = new AudioEngine();

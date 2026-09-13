/**
 * 100% Offline Synthesized Audio Engine (Web Audio API)
 * Zero external MP3/audio dependencies.
 *
 * Generates pink/brown noise for rain, modulated noise for ocean waves,
 * and stereo sine tones for binaural beats.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private currentSource: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private currentType: string | null = null;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Play synthesized Rain / White Noise */
  playRain(volume = 0.3) {
    this.stop();
    this.init();
    if (!this.ctx) return;

    // Generate 4 seconds of pink/brown noise
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2) * 0.25;
      }
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Filter to sound like soft soothing rain
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 850;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noiseSource.start();
    this.currentSource = noiseSource;
    this.gainNode = gain;
    this.isPlaying = true;
    this.currentType = 'rain';
  }

  /** Play synthesized Ocean Waves */
  playWaves(volume = 0.35) {
    this.stop();
    this.init();
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 5;
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Lowpass filter for deep surf
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    // Modulate gain with a slow LFO to simulate rolling wave tides (every 6 seconds)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.15; // 0.15 Hz = ~6.6s cycle

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = volume * 0.7;

    const mainGain = this.ctx.createGain();
    mainGain.gain.value = volume * 0.3;

    lfo.connect(lfoGain);
    lfoGain.connect(mainGain.gain);

    noiseSource.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(this.ctx.destination);

    noiseSource.start();
    lfo.start();

    this.currentSource = noiseSource;
    this.gainNode = mainGain;
    this.isPlaying = true;
    this.currentType = 'waves';
  }

  /** Play 10 Hz Alpha Binaural Beats for focus */
  playBinauralAlpha(volume = 0.2) {
    this.stop();
    this.init();
    if (!this.ctx) return;

    // Left ear: 200 Hz, Right ear: 210 Hz (Delta = 10 Hz Alpha wave)
    const oscL = this.ctx.createOscillator();
    const oscR = this.ctx.createOscillator();
    oscL.frequency.value = 200;
    oscR.frequency.value = 210;

    const merger = this.ctx.createChannelMerger(2);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    oscL.connect(merger, 0, 0); // Left channel
    oscR.connect(merger, 0, 1); // Right channel

    merger.connect(gain);
    gain.connect(this.ctx.destination);

    oscL.start();
    oscR.start();

    this.gainNode = gain;
    this.isPlaying = true;
    this.currentType = 'alpha';
  }

  /** Play pleasant completion chime */
  playChime() {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.2);
  }

  setVolume(vol: number) {
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime);
    }
  }

  stop() {
    if (this.currentSource) {
      try {
        (this.currentSource as AudioBufferSourceNode).stop();
      } catch {
        // ignore already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.currentType = null;
  }

  getStatus() {
    return { isPlaying: this.isPlaying, currentType: this.currentType };
  }
}

export const soundEngine = new SoundEngine();

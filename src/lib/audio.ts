export class SoundGenerator {
  private audioCtx: AudioContext | null = null;

  private init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
    this.init();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }

  playHighlight() {
    this.playTone(600, 'sine', 0.2, 0.1);
  }

  playClick() {
    this.playTone(800, 'sine', 0.1, 0.05);
  }

  playSuccess() {
    this.init();
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    
    // Play a chord
    [523.25, 659.25, 783.99].forEach(freq => {
      const osc = this.audioCtx!.createOscillator();
      const gain = this.audioCtx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(this.audioCtx!.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  playError() {
    this.init();
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.3);
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

export const sound = new SoundGenerator();

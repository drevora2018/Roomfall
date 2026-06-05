export class AudioManager {
  constructor() {
    this.context = null;
    this.muted = false;
  }

  setMuted(value) {
    this.muted = value;
  }

  async unlock() {
    if (typeof window === "undefined" || this.muted) {
      return;
    }
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      this.context = new AudioContextClass();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  beep({ frequency = 440, duration = 0.08, type = "square", gain = 0.03 }) {
    if (!this.context || this.muted) {
      return;
    }
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.value = gain;
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}

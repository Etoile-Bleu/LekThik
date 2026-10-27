const KEY = 'lekthik.timer.sound.v1';

export function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    return;
  }
}

export function chime(): void {
  try {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    gain.connect(context.destination);
    [660, 880].forEach((frequency, index) => {
      const tone = context.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(context.currentTime + index * 0.22);
      tone.stop(context.currentTime + index * 0.22 + 0.4);
    });
    window.setTimeout(() => void context.close(), 1500);
  } catch {
    return;
  }
}

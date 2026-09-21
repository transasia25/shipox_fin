/**
 * Звуковой отклик на скан.
 *
 * Кладовщик смотрит на посылки, а не на экран: по звуку он понимает, что скан
 * принят или что нужно поднять глаза. Тоны синтезируются на месте — файлы
 * не нужны, и звук не опаздывает на загрузку.
 */

export type BeepKind = "ok" | "repeat" | "warn" | "error";

/** Частота, Гц, и длительность, с, для каждого сигнала. */
const TONES: Record<BeepKind, Array<[number, number]>> = {
  ok: [[1046, 0.09]],
  repeat: [
    [784, 0.06],
    [784, 0.06],
  ],
  warn: [
    [523, 0.12],
    [784, 0.12],
  ],
  error: [[196, 0.35]],
};

let context: AudioContext | null = null;

export function beep(kind: BeepKind): void {
  try {
    context ??= new AudioContext();
    let at = context.currentTime;
    for (const [frequency, duration] of TONES[kind]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "error" ? "square" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.18, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + duration);
      at += duration + 0.04;
    }
  } catch {
    // Браузер без звука или без разрешения на него — приёмка работает и так.
  }
}

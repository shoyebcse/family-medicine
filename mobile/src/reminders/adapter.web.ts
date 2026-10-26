import { shouldPresent } from './plan';
import { testMessage, type AlarmLanguage } from './language';
import {
  TEST_PREFIX,
  type ReminderAdapter,
  type ReminderCapabilities,
  type ReminderRegistration,
  type ReminderSignal,
} from './types';

/** Browser fallback: active-tab timers only. No promise of background/closed-tab delivery. */
export class PlatformReminderAdapter implements ReminderAdapter {
  private statusListeners = new Set<() => void>();
  private readonly voicesChanged = () => {
    this.speechError = undefined;
    this.notifyStatus();
  };
  constructor() {
    if (typeof window !== 'undefined')
      window.speechSynthesis?.addEventListener?.('voiceschanged', this.voicesChanged);
  }
  private notifyStatus() {
    for (const listener of this.statusListeners) listener();
  }
  subscribeStatus(listener: () => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  private localVoices() {
    return typeof window === 'undefined'
      ? []
      : (window.speechSynthesis?.getVoices() ?? []).filter((voice) => voice.localService);
  }
  private selectedVoice() {
    const voices = this.localVoices();
    const normalize = (value: string) => value.toLowerCase().replaceAll('_', '-');
    return (
      voices.find((voice) => normalize(voice.lang) === normalize(this.language)) ??
      voices.find((voice) => normalize(voice.lang).split('-')[0] === this.language.slice(0, 2))
    );
  }
  testSpeech() {
    this.stopSound();
    this.playSpeech([testMessage(this.language)]);
  }
  private language: AlarmLanguage = 'en-IN';
  async setLanguage(language: AlarmLanguage) {
    this.stopSound();
    this.language = language;
    this.speechError = undefined;
    this.notifyStatus();
  }
  private registrations = new Map<string, ReminderRegistration>();
  private listeners = new Set<(signal: ReminderSignal) => void>();
  private audio: AudioContext | null = null;
  private ringTimer: ReturnType<typeof setInterval> | null = null;
  private ringDeadline: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private ringing = false;
  private notices = new Set<Notification>();
  private audioError: string | undefined;
  private lastTriggeredAt: number | undefined;
  private speechError: string | undefined;
  private speechQueue: string[] = [];
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private utterances = new Set<SpeechSynthesisUtterance>();
  private repeatedMessages = new Set<string>();
  private lastSpeechAt = 0;

  async inspect(): Promise<ReminderCapabilities> {
    return {
      platform: 'browser',
      notifications:
        typeof Notification === 'undefined'
          ? 'unsupported'
          : Notification.permission === 'default'
            ? 'prompt'
            : Notification.permission,
      exactAlarm: false,
      sound: this.audio?.state === 'running' && !this.audioError,
      canSchedule: typeof window !== 'undefined',
      audioError: this.audioError,
      lastTriggeredAt: this.lastTriggeredAt,
      speechError: this.speechError,
      speechVoice: this.selectedVoice()?.lang,
      localSpeechLanguages: [...new Set(this.localVoices().map((voice) => voice.lang))],
    };
  }
  async enable() {
    if (typeof window !== 'undefined') window.speechSynthesis?.getVoices();
    // Executed directly from a user click before any await, satisfying autoplay rules.
    try {
      if (typeof window !== 'undefined' && typeof AudioContext !== 'undefined') {
        this.audio ??= new AudioContext();
        await this.audio.resume();
      }
      this.beep();
    } catch {
      this.audioError =
        'Sound could not start. Re-enable sound and check Chrome site sound permission, tab mute and speaker volume.';
    }
    this.ticker ??= setInterval(() => this.tick(), 500);
  }
  async restoreEnabled() {
    return false;
  } // A new page requires a fresh user gesture for sound.
  async saveEnabled(enabled: boolean) {
    // No clinical data or opt-in is persisted. Stop background work when disabled.
    if (!enabled) {
      if (this.ticker) clearInterval(this.ticker);
      this.ticker = null;
      this.stopSound();
      if (this.audio?.state === 'running') await this.audio.suspend();
    }
  }
  async requestDesktopPermission() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default')
      await Notification.requestPermission();
  }
  async list() {
    return [...this.registrations.values()];
  }
  async schedule(item: ReminderRegistration) {
    if (item.dueAt > Date.now()) this.registrations.set(item.key, item);
  }
  async cancel(key: string) {
    this.registrations.delete(key);
  }
  async test() {
    if (!this.ticker) throw new Error('Enable reminders first.');
    this.registrations.set(`${TEST_PREFIX}browser`, {
      key: `${TEST_PREFIX}browser`,
      dueAt: Date.now() + 5000,
    });
  }
  subscribe(listener: (signal: ReminderSignal) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private tick() {
    const now = Date.now();
    const due = [...this.registrations.values()].filter((r) => r.dueAt <= now);
    for (const item of due) this.registrations.delete(item.key);
    const fresh = due.filter((r) => shouldPresent(r.dueAt, now));
    if (!fresh.length) return;
    this.lastTriggeredAt = now;
    // One sound/desktop alert per tick, even if several members have the same time.
    this.ring();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const notice = new Notification('Family Medicine', {
          body: fresh.every((r) => r.key.startsWith(TEST_PREFIX))
            ? 'This is a test reminder.'
            : 'A medicine reminder is due.',
          tag: 'family-medicine-due',
        });
        this.notices.add(notice);
        notice.onclose = () => this.notices.delete(notice);
      } catch {
        /* Some browsers require a service worker; the in-app alert still works. */
      }
    }
    for (const item of fresh)
      for (const listener of this.listeners)
        listener({ key: item.key, test: item.key.startsWith(TEST_PREFIX) });
  }
  private beep() {
    if (this.speechTimer || this.utterances.size) return;
    if (this.repeatedMessages.size && !this.speechError) return;
    try {
      this.playBeep();
      this.audioError = undefined;
    } catch {
      this.audioError =
        'Sound could not play. Re-enable sound and check Chrome site sound permission, tab mute and speaker volume.';
    }
  }
  private playBeep() {
    if (!this.audio || this.audio.state !== 'running') throw new Error('Audio is not running');
    const start = this.audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0, start + i * 0.32);
      gain.gain.linearRampToValueAtTime(0.14, start + i * 0.32 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.32 + 0.22);
      oscillator.connect(gain);
      gain.connect(this.audio.destination);
      oscillator.start(start + i * 0.32);
      oscillator.stop(start + i * 0.32 + 0.24);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }
  private ring() {
    if (this.ringing) return;
    this.ringing = true;
    this.beep();
    this.ringTimer = setInterval(() => {
      if (
        this.repeatedMessages.size &&
        !this.speechTimer &&
        !this.utterances.size &&
        Date.now() - this.lastSpeechAt >= 5000
      ) {
        for (const message of this.repeatedMessages) this.speak(message);
      } else this.beep();
    }, 2500);
    this.ringDeadline = setTimeout(() => this.stopSound(), 30_000);
  }
  speak(message: string) {
    this.repeatedMessages.add(message);
    this.speechQueue.push(message);
    if (this.speechTimer) return;
    // Let the initial three beeps finish before speaking; group simultaneous doses.
    this.speechTimer = setTimeout(() => {
      this.speechTimer = null;
      this.lastSpeechAt = Date.now();
      const messages = this.speechQueue.splice(0);
      this.playSpeech(messages);
    }, 1000);
  }
  private playSpeech(messages: string[]) {
    try {
      const synthesis = window.speechSynthesis;
      const voice = this.selectedVoice();
      if (!voice || typeof SpeechSynthesisUtterance === 'undefined')
        throw new Error('No installed voice');
      synthesis.resume?.();
      for (const text of messages) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang.replaceAll('_', '-');
        utterance.rate = 0.9;
        utterance.onend = () => {
          this.utterances.delete(utterance);
          this.lastSpeechAt = Date.now();
        };
        utterance.onerror = (event) => {
          this.utterances.delete(utterance);
          if (event.error !== 'canceled' && event.error !== 'interrupted')
            this.speechError =
              event.error === 'not-allowed'
                ? 'Chrome blocked speech. Allow site sound and click Check / test selected voice now to start speech from a direct click.'
                : `Speech could not play (${event.error}). Check browser sound and the installed voice for the selected language.`;
          this.notifyStatus();
        };
        this.utterances.add(utterance);
        synthesis.speak(utterance);
      }
      this.speechError = undefined;
    } catch {
      this.utterances.clear();
      this.speechError = `Spoken reminders need an installed text-to-speech voice for ${this.language === 'hi-IN' ? 'Hindi' : 'English'}. Install that voice in device settings; the tone and visible alert remain available.`;
    }
    this.notifyStatus();
  }
  stopSound() {
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = null;
    this.speechQueue = [];
    this.repeatedMessages.clear();
    if (typeof window !== 'undefined' && this.utterances.size) window.speechSynthesis?.cancel();
    this.utterances.clear();
    this.ringing = false;
    if (this.ringTimer) clearInterval(this.ringTimer);
    if (this.ringDeadline) clearTimeout(this.ringDeadline);
    this.ringTimer = null;
    this.ringDeadline = null;
    for (const notice of this.notices) notice.close();
    this.notices.clear();
  }
  dispose() {
    if (typeof window !== 'undefined')
      window.speechSynthesis?.removeEventListener?.('voiceschanged', this.voicesChanged);
    this.statusListeners.clear();
    this.stopSound();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.registrations.clear();
    if (this.audio) void this.audio.close().catch(() => undefined);
    this.audio = null;
  }
}

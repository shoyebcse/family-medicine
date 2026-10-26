import type { AlarmLanguage } from './language';
type SpeechDriver = {
  speak(
    text: string,
    options: { language: string; rate: number; onDone(): void; onError(error: Error): void },
  ): void;
  stop(): Promise<void>;
};

/** Foreground speech only; clinical names stay out of notification payloads. */
export class NativeReminderSpeech {
  private language: AlarmLanguage = 'en-IN';
  setLanguage(language: AlarmLanguage) {
    this.stop();
    this.language = language;
  }
  error: string | undefined;
  private messages = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private pending = 0;
  private preparing = false;
  private stopping: Promise<void> = Promise.resolve();

  constructor(
    private readonly driver: SpeechDriver,
    private readonly isActive: () => boolean,
  ) {}

  speak(message: string) {
    if (!this.isActive()) return;
    this.messages.add(message);
    this.deadline ??= setTimeout(() => this.stop(), 30000);
    if (!this.timer && !this.pending && !this.preparing) this.schedule(0);
  }

  private schedule(delay: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private async flush() {
    const generation = this.generation;
    this.preparing = true;
    await this.stopping;
    if (generation !== this.generation) return;
    this.preparing = false;
    if (!this.isActive() || !this.messages.size) return;
    const messages = [...this.messages];
    this.pending = messages.length;
    this.error = undefined;
    for (const text of messages) {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished || generation !== this.generation) return;
        finished = true;
        if (error)
          this.error =
            'Speech could not play. Check media volume and Android text-to-speech settings.';
        this.pending--;
        if (!this.pending && this.isActive()) this.schedule(5000);
      };
      try {
        this.driver.speak(text, {
          language: this.language,
          rate: 0.9,
          onDone: () => finish(),
          onError: finish,
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Speech unavailable'));
      }
    }
  }

  stop() {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    if (this.deadline) clearTimeout(this.deadline);
    this.timer = null;
    this.deadline = null;
    this.messages.clear();
    this.pending = 0;
    this.preparing = false;
    this.stopping = this.stopping
      .then(() => this.driver.stop())
      .catch(() => {
        this.error = 'Could not stop speech. Check Android text-to-speech settings.';
      });
  }
}

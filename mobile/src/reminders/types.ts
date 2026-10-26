export type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported';
export type ReminderCapabilities = {
  platform: 'browser' | 'native';
  notifications: Permission;
  exactAlarm: boolean;
  sound: boolean;
  canSchedule: boolean;
  lastTriggeredAt?: number;
  audioError?: string;
  speechError?: string;
  speechVoice?: string;
  localSpeechLanguages?: string[];
  backgroundSpeech?: boolean;
};
export type ReminderRegistration = {
  key: string;
  dueAt: number;
  message?: string;
  language?: import('./language').AlarmLanguage;
};
export type ReminderSignal = { key: string; test: boolean };
export interface ReminderAdapter {
  testSpeech?(): void;
  subscribeStatus?(listener: () => void): () => void;
  setLanguage?(language: import('./language').AlarmLanguage): Promise<void>;
  inspect(): Promise<ReminderCapabilities>;
  enable(): Promise<void>;
  restoreEnabled(): Promise<boolean>;
  saveEnabled(enabled: boolean): Promise<void>;
  requestDesktopPermission(): Promise<void>;
  list(): Promise<ReminderRegistration[]>;
  schedule(item: ReminderRegistration): Promise<void>;
  cancel(key: string): Promise<void>;
  test(): Promise<void>;
  stopSound(): void;
  speak?(message: string): void;
  subscribe(listener: (signal: ReminderSignal) => void): () => void;
  dispose(): void;
}
export type ReminderReport = {
  count: number;
  lastScheduledAt: number | null;
  nextDueAt: number | null;
  omitted: number;
  reconciledAt: number;
};
export const DOSE_PREFIX = 'family-medicine:dose:';
export const TEST_PREFIX = 'family-medicine:test:';
// An app scheduling budget, not a claim about any platform's guaranteed capacity.
export const PENDING_BUDGET = 60;

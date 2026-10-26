import type { AlarmLanguage } from './language';
const key = 'family-medicine.alarm-language.v1';
export async function readAlarmLanguage(): Promise<AlarmLanguage> {
  return localStorage.getItem(key) === 'hi-IN' ? 'hi-IN' : 'en-IN';
}
export async function saveAlarmLanguage(language: AlarmLanguage) {
  localStorage.setItem(key, language);
}

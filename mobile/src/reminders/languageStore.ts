import * as SecureStore from 'expo-secure-store';
import type { AlarmLanguage } from './language';
const key = 'family-medicine.alarm-language.v1';
export async function readAlarmLanguage(): Promise<AlarmLanguage> {
  return (await SecureStore.getItemAsync(key)) === 'hi-IN' ? 'hi-IN' : 'en-IN';
}
export async function saveAlarmLanguage(language: AlarmLanguage) {
  await SecureStore.setItemAsync(key, language);
}

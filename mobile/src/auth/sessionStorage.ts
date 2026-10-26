import * as SecureStore from 'expo-secure-store';
const KEY = 'family-medicine.account-session.v1';
export const sessionStorage = {
  read: () => SecureStore.getItemAsync(KEY),
  write: (value: string) =>
    SecureStore.setItemAsync(KEY, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const storageKey = 'family-medicine.google-attempt';

export async function openGoogle(authorizationUrl: string, clientSecret: string) {
  if (!authorizationUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'))
    throw new Error('The Google sign-in URL was invalid.');
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(storageKey, clientSecret);
    window.location.assign(authorizationUrl);
  } else {
    await Linking.openURL(authorizationUrl);
  }
}

export function takeWebGoogleReturn() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const ticket = params.get('google_ticket');
  if (!ticket && !params.has('google_error')) return null;
  const secret = window.sessionStorage.getItem(storageKey);
  window.sessionStorage.removeItem(storageKey);
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
  return { ticket, secret };
}

export function subscribeToGoogleReturn(onReturn: (ticket: string | null) => void) {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    const { scheme, queryParams } = Linking.parse(url);
    if (scheme !== 'family-medicine') return;
    const ticket = queryParams?.google_ticket;
    if (typeof ticket === 'string') onReturn(ticket);
    else if (queryParams?.google_error === '1') onReturn(null);
  });
  return () => subscription.remove();
}

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import {
  AuthApi,
  AuthHttpError,
  type Session,
  type Challenge,
  type Account,
  type AuthOptions,
  type GoogleStart,
} from './api';
import { sessionStorage } from './sessionStorage';
import { PlatformReminderAdapter } from '../reminders/adapter';
import { DOSE_PREFIX, TEST_PREFIX } from '../reminders/types';
import type { DoseInput } from '../domain/types';

const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ && Platform.OS === 'web' ? 'http://localhost:8080' : '');
type AuthState = {
  session: Session | null;
  demo: boolean;
  ready: boolean;
  notice: string | null;
  apiUrl: string;
  login(email: string, password: string): Promise<void>;
  register(displayName: string, email: string, password: string): Promise<void>;
  getOptions(): Promise<AuthOptions>;
  startGoogle(): Promise<GoogleStart>;
  completeGoogle(ticket: string, clientSecret: string): Promise<void>;
  startPhone(phone: string): Promise<Challenge>;
  verifyPhone(challengeId: string, code: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  invalidate(): void;
  explore(): void;
  pendingEvidence: Map<string, DoseInput>;
};
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [api] = useState(() => new AuthApi(baseUrl));
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const evidence = useRef(new Map<string, Map<string, DoseInput>>());
  const clearing = useRef(false);
  const [pendingEvidence, setPendingEvidence] = useState(() => new Map<string, DoseInput>());
  const restoreEvidence = useCallback((accountId: string) => {
    let pending = evidence.current.get(accountId);
    if (!pending) {
      pending = new Map();
      evidence.current.set(accountId, pending);
    }
    setPendingEvidence(pending);
  }, []);

  const clearReminders = useCallback(async () => {
    const adapter = new PlatformReminderAdapter();
    try {
      await adapter.saveEnabled(false);
      for (const item of await adapter.list())
        if (item.key.startsWith(DOSE_PREFIX) || item.key.startsWith(TEST_PREFIX))
          await adapter.cancel(item.key);
      adapter.stopSound();
    } finally {
      adapter.dispose();
    }
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      let saved: Session | null = null;
      try {
        const stored = await sessionStorage.read();
        if (stored) {
          saved = JSON.parse(stored) as Session;
          if (!saved.token || Date.parse(saved.expiresAt) <= Date.now())
            throw new Error('Session expired');
          const account = await api.request<Account>('/me', undefined, saved.token);
          if (active) {
            restoreEvidence(account.id);
            setSession({ ...saved, account });
          }
        }
      } catch (error) {
        if (
          saved &&
          saved.account?.id &&
          Date.parse(saved.expiresAt) > Date.now() &&
          !(error instanceof AuthHttpError && error.status === 401)
        ) {
          if (active) {
            restoreEvidence(saved.account.id);
            setSession(saved);
            setNotice(
              'Could not verify the connection. Existing reminders are retained; reconnect to load records.',
            );
          }
          return;
        }
        try {
          await sessionStorage.clear();
          await clearReminders();
          if (active) setNotice('Please sign in again to load your account.');
        } catch {
          if (active)
            setNotice(
              'Sign in again. Reminder cleanup needs attention; check active alarm notifications.',
            );
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, clearReminders, restoreEvidence]);
  const accept = useCallback(
    async (next: Session) => {
      await clearReminders();
      await sessionStorage.write(JSON.stringify(next));
      restoreEvidence(next.account.id);
      setDemo(false);
      setNotice(null);
      setSession(next);
    },
    [clearReminders, restoreEvidence],
  );
  const getOptions = useCallback(
    () => api.request<AuthOptions>(`/options?web=${Platform.OS === 'web'}`),
    [api],
  );
  const completeGoogle = useCallback(
    async (ticket: string, clientSecret: string) =>
      accept(await api.request<Session>('/google/complete', { ticket, clientSecret })),
    [api, accept],
  );
  const invalidate = useCallback(() => {
    if (clearing.current) return;
    clearing.current = true;
    void (async () => {
      try {
        await clearReminders();
        await sessionStorage.clear();
      } catch {
        // The sign-in gate still clears the protected UI if device storage is unavailable.
      } finally {
        setSession(null);
        setDemo(false);
        clearing.current = false;
        setNotice(
          'Your session expired. Sign in again. Pending dose retries are retained for this account while the app stays open.',
        );
      }
    })();
  }, [clearReminders]);
  const logout = async () => {
    if (pendingEvidence.size) throw new Error('Retry pending dose changes before signing out.');
    await clearReminders();
    let offline = false;
    if (session) {
      try {
        await api.request('/logout', {}, session.token);
      } catch {
        offline = true;
      }
    }
    await sessionStorage.clear();
    setSession(null);
    setDemo(false);
    setNotice(
      offline
        ? 'Signed out on this device. Server sign-out could not be confirmed; the session expires automatically.'
        : null,
    );
  };
  return (
    <Context.Provider
      value={{
        session,
        demo,
        ready,
        notice,
        apiUrl: baseUrl,
        pendingEvidence,
        login: async (email, password) =>
          accept(await api.request<Session>('/login', { email, password })),
        register: async (displayName, email, password) =>
          accept(await api.request<Session>('/register', { displayName, email, password })),
        getOptions,
        startGoogle: () =>
          api.request<GoogleStart>('/google/start', { web: Platform.OS === 'web' }),
        completeGoogle,
        startPhone: async (phone) => {
          const challenge = await api.request<Challenge>('/phone/start', { phone });
          if (challenge.developmentCode)
            throw new Error('SMS verification is unavailable on this server.');
          return challenge;
        },
        verifyPhone: async (challengeId, code, displayName) =>
          accept(await api.request<Session>('/phone/verify', { challengeId, code, displayName })),
        logout,
        invalidate,
        explore: () => {
          setPendingEvidence(new Map());
          setDemo(true);
          setNotice(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Crypto from 'expo-crypto';
import { ApiRepository, MedicineHttpError } from '../data/api';
import { DemoRepository } from '../data/demo';
import { useAuth } from '../auth/AuthProvider';
import { addDays, localDate } from '../domain/dates';
import type { DoseAction, Member, MedicineRepository, Occurrence, Schedule } from '../domain/types';
type Store = {
  members: Member[];
  schedules: Schedule[];
  today: Occurrence[];
  history: Occurrence[];
  reminderDoses: Occurrence[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  lastSync: Date | null;
  demo: boolean;
  refresh(): Promise<void>;
  clearError(): void;
  addMember(
    name: string,
    relationship: string,
    phone?: string,
    inviteAccess?: boolean,
  ): Promise<void>;
  record(dose: Occurrence, action: DoseAction, earlyConfirmed?: boolean): Promise<void>;
  repository: MedicineRepository;
};
const Context = createContext<Store | null>(null);
export function MedicineProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const repository = useMemo<MedicineRepository>(
    () =>
      auth.demo
        ? new DemoRepository()
        : new ApiRepository(auth.apiUrl, auth.session?.token ?? '', auth.invalidate),
    [auth.demo, auth.apiUrl, auth.session?.token, auth.invalidate],
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [today, setToday] = useState<Occurrence[]>([]);
  const [history, setHistory] = useState<Occurrence[]>([]);
  const [reminderDoses, setReminderDoses] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const pending = useRef(auth.pendingEvidence);
  const lock = useRef(false);
  const loadGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const date = localDate();
      const [people, medicines, doses, recent, upcoming] = await Promise.all([
        repository.members(),
        repository.schedules(),
        repository.occurrences(date, date),
        repository.occurrences(addDays(date, -6), date),
        repository.occurrences(date, addDays(date, 7)),
      ]);
      if (generation !== loadGeneration.current) return;
      setMembers(people);
      setSchedules(medicines);
      setToday(doses);
      setHistory(recent);
      setReminderDoses(upcoming);
      setLastSync(new Date());
      setError(null);
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setError(e instanceof Error ? e.message : 'Could not load records. Please retry.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(initialLoad);
    };
  }, [refresh]);
  // Recompute date-sensitive statuses while the screen is open; no reminder claims.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!lock.current) void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  const addMember = useCallback(
    async (name: string, relationship: string, phone?: string, inviteAccess = false) => {
      await repository.createMember(name, relationship, phone, inviteAccess);
      await refresh();
    },
    [refresh, repository],
  );
  const record = useCallback(
    async (dose: Occurrence, action: DoseAction, earlyConfirmed = false) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError(null);
      const key = `${dose.id}:${action}`;
      const event = pending.current.get(key) ?? {
        eventId: Crypto.randomUUID(),
        occurrenceId: dose.id,
        action,
        earlyConfirmed,
        ...(action === 'TAKEN' ? { actualAt: new Date().toISOString() } : {}),
      };
      pending.current.set(key, event);
      try {
        await repository.record(event);
        pending.current.delete(key);
        await refresh();
      } catch (e) {
        if (e instanceof MedicineHttpError && (e.status === 403 || e.status === 404)) {
          // Hide a possibly revoked profile immediately; preserve its unacknowledged evidence.
          setMembers((current) => current.filter((item) => item.id !== dose.memberId));
          setSchedules((current) => current.filter((item) => item.memberId !== dose.memberId));
          setToday((current) => current.filter((item) => item.memberId !== dose.memberId));
          setHistory((current) => current.filter((item) => item.memberId !== dose.memberId));
          setReminderDoses((current) => current.filter((item) => item.memberId !== dose.memberId));
        }
        setError(
          e instanceof Error
            ? e.message
            : 'Could not record the action. Retry while this app remains open.',
        );
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [refresh, repository],
  );
  const value = useMemo(
    () => ({
      members,
      schedules,
      today,
      history,
      reminderDoses,
      loading,
      busy,
      error,
      lastSync,
      demo: auth.demo,
      refresh,
      addMember,
      record,
      clearError: () => setError(null),
      repository,
    }),
    [
      members,
      schedules,
      today,
      history,
      reminderDoses,
      loading,
      busy,
      error,
      lastSync,
      refresh,
      addMember,
      record,
      repository,
      auth.demo,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMedicine() {
  const store = useContext(Context);
  if (!store) throw new Error('useMedicine must be used within MedicineProvider');
  return store;
}

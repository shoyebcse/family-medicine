// Tab-scoped storage survives refresh without persisting credentials across browser restarts.
// Native builds continue to use SecureStore through sessionStorage.ts.
const KEY = 'family-medicine.account-session.v1';
export const sessionStorage = {
  async read(): Promise<string | null> {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(KEY);
  },
  async write(value: string): Promise<void> {
    if (typeof window === 'undefined') throw new Error('Browser session storage is unavailable.');
    window.sessionStorage.setItem(KEY, value);
  },
  async clear(): Promise<void> {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(KEY);
  },
};

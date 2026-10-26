export type Account = {
  id: string;
  displayName: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
};
export type Session = { token: string; expiresAt: string; account: Account };
export type Challenge = { challengeId: string; expiresAt: string; developmentCode?: string };
export class AuthHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class AuthApi {
  constructor(readonly baseUrl: string) {}
  async request<T>(path: string, body?: unknown, token?: string): Promise<T> {
    if (!this.baseUrl)
      throw new Error('Account service is not connected. Use sample-data mode for now.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/auth${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok) {
        const fields = Array.isArray(result.fields)
          ? result.fields
              .filter(
                (field: { field?: unknown; message?: unknown }) =>
                  typeof field.field === 'string' && typeof field.message === 'string',
              )
              .map(
                (field: { field: string; message: string }) => `${field.field}: ${field.message}`,
              )
              .join('. ')
          : '';
        throw new AuthHttpError(
          fields || result.message || 'Sign-in failed. Please try again.',
          response.status,
        );
      }
      return result as T;
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
        throw new Error('Cannot reach the account service. Check your connection and try again.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

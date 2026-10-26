import type {
  DoseInput,
  Member,
  FamilyInvitation,
  MedicineRepository,
  Occurrence,
  Schedule,
  ScheduleInput,
  SchedulePreview,
} from '../domain/types';

export class MedicineHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export class ApiRepository implements MedicineRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly onUnauthorized?: () => void,
  ) {}
  private async request<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (response.status === 401) this.onUnauthorized?.();
      if (!response.ok)
        throw new MedicineHttpError(
          result.message || `Request failed (${response.status}). Please retry.`,
          response.status,
        );
      return result as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw new Error('The server took too long. Please retry; your form is still here.');
      if (error instanceof TypeError)
        throw new Error(
          'Cannot reach the server. Check your connection and API address, then retry.',
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  members() {
    return this.request<Member[]>('/v1/members');
  }
  createMember(name: string, relationship: string, phone?: string, inviteAccess = false) {
    return this.request<Member>('/v1/members', 'POST', { name, relationship, phone, inviteAccess });
  }
  invitations() {
    return this.request<FamilyInvitation[]>('/v1/family/invitations');
  }
  async decideInvitation(memberId: string, accept: boolean) {
    await this.request(`/v1/family/invitations/${encodeURIComponent(memberId)}/decision`, 'POST', {
      accept,
    });
  }
  async revokeAccess(memberId: string) {
    await this.request(`/v1/family/members/${encodeURIComponent(memberId)}/revoke`, 'POST', {});
  }
  async approveAccess(memberId: string) {
    await this.request(`/v1/family/members/${encodeURIComponent(memberId)}/approve`, 'POST', {});
  }
  schedules() {
    return this.request<Schedule[]>('/v1/schedules');
  }
  async updateStockAlert(scheduleId: string, threshold?: number) {
    await this.request(`/v1/schedules/${encodeURIComponent(scheduleId)}/stock-alert`, 'POST', {
      threshold: threshold ?? null,
    });
  }
  occurrences(from: string, to: string) {
    return this.request<Occurrence[]>(
      `/v1/occurrences?from=${from}&to=${to}&timezone=Asia%2FKolkata`,
    );
  }
  preview(input: ScheduleInput) {
    return this.request<SchedulePreview>('/v1/schedules/preview', 'POST', input);
  }
  activate(input: ScheduleInput, key: string) {
    return this.request<Schedule>('/v1/schedules', 'POST', input, key);
  }
  async record(input: DoseInput) {
    await this.request('/v1/dose-events', 'POST', input);
  }
}

import { Platform } from 'react-native';
import type { Prescription, PrescriptionItem, Routine, UploadPage } from './types';
import type { SchedulePreview } from '../domain/types';

export class PrescriptionHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class PrescriptionApi {
  constructor(
    private baseUrl: string,
    private token: string,
    private invalidate: () => void,
  ) {}
  async request<T>(path: string, body?: unknown, key?: string): Promise<T> {
    if (!this.baseUrl || !this.token)
      throw new Error('Sign in to the connected account service first.');
    const multipart = body instanceof FormData;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100000);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      });
      if (response.status === 401) this.invalidate();
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new PrescriptionHttpError(
          result.message ||
            `Request failed (${response.status}). Your draft has not been discarded.`,
          response.status,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
        throw new Error(
          'Connection interrupted. Check prescription history before retrying extraction; a repeat request may incur a charge. No automatic retry was made.',
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  private async uploadBody(memberId: string, pages: UploadPage[], originals: UploadPage[] = []) {
    const body = new FormData();
    body.append('memberId', memberId);
    for (const [part, files] of [
      ['files', pages],
      ['originals', originals],
    ] as const)
      for (const page of files) {
        if (Platform.OS === 'web')
          body.append(part, page.file || (await (await fetch(page.uri)).blob()), page.name);
        else
          body.append(part, {
            uri: page.uri,
            name: page.name,
            type: page.mimeType,
          } as unknown as Blob);
      }
    return body;
  }
  async extract(memberId: string, pages: UploadPage[], key: string, originals: UploadPage[] = []) {
    return this.request<Prescription>(
      '/prescriptions/extract',
      await this.uploadBody(memberId, pages, originals),
      key,
    );
  }
  async previewFiles(memberId: string, pages: UploadPage[]) {
    return this.request<string[]>(
      '/prescriptions/preview-files',
      await this.uploadBody(memberId, pages),
    );
  }
  history(member: string) {
    return this.request<Prescription[]>(`/members/${member}/prescriptions`);
  }
  get(id: string) {
    return this.request<Prescription>(`/prescriptions/${id}`);
  }
  save(document: Prescription, items: PrescriptionItem[]) {
    return this.request<Prescription>(`/prescriptions/${document.id}/draft`, {
      version: document.version,
      items,
    });
  }
  preview(id: string) {
    return this.request<Record<string, SchedulePreview>>(
      `/prescriptions/${id}/schedule-preview`,
      {},
    );
  }
  activate(document: Prescription, itemIds: string[]) {
    return this.request<Prescription>(`/prescriptions/${document.id}/activate`, {
      version: document.version,
      itemIds,
    });
  }
  routine(member: string) {
    return this.request<Routine>(`/members/${member}/routine`);
  }
  saveRoutine(member: string, routine: Routine) {
    return this.request<Routine>(`/members/${member}/routine`, routine);
  }
  states(id: string) {
    return this.request<Record<string, string>>(`/prescriptions/${id}/plan-states`);
  }
  page(id: string, index: number) {
    return this.request<{ uri: string }>(`/prescriptions/${id}/page-data/${index}`);
  }
  discontinue(document: Prescription, item: string) {
    return this.request<Prescription>(`/prescriptions/${document.id}/items/${item}/discontinue`, {
      version: document.version,
      itemIds: [item],
    });
  }
  sourceUrl(id: string, index: number) {
    return `${this.baseUrl.replace(/\/$/, '')}/v1/prescriptions/${id}/pages/${index}`;
  }
}

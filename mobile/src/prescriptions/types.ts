import type { ScheduleInput } from '../domain/types';

export type ExtractedMedicine = {
  raw: string | null;
  brand: string | null;
  strength: string | null;
  dose: string | null;
  frequency: string | null;
  pattern: string | null;
  timing: string[];
  food: string | null;
  duration: string | null;
  sos: boolean;
  unclear: boolean;
};
export type PrescriptionItem = {
  id: string;
  evidence: ExtractedMedicine;
  schedule: ScheduleInput | null;
  verified: boolean;
  reviewNote?: string;
  fields?: Record<string, string>;
};
export type Prescription = {
  extractionMode?: 'mock' | 'openai';
  id: string;
  memberId: string;
  status: string;
  version: number;
  createdAt: string;
  extraction: {
    patient: { name: string | null };
    doctor: { name: string | null };
    date: string | null;
    medicines: ExtractedMedicine[];
  };
  items: PrescriptionItem[];
  sources: { index: number; mediaType: string }[];
  plans: Record<string, string>;
};
export type Routine = {
  wakeUp?: string | null;
  breakfast?: string | null;
  lunch?: string | null;
  dinner?: string | null;
  bedtime?: string | null;
  timezone: string;
};
export type UploadPage = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: File;
  originalUri?: string;
};

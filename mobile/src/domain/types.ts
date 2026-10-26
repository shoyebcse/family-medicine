export type Member = {
  id: string;
  name: string;
  relationship: string;
  phone?: string;
  linkState?: string;
  linkedName?: string;
  owned?: boolean;
};
export type FamilyInvitation = {
  memberId: string;
  memberName: string;
  invitedBy: string;
  expiresAt: string;
};
export type DoseStatus = 'UPCOMING' | 'DUE' | 'NOT_RECORDED' | 'TAKEN' | 'SKIPPED';
export type DoseAction = 'TAKEN' | 'SKIPPED';
export type PrescriptionDetails = {
  genericName?: string;
  form: string;
  route: string;
  frequency: string;
  mealInstruction: string;
  amountUnspecified: boolean;
  regimenType: 'FIXED' | 'AS_NEEDED' | 'VARIABLE';
};
export type Schedule = {
  sampleData?: boolean;
  lowStockThreshold?: number;
  lowStock?: boolean;
  prescriptionDetails?: PrescriptionDetails;
  id: string;
  memberId: string;
  medicineName: string;
  strength: string;
  doseInstruction: string;
  doseQuantity?: number;
  unit: string;
  timezone: string;
  stock?: number;
};
export type Occurrence = {
  sampleData?: boolean;
  id: string;
  scheduleId: string;
  memberId: string;
  memberName: string;
  medicineName: string;
  strength: string;
  doseInstruction: string;
  unit: string;
  timezone: string;
  dueAt: string;
  status: DoseStatus;
  actualAt?: string;
  stock?: number;
};
export type ScheduleInput = {
  lowStockThreshold?: number;
  prescriptionDetails?: PrescriptionDetails;
  memberId: string;
  medicineName: string;
  strength: string;
  doseInstruction: string;
  doseQuantity?: number;
  unit: string;
  times: string[];
  weekdays: number[];
  timezone: string;
  startDate: string;
  endDate?: string;
  noEndAcknowledged: boolean;
  reviewed: boolean;
  initialStock?: number;
};
export type PlannedDose = { id: string; dueAt: string; localDate: string; localTime: string };
export type SchedulePreview = {
  occurrences: PlannedDose[];
  timezone: string;
  effectiveAt: string;
  coverageNote: string;
};
export type DoseInput = {
  eventId: string;
  occurrenceId: string;
  action: DoseAction;
  actualAt?: string;
  earlyConfirmed: boolean;
};
export interface MedicineRepository {
  members(): Promise<Member[]>;
  createMember(
    name: string,
    relationship: string,
    phone?: string,
    inviteAccess?: boolean,
  ): Promise<Member>;
  invitations(): Promise<FamilyInvitation[]>;
  decideInvitation(memberId: string, accept: boolean): Promise<void>;
  revokeAccess(memberId: string): Promise<void>;
  approveAccess(memberId: string): Promise<void>;
  schedules(): Promise<Schedule[]>;
  updateStockAlert(scheduleId: string, threshold?: number): Promise<void>;
  occurrences(from: string, to: string): Promise<Occurrence[]>;
  preview(input: ScheduleInput): Promise<SchedulePreview>;
  activate(input: ScheduleInput, commandKey: string): Promise<Schedule>;
  record(input: DoseInput): Promise<void>;
}

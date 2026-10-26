import * as Crypto from 'expo-crypto';
import { validatePrescription } from '../medicine/prescription';
import { isLowStock, validateStockThreshold } from '../stock/rules';
import { addDays, DEFAULT_ZONE, localDate } from '../domain/dates';
import type {
  DoseInput,
  MedicineRepository,
  Member,
  Occurrence,
  Schedule,
  ScheduleInput,
  SchedulePreview,
} from '../domain/types';

/** Sample-only, in-memory adapter. Never presented as durable or server-confirmed storage. */
export class DemoRepository implements MedicineRepository {
  private people: Member[] = [
    { id: 'maya', name: 'Maya', relationship: 'Self' },
    { id: 'arun', name: 'Arun', relationship: 'Father' },
    { id: 'leela', name: 'Leela', relationship: 'Mother' },
  ];
  private medicines: Schedule[] = [];
  private doses: Occurrence[] = [];
  private events = new Map<string, string>();
  private commands = new Map<string, { content: string; schedule: Schedule }>();
  constructor() {
    const today = localDate();
    for (const [index, [person, time]] of [
      ['maya', '08:00'],
      ['arun', '13:00'],
      ['leela', '20:00'],
    ].entries()) {
      const member = this.people.find((p) => p.id === person)!;
      const schedule: Schedule = {
        id: `sample-${index}`,
        memberId: person,
        medicineName: `Example medicine ${index + 1}`,
        strength: 'Sample only',
        doseInstruction: '1 tablet · illustrative instructions',
        doseQuantity: 1,
        unit: 'tablet',
        timezone: DEFAULT_ZONE,
        stock: 20,
      };
      this.medicines.push(schedule);
      for (let day = 0; day < 7; day++) {
        this.doses.push({
          ...schedule,
          id: `${schedule.id}-${day}`,
          scheduleId: schedule.id,
          memberName: member.name,
          dueAt: new Date(`${addDays(today, day)}T${time}:00+05:30`).toISOString(),
          status: 'UPCOMING',
        });
      }
    }
  }
  async members() {
    return [...this.people];
  }
  async invitations() {
    return [];
  }
  async decideInvitation() {
    throw new Error('Family invitations need a signed-in account.');
  }
  async revokeAccess() {
    throw new Error('Family access needs a signed-in account.');
  }
  async approveAccess() {
    throw new Error('Family access needs a signed-in account.');
  }
  async createMember(name: string, relationship: string, phone?: string, inviteAccess = false) {
    if (inviteAccess)
      throw new Error('Sign in to invite a family member. Sample mode does not share records.');
    const member = {
      id: Crypto.randomUUID(),
      name: name.trim(),
      relationship: relationship.trim(),
      phone,
      owned: true,
      linkState: 'NONE',
    };
    this.people.push(member);
    return member;
  }
  async schedules() {
    return this.medicines.map((s) => ({ ...s, lowStock: isLowStock(s) }));
  }
  async updateStockAlert(scheduleId: string, threshold?: number) {
    const schedule = this.medicines.find((item) => item.id === scheduleId);
    if (!schedule) throw new Error('Medicine unavailable.');
    validateStockThreshold(threshold, schedule.stock, schedule.doseQuantity);
    schedule.lowStockThreshold = threshold;
  }
  async occurrences(from: string, to: string) {
    return this.doses
      .filter((d) => localDate(new Date(d.dueAt)) >= from && localDate(new Date(d.dueAt)) <= to)
      .map((d) => {
        const due = new Date(d.dueAt).getTime();
        return {
          ...d,
          stock: this.medicines.find((s) => s.id === d.scheduleId)?.stock,
          status:
            d.status === 'TAKEN' || d.status === 'SKIPPED'
              ? d.status
              : Date.now() < due
                ? ('UPCOMING' as const)
                : Date.now() < due + 3_600_000
                  ? ('DUE' as const)
                  : ('NOT_RECORDED' as const),
        };
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }
  async preview(input: ScheduleInput): Promise<SchedulePreview> {
    validatePrescription(input);
    validateStockThreshold(input.lowStockThreshold, input.initialStock, input.doseQuantity);
    if (input.timezone !== DEFAULT_ZONE)
      throw new Error(
        'The sample preview supports Asia/Kolkata. The API supports named timezones.',
      );
    if (!input.reviewed) throw new Error('Review the instructions first.');
    if (!this.people.some((p) => p.id === input.memberId)) throw new Error('Choose a member.');
    if (new Set(input.times).size !== input.times.length)
      throw new Error('Each time must be different.');
    if (!input.endDate && !input.noEndAcknowledged) throw new Error('Confirm the end condition.');
    const today = localDate();
    const from = input.startDate > today ? input.startDate : today;
    const through =
      input.endDate && input.endDate < addDays(from, 34) ? input.endDate : addDays(from, 34);
    const now = new Date().toISOString();
    const occurrences = [];
    for (let day = from; day <= through; day = addDays(day, 1)) {
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
      if (!input.weekdays.includes(weekday)) continue;
      for (const time of input.times) {
        const dueAt = new Date(`${day}T${time}:00+05:30`).toISOString();
        if (dueAt >= now)
          occurrences.push({ id: Crypto.randomUUID(), dueAt, localDate: day, localTime: time });
      }
    }
    occurrences.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      occurrences,
      timezone: input.timezone,
      effectiveAt: now,
      coverageNote:
        'Sample schedule preview. Enable reminders and check readiness in Settings; the browser requires an open tab.',
    };
  }
  async activate(input: ScheduleInput, commandKey: string) {
    const existing = this.commands.get(commandKey);
    if (existing) {
      if (existing.content !== JSON.stringify(input))
        throw new Error('Request key already used for different content.');
      return existing.schedule;
    }
    const preview = await this.preview(input);
    if (!preview.occurrences.length)
      throw new Error('There are no upcoming doses. Review your dates and times.');
    const schedule: Schedule = { id: Crypto.randomUUID(), ...input, stock: input.initialStock };
    const member = this.people.find((p) => p.id === input.memberId)!;
    this.medicines.push(schedule);
    this.doses.push(
      ...preview.occurrences.map((o) => ({
        ...schedule,
        id: o.id,
        scheduleId: schedule.id,
        memberName: member.name,
        dueAt: o.dueAt,
        status: 'UPCOMING' as const,
      })),
    );
    this.commands.set(commandKey, { content: JSON.stringify(input), schedule });
    return schedule;
  }
  async record(input: DoseInput) {
    const content = JSON.stringify(input);
    if (this.events.has(input.eventId)) {
      if (this.events.get(input.eventId) !== content)
        throw new Error('Event ID already used for a different action.');
      return;
    }
    const dose = this.doses.find((d) => d.id === input.occurrenceId);
    if (!dose) throw new Error('Dose unavailable.');
    if (dose.status === input.action && dose.actualAt === input.actualAt) return;
    if (dose.status === 'TAKEN' || dose.status === 'SKIPPED')
      throw new Error('A different action is recorded. Refresh and review.');
    if (input.action === 'TAKEN' && !input.actualAt)
      throw new Error('Actual taken time is required.');
    if (input.action === 'TAKEN' && input.actualAt! < dose.dueAt && !input.earlyConfirmed)
      throw new Error('Confirm early recording.');
    dose.status = input.action;
    dose.actualAt = input.actualAt;
    const schedule = this.medicines.find((s) => s.id === dose.scheduleId)!;
    if (
      input.action === 'TAKEN' &&
      schedule.stock !== undefined &&
      schedule.doseQuantity !== undefined
    )
      schedule.stock -= schedule.doseQuantity;
    this.events.set(input.eventId, content);
  }
}

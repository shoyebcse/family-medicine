import type { ExtractedMedicine, Routine } from './types';
import { clockTimeLabel, toClockTime } from '../medicine/scheduleFields';

export const DEFAULT_ROUTINE = {
  wakeUp: '07:00',
  breakfast: '09:00',
  lunch: '13:30',
  dinner: '20:30',
  bedtime: '22:30',
};
export const EMPTY_MEDICINE: ExtractedMedicine = {
  raw: null,
  brand: null,
  strength: null,
  dose: null,
  frequency: null,
  pattern: null,
  timing: [],
  food: null,
  duration: null,
  sos: false,
  unclear: true,
};

export function proposeTimes(
  medicine: ExtractedMedicine,
  routine: Routine,
): { times: string[]; messages: string[] } {
  if (
    !medicine.brand ||
    !medicine.dose ||
    !medicine.frequency ||
    !medicine.duration ||
    medicine.sos
  )
    throw new Error(
      'Confirm medicine, dose, frequency and duration before proposing times. As-needed medicines stay drafts.',
    );
  if (medicine.food && /before|after|\bAC\b|\bPC\b/i.test(medicine.food))
    throw new Error(
      'Confirm the required food interval and enter exact times manually. Routine anchors alone cannot determine before/after-food timing.',
    );
  const exact = medicine.timing.map((time) => {
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return time;
    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time);
    return match
      ? toClockTime({ hour: match[1], minute: match[2], period: match[3].toUpperCase() })
      : '';
  });
  if (exact.length && exact.every(Boolean))
    return {
      times: [...new Set(exact)].sort(),
      messages: [
        'Using the written clock times. Check any prescribed spacing and conditions before confirmation.',
      ],
    };
  // Mixed exact/relative instructions and spacing cannot safely become a guessed routine.
  if (
    exact.some(Boolean) ||
    /every|hour|interval|taper|weekly|alternate/i.test(
      `${medicine.frequency} ${medicine.raw || ''}`,
    )
  )
    throw new Error('Enter the verified clock times manually for this instruction.');
  const mapping: Record<string, keyof typeof DEFAULT_ROUTINE> = {
    morning: 'breakfast',
    afternoon: 'lunch',
    evening: 'dinner',
    bedtime: 'bedtime',
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    'wake up': 'wakeUp',
  };
  const patterns: Record<string, string[]> = {
    '1-0-1': ['morning', 'evening'],
    '1-1-1': ['morning', 'afternoon', 'evening'],
    '0-0-1': ['evening'],
    '1-0-0': ['morning'],
    '0-1-0': ['afternoon'],
  };
  const labels = medicine.timing.length ? medicine.timing : patterns[medicine.pattern || ''] || [];
  const keys = labels.map((time) => mapping[time.toLowerCase().trim()]);
  if (!keys.length || keys.some((key) => !key))
    throw new Error('No unambiguous timing labels were written. Enter confirmed times manually.');
  const messages: string[] = [];
  if (!medicine.timing.length && medicine.pattern)
    messages.push(
      'Using the reviewed daily pattern to propose routine anchors; verify these times before activation.',
    );
  const times = keys.map((key) => {
    const override = routine[key];
    const time = override || DEFAULT_ROUTINE[key];
    messages.push(
      `Using ${override ? 'patient' : 'default'} ${key === 'wakeUp' ? 'wake-up' : key} time: ${clockTimeLabel(time)}. This is a draft suggestion.`,
    );
    return time;
  });
  return { times: [...new Set(times)].sort(), messages };
}

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { localDate } from '../domain/dates';
import { calendarMonth } from '../medicine/scheduleFields';
import { Button, colors, Label, styles } from './ui';

export function DateField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || localDate()).slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number);
  const move = (amount: number) => {
    const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    setMonth(date.toISOString().slice(0, 7));
  };
  return (
    <View style={{ gap: 8 }}>
      <Label required={required}>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${required ? ' (required)' : ''}: ${value || 'Choose date'}`}
        accessibilityState={{ expanded: open }}
        style={styles.input}
        onPress={() => {
          if (!open) setMonth((value || localDate()).slice(0, 7));
          setOpen(!open);
        }}
      >
        <Text style={{ color: colors.ink }}>
          {value
            ? new Intl.DateTimeFormat('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${value}T12:00:00Z`))
            : 'Choose date'}{' '}
          ▾
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          <View style={styles.between}>
            <Button compact secondary title="Previous month" onPress={() => move(-1)} />
            <Button compact secondary title="Next month" onPress={() => move(1)} />
          </View>
          <Text accessibilityRole="header" style={styles.fieldLabel}>
            {new Intl.DateTimeFormat('en-IN', {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${month}-01T12:00:00Z`))}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <Text
                key={day}
                style={{ width: `${100 / 7}%`, textAlign: 'center', color: colors.muted }}
              >
                {day}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {calendarMonth(year, monthNumber - 1).map((date, index) => (
              <View key={date || `blank-${index}`} style={{ width: `${100 / 7}%` }}>
                {date ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${date}`}
                    accessibilityState={{ selected: date === value }}
                    onPress={() => {
                      onChange(date);
                      setOpen(false);
                    }}
                    style={{
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      backgroundColor: date === value ? colors.teal : colors.soft,
                    }}
                  >
                    <Text style={{ color: date === value ? colors.white : colors.ink }}>
                      {Number(date.slice(-2))}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <Button secondary compact title="Close calendar" onPress={() => setOpen(false)} />
        </View>
      ) : null}
    </View>
  );
}

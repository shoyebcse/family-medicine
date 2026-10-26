import { type ComponentRef, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type ReminderTime } from '../medicine/scheduleFields';
import { colors, Label } from './ui';

const ROW_HEIGHT = 48;
const HOURS = ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))];
const MINUTES = ['', ...Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))];
const PERIODS = ['', 'AM', 'PM'];

function TimeWheel({
  values,
  value,
  label,
  onChange,
}: {
  values: string[];
  value: string;
  label: string;
  onChange(value: string): void;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = Math.max(0, values.indexOf(value ? value.padStart(2, '0') : ''));
  useEffect(() => {
    scroll.current?.scrollTo({ y: selected * ROW_HEIGHT, animated: false });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [selected]);
  return (
    <View style={styles.column}>
      <Text style={styles.caption}>{label}</Text>
      <View style={styles.viewport}>
        <View pointerEvents="none" style={styles.selection} />
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.options}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          snapToInterval={ROW_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={(event) => {
            const index = Math.max(
              0,
              Math.min(
                values.length - 1,
                Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT),
              ),
            );
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              if (index !== selected) onChange(values[index]);
            }, 160);
          }}
        >
          {values.map((option, index) => (
            <Pressable
              key={option || 'empty'}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${option || 'not selected'}`}
              accessibilityState={{ selected: index === selected }}
              onPress={() => onChange(option)}
              style={styles.row}
            >
              <Text style={[styles.option, index === selected && styles.selected]}>
                {option || '—'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function DigitalTimePicker({
  value,
  onChange,
  label,
  required,
}: {
  value: ReminderTime;
  onChange(value: ReminderTime): void;
  label: string;
  required: boolean;
}) {
  return (
    <View style={styles.card}>
      <Label required={required}>{label}</Label>
      <View style={styles.wheels}>
        <TimeWheel
          values={HOURS}
          value={value.hour}
          label="Hour"
          onChange={(hour) => onChange({ ...value, hour })}
        />
        <Text style={styles.colon}>:</Text>
        <TimeWheel
          values={MINUTES}
          value={value.minute}
          label="Minute"
          onChange={(minute) => onChange({ ...value, minute })}
        />
        <TimeWheel
          values={PERIODS}
          value={value.period}
          label="AM/PM"
          onChange={(period) => onChange({ ...value, period })}
        />
      </View>
      <Text style={styles.hint}>Scroll or tap to select each part of the time.</Text>
      {value.hour || value.minute || value.period ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}
          onPress={() => onChange({ hour: '', minute: '', period: '' })}
          style={styles.clear}
        >
          <Text style={styles.clearText}>Clear time</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 320,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.white,
  },
  wheels: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  column: { flex: 1, minWidth: 0 },
  caption: { fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 6 },
  viewport: { height: ROW_HEIGHT * 3, overflow: 'hidden' },
  scroll: { height: ROW_HEIGHT * 3 },
  options: { paddingVertical: ROW_HEIGHT },
  row: { height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  option: { fontSize: 22, color: '#969C99', fontWeight: '500' },
  selected: { color: colors.ink, fontWeight: '700', fontSize: 25 },
  selection: {
    position: 'absolute',
    top: ROW_HEIGHT,
    left: 5,
    right: 5,
    height: ROW_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F2F7F4',
    borderRadius: 6,
  },
  colon: { fontSize: 25, color: colors.ink, marginTop: 20 },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  clear: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.teal, fontSize: 14 },
});

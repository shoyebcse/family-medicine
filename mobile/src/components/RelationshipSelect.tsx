import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, Label, styles } from './ui';

const OPTIONS = [
  'Self',
  'Spouse',
  'Mother',
  'Father',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Grandparent',
  'Grandchild',
  'Other',
];
export function RelationshipSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Label>Relationship</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Relationship: ${value || 'Select relationship'}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={styles.input}
      >
        <Text style={{ color: colors.ink }}>
          {value || 'Select relationship'} {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
          {OPTIONS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: option === value }}
              disabled={disabled}
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
              style={{
                padding: 14,
                minHeight: 48,
                backgroundColor: option === value ? colors.soft : colors.white,
              }}
            >
              <Text style={{ color: colors.ink }}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

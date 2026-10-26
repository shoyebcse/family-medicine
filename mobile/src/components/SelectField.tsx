import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, Label, styles } from './ui';

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange(value: string): void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Label required={required}>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${required ? ' (required)' : ''}: ${value || 'Select an option'}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={styles.input}
      >
        <Text style={{ color: colors.ink }}>
          {value || 'Select an option'} {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
          {options.map((option) => (
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
      ) : null}
    </View>
  );
}

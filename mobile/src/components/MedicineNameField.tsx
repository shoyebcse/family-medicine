import { View } from 'react-native';
import { useState } from 'react';
import { useMedicine } from '../state/MedicineProvider';
import { Body, Button, Field } from './ui';

/** Only suggests names already recorded by this account; no unverified drug catalog is invented. */
export function MedicineNameField({
  value,
  onChange,
  label = 'Medicine name',
  required,
}: {
  value: string;
  onChange(value: string): void;
  label?: string;
  required?: boolean;
}) {
  const { schedules } = useMedicine();
  const [open, setOpen] = useState(false);
  const names = [
    ...new Set(
      schedules
        .flatMap((schedule) => [
          schedule.medicineName,
          schedule.prescriptionDetails?.genericName || '',
        ])
        .filter(Boolean),
    ),
  ]
    .filter(
      (name) =>
        value.trim().length >= 2 &&
        name.toLowerCase().includes(value.trim().toLowerCase()) &&
        name !== value,
    )
    .slice(0, 5);
  return (
    <View style={{ gap: 6 }}>
      <Field
        label={label}
        required={required}
        value={value}
        maxLength={150}
        placeholder="As written on the prescription"
        onChangeText={(text) => {
          setOpen(true);
          onChange(text);
        }}
      />
      {open && names.length ? (
        <>
          <Body>
            Previously recorded names — confirm the exact medicine; these are not verified catalog
            matches.
          </Body>
          {names.map((name) => (
            <Button
              secondary
              compact
              key={name}
              title={name}
              onPress={() => {
                onChange(name);
                setOpen(false);
              }}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

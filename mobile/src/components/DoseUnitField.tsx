import { useState } from 'react';
import { View } from 'react-native';
import { SelectField } from './SelectField';
import { Field } from './ui';

const UNITS = [
  'tablet',
  'capsule',
  'mL',
  'drop',
  'puff',
  'spray',
  'sachet',
  'patch',
  'mg',
  'g',
  'unit',
];
const OTHER = 'Other unit';

export function DoseUnitField({
  value,
  onChange,
  required = true,
}: {
  value: string;
  onChange(value: string): void;
  required?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || (!!value && !UNITS.includes(value));
  return (
    <View style={{ gap: 8 }}>
      <SelectField
        required={required}
        label="Dose unit"
        value={isCustom ? OTHER : value}
        options={[...UNITS, OTHER]}
        onChange={(unit) => {
          setCustom(unit === OTHER);
          onChange(unit === OTHER ? '' : unit);
        }}
      />
      {isCustom ? (
        <Field
          required={required}
          label="Unit as prescribed"
          value={value}
          onChangeText={onChange}
          maxLength={30}
          placeholder="Enter the prescribed unit"
        />
      ) : null}
    </View>
  );
}

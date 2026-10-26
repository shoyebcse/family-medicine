import { ErrorNotice } from '../components/ErrorNotice';
import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Field, styles } from '../components/ui';

export type CropMargins = { left: number; top: number; right: number; bottom: number };
export function CropControls({
  onApply,
  disabled,
}: {
  onApply(value: CropMargins): void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ left: '0', top: '0', right: '0', bottom: '0' });
  const [error, setError] = useState('');
  return (
    <View style={{ gap: 8 }}>
      <Button
        compact
        secondary
        disabled={disabled}
        title={open ? 'Hide crop controls' : 'Crop page'}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <Body>
            Enter the percentage to trim from each edge. Preview the result and undo if any
            prescription text is missing.
          </Body>
          <View style={styles.row}>
            {(['left', 'top', 'right', 'bottom'] as const).map((key) => (
              <View key={key} style={{ flex: 1, minWidth: 90 }}>
                <Field
                  label={`Trim ${key} (%)`}
                  value={values[key]}
                  onChangeText={(text) => setValues({ ...values, [key]: text })}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            ))}
          </View>
          <Button
            compact
            secondary
            disabled={disabled}
            title="Apply crop"
            onPress={() => {
              const margins = {
                left: Number(values.left),
                top: Number(values.top),
                right: Number(values.right),
                bottom: Number(values.bottom),
              };
              if (
                Object.values(values).some((value) => !/^\d{1,2}$/.test(value)) ||
                margins.left + margins.right >= 95 ||
                margins.top + margins.bottom >= 95
              ) {
                setError(
                  'Use whole percentages that leave at least 5% of the image in each direction.',
                );
                return;
              }
              setError('');
              onApply(margins);
            }}
          />
          <ErrorNotice message={error} />
        </>
      ) : null}
    </View>
  );
}

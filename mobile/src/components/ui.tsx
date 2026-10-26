import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { ErrorNotice } from './ErrorNotice';
import { isLowStock } from '../stock/rules';
import { requestStockPermission, showStockNotification } from '../stock/notifications';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMedicine } from '../state/MedicineProvider';

export const colors = {
  ink: '#203B36',
  muted: '#6E7D76',
  teal: '#267867',
  soft: '#E8F2ED',
  paper: '#F8F8F2',
  border: '#E2E8DF',
  white: '#FFFFFF',
  danger: '#A13D35',
  amber: '#805A23',
};
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  compact,
}: {
  title: string;
  onPress(): void;
  secondary?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        compact && styles.compact,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.teal }]}>{title}</Text>
    </Pressable>
  );
}
export function Screen({ children }: { children: ReactNode }) {
  const store = useMedicine();
  const auth = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const lowStock = store.schedules.filter(isLowStock);
  const [stockNotice, setStockNotice] = useState('');
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <Text style={styles.brand}>
            family medicine<Text style={{ color: colors.teal }}> +</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Text style={styles.preview}>PREVIEW</Text>
            <Button
              title="Settings"
              compact
              secondary
              onPress={() => router.navigate('/settings')}
            />
            <Button
              title={loggingOut ? 'Logging out…' : auth.session ? 'Log out' : 'Sign in'}
              compact
              secondary
              disabled={loggingOut}
              onPress={() => {
                setLoggingOut(true);
                setLogoutError(null);
                void auth
                  .logout()
                  .catch((error: unknown) => {
                    setLogoutError(
                      error instanceof Error ? error.message : 'Could not log out. Try again.',
                    );
                  })
                  .finally(() => setLoggingOut(false));
              }}
            />
          </View>
        </View>
        <ErrorNotice message={logoutError} />
        {store.demo && (
          <Text style={styles.demo}>Sample data · changes reset when the app reloads</Text>
        )}
        {store.error && (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={{ color: colors.danger, flex: 1 }}>{store.error}</Text>
            <Button title="Retry" compact secondary onPress={() => void store.refresh()} />
          </View>
        )}
        {lowStock.length ? (
          <View
            accessibilityRole="alert"
            style={{
              gap: 8,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.amber,
              borderRadius: 12,
              backgroundColor: colors.white,
            }}
          >
            <Text style={{ color: colors.amber, fontWeight: '700' }}>
              Medicine supply needs attention
            </Text>
            {lowStock.map((schedule) => (
              <Text key={schedule.id} style={{ color: colors.ink }}>
                {schedule.medicineName} ·{' '}
                {store.members.find((member) => member.id === schedule.memberId)?.name ??
                  'Family member'}
                : estimated {schedule.stock} {schedule.unit} remaining.
              </Text>
            ))}
            <Text style={{ color: colors.muted }}>
              At or below your alert threshold. Review your supply; this estimate does not change
              treatment instructions.
            </Text>
            <Button
              secondary
              compact
              title="Review stock in Family"
              onPress={() => router.push('/family')}
            />
            <Button
              secondary
              compact
              title="Enable / test stock notifications"
              onPress={() => {
                void requestStockPermission()
                  .then(async (granted) => {
                    if (!granted) {
                      setStockNotice(
                        'Notifications are unavailable or blocked. The in-app warning stays visible.',
                      );
                      return;
                    }
                    await showStockNotification();
                    setStockNotice(
                      'Notifications enabled. A generic test alert was requested; check your device notification settings.',
                    );
                  })
                  .catch(() =>
                    setStockNotice(
                      'Could not show a notification. Check permissions; the in-app warning stays visible.',
                    ),
                  );
              }}
            />
            {stockNotice ? <Text style={{ color: colors.muted }}>{stockNotice}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 8, marginVertical: 20 }}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle && <Text style={styles.body}>{subtitle}</Text>}
    </View>
  );
}
export function Panel({ children, tinted }: { children: ReactNode; tinted?: boolean }) {
  return (
    <View
      style={[styles.panel, tinted && { backgroundColor: colors.soft, borderColor: colors.soft }]}
    >
      {children}
    </View>
  );
}
export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={{ color: '#A52B24' }}> *</Text> : null}
    </Text>
  );
}
export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Field({
  label,
  hint,
  required,
  ...props
}: TextInputProps & { label: string; hint?: string; required?: boolean }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={{ color: '#A52B24' }}> *</Text> : null}
      </Text>
      <TextInput
        accessibilityLabel={required ? `${label} (required)` : label}
        placeholderTextColor="#89948D"
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}
export function Chip({
  title,
  active,
  onPress,
}: {
  title: string;
  active?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={{ color: active ? colors.white : colors.ink, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 48 }}>
      <ActivityIndicator accessibilityLabel="Loading records" color={colors.teal} />
    </View>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <Panel>
      <Label>{title}</Label>
      <Body>{text}</Body>
    </Panel>
  );
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 22,
    paddingBottom: 40,
    gap: 16,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  brand: { color: colors.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.6 },
  preview: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    backgroundColor: '#ECEEE6',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
  },
  demo: { color: colors.amber, fontSize: 12, lineHeight: 18 },
  title: {
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1.2,
    fontWeight: '700',
    color: colors.ink,
  },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted },
  label: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  panel: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 12,
  },
  button: {
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.teal,
  },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.white },
  secondary: { backgroundColor: colors.soft },
  compact: { paddingHorizontal: 16, minHeight: 44, paddingVertical: 10 },
  fieldLabel: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: '#CCD7CE',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  between: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  error: {
    backgroundColor: '#FFF0EC',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
});

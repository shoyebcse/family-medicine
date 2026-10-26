import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MedicineProvider } from '../state/MedicineProvider';
import { ReminderProvider } from '../reminders/ReminderProvider';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { AuthScreen } from '../auth/AuthScreen';
import { ActivityIndicator, View } from 'react-native';
import { StockNotifier } from '../stock/StockNotifier';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AccountContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
function AccountContent() {
  const auth = useAuth();
  if (!auth.ready)
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Restoring your session" />
      </View>
    );
  if (!auth.session && !auth.demo) return <AuthScreen />;
  return (
    <MedicineProvider key={auth.session?.account.id ?? 'sample-data'}>
      <ReminderProvider>
        <StockNotifier />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
        </Stack>
      </ReminderProvider>
    </MedicineProvider>
  );
}

import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';
const identifier = 'family-medicine:stock';
if (Platform.OS === 'android')
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
async function channel() {
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('medicine-stock', {
      name: 'Medicine supply',
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
}
export async function requestStockPermission(): Promise<boolean> {
  await channel();
  return (await Notifications.requestPermissionsAsync()).granted;
}
export async function showStockNotification(): Promise<boolean> {
  if (!(await Notifications.getPermissionsAsync()).granted) return false;
  await channel();
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Medicine supply alert',
      body: 'Estimated medicine stock is low. Open Family Medicine to review your supply.',
      data: { kind: 'stock' },
    },
    trigger: Platform.OS === 'android' ? { channelId: 'medicine-stock' } : null,
  });
  return true;
}
export async function clearStockNotifications() {
  await Notifications.dismissNotificationAsync(identifier);
}

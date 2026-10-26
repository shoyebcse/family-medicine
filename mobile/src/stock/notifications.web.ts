const notices = new Set<Notification>();
export async function requestStockPermission(): Promise<boolean> {
  return (
    typeof Notification !== 'undefined' && (await Notification.requestPermission()) === 'granted'
  );
}
export async function showStockNotification(): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const notice = new Notification('Medicine supply alert', {
    body: 'Estimated medicine stock is low. Open Family Medicine to review your supply.',
    tag: 'family-medicine:stock',
  });
  notices.add(notice);
  notice.onclose = () => notices.delete(notice);
  return true;
}
export async function clearStockNotifications() {
  for (const notice of notices) notice.close();
  notices.clear();
}

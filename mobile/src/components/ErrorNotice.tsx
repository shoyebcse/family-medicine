import { Text, View } from 'react-native';

export function ErrorNotice({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View
      style={{
        backgroundColor: '#FFF0EE',
        borderColor: '#B33A32',
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={{ color: '#8A201A', fontSize: 16, lineHeight: 24 }}
      >
        {message}
      </Text>
    </View>
  );
}

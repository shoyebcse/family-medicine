import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { DoseCard } from '../../components/DoseCard';
import {
  Body,
  Button,
  Chip,
  colors,
  Empty,
  Heading,
  Label,
  Loading,
  Panel,
  Screen,
  styles,
} from '../../components/ui';
import { dateLabel, isRecorded } from '../../domain/dates';
import { useMedicine } from '../../state/MedicineProvider';
import { useReminders } from '../../reminders/ReminderProvider';

export default function TodayScreen() {
  const { members, today, loading, lastSync, refresh, demo } = useMedicine();
  const reminders = useReminders();
  const [member, setMember] = useState<string | null>(null);
  const doses = today.filter((d) => !member || d.memberId === member);
  const logged = doses.filter((d) => isRecorded(d.status)).length;
  return (
    <Screen>
      <Heading title="A little care, every day." subtitle={dateLabel()} />
      <Button title="Scan / upload prescription" onPress={() => router.push('/prescriptions')} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Medicine reminder settings"
        onPress={() => router.push('/settings')}
        style={{
          backgroundColor: colors.soft,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: colors.teal, fontSize: 14 }}>
          {reminders.enabled && reminders.capabilities?.canSchedule && !reminders.error
            ? `Reminders on · ${reminders.report?.count ?? 0} registered · Settings →`
            : '🔔 Set up medicine reminders →'}
        </Text>
      </Pressable>
      <Panel tinted>
        <View style={styles.between}>
          <Label>Today at a glance</Label>
          <Text style={{ color: colors.teal, fontWeight: '700' }}>
            {logged} / {doses.length} recorded
          </Text>
        </View>
        <View
          accessibilityLabel={`${logged} of ${doses.length} doses recorded`}
          style={{ backgroundColor: '#D1E3D8', height: 6, borderRadius: 4, overflow: 'hidden' }}
        >
          <View
            style={{
              width: `${doses.length ? (logged / doses.length) * 100 : 0}%`,
              height: 6,
              backgroundColor: colors.teal,
            }}
          />
        </View>
        <Body>
          {doses.length
            ? `${doses.filter((d) => d.status === 'UPCOMING').length} upcoming · ${doses.filter((d) => d.status === 'DUE').length} due · ${doses.filter((d) => d.status === 'NOT_RECORDED').length} not recorded`
            : 'Your family’s reviewed schedules will appear here.'}
        </Body>
      </Panel>
      <View style={styles.row}>
        <Chip title="Everyone" active={!member} onPress={() => setMember(null)} />
        {members.map((m) => (
          <Chip
            key={m.id}
            title={m.name}
            active={member === m.id}
            onPress={() => setMember(m.id)}
          />
        ))}
      </View>
      <View style={styles.between}>
        <Label>Your medicine plan</Label>
        <Button
          compact
          secondary
          disabled={loading}
          title={
            !lastSync
              ? 'Retry connection'
              : members.length
                ? '+ Add medicine'
                : '+ Add member first'
          }
          onPress={() => {
            if (!lastSync) {
              void refresh();
              return;
            }
            if (members.length) router.push('/schedule');
            else router.push({ pathname: '/family', params: { add: '1' } });
          }}
        />
      </View>
      {loading ? (
        <Loading />
      ) : doses.length ? (
        doses.map((d) => <DoseCard key={d.id} dose={d} />)
      ) : (
        <Empty
          title="Nothing scheduled for today"
          text="Add a family member and a reviewed medicine schedule to get started."
        />
      )}
      <Body>Not recorded means no confirmation exists. It does not mean a dose was skipped.</Body>
      <Button
        secondary
        title={demo ? 'Refresh sample records' : 'Refresh records'}
        onPress={() => void refresh()}
      />
    </Screen>
  );
}

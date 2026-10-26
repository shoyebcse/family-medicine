import { useState } from 'react';
import { View } from 'react-native';
import { DoseCard } from '../../components/DoseCard';
import { Body, Chip, Empty, Heading, Label, Loading, Screen, styles } from '../../components/ui';
import { localDate } from '../../domain/dates';
import { useMedicine } from '../../state/MedicineProvider';

export default function HistoryScreen() {
  const { members, history, loading } = useMedicine();
  const [member, setMember] = useState<string | null>(null);
  const doses = history.filter(
    (d) => (!member || d.memberId === member) && d.status !== 'UPCOMING',
  );
  const days = [...new Set(doses.map((d) => localDate(new Date(d.dueAt))))].sort().reverse();
  return (
    <Screen>
      <Heading title="A record of your care." subtitle="The last seven days · Asia/Kolkata" />
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
      <Body>
        Taken and Skipped are recorded actions. Not recorded means no confirmation is available.
        These records do not prove ingestion.
      </Body>
      {loading ? (
        <Loading />
      ) : days.length ? (
        days.map((day) => (
          <View key={day} style={{ gap: 12 }}>
            <Label>{day}</Label>
            {doses
              .filter((d) => localDate(new Date(d.dueAt)) === day)
              .map((d) => (
                <DoseCard key={d.id} dose={d} readonly />
              ))}
          </View>
        ))
      ) : (
        <Empty
          title="No elapsed doses yet"
          text="Once a scheduled time has passed, its record appears here."
        />
      )}
    </Screen>
  );
}

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Chip, Label, Panel, colors } from '../components/ui';
import { filterHistory, historyStatus, type HistoryFilter } from './history';
import type { Prescription } from './types';

const PAGE_SIZE = 5;
export function PrescriptionHistory({
  history,
  busy,
  memberName,
  onRefresh,
  onOpen,
}: {
  history: Prescription[];
  busy: boolean;
  memberName: string;
  onRefresh(): void;
  onOpen(item: Prescription): void;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('All');
  const [page, setPage] = useState(0);
  const filtered = filterHistory(history, filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const start = current * PAGE_SIZE;
  return (
    <Panel>
      <View style={styles.header}>
        <Label>My prescriptions</Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh prescription history"
          disabled={busy}
          onPress={onRefresh}
          style={styles.refresh}
        >
          <Text style={{ fontSize: 23, color: colors.teal }}>↻</Text>
        </Pressable>
      </View>
      <Body>
        {memberName} · {history.length} prescriptions
      </Body>
      <View style={styles.header}>
        {(['All', 'Review needed', 'With schedules'] as const).map((choice) => (
          <Chip
            key={choice}
            title={choice}
            active={filter === choice}
            onPress={() => {
              setFilter(choice);
              setPage(0);
            }}
          />
        ))}
      </View>
      {!filtered.length ? (
        <Body>
          {history.length
            ? 'No prescriptions match this filter.'
            : 'No prescriptions saved for this person.'}
        </Body>
      ) : null}
      {filtered.slice(start, start + PAGE_SIZE).map((item) => {
        const date = new Date(item.createdAt);
        const status = historyStatus(item);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            disabled={busy}
            accessibilityLabel={`Open prescription from ${date.toLocaleString()}. ${status}${item.extractionMode === 'mock' ? '. Test data' : ''}`}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.details}>
              <Text style={styles.date}>
                {date.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                · {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.subtitle}>
                {item.items.length} medicines{item.extractionMode === 'mock' ? ' · Test data' : ''}
              </Text>
            </View>
            <View style={styles.actions}>
              <Text style={styles.badge}>{status}</Text>
              <Text style={styles.open}>Open →</Text>
            </View>
          </Pressable>
        );
      })}
      {filtered.length ? (
        <View style={styles.header}>
          <Button
            title="Previous"
            secondary
            compact
            disabled={busy || current === 0}
            onPress={() => setPage(current - 1)}
          />
          <Text style={styles.subtitle}>
            {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} · Page{' '}
            {current + 1}/{pages}
          </Text>
          <Button
            title="Next"
            secondary
            compact
            disabled={busy || current >= pages - 1}
            onPress={() => setPage(current + 1)}
          />
        </View>
      ) : null}
    </Panel>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  refresh: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  details: { flexGrow: 1, gap: 5 },
  date: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  subtitle: { color: colors.muted, fontSize: 13 },
  actions: { alignItems: 'flex-end', gap: 6 },
  badge: {
    color: colors.teal,
    backgroundColor: colors.soft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
  },
  open: { color: colors.teal, fontSize: 13, fontWeight: '600' },
});

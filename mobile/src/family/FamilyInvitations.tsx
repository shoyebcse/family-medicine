import { useCallback, useEffect, useState } from 'react';
import { Body, Button, Label, Panel } from '../components/ui';
import type { FamilyInvitation } from '../domain/types';
import { useMedicine } from '../state/MedicineProvider';

export function FamilyInvitations() {
  const { repository, refresh, demo } = useMedicine();
  const [items, setItems] = useState<FamilyInvitation[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      setItems(await repository.invitations());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load invitations.');
    }
  }, [repository]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (demo) return null;
  const decide = async (id: string, accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await repository.decideInvitation(id, accept);
      setNotice(
        accept
          ? 'Request accepted. Ask the profile owner to approve access in their Family tab, then refresh records.'
          : 'Invitation declined.',
      );
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your decision.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <Label>Family invitations</Label>
      <Body>
        Sign in with the invited mobile number to see requests. Accept only a profile you are
        authorized to manage. The owner must confirm your account after acceptance. No invitation
        SMS is sent.
      </Body>
      {items.map((item) => (
        <Panel key={item.memberId} tinted>
          <Label>{item.memberName}</Label>
          <Body>
            {item.invitedBy} invites you to view this profile’s medicine history, add schedules and
            record doses. Your other profiles stay private. Expires{' '}
            {new Date(item.expiresAt).toLocaleDateString()}.
          </Body>
          <Button
            disabled={busy}
            title="Accept profile access"
            onPress={() => void decide(item.memberId, true)}
          />
          <Button
            disabled={busy}
            secondary
            title="Decline invitation"
            onPress={() => void decide(item.memberId, false)}
          />
        </Panel>
      ))}
      {!items.length && <Body>No pending invitations for your signed-in phone account.</Body>}
      {error ? <Body>{error}</Body> : null}
      {notice ? <Body>{notice}</Body> : null}
      <Button
        disabled={busy}
        secondary
        title="Refresh invitations and records"
        onPress={() => {
          void load();
          void refresh();
        }}
      />
    </Panel>
  );
}

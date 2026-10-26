import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Switch, Text, View } from 'react-native';
import { RelationshipSelect } from '../../components/RelationshipSelect';
import { FamilyInvitations } from '../../family/FamilyInvitations';
import { PrescriptionSummary } from '../../medicine/PrescriptionSummary';
import { StockAlertEditor } from '../../stock/StockAlertEditor';
import {
  Body,
  Button,
  colors,
  Empty,
  Field,
  Heading,
  Label,
  Loading,
  Panel,
  Screen,
  styles,
} from '../../components/ui';
import { useMedicine } from '../../state/MedicineProvider';

export default function FamilyScreen() {
  const { members, schedules, loading, addMember, demo, repository, refresh } = useMedicine();
  const params = useLocalSearchParams<{ add?: string }>();
  const [formOpen, setFormOpen] = useState(false);
  const adding = formOpen || params.add === '1';
  function setAdding(value: boolean) {
    setFormOpen(value);
    if (!value) router.setParams({ add: '' });
  }
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteAccess, setInviteAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (!name.trim() || !relationship.trim()) {
      setError('Enter a name and relationship.');
      return;
    }
    if (
      (phone.trim() && !/^\+[1-9]\d{7,14}$/.test(phone.trim())) ||
      (inviteAccess && !phone.trim())
    ) {
      setError('Enter a mobile number with + and country code, for example +919876543210.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addMember(name.trim(), relationship.trim(), phone.trim() || undefined, inviteAccess);
      setName('');
      setRelationship('');
      setPhone('');
      setInviteAccess(false);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add member. Please retry.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Screen>
      <Heading
        title="Care starts with family."
        subtitle="A separate medicine plan and history for each person."
      />
      <View style={styles.between}>
        <Label>{members.length} family members</Label>
        <Button
          compact
          secondary
          title={adding ? 'Close form' : '+ Add member'}
          disabled={saving}
          onPress={() => setAdding(!adding)}
        />
      </View>
      {adding && (
        <Panel>
          <Label>Add a managed profile</Label>
          <Body>
            Add a mobile number if this person will sign in. Sharing starts only after you invite
            them, they accept in their Family tab and you approve their account here.
          </Body>
          <Field
            label="Member name"
            value={name}
            onChangeText={setName}
            maxLength={100}
            placeholder="For example, Arun"
            autoCapitalize="words"
            editable={!saving}
          />
          <RelationshipSelect value={relationship} onChange={setRelationship} disabled={saving} />
          <Field
            label="Member mobile number (optional)"
            value={phone}
            onChangeText={setPhone}
            editable={!saving}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={16}
            placeholder="+919876543210"
            hint="Use + and country code. A saved number alone does not grant access."
          />
          {!demo && (
            <View style={styles.row}>
              <Switch
                accessibilityLabel="Invite this number to access this profile"
                disabled={saving}
                value={inviteAccess}
                onValueChange={setInviteAccess}
              />
              <View style={{ flex: 1 }}>
                <Body>
                  Invite this person to view history, add medicine schedules and record doses for
                  this profile. I am authorized to share it. They must accept; other family profiles
                  stay private.
                </Body>
              </View>
            </View>
          )}
          <Body>
            No SMS is sent. During development, phone sign-in uses a free on-screen test code. Use
            fictional details.
          </Body>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
          <Button
            title={saving ? 'Saving…' : 'Save member'}
            disabled={saving}
            onPress={() => void save()}
          />
        </Panel>
      )}
      <FamilyInvitations />
      {error && !adding ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {loading ? (
        <Loading />
      ) : (
        members.map((member) => (
          <Panel key={member.id}>
            <View style={styles.row}>
              <View
                style={{
                  height: 48,
                  width: 48,
                  backgroundColor: colors.soft,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 20, color: colors.teal, fontWeight: '600' }}>
                  {member.name.slice(0, 1)}
                </Text>
              </View>
              <View>
                <Label>{member.name}</Label>
                <Body>{member.relationship}</Body>
                {member.phone && <Body>{member.phone}</Body>}
              </View>
            </View>
            <Body>
              {schedules.filter((s) => s.memberId === member.id).length} medicine schedules ·
              {member.owned === false ? 'Shared with you' : 'Managed profile'}
            </Body>
            {member.owned !== false && member.linkState && member.linkState !== 'NONE' && (
              <Body>Family access: {member.linkState.toLowerCase()}</Body>
            )}
            {!demo && member.owned !== false && member.linkState === 'AWAITING' && (
              <Panel tinted>
                <Body>
                  {member.linkedName} accepted using {member.phone}. Confirm this is the intended
                  person before sharing medicine records. Development test codes do not verify
                  ownership of the number.
                </Body>
                <Button
                  disabled={saving}
                  title="Approve this account’s profile access"
                  onPress={() => {
                    setSaving(true);
                    setError('');
                    void repository
                      .approveAccess(member.id)
                      .then(refresh)
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : 'Could not approve access.'),
                      )
                      .finally(() => setSaving(false));
                  }}
                />
              </Panel>
            )}
            {!demo && ['PENDING', 'AWAITING', 'ACCEPTED'].includes(member.linkState ?? '') && (
              <Button
                secondary
                disabled={saving}
                title={member.owned === false ? 'Leave shared profile' : 'Remove family access'}
                onPress={() => {
                  setSaving(true);
                  setError('');
                  void repository
                    .revokeAccess(member.id)
                    .then(refresh)
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : 'Could not remove access.'),
                    )
                    .finally(() => setSaving(false));
                }}
              />
            )}
            {schedules
              .filter((s) => s.memberId === member.id)
              .map((s) => (
                <View
                  key={s.id}
                  style={{
                    paddingTop: 10,
                    gap: 4,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{s.medicineName}</Text>
                  <Body>{s.doseInstruction}</Body>
                  <PrescriptionSummary schedule={s} />
                  <StockAlertEditor schedule={s} />
                  <Body>
                    {s.stock !== undefined
                      ? s.stock < 0
                        ? 'Stock estimate needs review'
                        : `Estimated stock: ${s.stock} ${s.unit}`
                      : 'Stock tracking off'}
                  </Body>
                </View>
              ))}
            <Button
              secondary
              title={`Add medicine for ${member.name}`}
              onPress={() =>
                router.push({ pathname: '/schedule', params: { memberId: member.id } })
              }
            />
          </Panel>
        ))
      )}
      {!loading && members.length === 0 && (
        <Empty
          title="Your family, in one place"
          text="Add yourself or a person you are authorized to manage, then create their medicine plan."
        />
      )}
    </Screen>
  );
}

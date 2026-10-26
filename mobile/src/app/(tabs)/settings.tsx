import { Body, Button, Heading, Label, Panel, Screen } from '../../components/ui';
import { timeLabel } from '../../domain/dates';
import { useMedicine } from '../../state/MedicineProvider';
import { ReminderSettings } from '../../reminders/ReminderSettings';
import { useAuth } from '../../auth/AuthProvider';
import { useState } from 'react';
import { requestStockPermission } from '../../stock/notifications';

export default function SettingsScreen() {
  const { demo, lastSync, refresh } = useMedicine();
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [stockPermissionMessage, setStockPermissionMessage] = useState('');
  const [stockPermissionBusy, setStockPermissionBusy] = useState(false);
  return (
    <Screen>
      <Heading title="Make care feel simple." subtitle="Connection, reminders and privacy." />
      <Panel>
        <Label>
          {auth.session
            ? `Signed in as ${auth.session.account.displayName}`
            : 'Exploring sample data'}
        </Label>
        {auth.session?.account.email && (
          <Body>
            {auth.session.account.email} ·{' '}
            {auth.session.account.emailVerified ? 'Verified email' : 'Email ownership not verified'}
          </Body>
        )}
        {auth.session?.account.phone && (
          <Body>
            {auth.session.account.phone} ·{' '}
            {auth.session.account.phoneVerified
              ? 'Verified phone'
              : 'Development phone — ownership not verified'}
          </Body>
        )}
        {signOutError && <Body>{signOutError}</Body>}
        {auth.notice && <Body>{auth.notice}</Body>}
        <Button
          secondary
          disabled={signingOut}
          title={
            signingOut ? 'Signing out…' : auth.session ? 'Sign out' : 'Sign in or create an account'
          }
          onPress={() => {
            setSigningOut(true);
            setSignOutError(null);
            void auth
              .logout()
              .catch((error) =>
                setSignOutError(
                  error instanceof Error ? error.message : 'Could not sign out. Try again.',
                ),
              )
              .finally(() => setSigningOut(false));
          }}
        />
      </Panel>
      <Panel>
        <Label>{demo ? 'Sample-data mode' : 'Account records'}</Label>
        <Body>
          {demo
            ? 'Sample records live in memory and reset when this app reloads. Use fictional details while exploring.'
            : 'Records are loaded from the server for your signed-in account. Sample records and other accounts are kept separate.'}
        </Body>
        <Body>
          Last {demo ? 'refresh' : 'successful fetch'}:{' '}
          {lastSync ? timeLabel(lastSync.toISOString()) : 'Not yet connected'}
        </Body>
        <Button secondary title="Refresh connection" onPress={() => void refresh()} />
      </Panel>
      <ReminderSettings />
      <Panel>
        <Label>Medicine supply notifications</Label>
        <Body>
          Set a low-stock threshold in Add Medicine or Family. Generic local alerts are checked when
          this app loads confirmed stock; closed-app monitoring is not available. No SMS is sent.
        </Body>
        <Button
          secondary
          disabled={stockPermissionBusy}
          title={stockPermissionBusy ? 'Checking permission…' : 'Enable stock notifications'}
          onPress={() => {
            setStockPermissionBusy(true);
            void requestStockPermission()
              .then((granted) =>
                setStockPermissionMessage(
                  granted
                    ? 'Notifications allowed. In-app warnings remain visible; device settings still control notification delivery.'
                    : 'Notifications unavailable or denied. Low-stock warnings still appear in the app.',
                ),
              )
              .catch(() =>
                setStockPermissionMessage(
                  'Could not enable notifications. Check device settings; in-app warnings remain available.',
                ),
              )
              .finally(() => setStockPermissionBusy(false));
          }}
        />
        {stockPermissionMessage ? <Body>{stockPermissionMessage}</Body> : null}
      </Panel>
      <Panel>
        <Label>Schedule timezone</Label>
        <Body>
          Asia/Kolkata. Schedule times stay in this timezone when your device timezone changes.
        </Body>
      </Panel>
      <Panel>
        <Label>Privacy and access</Label>
        <Body>
          Family profile sharing requires invitation, acceptance and final owner approval. Email
          ownership verification, granular permissions, encrypted offline storage, export and
          deletion remain pending. Use fictional details during development.
        </Body>
      </Panel>
      <Body>Family Medicine · Development version 0.1.0</Body>
    </Screen>
  );
}

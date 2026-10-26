import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Field, Heading, Panel, colors } from '../components/ui';
import { useAuth } from './AuthProvider';
import type { Challenge } from './api';

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'phone'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const submitCredentials = () =>
    void run(async () => {
      if (mode === 'register') {
        if (!name.trim()) throw new Error('Enter your name.');
        if (password !== confirm) throw new Error('The passwords do not match.');
        await auth.register(name.trim(), email.trim(), password);
      } else await auth.login(email.trim(), password);
    });
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
    setCode('');
    setChallenge(null);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 24,
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
          <Heading
            title="Welcome to Family Medicine"
            subtitle="Sign in to your own medicine records, or explore fictional sample data."
          />
          <Panel>
            <Heading
              title={
                mode === 'register'
                  ? 'Create your account'
                  : mode === 'phone'
                    ? 'Sign in with your phone'
                    : 'Sign in'
              }
            />
            {(mode === 'register' || mode === 'phone') && (
              <Field
                label={'Your name'}
                value={name}
                onChangeText={setName}
                maxLength={100}
                autoComplete="name"
                editable={!busy}
              />
            )}
            {mode === 'phone' ? (
              <>
                <Field
                  label="Mobile number with country code"
                  hint="For example, +919876543210"
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    setChallenge(null);
                    setCode('');
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!busy && !challenge}
                />
                {challenge && (
                  <>
                    <Body>
                      {challenge.developmentCode
                        ? `Development only — no SMS sent and no charge. Test code: ${challenge.developmentCode}. Use fictional phone accounts; this does not verify phone ownership.`
                        : 'Code requested. Enter the SMS code before it expires.'}
                    </Body>
                    <Field
                      label="Verification code"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      autoComplete="sms-otp"
                      maxLength={10}
                      editable={!busy}
                    />
                  </>
                )}
                <Button
                  disabled={busy}
                  title={
                    busy
                      ? 'Please wait…'
                      : challenge
                        ? 'Verify and continue'
                        : 'Send verification code'
                  }
                  onPress={() =>
                    void run(async () => {
                      if (!/^\+[1-9]\d{7,14}$/.test(phone.trim()))
                        throw new Error('Enter your mobile number with + and country code.');
                      if (challenge) {
                        if (Date.parse(challenge.expiresAt) <= Date.now())
                          throw new Error('Code expired. Request a new code.');
                        await auth.verifyPhone(challenge.challengeId, code, name.trim());
                      } else setChallenge(await auth.startPhone(phone.trim()));
                    })
                  }
                />
                {challenge && (
                  <Button
                    secondary
                    disabled={busy}
                    title="Request a new code or change number"
                    onPress={() => {
                      setChallenge(null);
                      setCode('');
                    }}
                  />
                )}
                <Body>
                  New phone numbers create a separate account after the code is accepted. Phone and
                  email accounts are not automatically linked.
                </Body>
              </>
            ) : (
              <>
                <Field
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  onSubmitEditing={submitCredentials}
                  returnKeyType="go"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  maxLength={254}
                  editable={!busy}
                />
                <Field
                  label="Password"
                  hint={
                    mode === 'register'
                      ? 'At least 12 characters; maximum 72 UTF-8 bytes.'
                      : undefined
                  }
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={submitCredentials}
                  returnKeyType="go"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  maxLength={72}
                  editable={!busy}
                />
                {mode === 'register' && (
                  <Field
                    label="Confirm password"
                    value={confirm}
                    onChangeText={setConfirm}
                    onSubmitEditing={submitCredentials}
                    returnKeyType="go"
                    secureTextEntry
                    autoComplete="new-password"
                    maxLength={72}
                    editable={!busy}
                  />
                )}
                {mode === 'register' && (
                  <Body>
                    Email ownership verification is not available yet. This account does not
                    establish a verified email identity.
                  </Body>
                )}
                <Button
                  disabled={busy}
                  title={busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
                  onPress={submitCredentials}
                />
              </>
            )}
            {(error || auth.notice) && (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {error || auth.notice}
              </Text>
            )}
            <Button
              secondary
              disabled={busy}
              title={
                mode === 'register' ? 'Already registered? Sign in' : 'Create an email account'
              }
              onPress={() => changeMode(mode === 'register' ? 'login' : 'register')}
            />
            <Button
              secondary
              disabled={busy}
              title={mode === 'phone' ? 'Use email and password' : 'Use mobile number and OTP'}
              onPress={() => changeMode(mode === 'phone' ? 'login' : 'phone')}
            />
          </Panel>
          <Button
            secondary
            disabled={busy}
            title="Explore sample data without signing in"
            onPress={auth.explore}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

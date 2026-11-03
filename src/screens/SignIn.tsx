import { useState } from 'react';
import { View } from 'react-native';
import { errorText, supabase } from '../lib/supabase';
import { color, space } from '../theme';
import { Button, Card, Field, T } from '../ui';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  async function sendCode() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return setError('Enter a valid email address.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(errorText(error));
    setStep('code');
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('That code did not work. Check it, or send a new one.');
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.xl, backgroundColor: color.bg }}>
      <View style={{ gap: space.sm }}>
        <T size="heading" bold>
          Jejak
        </T>
        <T muted>See where your family is, and find your phone, on Android and iPhone.</T>
      </View>
      <Card>
        {step === 'email' ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Button label="Send me a code" onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            <T muted>We emailed a code to {cleanEmail}.</T>
            <Field
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={10}
            />
            <Button label="Sign in" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
            <Button label="Use a different email" variant="secondary" onPress={() => setStep('email')} />
          </>
        )}
        {error ? <T color={color.danger}>{error}</T> : null}
      </Card>
    </View>
  );
}

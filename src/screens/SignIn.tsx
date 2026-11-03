import { useState } from 'react';
import { View } from 'react-native';
import { AUTH_REDIRECT } from '../lib/authLink';
import { FadeUp } from '../motion';
import { errorText, supabase } from '../lib/supabase';
import { color, space } from '../theme';
import { Button, Card, Field, T } from '../ui';

export function SignIn({ linkError }: { linkError?: string | null }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'sent'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  async function send() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return setError('Enter a valid email address.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true, emailRedirectTo: AUTH_REDIRECT },
    });
    setBusy(false);
    if (error) {
      const msg = errorText(error);
      return setError(/rate|too many|seconds/i.test(msg) ? 'Too many codes sent. Wait a minute and try again.' : msg);
    }
    setCode('');
    setStep('sent');
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('That code didn\'t work. Check it, or send a new one.');
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
        {/* keyed so "Check your email" rises and fades in instead of swapping instantly */}
        <FadeUp key={step} style={{ gap: space.md }}>
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
            <Button label="Email me a code" onPress={send} loading={busy} />
          </>
        ) : (
          <>
            <T bold>Enter the code</T>
            <T muted>We emailed a 6-digit code to {cleanEmail}. Check spam if it isn't there in a minute.</T>
            <Field
              label="Code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
              maxLength={10}
              placeholder="123456"
              onSubmitEditing={verify}
            />
            <Button label="Sign in" onPress={verify} loading={busy} disabled={code.length < 6} />
            <Button label="Send a new code / change email" variant="secondary" onPress={() => setStep('email')} />
          </>
        )}
        </FadeUp>
        {error || linkError ? <T color={color.danger}>{error || linkError}</T> : null}
      </Card>
    </View>
  );
}

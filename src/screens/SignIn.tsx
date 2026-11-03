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
  const [showCode, setShowCode] = useState(false);
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
      return setError(/rate|too many|seconds/i.test(msg) ? 'Too many emails sent. Wait a minute and try again.' : msg);
    }
    setStep('sent');
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('That code did not work. Check it, or send a new email.');
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
            <Button label="Email me a sign-in link" onPress={send} loading={busy} />
          </>
        ) : (
          <>
            <T bold>Check your email</T>
            <T muted>
              We sent a sign-in link to {cleanEmail}. Open the email on this phone and tap the link — it opens Jejak and signs
              you in. Check spam if you don't see it.
            </T>
            {showCode ? (
              <>
                <Field
                  label="Code from the email"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={10}
                />
                <Button label="Sign in with code" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
              </>
            ) : (
              <Button label="My email has a code instead" variant="secondary" onPress={() => setShowCode(true)} />
            )}
            <Button label="Send again / different email" variant="secondary" onPress={() => setStep('email')} />
          </>
        )}
        </FadeUp>
        {error || linkError ? <T color={color.danger}>{error || linkError}</T> : null}
      </Card>
    </View>
  );
}

import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { color, font, radius, space } from './theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn,
        variant === 'primary' && { backgroundColor: color.accent },
        variant === 'secondary' && { backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1 },
        variant === 'danger' && { backgroundColor: 'transparent', borderColor: color.danger, borderWidth: 1 },
        pressed && { opacity: 0.8 },
        off && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.onAccent : color.text} />
      ) : (
        <Text
          style={[
            s.btnText,
            { color: variant === 'primary' ? color.onAccent : variant === 'danger' ? color.danger : color.text },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.textMuted}
        accessibilityLabel={label}
        {...rest}
        style={[s.input, rest.style]}
      />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function T({
  children,
  muted,
  size = 'body',
  bold,
  color: c,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: keyof typeof font;
  bold?: boolean;
  color?: string;
}) {
  return (
    <Text
      style={{
        color: c ?? (muted ? color.textMuted : color.text),
        fontSize: font[size],
        fontWeight: bold ? '700' : '400',
        lineHeight: font[size] * 1.35,
      }}
    >
      {children}
    </Text>
  );
}

export function Avatar({
  name,
  size = 40,
  ring,
  url,
}: {
  name: string;
  size?: number;
  ring?: string;
  url?: string | null;
}) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={`${name}'s photo`}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: ring ?? color.accent,
          backgroundColor: color.surface2,
        }}
      />
    );
  }
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color.surface2,
        borderWidth: 2,
        borderColor: ring ?? color.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: color.text, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && { backgroundColor: color.accent, borderColor: color.accent }]}
    >
      <Text style={{ color: selected ? color.onAccent : color.text, fontWeight: '600', fontSize: font.small }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({
  left,
  title,
  subtitle,
  right,
  onPress,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && onPress && { backgroundColor: color.surface2 }]}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: color.text, fontSize: font.body, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: color.textMuted, fontSize: font.small }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <T size="title" bold>
              {title}
            </T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Text style={{ color: color.textMuted, fontSize: font.title }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function timeAgo(iso: string | null) {
  if (!iso) return 'no location yet';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function isStale(iso: string | null) {
  return !iso || Date.now() - new Date(iso).getTime() > 30 * 60000;
}

export function distanceText(a?: { lat: number | null; lng: number | null } | null, b?: { lat: number | null; lng: number | null } | null) {
  if (!a?.lat || !a.lng || !b?.lat || !b.lng) return null;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h));
  return m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(1)} km away`;
}

const s = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnText: { fontSize: font.body, fontWeight: '700' },
  label: { color: color.textMuted, fontSize: font.small, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    color: color.text,
    paddingHorizontal: space.md,
    fontSize: font.body,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: color.border,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
});

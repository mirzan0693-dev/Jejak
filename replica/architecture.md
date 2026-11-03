# Architecture: Jejak (working name, renamed at Brand)

## Stack

| layer | choice | why |
| --- | --- | --- |
| app | Expo SDK 58 + React Native + TypeScript + expo-router | one codebase for Android and iOS, cloud builds with EAS (no Mac needed) |
| map | MapLibre React Native + OpenFreeMap tiles | free, no Google Maps API key to set up |
| background location | expo-location + expo-task-manager | Android foreground service (visible notification = sharing indicator), iOS significant-change updates |
| backend | Supabase (Postgres, Auth, Realtime) | one managed service; free tier is enough for a family |
| auth | Supabase email one-time code | no passwords to manage |
| notifications | local notifications fired by the app (v1); Expo push later | push needs FCM + APNs credentials, added after the slice works |

No payments in v1 (personal/family use).

## Schema (supabase/schema.sql)

profiles, devices, shares, geofences, alerts, commands. Every table has row level security:
- you see your own rows;
- you see another person's devices/locations only while an **active, unexpired share from them to you** exists;
- commands (play sound, lost mode) can only target your own devices.
Hard rules in the database: no sharing with yourself, one share per direction, the share only becomes active when the recipient accepts (`accept_share()` checks the caller is the recipient).

Geofence alerts: a trigger on device location update compares previous and new position against geofences on that user and inserts an `alerts` row for the watcher. The subject can see every geofence set on them.

## How commands reach a phone without push (v1)

The background location task runs every few minutes (and on movement). After uploading location it fetches pending commands for that device and acts: play sound = a max-priority local notification with alarm sound; lost mode = a sticky notification and full-screen notice on next open. Realtime subscription makes it instant while the app is open. Latency when closed: up to a few minutes. Push (v2) makes it instant.

## Build order

1. Vertical slice: sign in → register device → background location upload → see yourself on map.
2. Invite by email → accept → see each other.
3. Devices list, play sound, lost mode.
4. Arrive/leave alerts.
5. v2: push notifications, web finder, location history.

## Risks

1. Google Play background-location declaration and review video; Apple "Always" location review.
2. iOS silent mode blocks the find sound without the Critical Alerts entitlement.
3. Battery: updates every 5 min / 50 m with balanced accuracy.

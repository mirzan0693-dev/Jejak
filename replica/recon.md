# Recon map: Find My (Apple) → cross-platform clone

Date: 2026-11-03 · Target platforms for the clone: Android + iOS (one Expo / React Native codebase)

## 1. Scope

| question | answer (proposed) |
| --- | --- |
| App | Apple Find My (iPhone, iPad, Mac, iCloud web) |
| Slice | **People** (share live location with family and friends, mutual consent) + **Devices** (locate your own phones, play a sound, mark as lost). Items/AirTags out of scope. |
| Who for | Families and friend groups with a mix of Android and iPhone, the gap Find My leaves (it is Apple-only) |
| Core loop | Invite someone → they accept → both see each other on a map → get alerts on arrive/leave → find a lost phone |

## 2. Sources

| source | URL | used for |
| --- | --- | --- |
| Feature availability by device | https://support.apple.com/en-in/126302 | full device/item feature list and conditions |
| Locate a lost device | https://support.apple.com/en-au/HT210515 | lost-device flow |
| iPhone User Guide, sharing with friends | https://support.apple.com/en-asia/guide/iphone/ipha24eb4a37/12.0/ios | people flow: invite, accept/decline, duration, notify me |
| iCloud User Guide, Find Devices | https://support.apple.com/guide/icloud/mm11a95f979f | web version of device finding |
| Find My for Mac guide | https://support.apple.com/en-bw/guide/findmy-mac/toc | screen and settings list |
| User's own account | (user's iPhone, if they have one) | states, empty screens |

## 3. Screen inventory

| ID | screen | how you get there | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | Welcome / sign in | first launch | account | logo, buttons, phone/email input | default, error |
| S02 | Permissions | after sign in | location (always), notifications, motion | explainer cards, system prompt trigger | granted, denied, "precise off" |
| S03 | Map (home) | tab People/Devices | map with avatars/device pins | map, pins, bottom sheet, tab bar | loading, empty (no one shared), filled, stale location |
| S04 | People list | bottom sheet on S03 | everyone sharing with you | person row (avatar, place, distance, time ago) | empty, filled, pending invite |
| S05 | Person detail | tap person | where they are, actions | address, distance, Directions, Notifications, Contact, Stop sharing | live, stale, paused |
| S06 | Invite / share | + button | send share with duration | contact picker, duration (1 hr / until end of day / indefinitely) | sent, failed |
| S07 | Invite received | push / in-app | accept or decline | card, Share back / Don't share | — |
| S08 | Notify me (geofence) | S05 → Notifications | alert when arrive/leave a place | place picker on map, radius, once/every time | none set, active |
| S09 | Devices list | tab Devices | your devices | device row (name, battery, last seen) | empty, online, offline |
| S10 | Device detail | tap device | locate and act | Play sound, Directions, Mark as lost, Notify when found | online, offline, lost |
| S11 | Lost mode setup | S10 | message + contact number on lock screen | text input, phone input | active |
| S12 | Me / settings | tab Me | my sharing status, paused, which device shares | toggle, sharing-from device, account | sharing on/off |
| S13 | Web finder | browser | find your phone from any computer | sign in, map, device actions | — |

## 4. Flows

F01 Share location with someone (core loop)
  S04 → S06 pick contact + duration → send → (them) S07 accept → both on S03
  edge: invitee has no app yet (link → install), declines, invite expires, duration ends
  happy path clicks: 4

F02 See where someone is
  S03 → S04 tap → S05
  edge: location stale (phone off/no signal) → show "last seen 2h ago", never fake fresh

F03 Arrive/leave alert
  S05 → S08 choose place + arrive/leave → save → push when crossed
  edge: the person sees that an alert exists about them (consent), iOS geofence limit (20 regions)

F04 Find my phone (from another phone or web)
  S09/S13 → S10 → Play sound
  edge: phone on silent, phone offline (show last location + Notify when found)

F05 Lost phone
  S10 → S11 message + number → phone shows full-screen notice, keeps reporting location

F06 Stop sharing
  S05 → Stop sharing, or S12 global pause → other side updates immediately

## 5. Components

Map with avatar pins and device pins · bottom sheet (3 heights) · tab bar (People / Devices / Me) · person row · device row (battery, status dot) · action button grid (Play sound, Directions, Notify, Lost) · duration picker · place/radius picker · invite card · permission explainer card · "you are sharing your location" banner · stale-location badge · toast.

## 6. Inferred data model

| entity | fields | evidence | confidence |
| --- | --- | --- | --- |
| User | id, name, phone/email, avatar | sign-in, contact picker | high |
| Device | id, user_id, name, platform, push_token, battery, last_location, last_seen_at, is_sharing_device | devices list, battery shown | high |
| LocationPing | device_id, lat, lng, accuracy, recorded_at | map, "x min ago" | high (store latest + short history only) |
| Share | id, from_user, to_user, status (pending/active/paused/ended), expires_at | invite + duration options | high |
| Geofence alert | id, watcher_id, subject_id, center, radius, trigger (arrive/leave), repeat | Notify me | high |
| LostMode | device_id, message, contact_phone, enabled_at | Lost Mode feature | high |
| Command | device_id, type (play_sound/lost_on/lost_off), status | Play Sound/Lost Mode | medium (guess at mechanism) |

## 7. Built-in safety (non-negotiable for this category)

Location sharing apps get used for stalking, so the clone is consent-first by design:
- Sharing only starts when the person being located accepts it on their own phone. No silent/hidden mode, no hiding the app icon.
- A persistent "sharing your location with N people" indicator on the sharer's phone.
- The located person is notified when someone sets an arrive/leave alert on them, and can stop sharing in one tap.
- Device features (play sound, lost mode) only on devices signed in to your own account.

## 8. What cannot be cloned (skip)

- **Offline finding network** (finding a phone with no internet via millions of nearby Apple devices): that's Apple's network and its users.
- **AirTags / items / Find Nearby (UWB)**: hardware + network.
- **Activation Lock and remote erase/lock on iPhone**: iOS doesn't let third-party apps lock or wipe the phone. On Android it needs device-admin permissions Google restricts. Lost mode becomes a full-screen notice + continuous location, not a real lock.
- **Locating after the phone is switched off or the app is force-closed**: needs OS-level access.
- **Siri integration and iMessage location sharing.**

## 9. Platform constraints (the hard parts)

1. **Background location on both OSes.** iOS needs "Always" permission plus battery-friendly significant-change updates; Google Play requires a background-location declaration and review video. Biggest risk to launch.
2. **Play sound on a silent phone.** Android: high-priority push + foreground service can ring. iOS: needs Apple's Critical Alerts entitlement (application, may be refused); without it, sound only plays if not on silent.
3. **Battery vs freshness.** Updating too often drains battery; too rarely and the map is stale.

## 10. Size

13 screens, 6 flows, 7 entities. **L (about a quarter of part-time work)**, mostly the background-location and push work, not the screens.

Next: Architect.

# Waqt: Prayer Times

Islamic prayer times in [Orca](https://orca.dev)'s status bar. Bahasa Indonesia and English.

- **Status bar**: the next prayer and its time, a countdown in the last hour, and "Asr time" for 15 minutes after a prayer begins. Click it for today's full timetable.
- **Reminders**: a desktop notification a few minutes before each prayer (10 by default) and when it begins, with each prayer switchable on or off. A reminder before sunrise, when Fajr ends (15 minutes by default). On Fridays an earlier Jumu'ah reminder (30 minutes by default) instead of the regular Dhuhr one. Imsak during Ramadan. Optional: Duha time, and the evening before a sunnah fast (Mondays, Thursdays, the White Days, Arafah, Tasu'a, Ashura; never in Ramadan or on Eid and tashriq days).
- **Your agents** (Orca workspaces with agents running):
  - Reminders before a prayer say which workspaces are waiting for your approval and how many are still working, so you can answer them before you step away.
  - When a prayer is 10 minutes away and an agent is waiting, the status bar turns red: "Asr 15:06, 8 min left, 1 agent waiting".
  - The panel lists those workspaces; click one to open it.
  - 20 minutes after a prayer begins, a note says what happened meanwhile: "While you prayed Asr: Finished in 1 workspace: api. 1 workspace is waiting for your approval: web."
  - Nothing is added when no agent is running. Turn it all off with *Show my agents*.
- **Panel**: today's and tomorrow's times (with Duha), a line from Fajr to Isha showing where the day is, the Hijri date and the Qibla direction.
- **Offline**: calculated on your computer, no internet. Methods: Kemenag (Indonesia), JAKIM, MUIS, Muslim World League, Egyptian General Authority, ISNA and Umm al-Qura. Checked against Kemenag's 2026 tables for Jakarta, Makassar, Medan and Jayapura on two dates: every time within a minute, 61 of 64 exactly (`test/kemenag.test.mjs`).

## Settings

Settings → Plugins → Waqt: language, city (automatic, 31 built in, picked in the panel, or your own coordinates), calculation method (automatic by country, or one of seven), Asr school, Hijri date adjustment (to follow your country's moon sighting), safety margin (ihtiyat, automatic by method), reminder minutes, a notification when a prayer begins, which prayers to notify, the sunrise and Jumu'ah reminders, showing your agents, the imsak reminder (Ramadan, every day or off), Duha and sunnah fasting reminders.

**Location, anywhere, offline.** City starts on Automatic: Waqt reads your computer's time zone and uses that zone's city from the tz database (418 zones, every country), or a built-in Indonesian city for WIB, WITA and WIT. The name shows "(auto)". The calculation method also starts on Automatic and follows your country: Kemenag in Indonesia, JAKIM in Malaysia, MUIS in Singapore, Umm al-Qura in Saudi Arabia, the Egyptian authority in Egypt, ISNA in the US and Canada, and the Muslim World League elsewhere.

A time zone is only a rough guess (WIB alone spans about 46 minutes from Banda Aceh to Jakarta), so the panel has **Change city**: search the built-in cities and time zone cities, or go back to Automatic. For anywhere else, set City to Other and enter coordinates.

Times are shown on the chosen place's own clock (WITA for Makassar, Istanbul time for Istanbul); the panel says "local time there" when that differs from your computer. Where the sun never sinks far enough for Fajr or Isha (northern Europe in summer, for example), those two are estimated from the length of the night (the "angle-based" rule). Locations above about 66° north or south are not supported yet.

---

**Bahasa Indonesia:** jadwal sholat di status bar Orca, dengan hitung mundur, notifikasi pengingat, dan panel jadwal hari ini dan besok. Dihitung offline. Lokasi dan metode otomatis dari zona waktu komputer (di Indonesia: kota WIB/WITA/WIT dan kriteria Kemenag); ganti kota lewat tombol **Ganti kota** di panel. Pilih bahasa di Settings → Plugins → Waqt.

## Access

Waqt asks Orca for: your workspaces and their agent status (to mention, list and open workspaces with working or waiting agents; nothing leaves your computer), its own settings, and desktop notifications.

## Development

```sh
orca plugin validate .
node --test test/*.test.mjs
orca plugin dev load .          # rerun with the --approve <fingerprint> it prints
orca plugin dev request . waqt.schedule
orca plugin shot . --status-bar
orca plugin logs local.waqt
```

## License

MIT

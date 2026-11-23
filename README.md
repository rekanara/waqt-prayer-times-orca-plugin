# Waqt: Prayer Times

Islamic prayer times in [Orca](https://orca.dev)'s status bar. Bahasa Indonesia and English.

- **Status bar**: the next prayer and its time, a countdown in the last hour, and "Asr time" for 15 minutes after a prayer begins. Click it for today's full timetable.
- **Reminders**: a desktop notification a few minutes before each prayer (10 by default) and when it begins, with each prayer switchable on or off. A reminder before sunrise, when Fajr ends (15 minutes by default). On Fridays an earlier Jumu'ah reminder (30 minutes by default) instead of the regular Dhuhr one.
- **Panel**: today's and tomorrow's times, a line from Fajr to Isha showing where the day is, and the Hijri date.
- **Offline**: calculated on your computer, no internet. Methods: Kemenag (Indonesia), JAKIM, MUIS, Muslim World League, Egyptian General Authority, ISNA and Umm al-Qura. With Kemenag, Jakarta's times match the official 2026 timetable to within a minute.

## Settings

Settings → Plugins → Waqt: language, city (automatic, 31 built in, picked in the panel, or your own coordinates), calculation method (automatic by country, or one of seven), Asr school, safety margin (ihtiyat), reminder minutes, a notification when a prayer begins, which prayers to notify, the sunrise and Jumu'ah reminders, and an imsak reminder for Ramadan.

**Location, anywhere, offline.** City starts on Automatic: Waqt reads your computer's time zone and uses that zone's city from the tz database (418 zones, every country), or a built-in Indonesian city for WIB, WITA and WIT. The name shows "(auto)". The calculation method also starts on Automatic and follows your country: Kemenag in Indonesia, JAKIM in Malaysia, MUIS in Singapore, Umm al-Qura in Saudi Arabia, the Egyptian authority in Egypt, ISNA in the US and Canada, and the Muslim World League elsewhere.

A time zone is only a rough guess (WIB alone spans about 46 minutes from Banda Aceh to Jakarta), so the panel has **Change city**: search the built-in cities and time zone cities, or go back to Automatic. For anywhere else, set City to Other and enter coordinates.

Times are shown in your computer's time zone. Where the sun never sinks far enough for Fajr or Isha (northern Europe in summer, for example), those two are estimated from the length of the night (the "angle-based" rule). Locations above about 66° north or south are not supported yet.

---

**Bahasa Indonesia:** jadwal sholat di status bar Orca, dengan hitung mundur, notifikasi pengingat, dan panel jadwal hari ini dan besok. Dihitung offline. Lokasi dan metode otomatis dari zona waktu komputer (di Indonesia: kota WIB/WITA/WIT dan kriteria Kemenag); ganti kota lewat tombol **Ganti kota** di panel. Pilih bahasa di Settings → Plugins → Waqt.

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

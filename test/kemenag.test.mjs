// node --test test/
// Waqt against Kemenag's published jadwal sholat (Bimas Islam, served by api.myquran.com v2,
// fetched 2026-11-23). Every time must be within a minute; most match exactly.
import test from 'node:test'
import assert from 'node:assert/strict'
import { prayerTimes } from '../worker/praytimes.mjs'
import { CITIES } from '../worker/cities.mjs'

// imsak subuh terbit dhuha dzuhur ashar maghrib isya
const OFFICIAL = {
  jakarta: ['Asia/Jakarta', {
    '2026-11-23': '03:55 04:05 05:23 05:52 11:42 15:05 17:55 19:09',
    '2026-06-21': '04:30 04:40 05:58 06:27 11:58 15:19 17:51 19:05' }],
  makassar: ['Asia/Makassar', {
    '2026-11-23': '04:07 04:17 05:34 06:03 11:52 15:15 18:03 19:17',
    '2026-06-21': '04:38 04:48 06:06 06:35 12:08 15:29 18:02 19:16' }],
  medan: ['Asia/Jakarta', {
    '2026-11-23': '04:44 04:54 06:10 06:39 12:15 15:37 18:13 19:26',
    '2026-06-21': '04:45 04:55 06:14 06:43 12:31 15:56 18:40 19:55' }],
  jayapura: ['Asia/Jayapura', {
    '2026-11-23': '03:46 03:56 05:13 05:41 11:27 14:50 17:34 18:47',
    '2026-06-21': '04:08 04:18 05:36 06:05 11:42 15:06 17:41 18:56' }]
}
const KEYS = ['imsak', 'fajr', 'sunrise', 'dhuha', 'dhuhr', 'asr', 'maghrib', 'isha']
const minutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }

for (const [city, [tz, days]] of Object.entries(OFFICIAL)) {
  test(`Kemenag ${city}: within a minute of the official table`, () => {
    const [, lat, lng] = CITIES[city]
    for (const [date, row] of Object.entries(days)) {
      const [y, m, d] = date.split('-').map(Number)
      const t = prayerTimes(new Date(y, m - 1, d, 12), { lat, lng, method: 'kemenag' }) // reads the local calendar day
      row.split(' ').forEach((official, i) => {
        const ours = t[KEYS[i]].toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
        assert.ok(Math.abs(minutes(ours) - minutes(official)) <= 1, `${city} ${date} ${KEYS[i]}: Waqt ${ours}, Kemenag ${official}`)
      })
    }
  })
}

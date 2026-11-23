// node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { sunnahFastReasons, notificationEvents } from '../worker/main.mjs'
import { prayerTimes, qibla } from '../worker/praytimes.mjs'

const L = {
  locale: 'id-ID',
  fast: { monday: 'Senin', thursday: 'Kamis', bidh: (d) => `Ayyamul Bidh (${d})`, arafah: 'Arafah', ashura: 'Asyura', tasua: "Tasu'a" }
}
const day = (y, m, d) => new Date(y, m - 1, d, 12)

test('sunnah fasting days', () => {
  assert.deepEqual(sunnahFastReasons(L, day(2026, 11, 23)), ['Ayyamul Bidh (13 Jumadilakhir)', 'Senin'])
  assert.deepEqual(sunnahFastReasons(L, day(2026, 11, 26)), ['Kamis'])
  assert.deepEqual(sunnahFastReasons(L, day(2026, 11, 27)), []) // Friday, 17 Jumadilakhir: a plain day
  assert.deepEqual(sunnahFastReasons(L, day(2026, 5, 26)), ['Arafah']) // 9 Dhu al-Hijjah 1447
})

test('no sunnah fast in Ramadan or on forbidden days', () => {
  assert.deepEqual(sunnahFastReasons(L, day(2026, 2, 23)), []) // a Monday in Ramadan 1447
  assert.deepEqual(sunnahFastReasons(L, day(2026, 3, 20)), []) // 1 Shawwal 1447 (Eid al-Fitr)
  assert.deepEqual(sunnahFastReasons(L, day(2026, 5, 27)), []) // 10 Dhu al-Hijjah (Eid al-Adha)
  assert.deepEqual(sunnahFastReasons(L, day(2026, 5, 30)), []) // 13 Dhu al-Hijjah: tashriq, not a White Day
})

const cfg = (over) => ({
  place: { name: 'Jakarta' }, lang: 'id', notifyAtTime: false, remindBefore: 0, remindSunrise: 0, fridayRemind: 0,
  prayers: {}, imsak: 'ramadan', remindDhuha: false, sunnahFast: false, hijriOffset: 0, ...over
})
const ids = (c, d) => notificationEvents(c, [[prayerTimes(d, { lat: -6.1754, lng: 106.8272 }), d]]).map((e) => e.id.slice(11))

test('imsak reminder: during Ramadan by default, every day or never on request', () => {
  assert.deepEqual(ids(cfg(), day(2026, 2, 23)), ['imsak-at'])
  assert.deepEqual(ids(cfg(), day(2026, 11, 23)), [])
  assert.deepEqual(ids(cfg({ imsak: 'always' }), day(2026, 11, 23)), ['imsak-at'])
  assert.deepEqual(ids(cfg({ imsak: 'off' }), day(2026, 2, 23)), [])
  // A sighting a day later moves the first imsak with it.
  assert.deepEqual(ids(cfg({ hijriOffset: -1 }), day(2026, 2, 18)), [])
})

test('Dhuha and the evening-before-fast reminders', () => {
  assert.deepEqual(ids(cfg({ remindDhuha: true }), day(2026, 11, 23)), ['dhuha-at'])
  // Sunday 22 Nov evening: tomorrow is Monday and 13 Jumadilakhir, a White Day.
  const ev = notificationEvents(cfg({ sunnahFast: true }), [[prayerTimes(day(2026, 11, 22), { lat: -6.1754, lng: 106.8272 }), day(2026, 11, 22)]])
  assert.equal(ev.length, 1)
  assert.equal(ev[0].body, 'Besok Ayyamul Bidh (13 Jumadilakhir) dan Senin. Jangan lupa niat dan sahur.')
  // Wednesday 25 Nov evening: Thursday the 16th, so just Thursday.
  const wed = notificationEvents(cfg({ sunnahFast: true }), [[prayerTimes(day(2026, 11, 25), { lat: -6.1754, lng: 106.8272 }), day(2026, 11, 25)]])
  assert.equal(wed[0].body, 'Besok Kamis. Jangan lupa niat dan sahur.')
})

test('qibla bearing', () => {
  assert.equal(Math.round(qibla(-6.1754, 106.8272)), 295) // Jakarta
  assert.equal(Math.round(qibla(51.5083, -0.1253)), 119) // London
  assert.equal(Math.round(qibla(40.7142, -74.0064)), 58) // New York
})

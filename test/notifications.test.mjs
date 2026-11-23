// node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationEvents } from '../worker/main.mjs'
import { prayerTimes } from '../worker/praytimes.mjs'

const cfg = (over = {}) => ({
  place: { name: 'Jakarta' },
  lang: 'id',
  notifyAtTime: true,
  remindBefore: 10,
  showImsak: false,
  remindSunrise: 15,
  fridayRemind: 30,
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  ...over
})
const day = (iso) => {
  const d = new Date(`${iso}T12:00:00+07:00`)
  return [prayerTimes(d, { lat: -6.1754, lng: 106.8272 }), d]
}
const ids = (c, iso) => notificationEvents(c, [day(iso)]).map((e) => e.id.slice(11))

test('Friday: Jumu\'ah reminder replaces the regular Dhuhr reminder', () => {
  const fri = notificationEvents(cfg(), [day('2026-11-27')])
  const got = fri.map((e) => e.id.slice(11))
  assert.ok(got.includes('jumuah-pre'))
  assert.ok(!got.includes('dhuhr-pre'))
  assert.ok(got.includes('dhuhr-at'))
  const j = fri.find((e) => e.id.endsWith('jumuah-pre'))
  const [t] = day('2026-11-27')
  assert.equal(t.dhuhr - j.at, 30 * 60_000)
  assert.equal(j.title, 'Jumatan 30 menit lagi')
})

test('Weekdays have no Jumu\'ah reminder; fridayRemind 0 restores the Dhuhr one', () => {
  assert.ok(!ids(cfg(), '2026-11-23').includes('jumuah-pre'))
  const fri = ids(cfg({ fridayRemind: 0 }), '2026-11-27')
  assert.ok(fri.includes('dhuhr-pre') && !fri.includes('jumuah-pre'))
})

test('Sunrise reminder fires before sunrise and can be turned off', () => {
  const ev = notificationEvents(cfg(), [day('2026-11-23')]).find((e) => e.id.endsWith('sunrise-pre'))
  const [t] = day('2026-11-23')
  assert.equal(t.sunrise - ev.at, 15 * 60_000)
  assert.equal(ev.title, 'Subuh berakhir 15 menit lagi')
  assert.ok(!ids(cfg({ remindSunrise: 0 }), '2026-11-23').includes('sunrise-pre'))
})

test('A prayer turned off sends neither its reminder nor its begin notification', () => {
  const got = ids(cfg({ prayers: { fajr: true, dhuhr: true, asr: false, maghrib: true, isha: false } }), '2026-11-23')
  assert.ok(!got.some((id) => id.startsWith('asr') || id.startsWith('isha')))
  assert.ok(got.includes('maghrib-at') && got.includes('maghrib-pre'))
})

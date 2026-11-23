// node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { prayerTimes } from '../worker/praytimes.mjs'

const jkt = (d) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })

test('Jakarta (Kemenag) is unchanged by the high-latitude rule', () => {
  const t = prayerTimes(new Date('2026-11-23T12:00:00+07:00'), { lat: -6.1754, lng: 106.8272 })
  assert.deepEqual(
    Object.fromEntries(Object.entries(t).map(([k, v]) => [k, jkt(v)])),
    { imsak: '03:55', fajr: '04:05', sunrise: '05:24', dhuhr: '11:42', asr: '15:06', maghrib: '17:55', isha: '19:09' }
  )
})

test('European summer gets finite, ordered times instead of throwing', () => {
  for (const [lat, lng] of [[51.5, -0.12], [52.5, 13.4], [59.3, 18.1]]) {
    for (const method of ['kemenag', 'mwl', 'isna', 'makkah']) {
      const t = prayerTimes(new Date('2026-06-21T12:00:00Z'), { lat, lng, method })
      const order = ['imsak', 'fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k) => t[k].getTime())
      assert.ok(order.every(Number.isFinite), `${lat} ${method}`)
      assert.deepEqual(order, [...order].sort((a, b) => a - b), `${lat} ${method} out of order`)
    }
  }
})

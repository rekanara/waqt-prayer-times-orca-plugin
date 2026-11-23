// node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationEvents, agentSummary, prayerReport, activeAgents, hijriDate } from '../worker/main.mjs'
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
  const [y, m, dd] = iso.split('-').map(Number)
  const d = new Date(y, m - 1, dd, 12) // local noon: the calendar day whatever zone runs the test
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

const ID = { agentsWaiting: (n, names) => `${n} menunggu: ${names}.`, agentsWorking: (n) => `${n} bekerja.`, more: (n) => `+${n} lagi` }
const ws = (name, state) => ({ name, status: state && { state } })

test('agent summary: waiting first, then working; nothing when idle', () => {
  assert.equal(agentSummary(ID, []), '')
  assert.equal(agentSummary(ID, [ws('a', 'done'), ws('b', 'inactive'), ws('c')]), '')
  assert.equal(agentSummary(ID, [ws('api', 'working'), ws('web', 'permission'), ws('cli', 'working')]), '1 menunggu: web. 2 bekerja.')
  assert.equal(
    agentSummary(ID, ['a', 'b', 'c', 'd', 'e'].map((n) => ws(n, 'permission'))),
    '5 menunggu: a, b, c, +2 lagi.'
  )
})

const RL = { ...ID, reportTitle: (p) => `Selama ${p}`, reportDone: (n, names) => `${n} selesai: ${names}.`, reportWorking: (n) => `${n} masih bekerja.` }
const w = (id, state) => ({ id, name: id, status: state && { state } })

test('after-prayer report: finished, waiting and still working; null when nothing ran', () => {
  const seen = new Set(['api', 'web', 'cli'])
  const r = prayerReport(RL, 'Ashar', seen, [w('api', 'done'), w('web', 'permission'), w('cli', 'working'), w('docs', 'inactive')])
  assert.deepEqual(r, { title: 'Selama Ashar', body: '1 selesai: api. 1 menunggu: web. 1 masih bekerja.' })
  assert.equal(prayerReport(RL, 'Ashar', new Set(), [w('docs', 'done'), w('x')]), null)
  // An agent idle all along is not reported as finished.
  assert.equal(prayerReport(RL, 'Ashar', new Set(['api']), [w('api', 'done'), w('old', 'done')]).body, '1 selesai: api.')
})

test('active agents: waiting first, idle ones left out', () => {
  assert.deepEqual(activeAgents([w('a', 'working'), w('b', 'done'), w('c', 'permission')]), [
    { id: 'c', name: 'c', state: 'permission' },
    { id: 'a', name: 'a', state: 'working' }
  ])
})

test('Hijri date follows the sighting adjustment', () => {
  const ramadan1 = new Date(2026, 1, 18, 12) // 1 Ramadan 1447 by Umm al-Qura
  assert.deepEqual([hijriDate(ramadan1).day, hijriDate(ramadan1).month], [1, 9])
  // Isbat a day later: 18 Feb is still the last of Sha'ban (29 days in 1447), 19 Feb becomes 1 Ramadan.
  assert.deepEqual([hijriDate(ramadan1, -1).day, hijriDate(ramadan1, -1).month], [29, 8])
  assert.deepEqual([hijriDate(new Date(2026, 1, 19, 12), -1).day, hijriDate(new Date(2026, 1, 19, 12), -1).month], [1, 9])
})

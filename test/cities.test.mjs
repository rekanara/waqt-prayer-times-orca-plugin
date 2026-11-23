// node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { CITIES, TZ_CITY, resolvePlace, methodFor, placeList } from '../worker/cities.mjs'
import { ZONES } from '../worker/zones.mjs'

const where = (s, tz) => {
  const p = resolvePlace(s, tz)
  return [p.name, p.country, p.auto]
}

test('automatic: Indonesian zones use curated cities, everywhere else the zone city', () => {
  assert.deepEqual(where({}, 'Asia/Makassar'), ['Makassar', 'ID', true])
  assert.deepEqual(where({ city: 'auto' }, 'Asia/Jayapura'), ['Jayapura', 'ID', true])
  assert.deepEqual(where({}, 'Europe/London'), ['London', 'GB', true])
  assert.deepEqual(where({}, 'America/Argentina/Buenos_Aires'), ['Buenos Aires', 'AR', true])
  assert.deepEqual(where({}, 'Asia/Calcutta'), ['Kolkata', 'IN', true]) // old name some systems report
  assert.deepEqual(where({}, 'Etc/UTC'), ['Jakarta', 'ID', true]) // no city to guess from
})

test('a chosen city wins over the time zone', () => {
  assert.deepEqual(where({ city: 'surabaya' }, 'Europe/London'), ['Surabaya', 'ID', false])
  assert.deepEqual(where({ city: 'zone', zone: 'Asia/Riyadh' }, 'Asia/Jakarta'), ['Riyadh', 'SA', false])
  assert.deepEqual(where({ city: 'custom', latitude: 51.5, longitude: -0.1 }, 'Europe/London'), ['51.500, -0.100', 'GB', false])
})

test('a choice that no longer resolves falls back to automatic', () => {
  assert.deepEqual(where({ city: 'zone', zone: 'Mars/Olympus' }, 'Asia/Makassar'), ['Makassar', 'ID', true])
  assert.deepEqual(where({ city: 'custom', latitude: 80, longitude: 0 }, 'Asia/Makassar'), ['Makassar', 'ID', true])
})

test('method follows the country', () => {
  assert.equal(methodFor('ID'), 'kemenag')
  assert.equal(methodFor('MY'), 'jakim')
  assert.equal(methodFor('SA'), 'makkah')
  assert.equal(methodFor('CA'), 'isna')
  assert.equal(methodFor('GB'), 'mwl')
  assert.equal(methodFor(null), 'mwl')
})

test('place list: curated cities plus zone cities, no duplicates, all resolvable', () => {
  for (const [tz, key] of Object.entries(TZ_CITY)) assert.ok(CITIES[key] && ZONES[tz], tz)
  const list = placeList()
  assert.equal(new Set(list.map((p) => p.id)).size, list.length)
  assert.ok(!list.some((p) => p.id === 'zone:Asia/Jakarta')) // Jakarta appears once, as the curated city
  assert.ok(list.some((p) => p.id === 'zone:Europe/London'))
  for (const p of list) assert.ok(p.id.startsWith('zone:') ? ZONES[p.id.slice(5)] : CITIES[p.id], p.id)
})

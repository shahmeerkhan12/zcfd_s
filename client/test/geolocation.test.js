import test from 'node:test'
import assert from 'node:assert/strict'
import { locationErrorMessage, requestLocation } from '../src/features/nearby-restaurants/geolocation.js'

function createGeolocation() {
  const calls = []
  return {
    calls,
    getCurrentPosition(success, error, options) {
      calls.push({ success, error, options })
    },
  }
}

test('retries an unavailable or timed out precise location with approximate location', () => {
  for (const code of [2, 3]) {
    const geolocation = createGeolocation()
    const positions = []
    const errors = []
    requestLocation(geolocation, (position) => positions.push(position), (error) => errors.push(error))
    assert.deepEqual(geolocation.calls[0].options, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
    geolocation.calls[0].error({ code })
    assert.deepEqual(geolocation.calls[1].options, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 })
    const position = { coords: { latitude: 1, longitude: 2, accuracy: 100 } }
    geolocation.calls[1].success(position)
    assert.deepEqual(positions, [position])
    assert.deepEqual(errors, [])
  }
})

test('permission denial is reported without retry', () => {
  const geolocation = createGeolocation()
  const errors = []
  requestLocation(geolocation, () => assert.fail('Unexpected success'), (error) => errors.push(error))
  const error = { code: 1 }
  geolocation.calls[0].error(error)
  assert.equal(geolocation.calls.length, 1)
  assert.deepEqual(errors, [error])
  assert.match(locationErrorMessage(error), /denied/i)
})

test('reports the final failure and distinguishes unavailable and timed out locations', () => {
  for (const code of [2, 3]) {
    const geolocation = createGeolocation()
    const errors = []
    requestLocation(geolocation, () => assert.fail('Unexpected success'), (error) => errors.push(error))
    geolocation.calls[0].error({ code })
    const error = { code }
    geolocation.calls[1].error(error)
    assert.deepEqual(errors, [error])
    assert.match(locationErrorMessage(error), code === 2 ? /could not determine/i : /timed out/i)
  }
})

test('cancellation ignores pending results and prevents retries', () => {
  const geolocation = createGeolocation()
  let notifications = 0
  const cancel = requestLocation(geolocation, () => { notifications++ }, () => { notifications++ })
  cancel()
  geolocation.calls[0].error({ code: 3 })
  geolocation.calls[0].success({})
  assert.equal(geolocation.calls.length, 1)
  assert.equal(notifications, 0)
})

test('cancellation ignores results from the approximate retry', () => {
  const geolocation = createGeolocation()
  let notifications = 0
  const cancel = requestLocation(geolocation, () => { notifications++ }, () => { notifications++ })
  geolocation.calls[0].error({ code: 2 })
  cancel()
  geolocation.calls[1].success({})
  geolocation.calls[1].error({ code: 3 })
  assert.equal(notifications, 0)
})

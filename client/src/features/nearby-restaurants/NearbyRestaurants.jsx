import { useEffect, useState } from 'react'
import { locationErrorMessage, requestLocation } from './geolocation'

export function NearbyRestaurants() {
  const [location, setLocation] = useState(null)
  const [error, setError] = useState(() => navigator.geolocation ? '' : 'Geolocation is not available in this browser.')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!navigator.geolocation) return

    return requestLocation(
      navigator.geolocation,
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy })
      },
      (error) => setError(locationErrorMessage(error)),
    )
  }, [attempt])

  function retry() {
    setError('')
    setLocation(null)
    setAttempt((value) => value + 1)
  }

  const mapParams = location && new URLSearchParams({
    q: 'restaurants',
    ll: `${location.lat},${location.lng}`,
    z: '15',
    output: 'embed',
  })

  return (
    <section className="mt-12 rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="nearby-heading">
      <h2 id="nearby-heading" className="font-display text-2xl font-semibold">Nearby restaurants</h2>
      <p className="mt-2 text-sm text-[#626960]">Your location is sent to Google Maps to show nearby restaurants.</p>
      {location && <p className="mt-2 text-sm text-[#626960]">Estimated location accuracy: {Math.ceil(location.accuracy)} m.</p>}
      {error ? (
        <div className="mt-4">
          <p className="text-sm text-[#a04532]" role="alert">{error}</p>
          {navigator.geolocation && <button className="select-button mt-3 rounded-full bg-[#eef2eb] px-4 py-2 text-sm font-semibold text-[#456749]" type="button" onClick={retry}>Try again</button>}
        </div>
      ) : location ? (
        <iframe
          title="Restaurants near your location on Google Maps"
          className="mt-5 h-80 w-full rounded-xl border-0 md:h-96"
          src={`https://maps.google.com/maps?${mapParams}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <p className="mt-4 text-sm" role="status">Waiting for your location…</p>
      )}
    </section>
  )
}

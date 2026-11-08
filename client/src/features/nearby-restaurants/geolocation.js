const highAccuracyOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
const approximateOptions = { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }

export function locationErrorMessage(error) {
  switch (error.code) {
    case 1:
      return 'Location access was denied. Check location permissions for this site and your browser in system settings.'
    case 2:
      return 'Your device could not determine its location. Check system location services and your network connection, then try again.'
    case 3:
      return 'Finding your location timed out. Check system location services and your network connection, then try again.'
    default:
      return 'Could not determine your location. Check system location services and try again.'
  }
}

export function requestLocation(geolocation, onSuccess, onError) {
  let active = true
  const success = (position) => {
    if (active) onSuccess(position)
  }
  const fail = (error) => {
    if (active) onError(error)
  }

  geolocation.getCurrentPosition(success, (error) => {
    if (!active) return
    if (error.code === 2 || error.code === 3) {
      geolocation.getCurrentPosition(success, fail, approximateOptions)
    } else {
      fail(error)
    }
  }, highAccuracyOptions)

  return () => { active = false }
}

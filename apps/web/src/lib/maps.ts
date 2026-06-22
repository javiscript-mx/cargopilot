import { importLibrary } from "@googlemaps/js-api-loader"

// El loader de Google Maps se inicializa (setOptions con la API key) en
// `components/ui/address-input.tsx` al importarse. Este módulo reutiliza ese loader
// singleton para geocodificar direcciones y medir distancia por carretera.

export interface GeoResult { postalCode?: string; state?: string; lat?: number; lng?: number }

// Geocodifica una dirección de texto → CP, Estado (nombre largo) y lat/lng.
// Sirve para completar CP/Estado de una dirección del cliente que se guardó sin ellos.
export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const q = address.trim()
  if (!q) return null
  try {
    await importLibrary("geocoding")
    const geocoder = new google.maps.Geocoder()
    const { results } = await geocoder.geocode({ address: q })
    const r = results?.[0]
    if (!r) return null
    const get = (t: string) => r.address_components.find((c) => c.types.includes(t))?.long_name
    return {
      postalCode: get("postal_code"),
      state: get("administrative_area_level_1"),
      lat: r.geometry?.location?.lat(),
      lng: r.geometry?.location?.lng(),
    }
  } catch {
    return null
  }
}

// Distancia por carretera (no en línea recta) entre dos coordenadas, en km enteros.
// Devuelve null si la API de Distance Matrix no está habilitada o no hay ruta.
export async function drivingDistanceKm(
  o: { lat: number; lng: number },
  d: { lat: number; lng: number },
): Promise<number | null> {
  try {
    await importLibrary("routes")
    const svc = new google.maps.DistanceMatrixService()
    const res = await svc.getDistanceMatrix({
      origins: [{ lat: o.lat, lng: o.lng }],
      destinations: [{ lat: d.lat, lng: d.lng }],
      travelMode: google.maps.TravelMode.DRIVING,
    })
    const el = res.rows?.[0]?.elements?.[0]
    if (!el || el.status !== "OK") return null
    return Math.round(el.distance.value / 1000)
  } catch {
    return null
  }
}

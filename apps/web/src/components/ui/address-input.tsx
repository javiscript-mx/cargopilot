import { useEffect, useRef, useState } from "react"
import { setOptions, importLibrary } from "@googlemaps/js-api-loader"
import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSettings } from "@/hooks/use-settings"

// Initialize once at module level
setOptions({
  key: import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string,
  v: "weekly",
  libraries: ["places"],
})

export interface AddressValue {
  formatted: string
  street?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  lat?: number
  lng?: number
  [key: string]: unknown
}

interface AddressInputProps {
  id: string
  label?: string
  value: string
  onChange: (formatted: string, detail?: AddressValue) => void
  placeholder?: string
  error?: string
  disabled?: boolean
}

export function AddressInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
}: AddressInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [ready, setReady] = useState(false)
  const { settings } = useSettings()
  const countries = settings["maps.countries"] as string[]
  // Stringify for stable useEffect dependency
  const countriesKey = countries.join(",")

  // onChange vive en un ref: el listener de Google se registra una sola vez
  // y siempre llama a la versión más reciente sin recrear el Autocomplete.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    importLibrary("places").then(() => setReady(true)).catch(console.error)
  }, [])

  // Crea el Autocomplete UNA sola vez por input. Instanciarlo de nuevo sobre
  // el mismo input apila instancias viejas que siguen mostrando sugerencias
  // con las restricciones anteriores.
  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: countries.length ? { country: countries } : undefined,
      fields: ["formatted_address", "address_components", "geometry"],
      types: ["geocode", "establishment"],
    })

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current!.getPlace()
      if (!place.formatted_address) return

      const get = (type: string) =>
        place.address_components?.find((c) => c.types.includes(type))?.long_name

      const detail: AddressValue = {
        formatted: place.formatted_address,
        street: [get("route"), get("street_number")].filter(Boolean).join(" ") || undefined,
        city: get("locality") ?? get("administrative_area_level_2"),
        state: get("administrative_area_level_1"),
        country: get("country"),
        postalCode: get("postal_code"),
        lat: place.geometry?.location?.lat(),
        lng: place.geometry?.location?.lng(),
      }

      onChangeRef.current(place.formatted_address, detail)
    })

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current)
        autocompleteRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Las restricciones de país se actualizan sobre la instancia existente
  // (los settings cargan async — pueden llegar después de crear el Autocomplete)
  useEffect(() => {
    if (!autocompleteRef.current) return
    autocompleteRef.current.setComponentRestrictions(
      countries.length ? { country: countries } : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, countriesKey])

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-foreground)]">
          {label}
        </label>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Busca una dirección..."}
          disabled={disabled || !ready}
          autoComplete="off"
          className={cn(
            "w-full rounded-md border bg-white py-2 pl-9 pr-3 text-sm",
            "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error ? "border-[var(--color-destructive)]" : "border-[var(--color-border)]",
          )}
        />
      </div>
      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}

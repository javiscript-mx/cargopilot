import { useQuery } from "@tanstack/react-query"
import { settingsApi, type AppSettings } from "@/api/settings"

export const SETTINGS_DEFAULTS: AppSettings = {
  "general.businessName": "HM Sistema",
  "general.timezone": "America/Mexico_City",
  "maps.countries": ["mx"],
  "invoicing.series": "A",
  "invoicing.emisorName": "",
  "invoicing.emisorRfc": "",
  "invoicing.emisorCp": "",
  "invoicing.regimenFiscal": "601",
  "shipments.folioPrefix": "EXP",
  "storage.bucket": "",
  "appearance.primaryColor": "#284a70",
  "appearance.accentColor": "#f49c2f",
  "appearance.menuColor": "#111d2d",
  "branding.systemName": "HM Sistema",
  "branding.logoDataUrl": "",
}

export function useSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    staleTime: 1000 * 60 * 5, // 5 min — settings rarely change
  })

  return {
    settings: data ?? SETTINGS_DEFAULTS,
    isLoading,
  }
}

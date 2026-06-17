import { useQuery } from "@tanstack/react-query"
import { catalogApi, type CatalogCategory } from "@/api/catalog"

/**
 * Loads catalog items for a given category.
 * Returns items as `{ value, label }` pairs ready for <Select> options.
 */
export function useCatalog(category: CatalogCategory | string) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["catalog", category],
    queryFn: () => catalogApi.listItems(category),
    staleTime: 1000 * 60 * 10, // 10 min — catalogs rarely change
  })

  const options = data.map((item) => ({
    value: item.code,
    label: `${item.code} – ${item.name}`,
  }))

  const simpleOptions = data.map((item) => ({
    value: item.code,
    label: item.name,
  }))

  return { items: data, options, simpleOptions, isLoading }
}

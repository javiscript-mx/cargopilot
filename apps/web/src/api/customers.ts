import { apiClient } from "@/lib/api-client"

export interface Customer {
  id: string
  name: string
  legalName: string | null
  tradeName: string | null
  rfc: string
  email: string | null
  phone: string | null
  address: Record<string, unknown> | null
  fiscalRegime: string | null
  fiscalZipCode: string | null
  status: string
  customerType: string
  taxCountry: string
  foreignTaxId: string | null
  defaultCfdiUse: string | null
  defaultPaymentForm: string | null
  defaultPaymentMethod: string | null
  billingEmail: string | null
  creditTermsDays: number | null
  creditLimit: string | null
  creditCurrency: string
  salesOwner: string | null
  operationsNotes: string | null
  billingNotes: string | null
  complianceStatus: string
  documentsStatus: string
  contacts?: CustomerContact[]
  addresses?: CustomerAddress[]
  createdAt: string
}

export interface CustomerContact {
  id?: string
  type: string
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  position: string | null
  isPrimary: boolean
  active: boolean
  notes: string | null
}

export interface CustomerAddress {
  id?: string
  type: string
  label: string | null
  address: Record<string, unknown> | null
  formatted: string | null
  street: string | null
  city: string | null
  state: string | null
  country: string | null
  postalCode: string | null
  lat: number | null
  lng: number | null
  isPrimary: boolean
  active: boolean
  notes: string | null
}

export type CustomerPayload = Omit<Customer, "id" | "createdAt" | "creditLimit" | "contacts" | "addresses"> & {
  creditLimit: number | null
  contacts?: Omit<CustomerContact, "id">[]
  addresses?: Omit<CustomerAddress, "id">[]
}

export interface PageParams { page: number; pageSize: number; search?: string }
export function pageQuery({ page, pageSize, search }: PageParams): string {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search?.trim()) p.set("search", search.trim())
  return p.toString()
}

export const customersApi = {
  list: () => apiClient.get<Customer[]>("/customers"),
  listPaged: (params: PageParams) => apiClient.getPaged<Customer>(`/customers?${pageQuery(params)}`),
  get: (id: string) => apiClient.get<Customer>(`/customers/${id}`),
  create: (data: CustomerPayload) => apiClient.post<Customer>("/customers", data),
  update: (id: string, data: Partial<CustomerPayload>) => apiClient.put<Customer>(`/customers/${id}`, data),
}

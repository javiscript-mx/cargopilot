const API_BASE = "/api"

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[], // p. ej. lista de faltantes (`missing`) de un candado
  ) {
    super(message)
    this.name = "ApiError"
  }
}

// El API a veces devuelve { error: string } y a veces { error: zodError.flatten() }
// (objeto). Esto convierte cualquiera de los dos en un mensaje legible.
function messageFromError(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const e = error as { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
    if (e.fieldErrors) {
      const msgs = Object.entries(e.fieldErrors).flatMap(([field, list]) =>
        (list ?? []).map((m) => `${field}: ${m}`),
      )
      if (msgs.length) return msgs.join(" · ")
    }
    if (Array.isArray(e.formErrors) && e.formErrors.length) return e.formErrors.join(" · ")
  }
  return "Error desconocido"
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      // Solo declarar JSON cuando hay body: un DELETE sin cuerpo con
      // Content-Type: application/json hace que Fastify responda 400 (FST_ERR_CTP_EMPTY_JSON_BODY).
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new ApiError(response.status, messageFromError(body.error), Array.isArray(body.missing) ? body.missing : undefined)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface Paged<T> {
  data: T[]
  total: number
}

// GET paginado: el body es T[] y el total viene en el header X-Total-Count.
async function getPaged<T>(path: string): Promise<Paged<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new ApiError(response.status, messageFromError(body.error), Array.isArray(body.missing) ? body.missing : undefined)
  }
  const data = (await response.json()) as T[]
  const total = Number(response.headers.get("X-Total-Count") ?? data.length)
  return { data, total }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  getPaged,
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}

export { ApiError }

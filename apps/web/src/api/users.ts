import { apiClient } from "@/lib/api-client"
import type { UserResponse, CreateUserInput, UpdateUserInput } from "@hm/shared"

export const usersApi = {
  list: () => apiClient.get<UserResponse[]>("/users"),
  create: (data: CreateUserInput) => apiClient.post<UserResponse>("/users", data),
  update: (id: string, data: UpdateUserInput) => apiClient.patch<UserResponse>(`/users/${id}`, data),
  resetPassword: (id: string, password: string) =>
    apiClient.post<{ ok: true }>(`/users/${id}/reset-password`, { password }),
}

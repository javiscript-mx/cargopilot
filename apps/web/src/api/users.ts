import { apiClient } from "@/lib/api-client"
import type { UserResponse, CreateUserInput } from "@hm/shared"

export const usersApi = {
  list: () => apiClient.get<UserResponse[]>("/users"),
  create: (data: CreateUserInput) => apiClient.post<UserResponse>("/users", data),
  updateRole: (id: string, role: string) => apiClient.patch<UserResponse>(`/users/${id}/role`, { role }),
}

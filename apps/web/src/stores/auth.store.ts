import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { UserRole } from '@seat-reservation/contracts';

export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isRecoveryAdmin: boolean;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'));
  const user = ref<UserSession | null>(
    localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')!) : null
  );

  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === UserRole.SYSTEM_ADMIN || user.value?.isRecoveryAdmin);
  const isManager = computed(() => user.value?.role === UserRole.BUILDING_MANAGER || isAdmin.value);

  function setSession(newToken: string, newUser: UserSession) {
    token.value = newToken;
    user.value = newUser;
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  }

  function clearSession() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  return {
    token,
    user,
    isAuthenticated,
    isAdmin,
    isManager,
    setSession,
    clearSession
  };
});


<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store';
import { AuthApi } from '../api/auth.api';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('employee@acme.local');
const password = ref('DemoEmployee123!');
const isRecoveryLogin = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

async function handleLogin() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please provide both email and password';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    const res = await AuthApi.login({
      email: email.value.trim(),
      password: password.value,
      isRecoveryLogin: isRecoveryLogin.value
    });

    authStore.setSession(res.accessToken, res.user);
    router.push('/');
  } catch (err: any) {
    errorMessage.value = err.message || 'Authentication failed. Please check credentials.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-full flex items-center justify-center p-6 bg-slate-100 font-sans">
    <div class="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-200 p-8 space-y-6">
      <div class="text-center">
        <div class="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-black text-2xl items-center justify-center shadow-lg mb-3">
          S
        </div>
        <h2 class="text-2xl font-black text-slate-900 tracking-tight">Sign in to SeatSpace</h2>
        <p class="text-xs text-slate-500 font-medium mt-1">Acme Tech Corporation Workplace</p>
      </div>

      <div v-if="errorMessage" class="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 font-medium">
        {{ errorMessage }}
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="name@company.com"
            class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••••••"
            class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <!-- Break-Glass Recovery Admin Toggle -->
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <label class="flex items-center space-x-2.5 cursor-pointer">
            <input v-model="isRecoveryLogin" type="checkbox" class="rounded text-amber-600 focus:ring-amber-500 h-4 w-4" />
            <span class="text-xs font-semibold text-slate-700">Break-Glass Recovery Admin sign-in</span>
          </label>
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 active:scale-95 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          {{ isSubmitting ? 'Authenticating...' : 'Sign In' }}
        </button>
      </form>

      <div class="border-t border-slate-100 pt-4 text-center space-y-2">
        <router-link to="/" class="text-xs font-semibold text-brand-600 hover:underline block">
          Return to Demo Floor Plan View →
        </router-link>
        <router-link to="/setup" class="text-[11px] text-slate-400 hover:underline block">
          First-Run System Setup Wizard
        </router-link>
      </div>
    </div>
  </div>
</template>

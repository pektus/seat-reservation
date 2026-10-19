<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { SetupApi } from '../api/setup.api';
import { AuthProviderType } from '@seat-reservation/contracts';

const router = useRouter();
const currentStep = ref(1);

const isCheckingLock = ref(true);
const isAlreadyLocked = ref(false);

const dbConfig = ref({
  host: 'localhost',
  port: 5432,
  database: 'seat_reservation_db',
  user: 'seatadmin',
  password: ''
});

const recoveryAdmin = ref({
  fullName: 'Local Recovery Admin',
  email: 'admin@internal.local',
  password: ''
});

const authProvider = ref<AuthProviderType>(AuthProviderType.LOCAL);
const companyName = ref('Acme Tech Corporation');

const isTestingDb = ref(false);
const dbTestMessage = ref<string | null>(null);
const dbTestSuccess = ref<boolean | null>(null);

const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  try {
    const status = await SetupApi.getStatus();
    if (status.isSetupCompleted) {
      isAlreadyLocked.value = true;
    }
  } catch {
    // API not yet running, continue in wizard mode
  } finally {
    isCheckingLock.value = false;
  }
});

async function testDbConnection() {
  isTestingDb.value = true;
  dbTestMessage.value = null;
  dbTestSuccess.value = null;

  try {
    const res = await SetupApi.testDatabase(dbConfig.value);
    dbTestSuccess.value = res.success;
    dbTestMessage.value = res.message || 'Connected successfully!';
  } catch (err: any) {
    dbTestSuccess.value = false;
    dbTestMessage.value = err.message || 'Failed to connect to database.';
  } finally {
    isTestingDb.value = false;
  }
}

async function completeSetup() {
  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    await SetupApi.initializeSystem({
      database: dbConfig.value,
      recoveryAdmin: recoveryAdmin.value,
      authProvider: {
        type: authProvider.value
      },
      companyName: companyName.value
    });

    router.push('/');
  } catch (err: any) {
    errorMessage.value = err.message || 'Setup initialization failed. Please check parameters.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-full flex items-center justify-center p-6 bg-slate-100 font-sans">
    <!-- Already Locked Notice -->
    <div v-if="isAlreadyLocked" class="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
      <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl mx-auto">
        🔒
      </div>
      <h2 class="text-xl font-bold text-slate-900">Setup is Locked</h2>
      <p class="text-xs text-slate-600 leading-relaxed">
        The system setup has already been completed and locked for security. For administrative changes, please sign in with your recovery admin or administrator credentials.
      </p>
      <div class="pt-2">
        <router-link
          to="/"
          class="inline-flex px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
        >
          Return to Floor Plan →
        </router-link>
      </div>
    </div>

    <!-- Setup Wizard -->
    <div v-else class="max-w-xl w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
      <!-- Wizard Header -->
      <div class="px-8 py-6 bg-slate-900 text-white">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-wider font-bold text-brand-400">First-Run Installation</span>
          <span class="text-xs text-slate-400 font-medium">Step {{ currentStep }} of 3</span>
        </div>
        <h2 class="text-2xl font-black tracking-tight">System Setup Wizard</h2>
        <p class="text-xs text-slate-400 mt-1">Configure PostgreSQL connectivity, break-glass recovery credentials, and security lock.</p>
      </div>

      <div v-if="errorMessage" class="m-6 mb-0 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
        {{ errorMessage }}
      </div>

      <!-- Step 1: Database -->
      <div v-if="currentStep === 1" class="p-8 space-y-4">
        <h3 class="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">1. PostgreSQL Configuration</h3>

        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="block text-xs font-bold text-slate-700 mb-1">Host</label>
            <input v-model="dbConfig.host" type="text" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Port</label>
            <input v-model.number="dbConfig.port" type="number" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Database Name</label>
          <input v-model="dbConfig.database" type="text" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Username</label>
            <input v-model="dbConfig.user" type="text" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <input v-model="dbConfig.password" type="password" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>
        </div>

        <div class="pt-2 flex items-center justify-between">
          <button
            @click="testDbConnection"
            :disabled="isTestingDb"
            class="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {{ isTestingDb ? 'Connecting...' : 'Test Connection' }}
          </button>
          <span
            v-if="dbTestMessage"
            class="text-xs font-semibold"
            :class="dbTestSuccess ? 'text-emerald-600' : 'text-rose-600'"
          >
            {{ dbTestMessage }}
          </span>
        </div>

        <div class="flex justify-end pt-4 border-t border-slate-100">
          <button
            @click="currentStep = 2"
            class="px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 shadow-md transition-all cursor-pointer"
          >
            Next: Organization & Admin →
          </button>
        </div>
      </div>

      <!-- Step 2: Org & Admin -->
      <div v-if="currentStep === 2" class="p-8 space-y-4">
        <h3 class="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">2. Organization & Recovery Admin</h3>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Company / Workplace Name</label>
          <input v-model="companyName" type="text" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>

        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed font-medium">
          <strong>Break-Glass Admin:</strong> This account remains permanently enabled in local storage to ensure administrative access even if corporate SSO is offline.
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Admin Full Name</label>
            <input v-model="recoveryAdmin.fullName" type="text" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Admin Email</label>
            <input v-model="recoveryAdmin.email" type="email" class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Master Recovery Password (min 12 chars)</label>
            <input
              v-model="recoveryAdmin.password"
              type="password"
              placeholder="Enter unique, strong master password"
              class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
            <div class="mt-1.5 text-xs">
              <span v-if="!recoveryAdmin.password" class="text-slate-400">
                A strong, unique recovery password of at least 12 characters is required.
              </span>
              <span v-else-if="recoveryAdmin.password.length < 12" class="text-rose-600 font-medium">
                Password too short: {{ recoveryAdmin.password.length }}/12 characters.
              </span>
              <span v-else class="text-emerald-600 font-semibold flex items-center gap-1">
                ✓ Password meets requirement ({{ recoveryAdmin.password.length }} characters).
              </span>
            </div>
          </div>
        </div>

        <div class="flex justify-between pt-4 border-t border-slate-100">
          <button @click="currentStep = 1" class="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Back</button>
          <button
            @click="currentStep = 3"
            :disabled="recoveryAdmin.password.length < 12"
            class="px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-md transition-all cursor-pointer"
          >
            Next: Auth Provider & Lock →
          </button>
        </div>
      </div>

      <!-- Step 3: Auth Provider & Lock -->
      <div v-if="currentStep === 3" class="p-8 space-y-4">
        <h3 class="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">3. Sign-In Provider & Lock Installation</h3>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-2">Primary Authentication Provider</label>
          <div class="grid grid-cols-2 gap-3">
            <label
              class="p-4 border rounded-2xl flex items-center space-x-3 cursor-pointer transition-all"
              :class="authProvider === AuthProviderType.LOCAL ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-300' : 'border-slate-200'"
            >
              <input type="radio" v-model="authProvider" :value="AuthProviderType.LOCAL" class="text-brand-600" />
              <div>
                <p class="font-bold text-sm text-slate-900">Local Accounts</p>
                <p class="text-xs text-slate-500">Internal database auth</p>
              </div>
            </label>

            <div
              class="p-4 border rounded-2xl flex items-center space-x-3 border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed select-none"
              title="Corporate SSO (OIDC) is not configured in this release. Only Local authentication is supported."
            >
              <input type="radio" disabled :value="AuthProviderType.OIDC" class="text-slate-400 cursor-not-allowed" />
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-bold text-sm text-slate-500">Corporate SSO</p>
                  <span class="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">Not Configured</span>
                </div>
                <p class="text-xs text-slate-400">OIDC / Entra ID (Disabled)</p>
              </div>
            </div>
          </div>
        </div>

        <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-medium">
          <strong>Security Notice:</strong> Initializing the system creates the database tables, assigns the recovery admin, and writes `setup.lock`. Setup endpoints are permanently disabled thereafter.
        </div>

        <div class="flex justify-between pt-4 border-t border-slate-100">
          <button @click="currentStep = 2" class="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Back</button>
          <button
            @click="completeSetup"
            :disabled="isSubmitting"
            class="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg transition-all cursor-pointer"
          >
            {{ isSubmitting ? 'Locking & Initializing...' : 'Initialize & Lock System' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

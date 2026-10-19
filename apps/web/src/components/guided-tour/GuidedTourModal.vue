<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const currentStep = ref(0);

const steps = [
  {
    title: 'Welcome to SeatSpace',
    tagline: 'Workplace Desk Reservation System',
    content: 'SeatSpace is a lightweight, responsive seat reservation platform inspired by Skedda. Built with NestJS, Vue 3, and PostgreSQL, it guarantees zero double-bookings through atomic database concurrency constraints.',
    icon: '🏢'
  },
  {
    title: '1. Select Floor & Date',
    tagline: 'Real-Time Availability',
    content: 'Use the top toolbar to switch between floors and pick any reservation date. Whole-day availability updates dynamically, displaying real-time desk occupancy.',
    icon: '📅'
  },
  {
    title: '2. Interactive Floor Plan Canvas',
    tagline: 'Visual Hot-Desking',
    content: 'Hover over any desk marker to view amenities (e.g. motorized standing desks, dual 4K monitors, acoustic pods). Color coding indicates live status: Emerald = Available, Amber = Your Booking, Slate = Reserved, and Red pulse = Position Review Needed.',
    icon: '🗺️'
  },
  {
    title: '3. Booking for Self or Guests',
    tagline: 'Proxy Visitor Reservations',
    content: 'Click on any green desk to open the booking modal. You can book for yourself or check "Reserve on behalf of an external Guest" to capture visitor names without requiring IT account provisioning.',
    icon: '👤'
  },
  {
    title: '4. Manager Desk Placement & Plan Replacement',
    tagline: 'Change Review Safety',
    content: 'Building managers can upload floor plans (PNG/JPG/SVG) and drop desks by clicking on the canvas. When a floor plan image is updated, existing desks are flagged with a pulsing review badge to ensure physical alignment.',
    icon: '🛠️'
  },
  {
    title: '5. Instant Demo Sandbox Reset',
    tagline: 'Evaluation Freedom',
    content: 'Click "Reset Sandbox" in the header at any time to return the demo hot-desks and reservations back to their baseline state for fresh demonstrations.',
    icon: '🔄'
  }
];

function next() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++;
  } else {
    close();
  }
}

function prev() {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
}

function close() {
  emit('update:modelValue', false);
  currentStep.value = 0;
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <!-- Header -->
      <div class="px-6 py-5 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 text-white flex justify-between items-start">
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <span class="text-2xl">{{ steps[currentStep].icon }}</span>
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-white/20 text-xs font-bold tracking-wider">
              Step {{ currentStep + 1 }} of {{ steps.length }}
            </span>
          </div>
          <h3 class="font-bold text-xl leading-tight">{{ steps[currentStep].title }}</h3>
          <p class="text-xs text-white/80 font-medium">{{ steps[currentStep].tagline }}</p>
        </div>
        <button
          @click="close"
          class="text-white/70 hover:text-white text-2xl font-bold leading-none p-1 transition-colors"
        >
          &times;
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <p class="text-slate-600 leading-relaxed text-sm md:text-base">
          {{ steps[currentStep].content }}
        </p>

        <!-- Visual progress dots -->
        <div class="flex justify-center space-x-2 mt-8">
          <button
            v-for="(_, index) in steps"
            :key="index"
            @click="currentStep = index"
            class="h-2 rounded-full transition-all duration-300 focus:outline-none"
            :class="index === currentStep ? 'w-8 bg-brand-600' : 'w-2 bg-slate-200 hover:bg-slate-300'"
            :aria-label="`Go to step ${index + 1}`"
          />
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
        <button
          v-if="currentStep > 0"
          @click="prev"
          class="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          ← Previous
        </button>
        <div v-else />

        <div class="flex items-center space-x-3">
          <button
            @click="close"
            class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Skip Guide
          </button>
          <button
            @click="next"
            class="px-5 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 active:scale-95 rounded-xl shadow-md transition-all"
          >
            {{ currentStep === steps.length - 1 ? 'Start Reserving Seats →' : 'Next Step →' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

export interface DeskMarker {
  id: string;
  code: string;
  label: string;
  deskType: string;
  xCoordinatePct: number;
  yCoordinatePct: number;
  isAvailable: boolean;
  isReservedByCurrentUser: boolean;
  needsPositionReview?: boolean;
  bookedFor?: string;
  amenities?: string[];
  reservationId?: string;
  floorPlanId?: string;
}

const props = withDefaults(
  defineProps<{
    floorPlanUrl: string;
    desks: DeskMarker[];
    selectedDeskId?: string | null;
    interactiveMode?: 'view' | 'place';
  }>(),
  {
    interactiveMode: 'view'
  }
);

const emit = defineEmits<{
  (e: 'select-desk', desk: DeskMarker): void;
  (e: 'canvas-click', coords: { xPct: number; yPct: number }): void;
  (e: 'open-upload-plan'): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const hoveredDesk = ref<DeskMarker | null>(null);
const imageLoadError = ref(false);

watch(() => props.floorPlanUrl, () => {
  imageLoadError.value = false;
});

// Zoom and Pan State
const zoom = ref(1.0);
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
const startPan = ref({ x: 0, y: 0 });
const hasMoved = ref(false);
const isSpacePressed = ref(false);
const currentCursorPct = ref<{ xPct: number; yPct: number } | null>(null);

// Desk marker sizing scale:
// 'xs': 1:150 scale architectural plan (~18px compact pin / dot)
// 'sm': Compact (~24px)
// 'md': Standard (~32px)
// 'lg': Large (~40px)
export type DeskScale = 'xs' | 'sm' | 'md' | 'lg';
const deskScale = ref<DeskScale>((localStorage.getItem('seat_desk_scale') as DeskScale) || 'xs');
const showListView = ref(false);

function setDeskScale(scale: DeskScale) {
  deskScale.value = scale;
  localStorage.setItem('seat_desk_scale', scale);
}

function getDeskAriaLabel(desk: DeskMarker): string {
  const parts = [`Desk ${desk.code}`, desk.label, `Type: ${desk.deskType.toLowerCase()}`];
  if (desk.isReservedByCurrentUser) {
    parts.push('Reserved by you');
  } else if (desk.isAvailable) {
    parts.push('Available to reserve');
  } else {
    parts.push('Reserved');
    if (desk.bookedFor) {
      parts.push(`Booked for ${desk.bookedFor}`);
    }
  }
  if (desk.needsPositionReview) {
    parts.push('Warning: Desk position flagged for review after floor plan replacement');
  }
  return parts.join(', ');
}

const markerSizeClasses = computed(() => {
  switch (deskScale.value) {
    case 'xs':
      return {
        box: 'w-4 h-4 sm:w-5 sm:h-5 rounded-md text-[8px] sm:text-[9px] font-extrabold border shadow-xs',
        badge: 'h-2 w-2 -top-1 -right-1'
      };
    case 'sm':
      return {
        box: 'w-6 h-6 rounded-lg text-[10px] font-bold border-1.5 shadow-sm',
        badge: 'h-2.5 w-2.5 -top-1 -right-1'
      };
    case 'lg':
      return {
        box: 'w-10 h-10 rounded-2xl text-xs sm:text-sm font-bold border-2 shadow-md',
        badge: 'h-3.5 w-3.5 -top-1.5 -right-1.5'
      };
    case 'md':
    default:
      return {
        box: 'w-8 h-8 rounded-xl text-xs font-bold border-2 shadow-md',
        badge: 'h-3 w-3 -top-1 -right-1'
      };
  }
});

function formatDeskCode(code: string): string {
  if (deskScale.value === 'xs') {
    // If code is like 'D-01' or 'DESK-12', return concise label e.g. '01'
    const parts = code.split('-');
    if (parts.length > 1 && parts[1]) {
      return parts[1];
    }
    return code.slice(0, 3);
  }
  return code;
}

// ---------------- Zoom & Pan Logic ----------------

function zoomIn() {
  setZoom(Math.min(5.0, zoom.value + 0.25));
}

function zoomOut() {
  setZoom(Math.max(0.5, zoom.value - 0.25));
}

function resetZoom() {
  zoom.value = 1.0;
  panX.value = 0;
  panY.value = 0;
}

function setZoom(newZoom: number) {
  const container = containerRef.value;
  if (!container) {
    zoom.value = newZoom;
    return;
  }
  const rect = container.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  panX.value = centerX - (centerX - panX.value) * (newZoom / zoom.value);
  panY.value = centerY - (centerY - panY.value) * (newZoom / zoom.value);
  zoom.value = Math.round(newZoom * 100) / 100;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
  const newZoom = Math.min(5.0, Math.max(0.5, Math.round(zoom.value * zoomFactor * 100) / 100));

  if (newZoom === zoom.value) return;

  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  panX.value = mouseX - (mouseX - panX.value) * (newZoom / zoom.value);
  panY.value = mouseY - (mouseY - panY.value) * (newZoom / zoom.value);
  zoom.value = newZoom;
}

function onMouseDown(event: MouseEvent) {
  // Allow panning with:
  // - Middle mouse button (button === 1)
  // - Right mouse button (button === 2)
  // - Spacebar held + Left click
  // - In 'view' mode: Left click on canvas
  const isPanButton =
    event.button === 1 ||
    event.button === 2 ||
    isSpacePressed.value ||
    (props.interactiveMode === 'view' && event.button === 0);

  if (isPanButton) {
    isPanning.value = true;
    hasMoved.value = false;
    startPan.value = {
      x: event.clientX - panX.value,
      y: event.clientY - panY.value
    };
    event.preventDefault();
  }
}

function onMouseMove(event: MouseEvent) {
  if (isPanning.value) {
    const newPanX = event.clientX - startPan.value.x;
    const newPanY = event.clientY - startPan.value.y;
    if (Math.abs(newPanX - panX.value) > 3 || Math.abs(newPanY - panY.value) > 3) {
      hasMoved.value = true;
    }
    panX.value = newPanX;
    panY.value = newPanY;
  }

  // Update cursor coordinates relative to content element for placement precision
  if (props.interactiveMode === 'place' && contentRef.value) {
    const rect = contentRef.value.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
      currentCursorPct.value = {
        xPct: Math.round(x * 10) / 10,
        yPct: Math.round(y * 10) / 10
      };
    } else {
      currentCursorPct.value = null;
    }
  }
}

function onMouseUp() {
  if (isPanning.value) {
    isPanning.value = false;
  }
}

function onCanvasClick(event: MouseEvent) {
  if (hasMoved.value) {
    hasMoved.value = false;
    return;
  }
  if (props.interactiveMode !== 'place') return;
  if (isSpacePressed.value || event.button !== 0) return;

  const content = contentRef.value;
  if (!content) return;

  const rect = content.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  if (x < 0 || x > 100 || y < 0 || y > 100) return;

  // Pinpoint 2 decimal places precision for CAD blueprints
  emit('canvas-click', {
    xPct: Math.round(x * 100) / 100,
    yPct: Math.round(y * 100) / 100
  });
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    isSpacePressed.value = true;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = false;
  }
}

function onContextMenu(e: MouseEvent) {
  // Prevent context menu when panning with right click
  if (hasMoved.value || e.button === 2) {
    e.preventDefault();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-950/5 shadow-inner select-none transition-all"
    :class="{
      'cursor-grabbing': isPanning,
      'cursor-grab': isSpacePressed && !isPanning,
      'cursor-crosshair': interactiveMode === 'place' && !isSpacePressed && !isPanning
    }"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @contextmenu="onContextMenu"
  >
    <!-- Top-Left Floating Controls: Desk Marker Scale Selector -->
    <div class="absolute top-4 left-4 z-30 flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md rounded-2xl p-1 space-x-1 text-xs">
      <span class="px-2 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Desk Size:</span>
      <button
        @click.stop="setDeskScale('xs')"
        class="px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer"
        :class="deskScale === 'xs' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'"
        title="Micro 1:150 scale architectural pin (Ideal for dense blueprint CAD layouts)"
      >
        XS (1:150)
      </button>
      <button
        @click.stop="setDeskScale('sm')"
        class="px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer"
        :class="deskScale === 'sm' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'"
        title="Compact marker"
      >
        S
      </button>
      <button
        @click.stop="setDeskScale('md')"
        class="px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer"
        :class="deskScale === 'md' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'"
        title="Standard marker"
      >
        M
      </button>
      <button
        @click.stop="setDeskScale('lg')"
        class="px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer"
        :class="deskScale === 'lg' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'"
        title="Large marker"
      >
        L
      </button>
    </div>

    <!-- Top-Right Floating Controls: Zoom & Pan Toolbar -->
    <div class="absolute top-4 right-4 z-30 flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md rounded-2xl p-1 space-x-1 text-xs font-semibold text-slate-700">
      <button
        @click.stop="zoomOut"
        :disabled="zoom <= 0.5"
        class="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-95 disabled:opacity-40 transition-all cursor-pointer font-black text-sm"
        title="Zoom Out (or scroll down)"
      >
        −
      </button>

      <button
        @click.stop="resetZoom"
        class="px-2.5 py-1 rounded-xl hover:bg-slate-100 font-mono text-[11px] font-bold text-slate-800 transition-all cursor-pointer"
        title="Click to reset zoom to 100%"
      >
        {{ Math.round(zoom * 100) }}%
      </button>

      <button
        @click.stop="zoomIn"
        :disabled="zoom >= 5.0"
        class="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-95 disabled:opacity-40 transition-all cursor-pointer font-black text-sm"
        title="Zoom In (or scroll up)"
      >
        +
      </button>

      <div class="w-px h-4 bg-slate-200 mx-1"></div>

      <button
        @click.stop="resetZoom"
        class="px-2.5 py-1 rounded-xl hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all cursor-pointer"
        title="Reset zoom & center position"
      >
        ⟲ Fit
      </button>

      <div class="w-px h-4 bg-slate-200 mx-1"></div>

      <button
        @click.stop="showListView = !showListView"
        class="px-2.5 py-1 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center space-x-1"
        :class="showListView ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'"
        :title="showListView ? 'Switch to interactive Floor Plan Canvas' : 'Switch to Accessible Table / List View'"
        :aria-pressed="showListView"
      >
        <span>{{ showListView ? '🗺️ Map View' : '📋 List View' }}</span>
      </button>
    </div>

    <!-- Bottom Floating Status & Shortcuts Hint Bar -->
    <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center space-x-3 px-3.5 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[11px] shadow-lg">
      <span v-if="interactiveMode === 'place' && currentCursorPct" class="font-mono text-amber-300 font-bold">
        Coords: {{ currentCursorPct.xPct }}% X, {{ currentCursorPct.yPct }}% Y
      </span>
      <span class="text-slate-300">
        {{ interactiveMode === 'place' ? 'Click to drop desk · Hold Space to pan' : 'Scroll to zoom · Drag to pan' }}
      </span>
    </div>

    <!-- Scalable / Pannable Workspace Canvas Viewport OR Accessible List View -->
    <div class="relative w-full aspect-[16/10] min-h-[500px] max-h-[850px] overflow-hidden flex items-center justify-center">
      <!-- Accessible Table / List View Alternative -->
      <div
        v-if="showListView"
        class="w-full h-full overflow-y-auto p-4 sm:p-6 bg-white z-20"
        role="region"
        aria-label="Accessible Floor Plan Desks List"
      >
        <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Workplace Desks & Availability List</h3>
            <p class="text-xs text-slate-500">Accessible tabular alternative to the visual 2D floor plan map.</p>
          </div>
          <span class="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
            Total Desks: {{ desks.length }}
          </span>
        </div>

        <div v-if="desks.length === 0" class="py-12 text-center text-slate-400 text-xs">
          No desks placed on this floor yet.
        </div>

        <table v-else class="w-full text-left border-collapse" role="table">
          <thead>
            <tr class="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th scope="col" class="py-2.5 px-3">Desk Code</th>
              <th scope="col" class="py-2.5 px-3">Label</th>
              <th scope="col" class="py-2.5 px-3">Type</th>
              <th scope="col" class="py-2.5 px-3">Amenities</th>
              <th scope="col" class="py-2.5 px-3">Availability</th>
              <th scope="col" class="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-xs">
            <tr
              v-for="desk in desks"
              :key="desk.id"
              class="hover:bg-slate-50/80 transition-colors"
              :class="{ 'bg-indigo-50/60': selectedDeskId === desk.id }"
            >
              <td class="py-3 px-3 font-mono font-bold text-slate-900">
                {{ desk.code }}
              </td>
              <td class="py-3 px-3 text-slate-800 font-medium">
                {{ desk.label }}
              </td>
              <td class="py-3 px-3 capitalize text-slate-600">
                {{ desk.deskType.toLowerCase() }}
              </td>
              <td class="py-3 px-3 text-slate-500 text-[11px]">
                <div v-if="desk.amenities && desk.amenities.length > 0" class="flex flex-wrap gap-1">
                  <span
                    v-for="am in desk.amenities"
                    :key="am"
                    class="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]"
                  >
                    {{ am }}
                  </span>
                </div>
                <span v-else class="text-slate-400 italic">None</span>
              </td>
              <td class="py-3 px-3">
                <span
                  v-if="desk.needsPositionReview"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 mr-1"
                >
                  ⚠️ Review Flagged
                </span>
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                  :class="[
                    desk.isReservedByCurrentUser
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : desk.isAvailable
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  ]"
                >
                  {{ desk.isReservedByCurrentUser ? 'Reserved by you' : desk.isAvailable ? 'Available' : 'Reserved' }}
                </span>
                <span v-if="!desk.isAvailable && desk.bookedFor" class="block text-[10px] text-slate-500 mt-0.5 truncate max-w-[150px]">
                  {{ desk.bookedFor }}
                </span>
              </td>
              <td class="py-3 px-3 text-right">
                <button
                  @click.stop="emit('select-desk', desk)"
                  class="px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  :class="[
                    desk.isAvailable
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  ]"
                >
                  {{ desk.isAvailable ? 'Reserve' : 'Details' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty Floor Plan Placeholder -->
      <div
        v-else-if="!floorPlanUrl || imageLoadError"
        class="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl m-4"
      >
        <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center text-3xl mx-auto shadow-inner mb-3">
          🗺️
        </div>
        <h4 class="text-base font-bold text-slate-900">
          {{ imageLoadError ? 'Unable to Load Floor Plan Image' : 'No Floor Plan Attached to This Floor' }}
        </h4>
        <p class="text-xs text-slate-500 max-w-sm mt-1 mb-4 leading-relaxed">
          {{ imageLoadError
              ? 'The floor plan image could not be loaded from the specified path. Please upload a new image.'
              : 'Upload an architectural blueprint (PNG, JPG, SVG) for this floor to begin placing desks.' }}
        </p>
        <button
          @click="emit('open-upload-plan')"
          class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
        >
          + Upload Floor Plan Image
        </button>
      </div>

      <!-- Content Canvas: Transformed by Zoom & Pan -->
      <div
        v-else
        ref="contentRef"
        class="relative w-full h-full transition-transform duration-75 ease-out select-none"
        :style="{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }"
        @click="onCanvasClick"
      >
        <!-- Floor Plan Architectural Background Image -->
        <img
          :src="floorPlanUrl"
          alt="Floor Plan"
          class="w-full h-full object-contain pointer-events-none select-none"
          draggable="false"
          @error="imageLoadError = true"
          @load="imageLoadError = false"
        />

        <!-- Desks Overlay -->
        <div
          v-for="desk in desks"
          :key="desk.id"
          role="button"
          tabindex="0"
          :aria-label="getDeskAriaLabel(desk)"
          class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-125 focus:scale-125 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 rounded-xl z-10"
          :style="{ left: `${desk.xCoordinatePct}%`, top: `${desk.yCoordinatePct}%` }"
          @click.stop="emit('select-desk', desk)"
          @keydown.enter.stop.prevent="emit('select-desk', desk)"
          @keydown.space.stop.prevent="emit('select-desk', desk)"
          @mouseenter="hoveredDesk = desk"
          @mouseleave="hoveredDesk = null"
        >
          <!-- Desk Marker Badge -->
          <div
            class="relative flex items-center justify-center transition-all cursor-pointer"
            :class="[
              markerSizeClasses.box,
              selectedDeskId === desk.id
                ? 'bg-blue-600 text-white border-white ring-4 ring-blue-300 scale-125 z-30'
                : desk.isReservedByCurrentUser
                ? 'bg-amber-500 text-white border-amber-200 z-20'
                : desk.isAvailable
                ? 'bg-emerald-500 text-white border-emerald-200 hover:bg-emerald-600 z-10'
                : 'bg-slate-400 text-slate-100 border-slate-200 z-0'
            ]"
          >
            {{ formatDeskCode(desk.code) }}

            <!-- Position Review Flag Badge -->
            <span
              v-if="desk.needsPositionReview"
              title="Desk position needs review after plan change"
              class="absolute flex"
              :class="markerSizeClasses.badge"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-full w-full bg-red-500"></span>
            </span>
          </div>

          <!-- Hover Tooltip Popover -->
          <div
            v-if="hoveredDesk?.id === desk.id"
            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl text-xs pointer-events-none z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            <div class="flex items-center justify-between font-semibold border-b border-slate-700/80 pb-1 mb-1">
              <span class="font-mono font-bold">{{ desk.code }}</span>
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                :class="desk.isAvailable ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'"
              >
                {{ desk.isAvailable ? 'Available' : 'Reserved' }}
              </span>
            </div>
            <p class="text-slate-300 text-[11px] truncate font-medium">{{ desk.label }}</p>
            <p class="text-slate-400 text-[10px] capitalize mt-0.5">
              Type: {{ desk.deskType.toLowerCase() }} · Coords: {{ desk.xCoordinatePct }}%, {{ desk.yCoordinatePct }}%
            </p>

            <p v-if="!desk.isAvailable && desk.bookedFor" class="text-amber-300 text-[10px] mt-1 font-semibold truncate">
              Booked for: {{ desk.bookedFor }}
            </p>

            <div v-if="desk.amenities && desk.amenities.length > 0" class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-for="amenity in desk.amenities"
                :key="amenity"
                class="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px]"
              >
                {{ amenity }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

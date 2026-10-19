<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth.store';
import { ReservationApi } from '../api/reservation.api';
import { WorkplaceApi } from '../api/workplace.api';
import { DemoApi } from '../api/demo.api';
import { SetupApi } from '../api/setup.api';
import { AuthApi } from '../api/auth.api';
import FloorPlanCanvas, { type DeskMarker } from '../components/floorplan/FloorPlanCanvas.vue';
import GuidedTourModal from '../components/guided-tour/GuidedTourModal.vue';
import { UserRole, type BuildingDto, type FloorDto, type FloorPlanDto, type UserSummaryDto, type UserRoleAssignmentDto, type ReservationDto } from '@seat-reservation/contracts';

const authStore = useAuthStore();
const isSetupCompleted = ref(false);

const showTour = ref(false);

function getBuildingTodayDate(timezone?: string): string {
  try {
    const tz = timezone || 'UTC';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

const selectedDate = ref(getBuildingTodayDate());

const buildings = ref<BuildingDto[]>([]);
const floors = ref<FloorDto[]>([]);
const selectedBuildingId = ref<string>('');
const selectedFloorId = ref<string>('');

const currentBuilding = computed(() => buildings.value.find(b => b.id === selectedBuildingId.value));
const currentFloor = computed(() => floors.value.find(f => f.id === selectedFloorId.value));

// My Reservations Modal State
const isMyReservationsModalOpen = ref(false);
const myReservations = ref<ReservationDto[]>([]);
const isLoadingMyReservations = ref(false);

// Repositioning Desk Mode State
const repositioningDesk = ref<DeskMarker | null>(null);

const desks = ref<DeskMarker[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const notification = ref<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

// Booking Modal state
const selectedDesk = ref<DeskMarker | null>(null);
const isBookingModalOpen = ref(false);
const isGuestBooking = ref(false);
const guestName = ref('');
const guestEmail = ref('');
const notes = ref('');

// Reserved Desk Details & Cancellation Modal State
const isReservationDetailsModalOpen = ref(false);
const isCancellingReservation = ref(false);

const canCancelSelectedReservation = computed(() => {
  if (!selectedDesk.value || selectedDesk.value.isAvailable) return false;
  // Supervisors (BUILDING_MANAGER) and Administrators have administrative cancellation rights
  if (authStore.isAdmin || authStore.isManager) return true;
  // Reservation owners can cancel their own bookings
  if (selectedDesk.value.isReservedByCurrentUser) return true;
  return false;
});

// Admin Management State
const isAdminModalOpen = ref(false);
const adminTab = ref<'desks' | 'floorplan' | 'buildings' | 'company' | 'roles'>('desks');

// User & Role Management State
const userList = ref<UserSummaryDto[]>([]);
const isLoadingUsers = ref(false);
const editingUserId = ref<string | null>(null);
const editAssignments = ref<{ roleName: UserRole; buildingScopeId?: string }[]>([]);
const isSavingRoles = ref(false);

// Desk Placement State
const isPlacementMode = ref(false);
const isAddDeskModalOpen = ref(false);
const newDeskCoords = ref({ xPct: 50, yPct: 50 });
const newDeskCode = ref('');
const newDeskLabel = ref('');
const newDeskType = ref('STANDARD');
const availableAmenities = ['Dual Monitors', 'Single 4K Monitor', 'Window View', 'Motorized Height Adjustable', 'Noise-Canceling Pod', 'Whiteboard Access', 'Conference Speaker'];
const selectedAmenities = ref<string[]>(['Dual Monitors']);

// Floor Plan Upload State
const uploadPlanPath = ref('');
const uploadPlanMimeType = ref('image/jpeg');
const isUploadingPlan = ref(false);
const libraryPlans = ref<FloorPlanDto[]>([]);
const uploadedFileName = ref('');
const uploadedFileSize = ref('');

// New Building / Floor Form State
const newBuildingName = ref('');
const newBuildingAddress = ref('');
const newBuildingTimezone = ref('America/New_York');
const newFloorName = ref('');
const newFloorNumber = ref(1);
const isCreatingBuilding = ref(false);
const isCreatingFloor = ref(false);

// Companies State
const companies = ref<{ id: string; name: string }[]>([]);
const selectedCompanyId = ref('');
const newCompanyName = ref('');
const isCreatingCompany = ref(false);

function notify(text: string, type: 'success' | 'error' | 'info' = 'success', duration = 4000) {
  notification.value = { text, type };
  setTimeout(() => {
    if (notification.value?.text === text) {
      notification.value = null;
    }
  }, duration);
}

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const floorPlans = ref<FloorPlanDto[]>([]);
const selectedFloorPlanId = ref<string>('');
const activeFloorPlanUrl = ref<string>('');

function getPlanDisplayName(plan?: FloorPlanDto | { filePath?: string; version?: number } | null): string {
  if (!plan) return 'Floor Plan';
  const path = plan.filePath || '';
  if (path.includes('floorplan-office')) return `🏢 Architectural CAD Plan (v${plan.version || 1})`;
  if (path.includes('demo-floorplan')) return `📐 Vector Blueprint (v${plan.version || 1})`;
  const name = path.split('/').pop()?.split('?')[0];
  if (name && name.length < 30 && !name.startsWith('data:')) {
    return `🗺️ ${name} (v${plan.version || 1})`;
  }
  return `🗺️ Custom Floor Plan (v${plan.version || 1})`;
}

function getPlanLabel(path?: string): string {
  if (!path) return 'No Plan Attached';
  if (path.includes('floorplan-office') || path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    return 'Architectural CAD Plan';
  }
  if (path.includes('demo-floorplan') || path.endsWith('.svg')) {
    return 'Vector Blueprint SVG';
  }
  return 'Custom Floor Plan';
}

async function loadCompanies() {
  if (!authStore.isAuthenticated) return;
  try {
    const list = await WorkplaceApi.listCompanies();
    companies.value = list;
    if (list.length > 0 && !selectedCompanyId.value) {
      selectedCompanyId.value = list[0].id;
    }
  } catch {
    // If table not yet populated or in demo mode
  }
}

async function loadFloorPlansForFloor(floorId: string) {
  if (!floorId) {
    floorPlans.value = [];
    return;
  }
  try {
    const plans = await WorkplaceApi.listFloorPlans(floorId);
    floorPlans.value = plans || [];
    const active = plans.find(p => p.isActive) || plans[0];
    if (active) {
      selectedFloorPlanId.value = active.id;
      activeFloorPlanUrl.value = active.filePath;
    } else {
      selectedFloorPlanId.value = '';
      activeFloorPlanUrl.value = '';
    }
  } catch {
    floorPlans.value = [];
    selectedFloorPlanId.value = '';
    activeFloorPlanUrl.value = '';
  }
}

async function loadFloorsForBuilding(buildingId: string) {
  if (!buildingId) {
    floors.value = [];
    selectedFloorId.value = '';
    floorPlans.value = [];
    selectedFloorPlanId.value = '';
    activeFloorPlanUrl.value = '';
    desks.value = [];
    return;
  }
  try {
    const flrs = await WorkplaceApi.listFloors(buildingId);
    floors.value = flrs || [];
    if (flrs && flrs.length > 0) {
      if (!floors.value.some(f => f.id === selectedFloorId.value)) {
        selectedFloorId.value = flrs[0].id;
      }
      await loadFloorPlansForFloor(selectedFloorId.value);
      await loadFloorAvailability();
    } else {
      selectedFloorId.value = '';
      floorPlans.value = [];
      selectedFloorPlanId.value = '';
      activeFloorPlanUrl.value = '';
      desks.value = [];
    }
  } catch {
    floors.value = [];
    selectedFloorId.value = '';
    floorPlans.value = [];
    selectedFloorPlanId.value = '';
    activeFloorPlanUrl.value = '';
    desks.value = [];
  }
}

async function loadBuildingsAndFloors() {
  try {
    const bldgs = await WorkplaceApi.listBuildings();
    if (bldgs && bldgs.length > 0) {
      buildings.value = bldgs;
      if (!selectedBuildingId.value || !bldgs.some(b => b.id === selectedBuildingId.value)) {
        selectedBuildingId.value = bldgs[0].id;
      }
      // Sync date with selected building timezone
      const bldg = bldgs.find(b => b.id === selectedBuildingId.value) || bldgs[0];
      selectedDate.value = getBuildingTodayDate(bldg.timezone);
      await loadFloorsForBuilding(selectedBuildingId.value);
      return;
    }

    buildings.value = [];
    floors.value = [];
    selectedBuildingId.value = '';
    selectedFloorId.value = '';
    floorPlans.value = [];
    selectedFloorPlanId.value = '';
    activeFloorPlanUrl.value = '';
    desks.value = [];

    // ONLY auto-seed demo workplace if user is in unauthenticated evaluation mode AND setup has not been run
    if (!isSetupCompleted.value && !authStore.isAuthenticated) {
      await seedDemoWorkplace();
    }
  } catch (err: any) {
    desks.value = [];
    notify(err?.message || 'Unable to connect to workplace services. Please ensure the backend is running.', 'error');
  }
}

async function seedDemoWorkplace() {
  try {
    isLoading.value = true;
    const demoRes = await DemoApi.seed();
    selectedBuildingId.value = demoRes.demoBuilding.id;
    selectedFloorId.value = demoRes.demoFloor.id;
    floors.value = [{
      id: demoRes.demoFloor.id,
      buildingId: demoRes.demoBuilding.id,
      floorNumber: 4,
      name: demoRes.demoFloor.name
    }];
    await loadFloorPlansForFloor(demoRes.demoFloor.id);
    await loadFloorAvailability();
    notify('Demo workplace initialized with sample floor plan & desks.', 'info');
  } catch (err: any) {
    desks.value = [];
    notify(err?.message || 'Unable to initialize demo workplace.', 'error');
  } finally {
    isLoading.value = false;
  }
}

async function loadFloorAvailability() {
  if (!selectedFloorId.value) return;
  isLoading.value = true;
  try {
    const res = await ReservationApi.getFloorAvailability(
      selectedFloorId.value,
      selectedDate.value,
      selectedFloorPlanId.value || undefined
    );
    if (res.floorPlanId) {
      selectedFloorPlanId.value = res.floorPlanId;
    }
    if (res.desks && res.desks.length > 0) {
      desks.value = res.desks.map((d) => ({
        id: d.id,
        floorPlanId: d.floorPlanId,
        code: d.code,
        label: d.label,
        deskType: d.deskType,
        xCoordinatePct: d.xCoordinatePct,
        yCoordinatePct: d.yCoordinatePct,
        isAvailable: d.isAvailable,
        isReservedByCurrentUser: d.isReservedByCurrentUser,
        needsPositionReview: d.needsPositionReview,
        reservationId: d.reservationId,
        bookedFor: d.bookedFor
      }));
    } else {
      // Empty floor/plan: no desks placed yet
      desks.value = [];
    }
  } catch (err: any) {
    desks.value = [];
    notify(err?.message || 'Failed to load floor availability from server.', 'error');
  } finally {
    isLoading.value = false;
  }
}

watch(selectedBuildingId, async (newBuildingId) => {
  if (newBuildingId) {
    const bldg = buildings.value.find(b => b.id === newBuildingId);
    if (bldg?.timezone) {
      selectedDate.value = getBuildingTodayDate(bldg.timezone);
    }
    await loadFloorsForBuilding(newBuildingId);
  } else {
    floors.value = [];
    selectedFloorId.value = '';
    floorPlans.value = [];
    selectedFloorPlanId.value = '';
    activeFloorPlanUrl.value = '';
    desks.value = [];
  }
});

watch(selectedFloorId, async (newFloorId) => {
  if (newFloorId) {
    await loadFloorPlansForFloor(newFloorId);
  } else {
    floorPlans.value = [];
    selectedFloorPlanId.value = '';
    activeFloorPlanUrl.value = '';
  }
  await loadFloorAvailability();
});

watch(selectedDate, async () => {
  await loadFloorAvailability();
});

watch(adminTab, async (newTab) => {
  if (newTab === 'floorplan') {
    await loadLibraryPlans();
  }
});

// ---------------- My Reservations ----------------

async function openMyReservationsModal() {
  isMyReservationsModalOpen.value = true;
  await loadMyReservations();
}

async function loadMyReservations() {
  if (!authStore.isAuthenticated) return;
  isLoadingMyReservations.value = true;
  try {
    const list = await ReservationApi.getMyReservations();
    myReservations.value = list || [];
  } catch (err: any) {
    notify(err?.message || 'Failed to load reservations', 'error');
  } finally {
    isLoadingMyReservations.value = false;
  }
}

async function handleCancelMyReservation(res: ReservationDto) {
  if (!confirm(`Are you sure you want to cancel your reservation for ${res.deskLabel || res.deskCode} on ${res.reservationDate}?`)) {
    return;
  }
  try {
    await ReservationApi.cancelReservation(res.id);
    notify(`Reservation cancelled successfully.`, 'success');
    await loadMyReservations();
    await loadFloorAvailability();
  } catch (err: any) {
    notify(err?.message || 'Failed to cancel reservation', 'error');
  }
}

// ---------------- Repositioning Mode ----------------

function startRepositioning(desk: DeskMarker) {
  repositioningDesk.value = desk;
  isAdminModalOpen.value = false;
  isReservationDetailsModalOpen.value = false;
  isBookingModalOpen.value = false;
  isPlacementMode.value = true;
  notify(`Repositioning ${desk.code}: Click anywhere on the floor plan canvas to place its new location.`, 'info', 6000);
}

function cancelRepositioning() {
  repositioningDesk.value = null;
  isPlacementMode.value = false;
}

// ---------------- Desk Selection & Booking ----------------

function handleSelectDesk(desk: DeskMarker) {
  if (isPlacementMode.value) return;
  selectedDesk.value = desk;
  if (desk.isAvailable) {
    isGuestBooking.value = false;
    guestName.value = '';
    guestEmail.value = '';
    notes.value = '';
    isBookingModalOpen.value = true;
  } else {
    isReservationDetailsModalOpen.value = true;
  }
}

async function handleCancelReservation() {
  if (!selectedDesk.value) return;
  const desk = selectedDesk.value;
  const isOwner = desk.isReservedByCurrentUser;
  const isSupervisorOrAdmin = authStore.isAdmin || authStore.isManager;

  const confirmMsg = isSupervisorOrAdmin && !isOwner
    ? `Supervisor Override:\n\nAre you sure you want to cancel the reservation for ${desk.label} (${desk.code}) on ${selectedDate.value}?\n\nThis will immediately release the seat and allow other employees to book it.`
    : `Are you sure you want to cancel your reservation for ${desk.label} (${desk.code}) on ${selectedDate.value}?`;

  if (!confirm(confirmMsg)) {
    return;
  }

  isCancellingReservation.value = true;
  try {
    if (desk.reservationId) {
      await ReservationApi.cancelReservation(desk.reservationId);
    } else {
      await ReservationApi.cancelReservationByDesk(desk.id, selectedDate.value);
    }

    notify(
      isOwner
        ? `Your reservation for ${desk.label} (${desk.code}) has been cancelled.`
        : `Reservation for ${desk.label} (${desk.code}) was cancelled by supervisor/admin.`,
      'success'
    );
    isReservationDetailsModalOpen.value = false;
    await loadFloorAvailability();
  } catch (err: any) {
    notify(err?.message || 'Failed to cancel reservation.', 'error');
  } finally {
    isCancellingReservation.value = false;
  }
}

async function confirmReservation() {
  if (!selectedDesk.value) return;
  isSubmitting.value = true;

  try {
    await ReservationApi.createReservation({
      deskId: selectedDesk.value.id,
      reservationDate: selectedDate.value,
      isGuest: isGuestBooking.value,
      guestName: isGuestBooking.value ? guestName.value.trim() : undefined,
      guestEmail: isGuestBooking.value && guestEmail.value ? guestEmail.value.trim() : undefined,
      notes: notes.value.trim() || undefined
    });

    notify(
      isGuestBooking.value
        ? `Reserved ${selectedDesk.value.label} for guest: ${guestName.value}`
        : `Successfully reserved ${selectedDesk.value.label} for yourself!`,
      'success'
    );

    isBookingModalOpen.value = false;
    await loadFloorAvailability();
  } catch (err: any) {
    if (err.statusCode === 409) {
      notify(err.message || 'Seat conflict: desk already booked for this date.', 'error', 6000);
      await loadFloorAvailability();
    } else {
      notify(err.message || 'Failed to complete reservation.', 'error');
    }
  } finally {
    isSubmitting.value = false;
  }
}

async function handleResetSandbox() {
  isLoading.value = true;
  try {
    await DemoApi.reset();
    notify('Sandbox reset: demo bookings restored to pristine state.', 'success');
    await loadFloorAvailability();
  } catch (err: any) {
    notify(err?.message || 'Failed to reset sandbox demo data.', 'error');
  } finally {
    isLoading.value = false;
  }
}

function handleSignOut() {
  authStore.clearSession();
  isPlacementMode.value = false;
  repositioningDesk.value = null;
  isAdminModalOpen.value = false;
  notify('You have signed out successfully.', 'info');
}

// ---------------- Admin Actions ----------------

async function handleCanvasClick(coords: { xPct: number; yPct: number }) {
  if (repositioningDesk.value) {
    const targetDesk = repositioningDesk.value;
    try {
      isSubmitting.value = true;
      await WorkplaceApi.updateCoordinates(targetDesk.id, {
        xCoordinatePct: coords.xPct,
        yCoordinatePct: coords.yPct
      });
      if (targetDesk.needsPositionReview) {
        await WorkplaceApi.acknowledgeReview(targetDesk.id);
      }
      notify(`Desk ${targetDesk.code} repositioned to (${coords.xPct}%, ${coords.yPct}%) and position alignment confirmed!`, 'success');
      repositioningDesk.value = null;
      isPlacementMode.value = false;
      await loadFloorAvailability();
    } catch (err: any) {
      notify(err?.message || 'Failed to reposition desk', 'error');
    } finally {
      isSubmitting.value = false;
    }
    return;
  }

  if (!isPlacementMode.value) return;
  newDeskCoords.value = coords;
  const nextNum = desks.value.length + 1;
  newDeskCode.value = `D-${nextNum < 10 ? '0' + nextNum : nextNum}`;
  newDeskLabel.value = `Desk ${nextNum}`;
  selectedAmenities.value = ['Dual Monitors'];
  isAddDeskModalOpen.value = true;
}

async function handleSaveNewDesk() {
  if (!newDeskCode.value.trim() || !newDeskLabel.value.trim()) {
    notify('Please specify both desk code and label', 'error');
    return;
  }
  if (!activeFloorPlanUrl.value) {
    notify('Cannot place a desk without an active floor plan. Please upload a floor plan first.', 'error');
    return;
  }
  if (!selectedFloorId.value) {
    notify('Please select a floor first before placing a desk.', 'error');
    return;
  }
  isSubmitting.value = true;
  try {
    await WorkplaceApi.createDesk(selectedFloorId.value, {
      floorPlanId: selectedFloorPlanId.value || undefined,
      code: newDeskCode.value.trim().toUpperCase(),
      label: newDeskLabel.value.trim(),
      deskType: newDeskType.value as any,
      xCoordinatePct: newDeskCoords.value.xPct,
      yCoordinatePct: newDeskCoords.value.yPct,
      amenities: selectedAmenities.value
    });
    await loadFloorAvailability();
    notify(`Desk ${newDeskCode.value} placed successfully on floor plan!`, 'success');
    isAddDeskModalOpen.value = false;
  } catch (err: any) {
    notify(err.message || 'Failed to place desk', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDeleteDesk(deskId: string, deskCode: string) {
  if (!confirm(`Are you sure you want to delete desk ${deskCode}?`)) return;
  try {
    await WorkplaceApi.deleteDesk(deskId);
    await loadFloorAvailability();
    notify(`Desk ${deskCode} deleted from database.`, 'success');
  } catch (err: any) {
    notify(err?.message || 'Failed to delete desk', 'error');
  }
}

async function handleAcknowledgeReview(deskId: string, deskCode: string) {
  try {
    await WorkplaceApi.acknowledgeReview(deskId);
    await loadFloorAvailability();
    notify(`Position alignment acknowledged for ${deskCode}.`, 'success');
  } catch (err: any) {
    notify(err?.message || 'Failed to acknowledge review', 'error');
  }
}

async function handleSwitchFloorPlan(planId: string) {
  if (!planId || !selectedFloorId.value) return;
  const targetPlan = floorPlans.value.find(p => p.id === planId);
  if (!targetPlan) return;

  try {
    await WorkplaceApi.activateFloorPlan(selectedFloorId.value, planId);
    selectedFloorPlanId.value = planId;
    activeFloorPlanUrl.value = targetPlan.filePath;

    const curFloor = floors.value.find(f => f.id === selectedFloorId.value);
    if (curFloor) {
      curFloor.activeFloorPlanId = targetPlan.id;
      curFloor.activeFloorPlanPath = targetPlan.filePath;
    }

    floorPlans.value.forEach(p => { p.isActive = (p.id === planId); });
    notify(`Switched active plan to ${getPlanDisplayName(targetPlan)}`, 'info');
    await loadFloorAvailability();
  } catch (err: any) {
    notify(err?.message || 'Failed to switch floor plan', 'error');
  }
}

async function handleDeleteFloorPlan(planId: string, planName: string) {
  if (!confirm(`Are you sure you want to delete floor plan "${planName}"?\nAll desks placed on this floor plan will also be permanently removed.`)) {
    return;
  }
  try {
    await WorkplaceApi.deleteFloorPlan(selectedFloorId.value, planId);
    notify(`Floor plan "${planName}" deleted successfully.`, 'success');
    await loadFloorPlansForFloor(selectedFloorId.value);
    if (selectedBuildingId.value) {
      const flrs = await WorkplaceApi.listFloors(selectedBuildingId.value);
      floors.value = flrs || [];
    }
    await loadFloorAvailability();
  } catch (err: any) {
    notify(err?.message || 'Failed to delete floor plan', 'error');
  }
}

async function loadLibraryPlans() {
  try {
    const plans = await WorkplaceApi.listFloorPlanLibrary();
    libraryPlans.value = plans || [];
  } catch {
    libraryPlans.value = [];
  }
}

async function handleBindExistingPlan(plan: FloorPlanDto) {
  if (!selectedFloorId.value) {
    notify('Please select a target floor first.', 'error');
    return;
  }
  isUploadingPlan.value = true;
  try {
    const newPlan = await WorkplaceApi.uploadFloorPlan(selectedFloorId.value, {
      filePath: plan.filePath,
      mimeType: plan.mimeType
    });
    selectedFloorPlanId.value = newPlan.id;
    activeFloorPlanUrl.value = newPlan.filePath;

    if (selectedBuildingId.value) {
      const flrs = await WorkplaceApi.listFloors(selectedBuildingId.value);
      floors.value = flrs || [];
    }
    await loadFloorPlansForFloor(selectedFloorId.value);
    await loadFloorAvailability();
    await loadLibraryPlans();
    notify(`Floor plan bound to ${currentFloor.value?.name || 'this floor'}! You can now place desks.`, 'success');
    isAdminModalOpen.value = false;
  } catch (err: any) {
    notify(err?.message || 'Failed to bind floor plan', 'error');
  } finally {
    isUploadingPlan.value = false;
  }
}

async function handleSaveFloorPlan() {
  if (!uploadPlanPath.value.trim()) {
    notify('Please specify or select a floor plan image', 'error');
    return;
  }
  if (!selectedFloorId.value) {
    notify('Please select or create a floor first before uploading a floor plan.', 'error');
    return;
  }
  isUploadingPlan.value = true;
  try {
    const newPath = uploadPlanPath.value.trim();
    let mimeType = uploadPlanMimeType.value;
    if (newPath.startsWith('data:image/')) {
      const match = newPath.match(/^data:(image\/[^;]+);/);
      if (match) mimeType = match[1];
    } else if (newPath.toLowerCase().endsWith('.svg')) {
      mimeType = 'image/svg+xml';
    } else if (newPath.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png';
    } else if (newPath.toLowerCase().endsWith('.jpg') || newPath.toLowerCase().endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (newPath.toLowerCase().endsWith('.webp')) {
      mimeType = 'image/webp';
    }

    const plan = await WorkplaceApi.uploadFloorPlan(selectedFloorId.value, {
      filePath: newPath,
      mimeType: mimeType
    });
    selectedFloorPlanId.value = plan.id;
    activeFloorPlanUrl.value = plan.filePath;

    if (selectedBuildingId.value) {
      const flrs = await WorkplaceApi.listFloors(selectedBuildingId.value);
      floors.value = flrs || [];
    }
    await loadFloorPlansForFloor(selectedFloorId.value);
    await loadFloorAvailability();
    await loadLibraryPlans();
    notify(`Floor plan saved and bound to ${currentFloor.value?.name || 'this floor'}! You can now place desks.`, 'success');

    uploadPlanPath.value = '';
    uploadedFileName.value = '';
    uploadedFileSize.value = '';
    isAdminModalOpen.value = false;
  } catch (err: any) {
    notify(err?.message || 'Failed to update floor plan', 'error');
  } finally {
    isUploadingPlan.value = false;
  }
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  const file = target.files[0];
  uploadedFileName.value = file.name;
  uploadedFileSize.value = `${(file.size / 1024).toFixed(1)} KB`;
  uploadPlanMimeType.value = file.type || 'image/png';
  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      uploadPlanPath.value = e.target.result as string;
    }
  };
  reader.readAsDataURL(file);
}

async function handleCreateBuilding() {
  if (!newBuildingName.value.trim()) {
    notify('Please specify a building name', 'error');
    return;
  }
  isCreatingBuilding.value = true;
  try {
    const compId = selectedCompanyId.value || (companies.value[0]?.id) || '';
    const bldg = await WorkplaceApi.createBuilding({
      companyId: compId,
      name: newBuildingName.value.trim(),
      address: newBuildingAddress.value.trim() || undefined,
      timezone: newBuildingTimezone.value
    });
    const bldgs = await WorkplaceApi.listBuildings();
    buildings.value = bldgs || [];
    selectedBuildingId.value = bldg.id;
    await loadFloorsForBuilding(bldg.id);
    newBuildingName.value = '';
    newBuildingAddress.value = '';
    notify(`Building "${bldg.name}" created! You can now add floors to it below.`, 'success');
  } catch (err: any) {
    notify(err.message || 'Failed to create building', 'error');
  } finally {
    isCreatingBuilding.value = false;
  }
}

async function handleDeleteBuilding(buildingId: string, buildingName: string) {
  if (!confirm(`Are you sure you want to delete building "${buildingName}"?\nThis will permanently delete the building and all floors, floor plans, and desks within it.`)) {
    return;
  }
  try {
    await WorkplaceApi.deleteBuilding(buildingId);
    notify(`Building "${buildingName}" deleted successfully.`, 'success');
    const bldgs = await WorkplaceApi.listBuildings();
    buildings.value = bldgs || [];
    if (selectedBuildingId.value === buildingId) {
      selectedBuildingId.value = bldgs.length > 0 ? bldgs[0].id : '';
    }
    if (selectedBuildingId.value) {
      await loadFloorsForBuilding(selectedBuildingId.value);
    } else {
      floors.value = [];
      selectedFloorId.value = '';
      desks.value = [];
    }
  } catch (err: any) {
    notify(err.message || 'Failed to delete building', 'error');
  }
}

async function handleCreateFloor() {
  if (!newFloorName.value.trim() || !selectedBuildingId.value) {
    notify('Please specify a floor name and select a building.', 'error');
    return;
  }
  isCreatingFloor.value = true;
  try {
    const flr = await WorkplaceApi.createFloor(selectedBuildingId.value, {
      floorNumber: Number(newFloorNumber.value) || 1,
      name: newFloorName.value.trim()
    });
    await loadFloorsForBuilding(selectedBuildingId.value);
    selectedFloorId.value = flr.id;
    newFloorName.value = '';
    newFloorNumber.value++;
    notify(`Floor "${flr.name}" created successfully!`, 'success');
  } catch (err: any) {
    notify(err.message || 'Failed to create floor', 'error');
  } finally {
    isCreatingFloor.value = false;
  }
}

async function handleDeleteFloor(floorId: string, floorName: string) {
  if (!confirm(`Are you sure you want to delete floor "${floorName}"?\nThis will permanently remove this floor, its floor plan, and all placed desks.`)) {
    return;
  }
  try {
    await WorkplaceApi.deleteFloor(floorId);
    notify(`Floor "${floorName}" deleted successfully.`, 'success');
    if (selectedBuildingId.value) {
      await loadFloorsForBuilding(selectedBuildingId.value);
    }
  } catch (err: any) {
    notify(err.message || 'Failed to delete floor', 'error');
  }
}

async function handleCreateCompany() {
  if (!newCompanyName.value.trim()) return;
  isCreatingCompany.value = true;
  try {
    const comp = await WorkplaceApi.createCompany(newCompanyName.value.trim());
    companies.value.push(comp);
    selectedCompanyId.value = comp.id;
    newCompanyName.value = '';
    notify(`Company "${comp.name}" created successfully!`, 'success');
  } catch (err: any) {
    notify(err.message || 'Failed to create company', 'error');
  } finally {
    isCreatingCompany.value = false;
  }
}

async function handlePurgeDemoData() {
  if (!confirm('This will permanently delete the evaluation demo organization (Acme Tech HQ), its sample floors, and demo desks. Real buildings and custom data will be preserved. Proceed?')) return;
  try {
    const res = await WorkplaceApi.purgeDemoData();
    notify(`Successfully purged demo sandbox data (${res.clearedCount} records removed).`, 'success');
    await loadBuildingsAndFloors();
    await loadCompanies();
  } catch (err: any) {
    notify(err.message || 'Failed to purge demo data', 'error');
  }
}

async function loadUsers() {
  if (!authStore.isAdmin) return;
  isLoadingUsers.value = true;
  try {
    userList.value = await AuthApi.listUsers();
  } catch (err: any) {
    notify(err.message || 'Failed to load user list', 'error');
  } finally {
    isLoadingUsers.value = false;
  }
}

function startEditUserRoles(user: UserSummaryDto) {
  editingUserId.value = user.id;
  if (user.roles && user.roles.length > 0) {
    editAssignments.value = user.roles.map((a: UserRoleAssignmentDto) => ({
      roleName: a.roleName,
      buildingScopeId: a.buildingScopeId || undefined
    }));
  } else {
    editAssignments.value = [{ roleName: UserRole.EMPLOYEE }];
  }
}

function cancelEditUserRoles() {
  editingUserId.value = null;
  editAssignments.value = [];
}

function addAssignment() {
  editAssignments.value.push({ roleName: UserRole.BUILDING_MANAGER, buildingScopeId: buildings.value[0]?.id });
}

function removeAssignment(index: number) {
  editAssignments.value.splice(index, 1);
  if (editAssignments.value.length === 0) {
    editAssignments.value.push({ roleName: UserRole.EMPLOYEE });
  }
}

async function saveUserRoles(userId: string) {
  isSavingRoles.value = true;
  try {
    const updated = await AuthApi.updateUserRoles(userId, {
      assignments: editAssignments.value.map(a => ({
        roleName: a.roleName,
        buildingScopeId: a.roleName === UserRole.BUILDING_MANAGER ? (a.buildingScopeId || undefined) : undefined
      }))
    });
    const idx = userList.value.findIndex(u => u.id === userId);
    if (idx !== -1) {
      userList.value[idx] = updated;
    }
    editingUserId.value = null;
    notify('User roles & building scopes updated successfully.', 'success');
  } catch (err: any) {
    notify(err.message || 'Failed to update user roles', 'error');
  } finally {
    isSavingRoles.value = false;
  }
}

watch(adminTab, (newTab) => {
  if (newTab === 'roles') {
    loadUsers();
  }
});

onMounted(async () => {
  try {
    const status = await SetupApi.getStatus();
    isSetupCompleted.value = status.isSetupCompleted;
  } catch {
    // API not yet running
  }
  await loadBuildingsAndFloors();
  await loadCompanies();
  await loadLibraryPlans();
});
</script>

<template>
  <div class="min-h-full flex flex-col bg-slate-50 font-sans">
    <!-- Top Header Navigation -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <!-- Logo & Branding -->
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-md">
            S
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="font-extrabold text-slate-900 text-lg leading-tight tracking-tight">SeatSpace</h1>
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                :class="isSetupCompleted ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-brand-50 text-brand-700 border-brand-200'"
              >
                {{ isSetupCompleted ? 'Live' : 'Demo' }}
              </span>
            </div>
            <p class="text-xs text-slate-500 font-medium">Hot-Desking & Floor Plan Management</p>
          </div>
        </div>

        <!-- Action Buttons & Auth State -->
        <div class="flex items-center space-x-2 sm:space-x-3">
          <button
            v-if="!isSetupCompleted"
            @click="showTour = true"
            class="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 active:scale-95 font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <span>💡 Tour</span>
          </button>

          <button
            v-if="!isSetupCompleted"
            @click="handleResetSandbox"
            :disabled="isLoading"
            class="hidden md:inline-flex px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-95 font-semibold text-xs sm:text-sm transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title="Reset sample bookings to baseline"
          >
            🔄 Reset
          </button>

          <!-- Admin Management Controls (Visible when logged in as Admin / Manager) -->
          <template v-if="authStore.isAdmin || authStore.isManager">
            <button
              @click="isPlacementMode = !isPlacementMode"
              class="px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              :class="isPlacementMode ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
              title="Click on the floor plan canvas to drop new desk markers"
            >
              <span>{{ isPlacementMode ? '📍 Exit Placement' : '📍 Drop Desk' }}</span>
            </button>

            <button
              @click="isAdminModalOpen = true"
              class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center space-x-1.5 transition-all shadow-md cursor-pointer"
            >
              <span>⚙️ Workplace Admin</span>
            </button>
          </template>

          <!-- My Bookings Button -->
          <button
            v-if="authStore.isAuthenticated"
            @click="openMyReservationsModal"
            class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs sm:text-sm flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            title="View and manage your reservations"
          >
            <span>📅 My Bookings</span>
          </button>

          <!-- User Session Status & Sign Out -->
          <div v-if="authStore.isAuthenticated" class="flex items-center space-x-2.5 pl-2 border-l border-slate-200">
            <div class="hidden lg:flex flex-col text-right">
              <span class="text-xs font-bold text-slate-900 leading-tight">{{ authStore.user?.fullName }}</span>
              <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                {{ authStore.user?.isRecoveryAdmin ? 'Recovery Admin' : authStore.user?.role }}
              </span>
            </div>
            <button
              @click="handleSignOut"
              class="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-all cursor-pointer"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>

          <!-- Sign In Link (when unauthenticated) -->
          <router-link
            v-else
            to="/login"
            class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm transition-all shadow-xs"
          >
            Sign In
          </router-link>
        </div>
      </div>
    </header>

    <!-- Notification Toast -->
    <div
      v-if="notification"
      class="max-w-md mx-auto mt-4 px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between text-sm animate-in fade-in slide-in-from-top-2 duration-200 z-40 text-white"
      :class="{
        'bg-emerald-600': notification.type === 'success',
        'bg-rose-600': notification.type === 'error',
        'bg-indigo-600': notification.type === 'info'
      }"
    >
      <span class="font-medium">{{ notification.text }}</span>
      <button @click="notification = null" class="ml-3 font-bold text-white/80 hover:text-white">&times;</button>
    </div>

    <!-- Main Content -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <!-- Repositioning Mode Alert Banner -->
      <div
        v-if="repositioningDesk"
        class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 rounded-2xl shadow-md flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-150"
      >
        <div class="flex items-center space-x-3">
          <span class="text-2xl">📐</span>
          <div>
            <h4 class="font-black text-sm">Repositioning Desk {{ repositioningDesk.code }} ({{ repositioningDesk.label }})</h4>
            <p class="text-xs text-indigo-100">Click anywhere on the floor plan canvas below to update this desk's location and confirm position alignment.</p>
          </div>
        </div>
        <button
          @click="cancelRepositioning"
          class="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          Cancel Repositioning
        </button>
      </div>

      <!-- Placement Mode Alert Banner -->
      <div
        v-else-if="isPlacementMode"
        class="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 rounded-2xl shadow-md flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-150"
      >
        <div class="flex items-center space-x-3">
          <span class="text-2xl">📍</span>
          <div>
            <h4 class="font-black text-sm">Desk Placement Mode Active</h4>
            <p class="text-xs text-amber-100">Click anywhere on the floor plan canvas below to drop a new hot-desk at that exact coordinate.</p>
          </div>
        </div>
        <button
          @click="isPlacementMode = false"
          class="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          Done Placing
        </button>
      </div>

      <!-- Toolbar Controls -->
      <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <!-- Building Selector -->
          <div class="flex items-center space-x-2" v-if="buildings.length > 0">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Building:</label>
            <select
              v-model="selectedBuildingId"
              class="rounded-xl border border-slate-200 text-sm font-semibold py-2 px-3 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option v-for="bldg in buildings" :key="bldg.id" :value="bldg.id">
                {{ bldg.name }}
              </option>
            </select>
          </div>

          <!-- Floor Selector -->
          <div class="flex items-center space-x-2">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Floor:</label>
            <select
              v-model="selectedFloorId"
              class="rounded-xl border border-slate-200 text-sm font-semibold py-2 px-3 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option v-for="floor in floors" :key="floor.id" :value="floor.id">
                Floor {{ floor.floorNumber }}: {{ floor.name }}
              </option>
              <option v-if="floors.length === 0" value="">
                {{ isSetupCompleted ? 'No floors in this building' : 'Floor 4 — Open Office & Collaboration' }}
              </option>
            </select>
          </div>

          <!-- Date Picker -->
          <div class="flex items-center space-x-2">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Date:</label>
            <input
              v-model="selectedDate"
              type="date"
              class="rounded-xl border border-slate-200 text-sm font-semibold py-2 px-3 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          <!-- Floor Plan Selector & Indicator Bound to Active Floor -->
          <div class="flex items-center space-x-2">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Plan:</label>

            <!-- Case 1: Active floor has floor plan(s) -->
            <template v-if="floorPlans.length > 0">
              <select
                :value="selectedFloorPlanId"
                @change="handleSwitchFloorPlan(($event.target as HTMLSelectElement).value)"
                class="rounded-xl border border-slate-200 text-sm font-semibold py-2 px-3 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none cursor-pointer"
              >
                <option v-for="plan in floorPlans" :key="plan.id" :value="plan.id">
                  {{ getPlanDisplayName(plan) }}{{ plan.isActive ? ' (Active)' : '' }}
                </option>
              </select>

              <button
                v-if="authStore.isAdmin || authStore.isManager"
                @click="isAdminModalOpen = true; adminTab = 'floorplan';"
                class="px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap"
                title="Manage or upload floor plan versions"
              >
                + Manage Plans
              </button>
            </template>

            <!-- Case 2: Unauthenticated demo mode before setup -->
            <template v-else-if="!isSetupCompleted && !authStore.isAuthenticated">
              <span class="inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                🏢 Architectural CAD Plan (Demo)
              </span>
            </template>

            <!-- Case 3: No floor plan attached to this floor yet -->
            <template v-else>
              <span class="inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                ⚠️ No Plan Attached
              </span>
              <button
                v-if="authStore.isAdmin || authStore.isManager"
                @click="isAdminModalOpen = true; adminTab = 'floorplan';"
                class="px-2.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap"
              >
                + Upload Plan
              </button>
            </template>
          </div>
        </div>

        <!-- Real-time Status Legend -->
        <div class="flex items-center space-x-4 text-xs font-semibold text-slate-600">
          <div class="flex items-center space-x-1.5">
            <span class="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
            <span>Available</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-xs"></span>
            <span>Your Booking</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="w-3 h-3 rounded-full bg-slate-400 inline-block shadow-xs"></span>
            <span>Reserved</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
            <span>Needs Review</span>
          </div>
        </div>
      </div>

      <!-- Clean Setup Empty State when no floors exist -->
      <div v-if="floors.length === 0 && isSetupCompleted" class="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-4 shadow-sm">
        <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center text-3xl mx-auto shadow-inner">
          🏢
        </div>
        <div class="space-y-1">
          <h3 class="text-xl font-black text-slate-900 tracking-tight">
            {{ buildings.length === 0 ? 'Clean Workplace Ready' : `No Floors in ${currentBuilding?.name || 'Selected Building'}` }}
          </h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            {{ buildings.length === 0
                ? 'All evaluation demo data has been cleared. To begin, open Workplace Admin to create your first building and floor.'
                : `This building currently has no floors. Open Workplace Admin to add a floor to ${currentBuilding?.name || 'this building'}, upload a floor plan, and drop desks.` }}
          </p>
        </div>
        <div class="pt-1">
          <button
            @click="isAdminModalOpen = true; adminTab = 'buildings';"
            class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            {{ buildings.length === 0 ? '+ Create First Building' : '+ Add Floor to Building' }}
          </button>
        </div>
      </div>

      <!-- Interactive Floor Plan Canvas -->
      <div v-else class="relative">
        <div v-if="isLoading" class="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-xs rounded-2xl">
          <div class="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-xl shadow-lg text-xs font-medium">
            <span class="animate-spin">⏳</span>
            <span>Updating desk availability...</span>
          </div>
        </div>

        <FloorPlanCanvas
          :floor-plan-url="activeFloorPlanUrl"
          :desks="desks"
          :selected-desk-id="selectedDesk?.id"
          :interactive-mode="isPlacementMode ? 'place' : 'view'"
          @select-desk="handleSelectDesk"
          @canvas-click="handleCanvasClick"
          @open-upload-plan="isAdminModalOpen = true; adminTab = 'floorplan';"
        />
      </div>
    </main>

    <!-- Booking Modal -->
    <div
      v-if="isBookingModalOpen && selectedDesk"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div class="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            <h3 class="font-extrabold text-xl text-slate-900">Reserve Desk</h3>
            <p class="text-xs text-slate-500 font-medium mt-0.5">
              {{ selectedDesk.label }} ({{ selectedDesk.code }})
            </p>
          </div>
          <button @click="isBookingModalOpen = false" class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
        </div>

        <div class="space-y-4 text-sm">
          <!-- Position Review Alert for Supervisors & Admins -->
          <div
            v-if="selectedDesk.needsPositionReview && (authStore.isAdmin || authStore.isManager)"
            class="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between"
          >
            <div>
              <p class="text-xs font-bold text-amber-900">⚠️ Position Alignment Flagged</p>
              <p class="text-[11px] text-amber-800">Requires position review after floor plan replacement.</p>
            </div>
            <div class="flex items-center space-x-2">
              <button
                @click="handleAcknowledgeReview(selectedDesk.id, selectedDesk.code)"
                class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
              >
                ✓ Confirm
              </button>
              <button
                @click="startRepositioning(selectedDesk)"
                class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
              >
                📐 Reposition
              </button>
            </div>
          </div>

          <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
            <div class="flex justify-between">
              <span class="text-slate-500 font-medium">Desk Type:</span>
              <span class="font-bold text-slate-800 capitalize">{{ selectedDesk.deskType.toLowerCase() }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 font-medium">Date:</span>
              <span class="font-bold text-slate-800">{{ selectedDate }} (Whole Day)</span>
            </div>
          </div>

          <!-- Guest Proxy Booking Checkbox -->
          <div class="p-3 bg-brand-50/60 border border-brand-100 rounded-2xl">
            <label class="flex items-center space-x-2.5 cursor-pointer">
              <input v-model="isGuestBooking" type="checkbox" class="rounded text-brand-600 focus:ring-brand-500 h-4 w-4" />
              <span class="text-xs sm:text-sm font-semibold text-brand-900">Reserve on behalf of an external Guest</span>
            </label>
          </div>

          <!-- Guest Input Fields -->
          <div v-if="isGuestBooking" class="space-y-3 pt-1 animate-in fade-in duration-200">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Guest Full Name *</label>
              <input
                v-model="guestName"
                type="text"
                placeholder="e.g. Alex Morgan"
                class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Guest Contact Email (Optional)</label>
              <input
                v-model="guestEmail"
                type="email"
                placeholder="alex.morgan@client.com"
                class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Notes (Optional)</label>
            <input
              v-model="notes"
              type="text"
              placeholder="e.g. Attending afternoon client presentation"
              class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div class="flex justify-end space-x-3 pt-3 border-t border-slate-100">
          <button
            @click="isBookingModalOpen = false"
            class="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            @click="confirmReservation"
            :disabled="isSubmitting || (isGuestBooking && !guestName.trim())"
            class="px-5 py-2.5 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 active:scale-95 rounded-xl shadow-md transition-all cursor-pointer"
          >
            {{ isSubmitting ? 'Confirming...' : 'Confirm Reservation' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reserved Desk Details & Cancellation Modal (Supervisors / Admins / Employees) -->
    <div
      v-if="isReservationDetailsModalOpen && selectedDesk"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-extrabold text-xl text-slate-900">{{ selectedDesk.label }}</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-700">
                Reserved
              </span>
            </div>
            <p class="text-xs text-slate-500 font-mono font-medium mt-0.5">
              Desk Code: {{ selectedDesk.code }}
            </p>
          </div>
          <button
            @click="isReservationDetailsModalOpen = false"
            class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <!-- Reservation Metadata -->
        <div class="space-y-3.5 text-sm">
          <!-- Position Review Alert for Supervisors & Admins -->
          <div
            v-if="selectedDesk.needsPositionReview && (authStore.isAdmin || authStore.isManager)"
            class="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between"
          >
            <div>
              <p class="text-xs font-bold text-amber-900">⚠️ Position Alignment Flagged</p>
              <p class="text-[11px] text-amber-800">Requires position review after floor plan replacement.</p>
            </div>
            <div class="flex items-center space-x-2">
              <button
                @click="handleAcknowledgeReview(selectedDesk.id, selectedDesk.code)"
                class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
              >
                ✓ Confirm
              </button>
              <button
                @click="startRepositioning(selectedDesk)"
                class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
              >
                📐 Reposition
              </button>
            </div>
          </div>

          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500 font-medium">Reservation Date</span>
              <span class="font-bold text-slate-800">{{ selectedDate }} (Full Day)</span>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500 font-medium">Occupant / Reserved For</span>
              <span class="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">
                {{ selectedDesk.bookedFor || (selectedDesk.isReservedByCurrentUser ? 'You (' + (authStore.user?.fullName || 'Current User') + ')' : 'Reserved Colleague') }}
              </span>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500 font-medium">Workstation Type</span>
              <span class="font-semibold text-slate-700 capitalize">{{ selectedDesk.deskType.toLowerCase() }}</span>
            </div>
            <div v-if="selectedDesk.amenities && selectedDesk.amenities.length > 0" class="pt-1 border-t border-slate-200/60">
              <span class="block text-[11px] text-slate-500 font-medium mb-1">Amenities</span>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="amenity in selectedDesk.amenities"
                  :key="amenity"
                  class="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-semibold text-slate-600"
                >
                  {{ amenity }}
                </span>
              </div>
            </div>
          </div>

          <!-- Cancellation Authorization Section -->
          <div v-if="canCancelSelectedReservation" class="space-y-3">
            <div
              v-if="authStore.isAdmin || authStore.isManager"
              class="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start space-x-2.5"
            >
              <span class="text-lg leading-none">🛡️</span>
              <div class="text-xs text-amber-900 leading-relaxed">
                <p class="font-bold">Supervisor / Admin Authority</p>
                <p class="mt-0.5 text-amber-800">
                  You are authorized as a supervisor or administrator to cancel this reservation and release the desk for booking immediately.
                </p>
              </div>
            </div>

            <div
              v-else-if="selectedDesk.isReservedByCurrentUser"
              class="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start space-x-2.5"
            >
              <span class="text-lg leading-none">👤</span>
              <div class="text-xs text-blue-900 leading-relaxed">
                <p class="font-bold">Your Active Booking</p>
                <p class="mt-0.5 text-blue-800">
                  You reserved this desk for {{ selectedDate }}. You may release it if you no longer require a seat.
                </p>
              </div>
            </div>

            <button
              @click="handleCancelReservation"
              :disabled="isCancellingReservation"
              class="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span v-if="isCancellingReservation">Releasing Seat...</span>
              <span v-else class="flex items-center space-x-1.5">
                <span>🚫</span>
                <span>{{ (authStore.isAdmin || authStore.isManager) && !selectedDesk.isReservedByCurrentUser ? 'Release Desk (Supervisor Cancel)' : 'Cancel My Reservation' }}</span>
              </span>
            </button>
          </div>

          <!-- Unauthorized Section (Regular employee viewing someone else's booking) -->
          <div v-else class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div class="flex items-start space-x-2.5">
              <span class="text-base leading-none">🔒</span>
              <div class="text-xs text-slate-600 leading-relaxed">
                <p class="font-bold text-slate-800">Reservation Protected</p>
                <p class="mt-0.5">
                  This desk is currently reserved by a colleague. Only supervisors (Building Managers) or Workplace Admins can modify or cancel reservations for others.
                </p>
              </div>
            </div>
            <div v-if="!authStore.isAuthenticated" class="pt-2 border-t border-slate-200">
              <router-link
                to="/login"
                class="inline-block text-xs font-bold text-brand-600 hover:text-brand-700 underline"
              >
                Sign in as Supervisor / Admin to manage &rarr;
              </router-link>
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-3 border-t border-slate-100">
          <button
            @click="isReservationDetailsModalOpen = false"
            class="px-5 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Drop Desk Placement Modal -->
    <div
      v-if="isAddDeskModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div class="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            <h3 class="font-extrabold text-xl text-slate-900">Add New Hot-Desk</h3>
            <p class="text-xs text-slate-500 font-medium mt-0.5">
              Coordinates: X: {{ newDeskCoords.xPct }}%, Y: {{ newDeskCoords.yPct }}%
            </p>
          </div>
          <button @click="isAddDeskModalOpen = false" class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
        </div>

        <div class="space-y-3.5 text-sm">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Desk Code *</label>
            <input
              v-model="newDeskCode"
              type="text"
              placeholder="e.g. D-13"
              class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-brand-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Desk Label *</label>
            <input
              v-model="newDeskLabel"
              type="text"
              placeholder="e.g. Focus Workstation 13"
              class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Desk Type</label>
            <select
              v-model="newDeskType"
              class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="STANDARD">Standard Workstation</option>
              <option value="STANDING">Electric Standing Desk</option>
              <option value="QUIET">Quiet / Focus Pod</option>
              <option value="COLLABORATIVE">Team / Collaborative</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1.5">Amenities</label>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <label
                v-for="amenity in availableAmenities"
                :key="amenity"
                class="flex items-center space-x-2 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer border border-slate-100"
              >
                <input
                  type="checkbox"
                  :value="amenity"
                  v-model="selectedAmenities"
                  class="rounded text-brand-600 focus:ring-brand-500"
                />
                <span class="text-slate-700 font-medium">{{ amenity }}</span>
              </label>
            </div>
          </div>
        </div>

        <div class="flex justify-end space-x-3 pt-3 border-t border-slate-100">
          <button
            @click="isAddDeskModalOpen = false"
            class="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            @click="handleSaveNewDesk"
            :disabled="isSubmitting"
            class="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 rounded-xl shadow-md transition-all cursor-pointer"
          >
            {{ isSubmitting ? 'Placing...' : 'Place Desk on Floor Plan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Workplace Admin Management Drawer / Modal -->
    <div
      v-if="isAdminModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 class="font-extrabold text-xl">Workplace Administration</h3>
            <p class="text-xs text-slate-400 mt-0.5">Manage office buildings, floors, floor plan images, and desk positions</p>
          </div>
          <button @click="isAdminModalOpen = false" class="text-slate-400 hover:text-white text-2xl font-bold p-1 leading-none">&times;</button>
        </div>

        <!-- Admin Tabs -->
        <div class="flex border-b border-slate-200 bg-slate-50 px-6 text-xs font-bold text-slate-600">
          <button
            @click="adminTab = 'desks'"
            class="py-3 px-4 border-b-2 transition-all cursor-pointer"
            :class="adminTab === 'desks' ? 'border-indigo-600 text-indigo-600 bg-white font-extrabold' : 'border-transparent hover:text-slate-900'"
          >
            🪑 Desks & Alignment ({{ desks.length }})
          </button>
          <button
            @click="adminTab = 'floorplan'"
            class="py-3 px-4 border-b-2 transition-all cursor-pointer"
            :class="adminTab === 'floorplan' ? 'border-indigo-600 text-indigo-600 bg-white font-extrabold' : 'border-transparent hover:text-slate-900'"
          >
            🗺️ Upload / Change Floor Plan
          </button>
          <button
            @click="adminTab = 'buildings'"
            class="py-3 px-4 border-b-2 transition-all cursor-pointer"
            :class="adminTab === 'buildings' ? 'border-indigo-600 text-indigo-600 bg-white font-extrabold' : 'border-transparent hover:text-slate-900'"
          >
            🏢 Buildings & Floors
          </button>
          <button
            @click="adminTab = 'company'"
            class="py-3 px-4 border-b-2 transition-all cursor-pointer"
            :class="adminTab === 'company' ? 'border-indigo-600 text-indigo-600 bg-white font-extrabold' : 'border-transparent hover:text-slate-900'"
          >
            🏛️ Organization
          </button>
          <button
            v-if="authStore.isAdmin"
            @click="adminTab = 'roles'"
            class="py-3 px-4 border-b-2 transition-all cursor-pointer"
            :class="adminTab === 'roles' ? 'border-indigo-600 text-indigo-600 bg-white font-extrabold' : 'border-transparent hover:text-slate-900'"
          >
            👥 Access & Roles
          </button>
        </div>

        <!-- Modal Body Content -->
        <div class="p-6 overflow-y-auto space-y-4 text-sm flex-1">
          <!-- TAB 1: Desks Management -->
          <div v-if="adminTab === 'desks'" class="space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
              <span class="text-xs font-bold text-slate-600 uppercase tracking-wider">Desks on Current Floor</span>
              <button
                @click="isAdminModalOpen = false; isPlacementMode = true;"
                class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                📍 Click Canvas to Drop Desk
              </button>
            </div>

            <div class="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
              <div
                v-for="desk in desks"
                :key="desk.id"
                class="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl transition-colors"
              >
                <div class="space-y-0.5">
                  <div class="flex items-center space-x-2">
                    <span class="font-mono font-bold text-slate-900 text-xs px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">{{ desk.code }}</span>
                    <span class="font-semibold text-slate-800 text-xs">{{ desk.label }}</span>
                    <span
                      v-if="desk.needsPositionReview"
                      class="px-2 py-0.5 bg-rose-100 text-rose-700 font-bold text-[10px] rounded-full border border-rose-200 animate-pulse"
                    >
                      ⚠️ Needs Review
                    </span>
                  </div>
                  <p class="text-[11px] text-slate-500">
                    Type: <span class="capitalize font-medium">{{ desk.deskType.toLowerCase() }}</span> | Position: {{ desk.xCoordinatePct }}% X, {{ desk.yCoordinatePct }}% Y
                  </p>
                </div>

                <div class="flex items-center space-x-2">
                  <button
                    v-if="desk.needsPositionReview"
                    @click="startRepositioning(desk)"
                    class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
                    title="Reposition desk marker on current floor plan"
                  >
                    📐 Reposition
                  </button>
                  <button
                    v-if="desk.needsPositionReview"
                    @click="handleAcknowledgeReview(desk.id, desk.code)"
                    class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
                    title="Acknowledge desk alignment against current floor plan"
                  >
                    ✓ Confirm Alignment
                  </button>
                  <button
                    @click="handleDeleteDesk(desk.id, desk.code)"
                    class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div v-if="desks.length === 0" class="py-8 text-center text-slate-400 text-xs">
                No desks placed on this floor yet. Click "Drop Desk" to start placing.
              </div>
            </div>
          </div>

          <!-- TAB 2: Floor Plan Upload / Change -->
          <div v-if="adminTab === 'floorplan'" class="space-y-4">
            <div class="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-xs text-indigo-950 leading-relaxed">
              <strong>Floor Plan & Desk Binding:</strong> Floor plans are bound directly to each individual floor. Desks are tied to their active plan version so switching or uploading new plans keeps layouts clean and isolated.
            </div>

            <!-- Target Floor Selector -->
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div class="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Target Floor to Configure:
                </span>
                <span
                  v-if="currentFloor?.activeFloorPlanPath"
                  class="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold text-[10px]"
                >
                  ✓ {{ getPlanLabel(currentFloor.activeFloorPlanPath) }}
                </span>
                <span
                  v-else
                  class="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold text-[10px]"
                >
                  ⚠️ No Plan Attached
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-if="buildings.length > 0">
                  <label class="block text-[11px] font-semibold text-slate-500 mb-1">Building:</label>
                  <select
                    v-model="selectedBuildingId"
                    class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option v-for="b in buildings" :key="b.id" :value="b.id">
                      {{ b.name }}
                    </option>
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-semibold text-slate-500 mb-1">Floor:</label>
                  <select
                    v-model="selectedFloorId"
                    class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option v-for="f in floors" :key="f.id" :value="f.id">
                      Floor {{ f.floorNumber }}: {{ f.name }}
                    </option>
                    <option v-if="floors.length === 0" value="">
                      No floors available in this building
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div v-if="!selectedFloorId" class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
              <span>⚠️ No floor currently selected. Please select a floor or create one in <strong>Buildings & Floors</strong> before uploading a plan.</span>
              <button
                @click="adminTab = 'buildings'"
                class="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                Go to Buildings & Floors
              </button>
            </div>

            <!-- Existing Floor Plans for this floor -->
            <div v-if="selectedFloorId && floorPlans.length > 0" class="space-y-2">
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Attached Floor Plans for Floor {{ currentFloor?.floorNumber }} ({{ floorPlans.length }})
              </label>
              <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div
                  v-for="plan in floorPlans"
                  :key="plan.id"
                  class="p-3 rounded-2xl border transition-all flex items-center justify-between"
                  :class="plan.isActive ? 'border-emerald-500/40 bg-emerald-50/20 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'"
                >
                  <div class="space-y-0.5">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-bold text-slate-800">{{ getPlanDisplayName(plan) }}</span>
                      <span
                        v-if="plan.isActive"
                        class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300"
                      >
                        Active
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono truncate max-w-xs">
                      {{ plan.filePath.startsWith('data:') ? 'Custom Uploaded Image' : plan.filePath }}
                    </div>
                  </div>

                  <div class="flex items-center space-x-2">
                    <button
                      v-if="!plan.isActive"
                      @click="handleSwitchFloorPlan(plan.id)"
                      class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Activate
                    </button>
                    <button
                      @click="handleDeleteFloorPlan(plan.id, getPlanDisplayName(plan))"
                      class="text-rose-500 hover:text-rose-700 p-1.5 text-xs font-bold rounded-lg hover:bg-rose-50 cursor-pointer"
                      title="Delete floor plan and its desks"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty indicator when no floor plan is attached to this floor -->
            <div v-else-if="selectedFloorId" class="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed flex items-center space-x-3">
              <span class="text-xl">⚠️</span>
              <div>
                <strong>No floor plan attached to Floor {{ currentFloor?.floorNumber }}: {{ currentFloor?.name }}.</strong>
                <p class="text-[11px] text-amber-700 mt-0.5">Desks cannot be placed until a floor plan is bound. Select a preset, pick from library, or upload a custom image below.</p>
              </div>
            </div>

            <!-- Existing Workplace Plans Library (available to bind) -->
            <div v-if="selectedFloorId && libraryPlans.length > 0" class="space-y-2 border-t border-slate-200 pt-3">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Workplace Floor Plan Library
                </label>
                <span class="text-[11px] text-slate-500">Previously uploaded layouts across workplace</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                <div
                  v-for="libPlan in libraryPlans"
                  :key="libPlan.id"
                  class="p-2.5 border rounded-xl bg-white hover:bg-slate-50 flex items-center justify-between border-slate-200"
                >
                  <div class="space-y-0.5 truncate mr-2">
                    <div class="font-bold text-xs text-slate-800 truncate">{{ getPlanDisplayName(libPlan) }}</div>
                    <div class="text-[10px] text-slate-500 font-mono truncate">
                      {{ libPlan.filePath.startsWith('data:') ? 'Custom Upload' : libPlan.filePath }}
                    </div>
                  </div>
                  <button
                    type="button"
                    @click="handleBindExistingPlan(libPlan)"
                    class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all"
                    title="Bind this layout to target floor"
                  >
                    Bind to Floor
                  </button>
                </div>
              </div>
            </div>

            <!-- Upload New Floor Plan Form -->
            <div v-if="selectedFloorId" class="border-t border-slate-200 pt-3 space-y-3">
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Upload New Floor Plan Layout
              </label>

              <!-- Presets -->
              <div>
                <label class="block text-[11px] font-semibold text-slate-500 mb-1">Preset Floor Plan Diagrams:</label>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    @click="uploadPlanPath = `${baseUrl}floorplan-office.jpg`; uploadPlanMimeType = 'image/jpeg'; uploadedFileName = '';"
                    class="p-3 border rounded-2xl text-left transition-all cursor-pointer"
                    :class="uploadPlanPath.includes('floorplan-office') ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'"
                  >
                    <div class="font-bold text-xs text-slate-800">🏢 Architectural CAD Plan</div>
                    <div class="text-[11px] text-slate-500 mt-0.5">Realistic 2D office layout</div>
                  </button>
                  <button
                    type="button"
                    @click="uploadPlanPath = `${baseUrl}demo-floorplan.svg`; uploadPlanMimeType = 'image/svg+xml'; uploadedFileName = '';"
                    class="p-3 border rounded-2xl text-left transition-all cursor-pointer"
                    :class="uploadPlanPath.includes('demo-floorplan') ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'"
                  >
                    <div class="font-bold text-xs text-slate-800">📐 Vector Blueprint SVG</div>
                    <div class="text-[11px] text-slate-500 mt-0.5">Clean blueprint layout</div>
                  </button>
                </div>
              </div>

              <!-- File Upload with Thumbnail Badge -->
              <div>
                <label class="block text-[11px] font-semibold text-slate-500 mb-1">
                  Or Upload Custom Image from Computer (PNG, JPG, SVG, WebP):
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/svg,image/webp"
                  @change="handleFileUpload"
                  class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
                <!-- Selected File Preview Badge -->
                <div v-if="uploadedFileName" class="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 animate-in fade-in duration-150">
                  <div class="flex items-center space-x-2 truncate">
                    <span class="text-base">🖼️</span>
                    <span class="font-bold truncate">{{ uploadedFileName }}</span>
                    <span class="text-[10px] text-emerald-600">({{ uploadedFileSize }})</span>
                  </div>
                  <button
                    type="button"
                    @click="uploadPlanPath = ''; uploadedFileName = ''; uploadedFileSize = '';"
                    class="text-slate-400 hover:text-slate-600 font-bold ml-2 text-sm cursor-pointer"
                    title="Remove selected file"
                  >
                    &times;
                  </button>
                </div>
              </div>

              <!-- Custom URL or Path -->
              <div>
                <label class="block text-[11px] font-semibold text-slate-500 mb-1">Or Enter Custom Image URL or Path:</label>
                <input
                  v-model="uploadPlanPath"
                  type="text"
                  placeholder="/seats/your-floorplan.png or https://..."
                  class="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <!-- Submit Button -->
              <div class="pt-2">
                <button
                  @click="handleSaveFloorPlan"
                  :disabled="isUploadingPlan || !uploadPlanPath.trim() || !selectedFloorId"
                  class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {{ isUploadingPlan ? 'Saving and Binding...' : `Upload & Bind Floor Plan to Floor ${currentFloor?.floorNumber || ''}` }}
                </button>
              </div>
            </div>
          </div>

          <!-- TAB 3: Buildings & Floors -->
          <div v-if="adminTab === 'buildings'" class="space-y-6">
            <!-- Buildings Section -->
            <div class="space-y-3">
              <div class="flex items-center justify-between pb-1 border-b border-slate-200">
                <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">🏢 Buildings ({{ buildings.length }})</span>
                <span class="text-[11px] text-slate-500">Select a building to view & manage its floors</span>
              </div>

              <!-- List of Existing Buildings -->
              <div v-if="buildings.length > 0" class="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div
                  v-for="bldg in buildings"
                  :key="bldg.id"
                  class="p-3 rounded-2xl border transition-all flex items-center justify-between"
                  :class="selectedBuildingId === bldg.id ? 'border-indigo-600 bg-indigo-50/60 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'"
                >
                  <div class="cursor-pointer flex-1" @click="selectedBuildingId = bldg.id">
                    <div class="flex items-center space-x-2">
                      <span class="font-bold text-xs text-slate-900">{{ bldg.name }}</span>
                      <span
                        v-if="selectedBuildingId === bldg.id"
                        class="px-2 py-0.5 bg-indigo-600 text-white font-bold text-[10px] rounded-full"
                      >
                        Selected
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-0.5">
                      {{ bldg.address || 'No address specified' }} · {{ bldg.timezone || 'UTC' }}
                    </p>
                  </div>

                  <div class="flex items-center space-x-2 ml-3">
                    <button
                      v-if="selectedBuildingId !== bldg.id"
                      type="button"
                      @click="selectedBuildingId = bldg.id"
                      class="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all cursor-pointer"
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      @click="handleDeleteBuilding(bldg.id, bldg.name)"
                      class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                      title="Delete building and all associated floors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div v-else class="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                No buildings created yet. Use the form below to add your first building.
              </div>

              <!-- Add New Building Form -->
              <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700">+ Add New Building</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    v-model="newBuildingName"
                    type="text"
                    placeholder="Building Name (e.g. West Campus)"
                    class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                  <input
                    v-model="newBuildingAddress"
                    type="text"
                    placeholder="Address (e.g. 500 Market St)"
                    class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div class="flex justify-end">
                  <button
                    @click="handleCreateBuilding"
                    :disabled="isCreatingBuilding || !newBuildingName.trim()"
                    class="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    {{ isCreatingBuilding ? 'Creating...' : '+ Create Building' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Floors Section -->
            <div class="space-y-3 pt-2 border-t border-slate-200">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100">
                <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  📑 Floors in {{ currentBuilding?.name || 'Selected Building' }} ({{ floors.length }})
                </span>
                <!-- Building selector dropdown for floor management -->
                <div class="flex items-center space-x-2" v-if="buildings.length > 0">
                  <label class="text-xs text-slate-500 font-medium">Target Building:</label>
                  <select
                    v-model="selectedBuildingId"
                    class="px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option v-for="b in buildings" :key="b.id" :value="b.id">
                      {{ b.name }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- List of Existing Floors -->
              <div v-if="floors.length > 0" class="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div
                  v-for="floor in floors"
                  :key="floor.id"
                  class="p-3 rounded-2xl border transition-all flex items-center justify-between"
                  :class="selectedFloorId === floor.id ? 'border-indigo-600 bg-indigo-50/60 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'"
                >
                  <div class="cursor-pointer flex-1" @click="selectedFloorId = floor.id">
                    <div class="flex items-center space-x-2">
                      <span class="font-bold text-xs text-slate-900">Floor {{ floor.floorNumber }}: {{ floor.name }}</span>
                      <span
                        v-if="selectedFloorId === floor.id"
                        class="px-2 py-0.5 bg-indigo-600 text-white font-bold text-[10px] rounded-full"
                      >
                        Selected
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-0.5">
                      <span v-if="floor.activeFloorPlanPath" class="text-emerald-600 font-medium">✓ {{ getPlanLabel(floor.activeFloorPlanPath) }} attached</span>
                      <span v-else class="text-amber-600 font-medium">⚠️ No floor plan attached</span>
                    </p>
                  </div>

                  <div class="flex items-center space-x-2 ml-3">
                    <button
                      type="button"
                      @click="selectedFloorId = floor.id; adminTab = 'floorplan'"
                      class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                    >
                      Floor Plan
                    </button>
                    <button
                      type="button"
                      @click="handleDeleteFloor(floor.id, floor.name)"
                      class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                      title="Delete floor, floor plan, and desks"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div v-else class="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                <span v-if="selectedBuildingId">
                  No floors added to "{{ currentBuilding?.name }}" yet. Use the form below to create a floor.
                </span>
                <span v-else>
                  Please create or select a building first before adding floors.
                </span>
              </div>

              <!-- Add Floor Form -->
              <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700">
                  + Add Floor to {{ currentBuilding?.name || 'Building' }}
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    v-model="newFloorName"
                    type="text"
                    placeholder="Floor Name (e.g. Floor 2 Marketing)"
                    class="sm:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                  <input
                    v-model="newFloorNumber"
                    type="number"
                    min="1"
                    placeholder="Floor Number"
                    class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div class="flex justify-end">
                  <button
                    @click="handleCreateFloor"
                    :disabled="isCreatingFloor || !newFloorName.trim() || !selectedBuildingId"
                    class="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    {{ isCreatingFloor ? 'Creating...' : '+ Create Floor' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 4: Organization -->
          <div v-if="adminTab === 'company'" class="space-y-4">
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700">Organization Info</h4>
              <div v-for="comp in companies" :key="comp.id" class="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <div class="font-bold text-xs text-slate-900">{{ comp.name }}</div>
                  <div class="font-mono text-[10px] text-slate-400">ID: {{ comp.id }}</div>
                </div>
                <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">Active</span>
              </div>
              <div v-if="companies.length === 0" class="text-xs text-slate-500">
                Acme Tech Corporation (Default System Organization)
              </div>
            </div>

            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700">Add Subsidiary Organization</h4>
              <div class="flex space-x-2">
                <input
                  v-model="newCompanyName"
                  type="text"
                  placeholder="Subsidiary Name (e.g. Acme Labs Ltd)"
                  class="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
                <button
                  @click="handleCreateCompany"
                  :disabled="isCreatingCompany || !newCompanyName.trim()"
                  class="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  Add
                </button>
              </div>
            </div>

            <!-- Purge Evaluation Demo Data -->
            <div class="p-4 bg-rose-50 rounded-2xl border border-rose-200 space-y-2">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 class="font-bold text-xs uppercase tracking-wider text-rose-800">Clean Evaluation Sandbox Data</h4>
                  <p class="text-[11px] text-rose-600">Remove any legacy demo companies (Acme Tech HQ), sample buildings, floors, and demo desks from your database.</p>
                </div>
                <button
                  @click="handlePurgeDemoData"
                  class="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all whitespace-nowrap cursor-pointer"
                >
                  🧹 Purge Demo Data
                </button>
              </div>
            </div>
          </div>

          <!-- TAB 5: Access & Roles (Admin Only) -->
          <div v-if="adminTab === 'roles'" class="space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700">User Access & Role Assignments</h4>
                <p class="text-[11px] text-slate-500">Assign system roles and building-scoped permissions to users.</p>
              </div>
              <button
                @click="loadUsers"
                :disabled="isLoadingUsers"
                class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all"
              >
                {{ isLoadingUsers ? 'Refreshing...' : '↻ Refresh' }}
              </button>
            </div>

            <div v-if="isLoadingUsers" class="p-8 text-center text-xs text-slate-400">
              Loading users and role assignments...
            </div>

            <div v-else-if="userList.length === 0" class="p-8 text-center text-xs text-slate-400">
              No users found.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="user in userList"
                :key="user.id"
                class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3"
              >
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div class="flex items-center space-x-2">
                      <span class="font-bold text-sm text-slate-900">{{ user.fullName }}</span>
                      <span v-if="user.isRecoveryAdmin" class="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                        Break-Glass Recovery Admin
                      </span>
                    </div>
                    <div class="text-xs text-slate-500">{{ user.email }}</div>
                  </div>

                  <div v-if="editingUserId !== user.id">
                    <button
                      @click="startEditUserRoles(user)"
                      class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      ✏️ Edit Roles & Scopes
                    </button>
                  </div>
                </div>

                <!-- Display Role Badges when not editing -->
                <div v-if="editingUserId !== user.id" class="flex flex-wrap gap-2 pt-1 border-t border-slate-200/60">
                  <div
                    v-for="(assign, idx) in user.roles"
                    :key="idx"
                    class="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                  >
                    <span
                      class="font-bold"
                      :class="{
                        'text-purple-700': assign.roleName === 'SYSTEM_ADMIN',
                        'text-blue-700': assign.roleName === 'BUILDING_MANAGER',
                        'text-slate-700': assign.roleName === 'EMPLOYEE'
                      }"
                    >
                      {{ assign.roleName === 'SYSTEM_ADMIN' ? '🛡️ System Admin' : assign.roleName === 'BUILDING_MANAGER' ? '🏢 Building Manager' : '👤 Employee' }}
                    </span>
                    <span v-if="assign.buildingScopeId" class="text-slate-400 text-[11px]">
                      ({{ assign.buildingName || buildings.find(b => b.id === assign.buildingScopeId)?.name || 'Unknown Building' }})
                    </span>
                    <span v-else-if="assign.roleName === 'BUILDING_MANAGER'" class="text-amber-600 text-[11px] font-semibold">
                      (No building scope assigned)
                    </span>
                  </div>
                </div>

                <!-- Role Editor Form when editing -->
                <div v-else class="pt-3 border-t border-slate-200 space-y-3 bg-white p-3.5 rounded-xl border">
                  <div class="text-xs font-bold text-slate-700">Edit Role Assignments for {{ user.fullName }}:</div>

                  <div v-if="user.isRecoveryAdmin" class="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ℹ️ This is the system break-glass recovery administrator. System Administrator role is mandatory and cannot be removed.
                  </div>

                  <div class="space-y-2">
                    <div
                      v-for="(assign, aIdx) in editAssignments"
                      :key="aIdx"
                      class="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <select
                        v-model="assign.roleName"
                        class="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
                        :disabled="user.isRecoveryAdmin && assign.roleName === 'SYSTEM_ADMIN'"
                      >
                        <option value="EMPLOYEE">👤 EMPLOYEE</option>
                        <option value="BUILDING_MANAGER">🏢 BUILDING_MANAGER</option>
                        <option value="SYSTEM_ADMIN">🛡️ SYSTEM_ADMIN</option>
                      </select>

                      <!-- Building Scope Selector for BUILDING_MANAGER -->
                      <div v-if="assign.roleName === 'BUILDING_MANAGER'" class="flex items-center gap-1 flex-1">
                        <span class="text-[11px] text-slate-500 font-medium">Scope:</span>
                        <select
                          v-model="assign.buildingScopeId"
                          class="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                        >
                          <option :value="undefined" disabled>-- Select Building --</option>
                          <option v-for="b in buildings" :key="b.id" :value="b.id">
                            {{ b.name }}
                          </option>
                        </select>
                      </div>

                      <div v-else class="flex-1 text-[11px] text-slate-400 italic">
                        {{ assign.roleName === 'SYSTEM_ADMIN' ? 'Global organization-wide access' : 'General seat booking access' }}
                      </div>

                      <button
                        type="button"
                        @click="removeAssignment(aIdx)"
                        :disabled="user.isRecoveryAdmin && assign.roleName === 'SYSTEM_ADMIN'"
                        class="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-30 p-1 font-bold"
                        title="Remove role"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      @click="addAssignment"
                      class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all"
                    >
                      + Add Role / Scope
                    </button>

                    <div class="flex items-center space-x-2">
                      <button
                        type="button"
                        @click="cancelEditUserRoles"
                        class="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        @click="saveUserRoles(user.id)"
                        :disabled="isSavingRoles"
                        class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                      >
                        {{ isSavingRoles ? 'Saving...' : 'Save Roles' }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            @click="isAdminModalOpen = false"
            class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- My Reservations Modal -->
    <div
      v-if="isMyReservationsModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="flex justify-between items-center px-6 py-5 border-b border-slate-100">
          <div>
            <h3 class="font-extrabold text-xl text-slate-900">My Reservations</h3>
            <p class="text-xs text-slate-500 font-medium mt-0.5">
              Review and manage your personal and guest seat bookings
            </p>
          </div>
          <button
            @click="isMyReservationsModalOpen = false"
            class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto space-y-3 flex-1">
          <div v-if="isLoadingMyReservations" class="py-12 text-center text-slate-500 text-xs">
            <span class="animate-spin inline-block mr-2">⏳</span> Loading reservations...
          </div>

          <div v-else-if="myReservations.length === 0" class="py-12 text-center text-slate-400 text-xs">
            <div class="text-3xl mb-2">📅</div>
            <p class="font-bold text-slate-700">No Reservations Found</p>
            <p class="mt-1">You haven't booked any desks yet. Select a desk on the floor plan to make a reservation.</p>
          </div>

          <div
            v-else
            v-for="res in myReservations"
            :key="res.id"
            class="p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            :class="res.status === 'CONFIRMED' ? 'border-slate-200 bg-white hover:border-slate-300 shadow-xs' : 'border-slate-100 bg-slate-50/60 opacity-60'"
          >
            <div class="space-y-1">
              <div class="flex items-center space-x-2">
                <span class="font-mono font-bold text-slate-900 text-sm px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                  {{ res.deskCode }}
                </span>
                <span class="font-bold text-slate-800 text-sm">{{ res.deskLabel || res.deskCode }}</span>
                <span
                  class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
                  :class="res.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'"
                >
                  {{ res.status }}
                </span>
                <span
                  v-if="res.isGuest"
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800"
                >
                  Guest Booking
                </span>
              </div>

              <div class="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>📍 {{ res.buildingName }} · {{ res.floorName }}</span>
                <span>📅 {{ res.reservationDate }}</span>
                <span v-if="res.isGuest && res.guestName">👤 Guest: {{ res.guestName }}</span>
              </div>
            </div>

            <div class="flex items-center justify-end">
              <button
                v-if="res.status === 'CONFIRMED'"
                @click="handleCancelMyReservation(res)"
                class="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel Booking
              </button>
              <span v-else class="text-xs text-slate-400 italic">
                Cancelled
              </span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            @click="isMyReservationsModalOpen = false"
            class="px-5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Guided Walkthrough Modal -->
    <GuidedTourModal v-model="showTour" />
  </div>
</template>

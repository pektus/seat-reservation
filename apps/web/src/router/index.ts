import { createRouter, createWebHistory } from 'vue-router';
import FloorPlanView from '../views/FloorPlanView.vue';
import SetupView from '../views/SetupView.vue';
import LoginView from '../views/LoginView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'floorplan',
      component: FloorPlanView
    },
    {
      path: '/setup',
      name: 'setup',
      component: SetupView
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    }
  ]
});

export default router;


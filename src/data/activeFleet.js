// Active Fleet Definition — Single Source of Truth
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Change the active fleet here, and the entire application (UI, Map, Counters, Worker, Simulation)
// will automatically adapt to the exact number of ambulances without any hardcoded counts.

import { INITIAL_17_FLEET } from './initial17Fleet.js';

// Currently active fleet: Exactly 17 ambulances across Purvanchal (Basti, Sant Kabir Nagar, Siddharthnagar)
export const ACTIVE_FLEET = INITIAL_17_FLEET;
export const INITIAL_FLEET = ACTIVE_FLEET;

export default ACTIVE_FLEET;

// Active Fleet Definition — Single Source of Truth
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Change the active fleet here, and the entire application (UI, Map, Counters, Worker, Simulation)
// will automatically adapt to the exact number of ambulances without any hardcoded counts.

import { INITIAL_17_FLEET } from './initial17Fleet.js';

// 10 Distinct Ambulances distributed across Purvanchal:
// - Basti District: AMB-01 (Harraiya), AMB-02 (Rudhauli), AMB-05 (Kalwari), AMB-06 (Gaur Bazar)
// - Sant Kabir Nagar District: AMB-07 (Baghnagar), AMB-08 (Maghar), AMB-11 (Mehdawal), AMB-12 (Dhanghata)
// - Siddharthnagar District: AMB-13 (Naugarh Sadar), AMB-14 (Bansi Nagar)
export const ACTIVE_10_FLEET = INITIAL_17_FLEET.filter((v) => [
  'AMB-01', 'AMB-02', 'AMB-05', 'AMB-06', 'AMB-07',
  'AMB-08', 'AMB-11', 'AMB-12', 'AMB-13', 'AMB-14'
].includes(v.id));

export const ACTIVE_FLEET = ACTIVE_10_FLEET;
export const INITIAL_FLEET = ACTIVE_FLEET;

export default ACTIVE_FLEET;

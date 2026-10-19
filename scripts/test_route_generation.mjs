import { INITIAL_17_FLEET } from '../src/data/initial17Fleet.js';
import { getDeliveryRouteSplit } from '../src/utils/roadDistance.js';
import { simulateFleetAtTime } from '../src/utils/fleetSimulation.js';

const now = Date.now();
const simulatedVehicles = simulateFleetAtTime(INITIAL_17_FLEET, now);

console.log('Simulated vehicles count:', simulatedVehicles.length);

simulatedVehicles.forEach((v, idx) => {
  const split = getDeliveryRouteSplit(v);
  console.log(`Veh ${v.id} (${v.villageBadge || v.villageName}): upcomingRoute length = ${split.upcomingRoute?.length}, roadDist = ${split.roadDistFromBaseKm}, corridor = ${split.corridorName}`);
  if (!split.upcomingRoute || split.upcomingRoute.length < 2) {
    console.log(`  -> EMPTY ROUTE for ${v.id}! Status: ${v.status}, Pos: [${v.lon}, ${v.lat}]`);
  }
});

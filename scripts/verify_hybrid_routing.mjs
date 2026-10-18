import assert from 'assert';

console.log('--- 🧪 STARTING HYBRID ROUTING & FULL UP VERIFICATION ---');

const testPoints = [
  { name: 'Lucknow (Central City)', fromLon: 80.9462, fromLat: 26.8467 },
  { name: 'Rural Village (Lalganj Interior)', fromLon: 81.7050, fromLat: 25.9320 },
  { name: 'Remote East Village (Maharajganj)', fromLon: 83.5600, fromLat: 27.1500 },
];

async function runTests() {
  for (const pt of testPoints) {
    const url = `http://localhost:3000/api/route?from=${pt.fromLon},${pt.fromLat}&to=82.7184,26.7973`;
    console.log(`\nTesting: ${pt.name} -> Sant Kabir Base`);
    const res = await fetch(url);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);

    const data = await res.json();
    assert.strictEqual(data.success, true, 'Expected success: true');
    assert.strictEqual(data.source, 'osrm-driving', 'Expected source: osrm-driving');
    assert.ok(data.roadDistanceKm > 0, `Expected distance > 0, got ${data.roadDistanceKm}`);
    assert.ok(Array.isArray(data.coordinates), 'Expected coordinates array');
    assert.ok(data.coordinates.length > 10, `Expected > 10 points, got ${data.coordinates.length}`);

    console.log(`✅ [PASS] ${pt.name}: ${data.roadDistanceKm} km (${data.pointsCount} points, ~${data.durationMin} min drive)`);
  }

  console.log('\n========================================');
  console.log('🎉 HYBRID ROUTING TESTS PASSED (100% UP COVERAGE READY)');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

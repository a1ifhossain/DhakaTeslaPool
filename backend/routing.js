const { areas } = require('./domain');
const areaOrder = Object.keys(areas);

const routeCache = new Map();
const routingBaseUrl =
  process.env.ROUTING_BASE_URL || 'https://router.project-osrm.org/route/v1/driving';

async function routeBetween(from, to) {
  const start = areas[from];
  const end = areas[to];
  if (!start || !end || from === to) {
    throw new Error('Choose two different supported Dhaka areas.');
  }

  const key = `${from}\u0000${to}`;
  if (routeCache.has(key)) return routeCache.get(key);

  const request = (async () => {
    const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
    const url = `${routingBaseUrl}/${coordinates}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Routing service unavailable.');

    const data = await response.json();
    const route = data.code === 'Ok' ? data.routes?.[0] : null;
    if (!route || !Number.isFinite(route.distance) || !route.geometry?.coordinates?.length) {
      throw new Error('No driving route found for these areas.');
    }

    return {
      distanceMeters: Math.round(route.distance),
      coordinates: route.geometry.coordinates,
    };
  })();

  routeCache.set(key, request);
  try {
    return await request;
  } catch (error) {
    routeCache.delete(key);
    throw error;
  }
}

function bestSharedStopOrder(trips, capacity) {
  if (trips.length !== 2) return null;
  const indexedTrips = trips.map((trip, rideIndex) => ({
    ...trip,
    rideIndex,
    pickupIndex: areaOrder.indexOf(trip.pickup),
    destinationIndex: areaOrder.indexOf(trip.destination),
  }));
  if (indexedTrips.some((trip) => trip.pickupIndex < 0 || trip.destinationIndex < 0)) return null;

  const [first, second] = indexedTrips;
  const firstDirection = Math.sign(first.destinationIndex - first.pickupIndex);
  const secondDirection = Math.sign(second.destinationIndex - second.pickupIndex);
  if (!firstDirection || firstDirection !== secondDirection) return null;

  const overlapStart = Math.max(
    Math.min(first.pickupIndex, first.destinationIndex),
    Math.min(second.pickupIndex, second.destinationIndex),
  );
  const overlapEnd = Math.min(
    Math.max(first.pickupIndex, first.destinationIndex),
    Math.max(second.pickupIndex, second.destinationIndex),
  );
  if (overlapEnd <= overlapStart || first.seats + second.seats > capacity) return null;

  const stops = indexedTrips.flatMap((trip) => [
    { area: trip.pickup, position: trip.pickupIndex, kind: 'pickup', rideIndex: trip.rideIndex },
    {
      area: trip.destination,
      position: trip.destinationIndex,
      kind: 'dropoff',
      rideIndex: trip.rideIndex,
    },
  ]);
  stops.sort((a, b) => {
    const progress = (a.position - b.position) * firstDirection;
    if (progress) return progress;
    if (a.kind !== b.kind) return a.kind === 'dropoff' ? -1 : 1;
    return a.rideIndex - b.rideIndex;
  });
  return stops;
}

module.exports = { routeBetween, bestSharedStopOrder };

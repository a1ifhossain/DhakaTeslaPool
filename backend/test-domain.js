const test = require('node:test');
const assert = require('node:assert/strict');
const {
  areas,
  MAX_PASSENGER_SEATS,
  MAX_POOL_REQUESTS,
  farePaisa,
  hasCapacity,
  canTransition,
  canCancel,
  validateSignup,
} = require('./domain');
const { bestSharedStopOrder } = require('./routing');

test('Dhaka areas follow the requested route order', () => {
  assert.deepEqual(Object.keys(areas), [
    'Uttara',
    'Mirpur',
    'Banani',
    'Gulshan',
    'Bashundhara',
    'Mohakhali',
    'Farmgate',
    'Dhanmondi',
  ]);
});

test('a vehicle has two passenger seats and a shared pool has at most two ride requests', () => {
  assert.equal(MAX_PASSENGER_SEATS, 2);
  assert.equal(MAX_POOL_REQUESTS, 2);
  assert.equal(hasCapacity(1, 1, 2), true);
  assert.equal(hasCapacity(1, 2, 2), false);
  assert.equal(hasCapacity(2, 1, 2), false);
});

test('routed fares are stored as integer paisa and share discount stays individual', () => {
  assert.equal(farePaisa(7531), 18556);
  assert.equal(farePaisa(3812), 11862);
  assert.equal(farePaisa(7239), 18030);
  assert.equal(farePaisa(3812, true), 9490);
  assert.equal(farePaisa(3812, false, 2), 23724);
  assert.equal(farePaisa(3812, false, 3), 35586);
});

test('the same Uttara-to-Mohakhali route can take two one-seat requests', () => {
  const plan = bestSharedStopOrder(
    [
      { pickup: 'Uttara', destination: 'Mohakhali', seats: 1 },
      { pickup: 'Uttara', destination: 'Mohakhali', seats: 1 },
    ],
    2,
  );
  assert.deepEqual(
    plan.map(({ area, kind }) => `${kind}:${area}`),
    ['pickup:Uttara', 'pickup:Uttara', 'dropoff:Mohakhali', 'dropoff:Mohakhali'],
  );
});

test('Uttara to Gulshan shares the ordered route with Mirpur to Gulshan', () => {
  assert.ok(
    bestSharedStopOrder(
      [
        { pickup: 'Uttara', destination: 'Gulshan', seats: 1 },
        { pickup: 'Mirpur', destination: 'Gulshan', seats: 1 },
      ],
      2,
    ),
  );
});

test('Uttara to Bashundhara shares a route section with Banani to Farmgate', () => {
  assert.ok(
    bestSharedStopOrder(
      [
        { pickup: 'Uttara', destination: 'Bashundhara', seats: 1 },
        { pickup: 'Banani', destination: 'Farmgate', seats: 1 },
      ],
      2,
    ),
  );
});

test('requests going in opposite directions or on disjoint route sections do not share', () => {
  assert.equal(
    bestSharedStopOrder(
      [
        { pickup: 'Farmgate', destination: 'Dhanmondi', seats: 1 },
        { pickup: 'Dhanmondi', destination: 'Mohakhali', seats: 1 },
      ],
      2,
    ),
    null,
  );
  assert.equal(
    bestSharedStopOrder(
      [
        { pickup: 'Uttara', destination: 'Mirpur', seats: 1 },
        { pickup: 'Banani', destination: 'Farmgate', seats: 1 },
      ],
      2,
    ),
    null,
  );
});

test('a shared pool is rejected when it exceeds the two passenger seats', () => {
  assert.equal(
    bestSharedStopOrder(
      [
        { pickup: 'Uttara', destination: 'Mohakhali', seats: 2 },
        { pickup: 'Mirpur', destination: 'Gulshan', seats: 1 },
      ],
      null,
      2,
    ),
    null,
  );
});

test('signup validation explains both supplied credential problems', () => {
  assert.deepEqual(validateSignup('Alif', 'alif@gmailcom', '12345678', 'PASSENGER'), [
    'Enter a valid email address, for example alif@gmail.com.',
    'Use a password with at least 10 characters.',
  ]);
  assert.deepEqual(validateSignup('Alif', 'alif@gmail.com', 'a-secure-password', 'DRIVER'), []);
});

test('driver lifecycle accepts only the next state transition', () => {
  assert.equal(canTransition('REQUESTED', 'accept'), true);
  assert.equal(canTransition('REQUESTED', 'start'), false);
  assert.equal(canTransition('MATCHED', 'arrive'), true);
  assert.equal(canTransition('COMPLETED', 'arrive'), false);
  assert.equal(canCancel('MATCHED'), true);
  assert.equal(canCancel('STARTED'), false);
});

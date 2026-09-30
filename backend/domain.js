const areas = {
  Uttara: [23.8759, 90.3795],
  Mirpur: [23.8223, 90.3654],
  Banani: [23.7937, 90.4066],
  Gulshan: [23.7872, 90.4153],
  Bashundhara: [23.8151, 90.4255],
  Mohakhali: [23.7806, 90.4001],
  Farmgate: [23.7578, 90.389],
  Dhanmondi: [23.7461, 90.3742],
};
const MAX_PASSENGER_SEATS = 2;
const MAX_POOL_REQUESTS = 2;
const nextStatus = {
  accept: ['REQUESTED', 'MATCHED'],
  arrive: ['MATCHED', 'DRIVER_ARRIVED'],
  start: ['DRIVER_ARRIVED', 'STARTED'],
  complete: ['STARTED', 'COMPLETED'],
};
function farePaisa(distanceMeters, shared = false, seats = 1) {
  if (!Number.isInteger(distanceMeters) || distanceMeters <= 0) {
    throw new Error('Route distance must be a positive whole number of meters.');
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
    throw new Error('Seat count must be between one and eight.');
  }
  const distanceChargePaisa = Math.round((distanceMeters / 1000) * 1800);
  const fullFarePaisa = 5000 + distanceChargePaisa;
  const perSeatPaisa = shared ? Math.round((fullFarePaisa * 80) / 100) : fullFarePaisa;
  return perSeatPaisa * seats;
}
function validateSignup(name, email, password, role) {
  const issues = [];
  if (name.length < 2 || name.length > 80) {
    issues.push('Enter a name between 2 and 80 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push('Enter a valid email address, for example alif@gmail.com.');
  }
  if (password.length < 10) {
    issues.push('Use a password with at least 10 characters.');
  }
  if (!['PASSENGER', 'DRIVER'].includes(role)) {
    issues.push('Choose Passenger or Driver as the account type.');
  }
  return issues;
}
function hasCapacity(occupied, seats, capacity) {
  return (
    Number.isInteger(occupied) &&
    Number.isInteger(seats) &&
    Number.isInteger(capacity) &&
    occupied >= 0 &&
    seats > 0 &&
    capacity > 0 &&
    occupied + seats <= capacity
  );
}
function canTransition(current, action) {
  return Boolean(nextStatus[action] && nextStatus[action][0] === current);
}
function canCancel(status) {
  return ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'].includes(status);
}
module.exports = {
  areas,
  MAX_PASSENGER_SEATS,
  MAX_POOL_REQUESTS,
  nextStatus,
  farePaisa,
  hasCapacity,
  canTransition,
  canCancel,
  validateSignup,
};

export const zonePoints = {
  Uttara: [23.8759, 90.3795],
  Mirpur: [23.8223, 90.3654],
  Banani: [23.7937, 90.4066],
  Gulshan: [23.7872, 90.4153],
  Bashundhara: [23.8151, 90.4255],
  Mohakhali: [23.7806, 90.4001],
  Farmgate: [23.7578, 90.389],
  Dhanmondi: [23.7461, 90.3742],
};
export const areas = Object.keys(zonePoints);
export function validateSignup(name, email, password, role) {
  const issues = [];
  if (name.trim().length < 2 || name.trim().length > 80) {
    issues.push('Enter a name between 2 and 80 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    issues.push('Enter a valid email, for example alif@gmail.com.');
  }
  if (password.length < 10) {
    issues.push('Use a password with at least 10 characters.');
  }
  if (!['PASSENGER', 'DRIVER'].includes(role)) {
    issues.push('Choose Passenger or Driver as the account type.');
  }
  return issues;
}
export const money = (p) => `৳${(Number(p || 0) / 100).toFixed(2)}`;

export const shortDate = (d) =>
  new Intl.DateTimeFormat('en-BD', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(d));

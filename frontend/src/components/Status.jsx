export default function Status({ status }) {
  const labels = {
    REQUESTED: 'Waiting for driver',
    MATCHED: 'Matched',
    DRIVER_ARRIVED: 'Driver arrived',
    STARTED: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return (
    <span className={'status ' + String(status).toLowerCase()}>
      <i />
      {labels[status] || status}
    </span>
  );
}

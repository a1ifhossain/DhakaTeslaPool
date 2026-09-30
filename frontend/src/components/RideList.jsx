import Status from './Status.jsx';
import { money, shortDate } from '../utils.js';

export default function RideList({ rides, cancel, busy }) {
  if (!rides.length)
    return (
      <div className="empty">
        <div className="empty-icon">↗</div>
        <b>No rides just yet</b>
        <p>Your next Dhaka story starts with a destination.</p>
      </div>
    );
  return (
    <div className="ride-list">
      {rides.map((r) => (
        <article className="ride-row" key={r.id}>
          <div className="ride-date">
            <b>{new Date(r.created_at).getDate()}</b>
            <small>
              {new Intl.DateTimeFormat('en', { month: 'short' })
                .format(new Date(r.created_at))
                .toUpperCase()}
            </small>
          </div>
          <div className="ride-route">
            <b>
              {r.pickup_zone}
              <span> → </span>
              {r.destination_zone}
            </b>
            <small>
              {shortDate(r.created_at)} · {r.seats} {r.seats === 1 ? 'seat' : 'seats'} ·{' '}
              {r.driver_name || 'Jashim · Bullet'}
              {r.history?.length
                ? ' · ' +
                  r.history
                    .map((e) =>
                      e.from === e.to && e.note?.toLowerCase().includes('fare')
                        ? 'fare updated'
                        : e.to.toLowerCase().replace('_', ' '),
                    )
                    .join(' → ')
                : ''}
            </small>
            {r.pool_route_plan?.length > 2 && (
              <small>
                Shared stops:{' '}
                {r.pool_route_plan.map((stop) => `${stop.kind}: ${stop.area}`).join(' → ')}
              </small>
            )}
          </div>
          <div className="ride-fare">
            <b>{money(r.fare_paisa)}</b>
            <small>YOUR SHARE</small>
          </div>
          <Status status={r.status} />
          {['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'].includes(r.status) && (
            <button className="cancel" disabled={busy} onClick={() => cancel(r.id)}>
              Cancel
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

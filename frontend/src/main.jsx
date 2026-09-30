import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import DriverList from './components/DriverList.jsx';
import RideList from './components/RideList.jsx';
import api from './api.js';
import { areas, money, validateSignup } from './utils.js';
const demo = {
  PASSENGER: { email: 'nusrat@teslapool.test', password: 'nusrat-ride' },
  DRIVER: { email: 'jashim@teslapool.test', password: 'bullet-driver' },
};
function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('user'));
    } catch {
      return null;
    }
  });
  const [page, setPage] = useState('Overview');
  const [rides, setRides] = useState([]);
  const [pools, setPools] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pickup, setPickup] = useState('Banani');
  const [dest, setDest] = useState('Mohakhali');
  const [seats, setSeats] = useState(1);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [fareEstimateError, setFareEstimateError] = useState('');
  const [driverOnline, setDriverOnline] = useState(true);
  const [payment, setPayment] = useState('CASH');
  const [loginRole, setLoginRole] = useState('PASSENGER');
  const [login, setLogin] = useState(demo.PASSENGER);
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [history, setHistory] = useState(false);
  const refresh = async () => {
    if (!user) return;
    try {
      if (user.role === 'PASSENGER') {
        const d = await api('/passenger/rides');
        setRides(d.rides || []);
      } else {
        const d = await api('/driver/pools');
        setPools(d.pools || []);
      }
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    refresh();
  }, [user]);
  useEffect(() => {
    if (user?.role !== 'DRIVER') return;
    api('/driver/status')
      .then((data) => setDriverOnline(data.active))
      .catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    if (user?.role !== 'PASSENGER') return;
    const controller = new AbortController();
    setFareEstimate(null);
    setFareEstimateError('');
    const query = new URLSearchParams({ pickup, destination: dest, seats: String(seats) });
    api(`/fare/estimate?${query}`, { signal: controller.signal })
      .then((estimate) => setFareEstimate(estimate))
      .catch((e) => {
        if (e.name !== 'AbortError') setFareEstimateError(e.message);
      });
    return () => controller.abort();
  }, [pickup, dest, seats, user]);
  const active = useMemo(
    () =>
      user?.role === 'DRIVER'
        ? pools.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status))
        : rides.filter((r) => !['COMPLETED', 'CANCELLED'].includes(r.status)),
    [pools, rides, user],
  );
  const signIn = async (e) => {
    e.preventDefault();
    setError('');
    if (registering) {
      const issues = validateSignup(
        login.name || '',
        login.email || '',
        login.password || '',
        loginRole,
      );
      if (issues.length) {
        setError(issues.join(' '));
        return;
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((login.email || '').trim())) {
        setError('Enter a valid email address, for example alif@gmail.com.');
        return;
      }
      if (!login.password) {
        setError('Enter your password to sign in.');
        return;
      }
    }
    setBusy(true);
    try {
      const d = await api(registering ? '/auth/signup' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...login, role: loginRole }),
      });
      sessionStorage.setItem('token', d.token);
      sessionStorage.setItem('user', JSON.stringify(d.user));
      setUser(d.user);
      setPage('Overview');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    setRides([]);
    setPools([]);
    setPage('Overview');
    setNotice('');
    setError('');
  };
  const toggleDriverOnline = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api('/driver/status', {
        method: 'POST',
        body: JSON.stringify({ active: !driverOnline }),
      });
      setDriverOnline(result.active);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const book = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const d = await api('/passenger/rides', {
        method: 'POST',
        body: JSON.stringify({
          pickup,
          destination: dest,
          seats: Number(seats),
          paymentMethod: payment,
        }),
      });
      setNotice(
        (d.matched
          ? 'You’re in! Another trip was already heading out from ' + pickup + '.'
          : 'Your ride request is on its way to Jashim.') +
          ' Estimated fare: ' +
          money(d.estimatePaisa) +
          ` for an estimated ${d.routeDistanceKm} km route.`,
      );
      setPage('My rides');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const doAction = async (pool, action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/driver/pools/${pool}/${action}`, { method: 'POST', body: '{}' });
      setNotice(
        `Pool ${action === 'accept' ? 'accepted' : action === 'arrive' ? 'marked arrived' : action === 'start' ? 'started' : 'completed'}.`,
      );
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id) => {
    setBusy(true);
    try {
      await api(`/passenger/rides/${id}/cancel`, { method: 'POST', body: '{}' });
      setNotice('Ride cancelled.');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!user)
    return (
      <div className="login-shell">
        <div className="login-art">
          <div className="brand brand-light">
            <span className="brand-mark">T</span>
            <span>
              TESLA<span className="brand-thin">POOL</span>
            </span>
          </div>
          <div className="login-copy">
            <div className="eyebrow">MADE FOR DHAKA MORNINGS</div>
            <h1>
              Same way.
              <br />
              <em>Better together.</em>
            </h1>
            <p>Find your seat, share the ride, and make the morning rush a little lighter.</p>
          </div>
          <div className="login-bottom">
            Banani <span>·</span> Gulshan <span>·</span> Mohakhali
          </div>
          <div className="glow-orb" />
        </div>
        <div className="login-panel">
          <form className="login-card" onSubmit={signIn} noValidate>
            <div className="eyebrow muted">YOUR CITY, IN SYNC</div>
            <h2>{registering ? 'Create your account' : 'Welcome back'}</h2>
            <p className="subtle">
              {registering
                ? loginRole === 'DRIVER'
                  ? 'Create a driver account and Bullet will be assigned to you.'
                  : 'A seat in the city is waiting.'
                : 'Sign in to plan your next ride.'}
            </p>
            <div className="role-switch-label">
              {registering ? 'CREATE ACCOUNT AS' : 'SIGN IN AS'}
            </div>
            <div className="role-switch">
              <button
                type="button"
                className={loginRole === 'PASSENGER' ? 'selected' : ''}
                onClick={() => {
                  setLoginRole('PASSENGER');
                  if (!registering) setLogin(demo.PASSENGER);
                  setError('');
                }}
              >
                Passenger
              </button>
              <button
                type="button"
                className={loginRole === 'DRIVER' ? 'selected' : ''}
                onClick={() => {
                  setLoginRole('DRIVER');
                  if (!registering) setLogin(demo.DRIVER);
                  setError('');
                }}
              >
                Driver
              </button>
            </div>
            {registering && (
              <label>
                Name
                <input
                  value={login.name || ''}
                  onChange={(e) => setLogin({ ...login, name: e.target.value })}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                value={login.email}
                onChange={(e) => setLogin({ ...login, email: e.target.value })}
                required
                autoComplete="email"
              />
              {registering && (
                <small className="field-hint">
                  Enter an address in the format name@example.com.
                </small>
              )}
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={login.password}
                  onChange={(e) => setLogin({ ...login, password: e.target.value })}
                  required
                  autoComplete={registering ? 'new-password' : 'current-password'}
                  aria-describedby={registering ? 'password-guidance' : undefined}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {registering && (
                <small className="field-hint" id="password-guidance">
                  Use at least 10 characters.
                </small>
              )}
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="btn dark full" disabled={busy}>
              {busy
                ? registering
                  ? 'Creating account…'
                  : 'Signing in…'
                : registering
                  ? 'Create account'
                  : 'Sign in'}{' '}
              <span>↗</span>
            </button>
            {!registering && (
              <div className="demo-note">
                Demo:{' '}
                {loginRole === 'PASSENGER'
                  ? 'nusrat@teslapool.test · nusrat-ride'
                  : 'jashim@teslapool.test · bullet-driver'}
              </div>
            )}
            <div className="demo-note">
              <button
                type="button"
                className="auth-toggle"
                onClick={() => {
                  setRegistering(!registering);
                  setError('');
                  setShowPassword(false);
                  setLoginRole('PASSENGER');
                  setLogin(registering ? demo.PASSENGER : { name: '', email: '', password: '' });
                }}
              >
                {registering
                  ? 'Already have an account? Sign in'
                  : 'New to TeslaPool? Create an account'}
              </button>
            </div>
          </form>
          <div className="login-foot">
            Dhaka Tesla Pool <span>·</span> Built for a smoother commute
          </div>
        </div>
      </div>
    );
  const driver = user.role === 'DRIVER';
  const nav = driver
    ? ['Overview', 'Pool requests', 'Ride history']
    : ['Overview', 'Book a ride', 'My rides', 'Ride history'];
  const shownRides = history
    ? driver
      ? pools.filter((p) => ['COMPLETED', 'CANCELLED'].includes(p.status))
      : rides.filter((r) => ['COMPLETED', 'CANCELLED'].includes(r.status))
    : driver
      ? pools
      : rides;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>
            TESLA<span className="brand-thin">POOL</span>
          </span>
        </div>
        <div className="side-context">
          <div className="context-dot" />
          <div>
            <b>Dhaka, Bangladesh</b>
            <small>City rides · Live</small>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n, i) => (
            <button
              key={n}
              className={(page === n ? 'active ' : '') + 'nav-item'}
              onClick={() => {
                setPage(n);
                setHistory(n === 'Ride history');
              }}
            >
              <span className="nav-icon">{['◫', '↗', '▤', '◷'][i]}</span>
              {n}
              {n === 'My rides' && active.length > 0 && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-spacer" />
        <div className="support-card">
          <div className="support-icon">✳</div>
          <b>Need a hand?</b>
          <p>Our local team is around to help.</p>
          <button onClick={() => setNotice('Reach us at hello@dhakateslapool.test')}>
            Get support <span>↗</span>
          </button>
        </div>
        <div className="profile">
          <button
            className="profile-trigger"
            type="button"
            onClick={() => setPage('Profile')}
            aria-label="Open profile page"
          >
            <span className="avatar">
              {user.name
                .split(' ')
                .map((x) => x[0])
                .join('')
                .slice(0, 2)}
            </span>
            <span className="profile-meta">
              <b>{user.name}</b>
              <small>{driver ? 'Tesla driver' : 'Passenger account'}</small>
            </span>
          </button>
          <button className="sign-out-btn" type="button" onClick={logout}>
            <span aria-hidden="true">↪</span> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{page}</b>
          </div>
          <div className="top-actions">
            <div className="weather">
              <span>☼</span> 29° <i /> Dhaka
            </div>
            <button
              className="round-btn"
              title="Notifications"
              onClick={() => setNotice('You’re all caught up.')}
            >
              ♧
            </button>
            <button className="profile-shortcut" type="button" onClick={() => setPage('Profile')}>
              <span className="avatar tiny">{user.name[0]}</span>
              <span>Profile</span>
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow muted">
                {new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' })
                  .format(new Date())
                  .toUpperCase()}
              </div>
              <h1>{page === 'Overview' ? `Good morning, ${user.name.split(' ')[0]}.` : page}</h1>
              <p>
                {driver
                  ? 'Keep the city moving, one shared ride at a time.'
                  : 'Your next ride is closer than you think.'}
              </p>
            </div>
            <div className="heading-right">
              {driver ? (
                <button
                  className="online-pill presence-toggle"
                  type="button"
                  disabled={busy}
                  onClick={toggleDriverOnline}
                  aria-pressed={driverOnline}
                >
                  <i className={driverOnline ? '' : 'offline-dot'} />
                  {driverOnline ? 'On duty' : 'Go online'}
                </button>
              ) : (
                <div className="online-pill">
                  <i /> All systems ready
                </div>
              )}
              {driver && (
                <button className="btn dark" onClick={() => setPage('Pool requests')}>
                  View requests <span>↗</span>
                </button>
              )}
            </div>
          </div>
          {notice && (
            <div className="alert success">
              {notice}
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}
          {error && (
            <div className="alert error">
              {error}
              <button onClick={() => setError('')}>×</button>
            </div>
          )}
          {page === 'Profile' && (
            <section className="account-page">
              <div className="account-card">
                <div className="account-card-heading">
                  <div className="avatar account-avatar">
                    {user.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div>
                    <div className="eyebrow muted">TESLAPOOL ACCOUNT</div>
                    <h2>{user.name}</h2>
                    <p>{driver ? 'Tesla driver' : 'Passenger'}</p>
                  </div>
                </div>
                <div className="account-details">
                  <div>
                    <small>NAME</small>
                    <b>{user.name}</b>
                  </div>
                  <div>
                    <small>EMAIL ADDRESS</small>
                    <b>{user.email}</b>
                  </div>
                  <div>
                    <small>ACCOUNT TYPE</small>
                    <b>{driver ? 'Driver' : 'Passenger'}</b>
                  </div>
                </div>
                <button className="btn dark" type="button" onClick={() => setPage('Overview')}>
                  Back to overview <span>↗</span>
                </button>
              </div>
            </section>
          )}
          {page === 'Overview' && !driver && (
            <>
              <section className="hero-grid">
                <div className="booking-card">
                  <div className="card-top">
                    <div>
                      <div className="eyebrow muted">PLAN YOUR TRIP</div>
                      <h2>Where are you headed?</h2>
                    </div>
                    <span className="seat-tag">◉ &nbsp; 2 passenger seats</span>
                  </div>
                  <form onSubmit={book}>
                    <div className="route-inputs">
                      <div className="route-rail">
                        <i />
                        <span />
                        <i />
                      </div>
                      <label>
                        Pickup location
                        <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
                          {areas.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Destination
                        <select value={dest} onChange={(e) => setDest(e.target.value)}>
                          {areas.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="booking-options">
                      <label>
                        Seats
                        <select value={seats} onChange={(e) => setSeats(e.target.value)}>
                          {[1, 2].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? 'seat' : 'seats'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Payment
                        <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                          <option value="CASH">Cash</option>
                          <option value="TESLAPAY">TeslaPay</option>
                        </select>
                      </label>
                      <div className="estimate">
                        <small>ESTIMATED FARE</small>
                        <b>{fareEstimate ? money(fareEstimate.farePaisa) : 'Calculating…'}</b>
                        {fareEstimate && <small>{fareEstimate.distanceKm} road km</small>}
                        {fareEstimateError && <small>{fareEstimateError}</small>}
                      </div>
                    </div>
                    <button className="btn dark book-btn" disabled={busy}>
                      {busy ? 'Finding a seat…' : 'Find my ride'} <span>↗</span>
                    </button>
                  </form>
                  <div className="fare-hint">Share a Tesla and save 20% on your fare.</div>
                </div>
                <div className="map-card">
                  <div className="map-head">
                    <div>
                      <div className="eyebrow muted">YOUR CITY, CONNECTED</div>
                      <b>Dhaka ride network</b>
                    </div>
                    <span className="live-tag">
                      <i /> LIVE
                    </span>
                  </div>
                  <div className="map-art">
                    <svg viewBox="0 0 420 300" role="img" aria-label="Illustrated Dhaka route map">
                      <path
                        className="river"
                        d="M0 243 C58 210 59 182 123 193 S192 223 233 172 287 124 312 139 372 112 420 87"
                      />
                      <path
                        className="road"
                        d="M-5 74 C82 109 111 32 184 85 S292 175 423 164M14 280 C87 206 144 266 205 216 S311 207 406 250M35 0 C89 65 69 158 143 181 S223 124 261 48 339 40 407 -8M0 154 C83 149 147 141 209 112 S309 64 425 85"
                      />
                      <path
                        className="road-thin"
                        d="M14 35L394 276M8 113L350 6M59 291L306 34M118 0L219 298M-5 200L420 203"
                      />
                      <path
                        className="route-line"
                        d="M125 119 C168 92 180 178 234 166 S283 123 307 133"
                      />
                      <circle className="pin start" cx="125" cy="119" r="6" />
                      <circle className="pin end" cx="307" cy="133" r="6" />
                      <g className="map-label">
                        <rect x="91" y="91" width="66" height="20" rx="10" />
                        <text x="124" y="105">
                          BANANI
                        </text>
                        <rect x="280" y="144" width="80" height="20" rx="10" />
                        <text x="320" y="158">
                          MOHAKHALI
                        </text>
                      </g>
                      <g className="car" transform="translate(211 157)">
                        <circle r="18" />
                        <text y="5">T</text>
                      </g>
                      <text className="area-label" x="292" y="80">
                        GULSHAN
                      </text>
                      <text className="area-label" x="44" y="223">
                        TEJGAON
                      </text>
                      <text className="area-label" x="317" y="218">
                        BASHUNDHARA
                      </text>
                    </svg>
                    <div className="map-caption">
                      <span>
                        <i className="legend-dot" /> Tesla routes across the city
                      </span>
                      <b>
                        8 areas <span>↗</span>
                      </b>
                    </div>
                  </div>
                </div>
              </section>
              <section className="metrics">
                <div className="metric">
                  <span className="metric-icon">↗</span>
                  <div>
                    <small>RIDES THIS MONTH</small>
                    <b>{rides.length.toString().padStart(2, '0')}</b>
                    <em>On your account</em>
                  </div>
                </div>
                <div className="metric">
                  <span className="metric-icon mint">♧</span>
                  <div>
                    <small>ACTIVE RIDES</small>
                    <b>{active.length.toString().padStart(2, '0')}</b>
                    <em>Ready when you are</em>
                  </div>
                </div>
                <div className="metric">
                  <span className="metric-icon sand">৳</span>
                  <div>
                    <small>AVERAGE FARE</small>
                    <b>
                      {rides.length
                        ? money(
                            Math.round(
                              rides.reduce((s, r) => s + Number(r.fare_paisa), 0) / rides.length,
                            ),
                          )
                        : '—'}
                    </b>
                    <em>Fair, every trip</em>
                  </div>
                </div>
              </section>
              <section className="section-heading">
                <div>
                  <h2>Recent rides</h2>
                  <p>Your trips, all in one place.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setPage('My rides');
                    setHistory(false);
                  }}
                >
                  View all rides <span>↗</span>
                </button>
              </section>
              <RideList rides={rides.slice(0, 3)} cancel={cancel} busy={busy} />
            </>
          )}
          {page === 'Overview' && driver && (
            <>
              <section className="driver-banner">
                <div>
                  <div className="eyebrow">BULLET · DHK-GA-11-0421</div>
                  <h2>Your Tesla is ready to roll.</h2>
                  <p>
                    Two passenger seats. Choose compatible rides and keep every seat accounted for.
                  </p>
                  <button className="btn white" onClick={() => setPage('Pool requests')}>
                    See pool requests <span>↗</span>
                  </button>
                </div>
                <div className="driver-car">T</div>
              </section>
              <section className="metrics">
                <div className="metric">
                  <span className="metric-icon">◷</span>
                  <div>
                    <small>OPEN POOLS</small>
                    <b>{active.length.toString().padStart(2, '0')}</b>
                    <em>Needs your attention</em>
                  </div>
                </div>
                <div className="metric">
                  <span className="metric-icon mint">♧</span>
                  <div>
                    <small>SEATS OCCUPIED</small>
                    <b>{active.reduce((s, p) => s + (Number(p.occupied_seats) || 0), 0)}</b>
                    <em>Across open pools · max 2 per pool</em>
                  </div>
                </div>
                <div className="metric">
                  <span className="metric-icon sand">↗</span>
                  <div>
                    <small>COMPLETED POOLS</small>
                    <b>
                      {pools
                        .filter((p) => p.status === 'COMPLETED')
                        .length.toString()
                        .padStart(2, '0')}
                    </b>
                    <em>Nice work, Jashim</em>
                  </div>
                </div>
              </section>
              <section className="section-heading">
                <div>
                  <h2>Pool requests</h2>
                  <p>Passengers heading your way.</p>
                </div>
                <button className="text-button" onClick={() => setPage('Pool requests')}>
                  Manage pools <span>↗</span>
                </button>
              </section>
              <DriverList
                pools={pools.slice(0, 3)}
                action={doAction}
                busy={busy}
                online={driverOnline}
              />
            </>
          )}
          {page === 'Book a ride' && (
            <section className="booking-card standalone">
              <div className="eyebrow muted">PLAN YOUR TRIP</div>
              <h2>Where are you headed?</h2>
              <p className="subtle">
                Pick your Dhaka neighborhoods; Bullet’s route matching is designed for shared
                pickups.
              </p>
              <form onSubmit={book}>
                <div className="standalone-fields">
                  <label>
                    Pickup location
                    <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
                      {areas.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Destination
                    <select value={dest} onChange={(e) => setDest(e.target.value)}>
                      {areas.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Seats
                    <select value={seats} onChange={(e) => setSeats(e.target.value)}>
                      {[1, 2].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Payment
                    <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                      <option value="CASH">Cash</option>
                      <option value="TESLAPAY">TeslaPay (simulated)</option>
                    </select>
                  </label>
                </div>
                <div className="fare-explain">
                  <span>Estimated fare</span>
                  <b>{fareEstimate ? money(fareEstimate.farePaisa) : 'Calculating route…'}</b>
                  {fareEstimate && (
                    <small>{fareEstimate.distanceKm} road km from area centers.</small>
                  )}
                  {fareEstimateError && <small>{fareEstimateError}</small>}
                  <small>
                    A compatible shared pool receives a 20% discount. TeslaPay is simulated.
                  </small>
                </div>
                <button className="btn dark" disabled={busy}>
                  {busy ? 'Finding a seat…' : 'Find my ride'} <span>↗</span>
                </button>
              </form>
            </section>
          )}
          {(page === 'My rides' || (page === 'Ride history' && !driver)) && (
            <>
              <section className="section-heading list-title">
                <div>
                  <h2>{history ? 'Past rides' : 'Your rides'}</h2>
                  <p>
                    {history
                      ? 'Completed and cancelled trips.'
                      : 'Status and fare for each of your trips.'}
                  </p>
                </div>
                {history ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setHistory(false);
                      setPage('My rides');
                    }}
                  >
                    Active rides ↗
                  </button>
                ) : (
                  <button className="btn dark" onClick={() => setPage('Book a ride')}>
                    Book a ride <span>↗</span>
                  </button>
                )}
              </section>
              <RideList rides={shownRides} cancel={cancel} busy={busy} />
            </>
          )}
          {(page === 'Pool requests' || (page === 'Ride history' && driver)) && (
            <>
              <section className="section-heading list-title">
                <div>
                  <h2>{history ? 'Past pools' : 'Tesla pools'}</h2>
                  <p>Seat capacity is held safely while each request joins.</p>
                </div>
                <span className="seat-tag">Bullet · 2 passenger seats · max 2 requests</span>
              </section>
              <DriverList pools={shownRides} action={doAction} busy={busy} online={driverOnline} />
            </>
          )}
          <footer className="footer">
            A little less solo. A little more city. <span>TESLAPOOL · DHAKA</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);

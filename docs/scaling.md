# Scaling notes

```mermaid
flowchart LR
  Clients --> WAF[Rate limiting / WAF]
  WAF --> LB[Load balancer]
  LB --> API1[Stateless API replicas]
  API1 --> Pooler[Postgres connection pool]
  Pooler --> Primary[(Postgres primary)]
  Primary --> Replica[(Read replicas)]
  API1 --> Outbox[(Transactional outbox)]
  Outbox --> Queue[Managed queue when justified]
  Queue --> Events[Notifications / analytics workers]
  API1 -. optional realtime .-> Push[WebSocket or push gateway]
  API1 --> Obs[Logs, metrics, traces, alerts]
```

The current MVP correctly keeps pool membership transactional. At higher scale, move match finding to geo/zone partitions, add expiring idempotent seat reservations, and route each pool to a single serialization key. Keep the Postgres primary authoritative for confirmed seats. A queue can distribute notifications and analytics, but must not become the capacity authority.

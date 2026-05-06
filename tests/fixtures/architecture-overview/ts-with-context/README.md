# billing-service

A small HTTP service that records billing events to Postgres and is intended
to charge customers via Stripe.

## Primary actor

Platform engineer — operates this service in production and onboards new
tenants.

## Adjacent systems

- Postgres — primary store for billing events (observed via `pg` dependency
  and `DATABASE_URL`)
- Stripe API — charging integration; intended but not yet wired (env var
  `STRIPE_API_KEY` exposed, no client lib in deps)

# Architecture — data-flow
## Flow
- Web checkout → payments-service → Stripe (synchronous)
- payments-service → Snowflake (async event stream for billing reporting)

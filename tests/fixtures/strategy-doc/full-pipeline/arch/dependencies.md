# Architecture — dependencies
## Internal modules
- web-checkout depends on payments-service
- payments-service has no internal dependencies (root)

## External
- payments-service: stripe, postgres

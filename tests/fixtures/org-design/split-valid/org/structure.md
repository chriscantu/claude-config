# Org structure — orgfix-acme

One row per person. Manual entry. This file is the input to /org-design
analyze. Fill every column you can; blanks degrade specific analyses
but never abort the run.

<!-- org-design:structure -->
| Person | Role (M/IC) | Team | Reports to | Critical systems owned | On-call rotation | Key skills |
|--------|-------------|------|------------|------------------------|------------------|-----------|
| Dana   | M           | Platform | | | | leadership |
| Sam    | M           | Payments | Dana | | | leadership |
| Jordan | IC          | Payments | Sam | billing-service | payments-primary | Kafka, Go |
| Riley  | IC          | Payments | Sam | | payments-primary | Go |
| Alex   | IC          | Platform | Dana | observability-stack | platform-primary | Terraform |
| Morgan | IC          | Platform | Dana | | platform-primary | Python |
<!-- /org-design:structure -->

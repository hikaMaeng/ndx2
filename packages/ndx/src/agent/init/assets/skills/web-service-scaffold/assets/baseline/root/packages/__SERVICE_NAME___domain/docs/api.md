# API

Public exports:

| Export | Purpose |
| --- | --- |
| `__DOMAIN_PACKAGE_NAME__` | Common domain entrypoint. |
| `__DOMAIN_PACKAGE_NAME__/common` | Runtime-neutral domain entrypoint. |
| `__DOMAIN_PACKAGE_NAME__/server` | Server-only domain entrypoint. |
| `__DOMAIN_PACKAGE_NAME__/front` | Front-only domain entrypoint. |

Add APIs only when a requested product behavior needs a durable domain contract.

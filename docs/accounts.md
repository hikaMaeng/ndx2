# Accounts

NDX no longer has a product account/user concept.

`ndev` remains a PostgreSQL/container credential and development runtime default
where documented by the Docker contract, but it is not a session owner, browser
profile, login identity, or deletion target.

Current identity rules:

| Rule | Contract |
| --- | --- |
| Product user table | None |
| Session owner column | None |
| Login/account selection flow | None |
| Browser client identity | `clientid` UUID for reconnect/presentation state only |
| Session authorization | Socket-local `sessionid` grant after project/session attach |
| Data deletion unit | Project/session/chat rows, not a user row |

Do not add user/account APIs, user-owned session filters, account selection
socket messages, or `userid` columns without a new explicit product decision.

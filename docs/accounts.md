# Accounts

The server must always provide a default account named `ndev`.

If a client has not completed an explicit login or account-selection flow, the server treats the client as `ndev`.

Account rules:

| Rule | Contract |
| --- | --- |
| Name characters | Any Unicode characters except Unicode whitespace |
| Name length | Maximum 200 characters |
| Storage | `users.userid` primary key, `users.created` creation timestamp |
| Password | Optional |
| Creation default | No password |
| Database initialization | `initServer` creates `users` and inserts `ndev` before session tables |
| Rename | Not allowed |
| Delete | Removes the account and all owned session information |

Account names are identities, not editable profile labels. Display-name support, if added later, must be separate from account identity.

Deleting an account must remove every session category, session metadata row, context event, tool log, resume marker, and downstream history owned by that account.

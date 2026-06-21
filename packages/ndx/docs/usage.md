# Usage

Import through the workspace package name:

```ts
import { serviceDomain } from "ndx/common";
import { agentServerDomain } from "ndx/agent/init";
import { loadModelSettings } from "ndx/webclient/server";
```

Do not use relative imports across workspace boundaries. Before changing any
exported subpath, check its consumers and invariants in
[constraints.md](constraints.md#blast-radius).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Acquires the OS-local singleton lock for the agent server process. */
export function acquireAgentServerInstanceLock(lockPath = path.join(os.tmpdir(), "ndx-agent-server.lock")) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  try {
    const descriptor = fs.openSync(lockPath, "wx");
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, created: new Date().toISOString() }));
    return () => {
      fs.closeSync(descriptor);
      fs.rmSync(lockPath, { force: true });
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    let stale = false;
    try {
      const raw = fs.readFileSync(lockPath, "utf8");
      const pid = JSON.parse(raw) as { created?: unknown; pid?: unknown };
      if (typeof pid.pid !== "number") {
        stale = true;
      } else if (pid.pid === process.pid && typeof pid.created === "string" && Date.parse(pid.created) < Date.now() - (process.uptime() * 1000)) {
        stale = true;
      } else {
        try {
          process.kill(pid.pid, 0);
        } catch {
          stale = true;
        }
      }
    } catch {
      stale = true;
    }

    if (stale) {
      fs.rmSync(lockPath, { force: true });
      return acquireAgentServerInstanceLock(lockPath);
    }

    throw new Error("agent server session socket surface is already running on this OS.");
  }
}

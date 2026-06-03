import { SESSION_SHELL, type SessionMetadata } from "../types.js";

export function buildEnvironmentContext(sessionMetadata: SessionMetadata): string {
  const lines = [
    `  <cwd>${sessionMetadata.cwd}</cwd>`,
    `  <shell>${SESSION_SHELL}</shell>`,
  ];

  if (sessionMetadata.currentDate) {
    lines.push(`  <current_date>${sessionMetadata.currentDate}</current_date>`);
  }
  if (sessionMetadata.timezone) {
    lines.push(`  <timezone>${sessionMetadata.timezone}</timezone>`);
  }

  return `<environment_context>\n${lines.join("\n")}\n</environment_context>`;
}

import { SESSION_SHELL, type SessionMetadata } from "../types.js";

export function buildEnvironmentContext(sessionMetadata: SessionMetadata): string {
  const projectRoot = sessionMetadata.projectHome ?? sessionMetadata.cwd;
  const virtualRoot = sessionMetadata.userHome ?? projectRoot;
  const lines = [
    `  <cwd>${sessionMetadata.cwd}</cwd>`,
    `  <project_root>${projectRoot}</project_root>`,
    `  <ndx_virtual_root>${virtualRoot}</ndx_virtual_root>`,
    `  <shell>${SESSION_SHELL}</shell>`,
    "  <path_policy>",
    `    File tools resolve relative paths from ${projectRoot}.`,
    "    Use project-relative paths like apps/...; do not prefix project paths with /.",
    `    Absolute file-tool paths must stay under ${virtualRoot}; project absolute paths should start with ${projectRoot}.`,
    `    Do not pass /tmp paths to file tools; use bash for /tmp or write under ${projectRoot}.`,
    "  </path_policy>",
  ];

  if (sessionMetadata.currentDate) {
    lines.push(`  <current_date>${sessionMetadata.currentDate}</current_date>`);
  }
  if (sessionMetadata.timezone) {
    lines.push(`  <timezone>${sessionMetadata.timezone}</timezone>`);
  }

  return `<environment_context>\n${lines.join("\n")}\n</environment_context>`;
}

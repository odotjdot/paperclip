import type { AdapterModelProfileDefinition } from "@paperclipai/adapter-utils";

export const type = "antigravity_local";
export const label = "Antigravity CLI (local)";

export const DEFAULT_AGY_COMMAND = "agy";

export const models = [
  { id: "default", label: "Default" },
];

export const modelProfiles: AdapterModelProfileDefinition[] = [];

export const agentConfigurationDoc = `# antigravity_local agent configuration

Adapter: antigravity_local

Use when:
- You want Paperclip to run the Antigravity CLI (agy) locally on the host machine
- agy is installed and accessible on the machine running Paperclip

Don't use when:
- agy is not installed (AC1 testEnvironment will report the failure)
- You need webhook-style external invocation (use http or openclaw_gateway)

Core fields:
- cwd (string, optional): default absolute working directory for the agent process
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- promptTemplate (string, optional): run prompt template
- command (string, optional): defaults to "agy"
- extraArgs (string[], optional): additional CLI args passed after the standard flags
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (0 = no timeout)
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- agy is the Antigravity CLI v2 (Go binary) that replaced Gemini CLI.
- Skills are injected into \`~/.gemini/skills/\` via symlinks (same dir as Gemini CLI).
- Headless execution uses: agy -p "<prompt>" --output-format json --headless --yes --no-color
- Auth uses the same Google account credentials as Gemini CLI (\`~/.gemini/\`).
- Install: download the agy Go binary from the Antigravity release page and place it on PATH.
`;

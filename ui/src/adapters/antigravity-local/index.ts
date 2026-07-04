import type { UIAdapterModule } from "../types";
import { parseAgyStdoutLine } from "@paperclipai/adapter-antigravity-local/ui";
import { AntigravityLocalConfigFields } from "./config-fields";
import { buildAntigravityLocalConfig } from "@paperclipai/adapter-antigravity-local/ui";

export const antigravityLocalUIAdapter: UIAdapterModule = {
  type: "antigravity_local",
  label: "Antigravity CLI (local)",
  parseStdoutLine: parseAgyStdoutLine,
  ConfigFields: AntigravityLocalConfigFields,
  buildAdapterConfig: buildAntigravityLocalConfig,
};

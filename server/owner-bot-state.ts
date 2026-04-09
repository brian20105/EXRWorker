import fs from "fs";
import path from "path";

export type OwnerBotDesiredState = "on" | "off";

const OWNER_BOT_STATE_FILE = path.resolve(process.cwd(), ".owner-bot.state");

export function readOwnerBotDesiredState(): OwnerBotDesiredState {
  try {
    const raw = fs.readFileSync(OWNER_BOT_STATE_FILE, "utf8").trim().toLowerCase();
    return raw === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

export function writeOwnerBotDesiredState(state: OwnerBotDesiredState): void {
  try {
    fs.writeFileSync(OWNER_BOT_STATE_FILE, state, "utf8");
  } catch {
    // ignore persistence errors
  }
}
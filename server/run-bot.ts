import "dotenv/config";
import fs from "fs";
import path from "path";
import { startBot } from "./bot";

const OWNER_BOT_PID_FILE = path.resolve(process.cwd(), ".owner-bot.pid");

try {
  fs.writeFileSync(OWNER_BOT_PID_FILE, String(process.pid), "utf8");
} catch {
  // ignore pid file write errors
}

const cleanupPidFile = () => {
  try {
    const current = fs.readFileSync(OWNER_BOT_PID_FILE, "utf8").trim();
    if (Number(current) === process.pid) {
      fs.unlinkSync(OWNER_BOT_PID_FILE);
    }
  } catch {
    // ignore
  }
};

process.on("exit", cleanupPidFile);
process.on("SIGINT", () => {
  cleanupPidFile();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupPidFile();
  process.exit(0);
});

startBot().catch((error) => {
  cleanupPidFile();
  console.error("❌ Bot runner failed:", error);
  process.exit(1);
});

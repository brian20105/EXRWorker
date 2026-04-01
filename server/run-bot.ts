import "dotenv/config";
import { startBot } from "./bot";

startBot().catch((error) => {
  console.error("❌ Bot runner failed:", error);
  process.exit(1);
});

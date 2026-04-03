import fs from "fs";
import path from "path";

export type OwnerGuildSnapshot = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
};

const OWNER_GUILD_SNAPSHOT_FILE = path.resolve(process.cwd(), ".owner-guilds.json");

export function readOwnerGuildSnapshot(): OwnerGuildSnapshot[] {
  try {
    const raw = fs.readFileSync(OWNER_GUILD_SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        id: String(entry?.id || "").trim(),
        name: String(entry?.name || "Unknown").trim() || "Unknown",
        icon: entry?.icon ? String(entry.icon) : null,
        memberCount: Number(entry?.memberCount || 0),
      }))
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

export function writeOwnerGuildSnapshot(guilds: OwnerGuildSnapshot[]): void {
  try {
    fs.writeFileSync(OWNER_GUILD_SNAPSHOT_FILE, JSON.stringify(guilds, null, 2), "utf8");
  } catch {
    // ignore persistence errors
  }
}
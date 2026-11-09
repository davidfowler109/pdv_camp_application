import { randomBytes } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";

const roles = ["LEADERSHIP", "REGISTRATION", "GUIDE", "HEALTH", "KITCHEN"];
const passwordLine = role => "PDV_" + role + "_PASSWORD=" + randomBytes(12).toString("base64url");

const lines = [
  "PDV_LOCAL_DEMO=1",
  "PDV_SESSION_SECRET=" + randomBytes(32).toString("hex"),
  ...roles.map(passwordLine),
];
try {
  await writeFile(".env.local", lines.join("\n") + "\n", { flag: "wx" });
  console.log("Local pilot passwords (also in .env.local)");
  for (const line of lines.slice(2)) console.log(line);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const existing = await readFile(".env.local", "utf8");
  const additions = ["HEALTH", "KITCHEN"].filter(role => !new RegExp("^\\s*PDV_"+role+"_PASSWORD=", "m").test(existing)).map(passwordLine);
  if (additions.length) {
    await appendFile(".env.local", "\n" + additions.join("\n") + "\n");
    console.log("Added local health and kitchen passwords to .env.local.");
  } else {
    console.log(".env.local already exists. Use its existing pilot passwords.");
  }
}

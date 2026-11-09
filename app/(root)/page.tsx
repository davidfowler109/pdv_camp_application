import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  redirect((await cookies()).get("pdv-language")?.value === "en" ? "/en" : "/es");
}

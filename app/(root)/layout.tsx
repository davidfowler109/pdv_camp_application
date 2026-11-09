import "../style.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es-PA"><body>{children}</body></html>;
}

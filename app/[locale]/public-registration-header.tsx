import Image from "next/image";
import type { ReactNode } from "react";

export function PublicRegistrationHeader({ children }: { children: ReactNode }) {
  return <header className="public-registration-header">
    <div className="public-registration-banner">
      <span>Palabra de Vida Panamá</span><span>El Mangote, Chame</span>
    </div>
    <div>
      <div className="brand">
        <Image src="/palabra-de-vida-public.png" width={1644} height={279} alt="Palabra de Vida Panamá" />
      </div>
      {children}
    </div>
  </header>;
}

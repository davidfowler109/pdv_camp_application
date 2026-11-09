import { RegistrationScreen } from "../registration-screen";

export const metadata = {robots:{index:false,follow:false},referrer:"no-referrer" as const};

export default async function Register({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{week?:string;receipt?:string}> }) {
  const query = await searchParams;
  return <RegistrationScreen locale={(await params).locale} requestedWeek={query.week} receipt={query.receipt} />;
}

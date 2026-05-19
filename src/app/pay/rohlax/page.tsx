import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { RohlaxPaymentForm } from "./RohlaxPaymentForm";
import { formatRohlaxPaymentAmount, parseRohlaxPaymentAmount } from "@/lib/rohlax-payment";

export const metadata: Metadata = {
  title: {
    absolute: "Flexible website payment",
  },
  description: "Choose and pay a one-time website payment.",
};

interface PageProps {
  searchParams?: Promise<{
    payment?: string;
    amount?: string;
  }>;
}

export default async function RohlaxPaymentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const payment = params?.payment;
  const amountCents = parseRohlaxPaymentAmount(params?.amount);

  return (
    <main className="min-h-screen bg-[#f4f6f1] px-5 py-8 text-[#172117] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1120px] flex-col">
        <header className="flex items-center justify-between gap-4">
          <Link href="/pay/rohlax" className="text-[15px] font-semibold text-[#172117]">
            Website payment
          </Link>
          <a
            href="mailto:jacob@scaffoldweb.com"
            className="text-[13px] font-medium text-[#5f7667] hover:text-[#172117]"
          >
            Contact Jacob
          </a>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_430px] lg:py-16">
          <div className="max-w-[650px]">
            {payment === "success" && (
              <div className="mb-6 inline-flex items-center gap-2 rounded-[6px] border border-[#bbd7bd] bg-[#edf8ee] px-3 py-2 text-[13px] font-medium text-[#315f37]">
                <CheckCircle2 size={16} />
                Payment received{amountCents ? ` for ${formatRohlaxPaymentAmount(amountCents)}` : ""}
              </div>
            )}
            {payment === "cancelled" && (
              <div className="mb-6 rounded-[6px] border border-[#e4d2b7] bg-[#fff8ea] px-3 py-2 text-[13px] font-medium text-[#76551c]">
                Payment was cancelled. You can choose an amount and try again below.
              </div>
            )}

            <h1 className="text-[42px] font-semibold leading-[1.02] tracking-normal text-[#172117] sm:text-[58px] lg:text-[64px]">
              Flexible website payment
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-8 text-[#4f6154] sm:text-[18px]">
              There is no default or expected amount. Choose what feels right for the website work,
              anywhere from $300 up to $1,000. The top of the range is just a ceiling, not a target.
            </p>
            <p className="mt-4 max-w-[560px] text-[15px] leading-7 text-[#5f7667]">
              Admin site access is guaranteed free for life. This is a courtesy payment only; it
              will not change future response times, and it does not add extra coverage at this
              moment. All website requests still fall within the normal 3-5 day response window.
            </p>

            <div className="mt-9 grid max-w-[580px] gap-3 sm:grid-cols-3">
              <div className="border-l border-[#cfd8cc] pl-4">
                <p className="text-[12px] font-medium uppercase text-[#758579]">Minimum</p>
                <p className="mt-1 text-[18px] font-semibold">$300</p>
              </div>
              <div className="border-l border-[#cfd8cc] pl-4">
                <p className="text-[12px] font-medium uppercase text-[#758579]">Flexible</p>
                <p className="mt-1 text-[18px] font-semibold">No default</p>
              </div>
              <div className="border-l border-[#cfd8cc] pl-4">
                <p className="text-[12px] font-medium uppercase text-[#758579]">Maximum</p>
                <p className="mt-1 text-[18px] font-semibold">$1,000 cap</p>
              </div>
            </div>
          </div>

          <RohlaxPaymentForm />
        </section>
      </div>
    </main>
  );
}

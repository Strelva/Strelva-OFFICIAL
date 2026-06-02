"use client";

import { useState } from "react";
import type { ServiceItem } from "@/lib/types";

interface BookingWidgetProps {
  services: ServiceItem[];
  bookingUrl?: string;
  minPrice?: string;
  reviewCount?: number;
}

type Step = "service" | "date" | "time" | "info" | "confirmed";

export function BookingWidget({ services, bookingUrl, minPrice, reviewCount }: BookingWidgetProps) {
  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [booking, setBooking] = useState<{ id: string; date: string; startTime: string; serviceName: string } | null>(null);

  const bookableServices = services.filter((s) => !s.comingSoon);
  const priceDisplay = minPrice ? `$${minPrice}` : "$60";

  // Generate next 30 days for date picker
  const dates: string[] = [];
  for (let i = 1; i <= 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  async function fetchSlots(date: string, serviceId: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/booking/availability?date=${date}&serviceId=${serviceId}`);
      const data = await res.json();
      setSlots(data.slots || []);
      if (data.slots?.length === 0) {
        setError("No available times on this date. Try another day.");
      }
    } catch {
      setError("Failed to load availability.");
    } finally {
      setLoading(false);
    }
  }

  async function submitBooking() {
    if (!selectedService || !selectedDate || !selectedTime) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          date: selectedDate,
          startTime: selectedTime,
          clientName: form.name,
          clientEmail: form.email,
          clientPhone: form.phone,
          notes: form.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to book. Please try again.");
        return;
      }

      setBooking(data.booking);
      setStep("confirmed");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatTime(time: string) {
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  }

  function reset() {
    setStep("service");
    setSelectedService(null);
    setSelectedDate("");
    setSelectedTime("");
    setSlots([]);
    setForm({ name: "", email: "", phone: "", notes: "" });
    setBooking(null);
    setError("");
  }

  return (
    <section id="booking" className="py-14 md:py-20" style={{ background: "var(--cream-dark)" }}>
      <div className="container-main">
        <div className="text-center">
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight mb-4">
            Book a Session
          </h2>
          <p className="text-base md:text-lg leading-relaxed max-w-lg mx-auto mb-10" style={{ color: "var(--bark-light)" }}>
            Choose a service, pick your time, and you&apos;re booked. Simple as that.
          </p>

          <div className="max-w-xl mx-auto p-8 md:p-12" style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}>
            {/* Rating strip */}
            {reviewCount && reviewCount > 0 && (
              <div className="flex items-center justify-center gap-3 mb-6">
                <span className="text-[0.625rem] font-bold tracking-widest uppercase" style={{ color: "var(--sage)" }}>
                  Highly Rated · {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                </span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map((i) => (
                    <svg key={i} className="w-4 h-4" style={{ color: "var(--sage)" }} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
            )}

            {/* Progress indicator */}
            {step !== "confirmed" && (
              <div className="flex items-center justify-center gap-2 mb-8">
                {(["service", "date", "time", "info"] as Step[]).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full transition-colors"
                      style={{
                        background: (["service", "date", "time", "info"] as Step[]).indexOf(step) >= i
                          ? "var(--sage)"
                          : "var(--cream-mid)",
                      }}
                    />
                    {i < 3 && <div className="w-8 h-px" style={{ background: "var(--cream-mid)" }} />}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            {/* Step 1: Service */}
            {step === "service" && (
              <div>
                <p className="text-sm font-medium mb-4" style={{ color: "var(--bark)" }}>Choose a service</p>
                <div className="space-y-2">
                  {bookableServices.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => {
                        setSelectedService(service);
                        setStep("date");
                      }}
                      className="w-full text-left p-4 rounded-md border transition-colors hover:border-[var(--sage)]"
                      style={{ borderColor: "var(--cream-mid)" }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-sm" style={{ color: "var(--bark)" }}>{service.name}</span>
                          {service.featured && (
                            <span className="ml-2 text-[0.6rem] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded" style={{ background: "var(--sage)", color: "var(--pure-white)" }}>
                              Start here
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium" style={{ color: "var(--sage)" }}>
                          ${service.price} · {service.duration}
                        </span>
                      </div>
                      {service.who_its_for && (
                        <p className="text-xs mt-1" style={{ color: "var(--bark-faded)" }}>{service.who_its_for}</p>
                      )}
                    </button>
                  ))}
                </div>
                {bookingUrl && (
                  <p className="text-xs mt-6" style={{ color: "var(--bark-faded)" }}>
                    Sessions from {priceDisplay} · 24-hour cancellation policy
                  </p>
                )}
              </div>
            )}

            {/* Step 2: Date */}
            {step === "date" && (
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--bark)" }}>
                  {selectedService?.name}
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--bark-faded)" }}>Pick a date</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                  {dates.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setSelectedDate(d);
                        if (selectedService) fetchSlots(d, selectedService.id);
                        setStep("time");
                      }}
                      className="p-2 text-xs rounded-md border transition-colors hover:border-[var(--sage)]"
                      style={{ borderColor: "var(--cream-mid)" }}
                    >
                      {formatDate(d)}
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep("service")} className="mt-4 text-xs underline" style={{ color: "var(--bark-faded)" }}>
                  Back
                </button>
              </div>
            )}

            {/* Step 3: Time */}
            {step === "time" && (
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--bark)" }}>
                  {selectedService?.name} · {formatDate(selectedDate)}
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--bark-faded)" }}>Pick a time</p>
                {loading ? (
                  <p className="text-sm py-8" style={{ color: "var(--bark-faded)" }}>Loading times...</p>
                ) : slots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setSelectedTime(t);
                          setStep("info");
                        }}
                        className="p-3 text-sm rounded-md border transition-colors hover:border-[var(--sage)] font-medium"
                        style={{ borderColor: "var(--cream-mid)", color: "var(--bark)" }}
                      >
                        {formatTime(t)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm py-8" style={{ color: "var(--bark-faded)" }}>
                    No times available. Try another date.
                  </p>
                )}
                <button onClick={() => { setStep("date"); setSlots([]); setError(""); }} className="mt-4 text-xs underline" style={{ color: "var(--bark-faded)" }}>
                  Back
                </button>
              </div>
            )}

            {/* Step 4: Contact info */}
            {step === "info" && (
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--bark)" }}>
                  {selectedService?.name}
                </p>
                <p className="text-xs mb-6" style={{ color: "var(--bark-faded)" }}>
                  {formatDate(selectedDate)} at {formatTime(selectedTime)}
                </p>
                <div className="space-y-3 text-left">
                  <div>
                    <label htmlFor="booking-name" className="text-xs font-medium" style={{ color: "var(--bark)" }}>Name *</label>
                    <input
                      id="booking-name"
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2"
                      style={{ borderColor: "var(--cream-mid)", color: "var(--bark)" }}
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-email" className="text-xs font-medium" style={{ color: "var(--bark)" }}>Email *</label>
                    <input
                      id="booking-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2"
                      style={{ borderColor: "var(--cream-mid)", color: "var(--bark)" }}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-phone" className="text-xs font-medium" style={{ color: "var(--bark)" }}>Phone</label>
                    <input
                      id="booking-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2"
                      style={{ borderColor: "var(--cream-mid)", color: "var(--bark)" }}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-notes" className="text-xs font-medium" style={{ color: "var(--bark)" }}>Notes</label>
                    <textarea
                      id="booking-notes"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2"
                      style={{ borderColor: "var(--cream-mid)", color: "var(--bark)" }}
                      rows={2}
                      placeholder="Anything we should know?"
                    />
                  </div>
                </div>
                <button
                  onClick={submitBooking}
                  disabled={!form.name || !form.email || loading}
                  className="w-full mt-6 px-6 py-3 text-sm font-bold tracking-widest uppercase transition-all disabled:opacity-50"
                  style={{ background: "var(--sage)", color: "var(--pure-white)" }}
                >
                  {loading ? "Booking..." : "Confirm Booking"}
                </button>
                <button onClick={() => setStep("time")} className="mt-3 text-xs underline" style={{ color: "var(--bark-faded)" }}>
                  Back
                </button>
              </div>
            )}

            {/* Confirmed */}
            {step === "confirmed" && booking && (
              <div className="py-4">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "var(--sage)" }}>
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--bark)" }}>You&apos;re booked!</h3>
                <p className="text-sm mb-1" style={{ color: "var(--bark-light)" }}>{booking.serviceName}</p>
                <p className="text-sm mb-4" style={{ color: "var(--bark-faded)" }}>
                  {formatDate(booking.date)} at {formatTime(booking.startTime)}
                </p>
                <p className="text-xs mb-6" style={{ color: "var(--bark-faded)" }}>
                  A confirmation has been sent to {form.email}
                </p>
                <button
                  onClick={reset}
                  className="text-sm font-medium underline"
                  style={{ color: "var(--sage)" }}
                >
                  Book another session
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

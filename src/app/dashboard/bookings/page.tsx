"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, User, CheckCircle, XCircle } from "lucide-react";

interface BookingItem {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes?: string;
  status: "confirmed" | "cancelled" | "completed";
  createdAt: string;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const res = await fetch("/api/booking/list");
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: "completed" | "cancelled") {
    try {
      const res = await fetch(`/api/booking/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status } : b))
        );
      }
    } catch {}
  }

  const filtered = bookings.filter((b) => {
    if (filter === "upcoming") return b.date >= today && b.status === "confirmed";
    if (filter === "past") return b.date < today || b.status !== "confirmed";
    return true;
  });

  const todayBookings = bookings.filter((b) => b.date === today && b.status === "confirmed");
  const weekBookings = bookings.filter((b) => {
    const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return b.date >= today && b.date <= weekFromNow && b.status === "confirmed";
  });

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

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-[#1c1c1c] rounded" />
          <div className="h-64 bg-[#1c1c1c] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Bookings</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage your appointment schedule</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-lg bg-[#141414] border border-[#262626]">
          <p className="text-2xl font-semibold text-white">{todayBookings.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Today</p>
        </div>
        <div className="p-4 rounded-lg bg-[#141414] border border-[#262626]">
          <p className="text-2xl font-semibold text-white">{weekBookings.length}</p>
          <p className="text-xs text-zinc-500 mt-1">This week</p>
        </div>
        <div className="p-4 rounded-lg bg-[#141414] border border-[#262626]">
          <p className="text-2xl font-semibold text-white">
            {bookings.filter((b) => b.status === "confirmed" && b.date >= today).length}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Upcoming</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-[#141414] border border-[#262626] rounded-md p-0.5 w-fit">
        {(["upcoming", "past", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
              filter === f ? "bg-[#262626] text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Bookings list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Calendar className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No {filter} bookings</p>
          <p className="text-xs mt-1 text-zinc-600">Bookings will appear here when clients book through your site.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between p-4 rounded-lg bg-[#141414] border border-[#262626] hover:border-[#333] transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-[#1c1c1c]">
                  <span className="text-xs font-bold text-white leading-none">
                    {new Date(b.date + "T12:00:00").getDate()}
                  </span>
                  <span className="text-[10px] text-zinc-500 uppercase">
                    {new Date(b.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{b.serviceName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Clock className="w-3 h-3" />
                      {formatTime(b.startTime)} – {formatTime(b.endTime)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <User className="w-3 h-3" />
                      {b.clientName}
                    </span>
                  </div>
                  {b.notes && <p className="text-xs text-zinc-600 mt-1">{b.notes}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium tracking-wider uppercase px-2 py-1 rounded ${
                  b.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" :
                  b.status === "completed" ? "bg-blue-500/10 text-blue-400" :
                  "bg-red-500/10 text-red-400"
                }`}>
                  {b.status}
                </span>
                {b.status === "confirmed" && (
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => updateStatus(b.id, "completed")}
                      className="p-1.5 rounded hover:bg-[#262626] transition-colors"
                      title="Mark completed"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    </button>
                    <button
                      onClick={() => updateStatus(b.id, "cancelled")}
                      className="p-1.5 rounded hover:bg-[#262626] transition-colors"
                      title="Cancel"
                    >
                      <XCircle className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

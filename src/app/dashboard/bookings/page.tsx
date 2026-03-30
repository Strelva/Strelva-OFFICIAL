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
  const [error, setError] = useState<string | null>(null);
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
    } catch {
      setError("Failed to load bookings");
    } finally {
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
    } catch {
      setError("Failed to update booking status");
      setTimeout(() => setError(null), 3000);
    }
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
          <div className="h-8 w-48 bg-[#f0f0f0] rounded" />
          <div className="h-64 bg-[#f0f0f0] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1a1a1a] tracking-tight">Bookings</h1>
        <p className="text-sm text-[#999] mt-1">Manage your appointment schedule</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-600/5 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-lg bg-white border border-[#e8e8e8]">
          <p className="text-2xl font-semibold text-[#1a1a1a]">{todayBookings.length}</p>
          <p className="text-xs text-[#999] mt-1">Today</p>
        </div>
        <div className="p-4 rounded-lg bg-white border border-[#e8e8e8]">
          <p className="text-2xl font-semibold text-[#1a1a1a]">{weekBookings.length}</p>
          <p className="text-xs text-[#999] mt-1">This week</p>
        </div>
        <div className="p-4 rounded-lg bg-white border border-[#e8e8e8]">
          <p className="text-2xl font-semibold text-[#1a1a1a]">
            {bookings.filter((b) => b.status === "confirmed" && b.date >= today).length}
          </p>
          <p className="text-xs text-[#999] mt-1">Upcoming</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-[#f5f5f5] border border-[#e8e8e8] rounded-md p-0.5 w-fit">
        {(["upcoming", "past", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
              filter === f ? "bg-white text-[#1a1a1a] shadow-sm" : "text-[#999] hover:text-[#666]"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Bookings list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#999]">
          <Calendar className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No {filter} bookings</p>
          <p className="text-xs mt-1 text-[#ccc]">Bookings will appear here when clients book through your site.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between p-4 rounded-lg bg-white border border-[#e8e8e8] hover:border-[#d0d0d0] transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-[#f5f5f5]">
                  <span className="text-xs font-bold text-[#1a1a1a] leading-none">
                    {new Date(b.date + "T12:00:00").getDate()}
                  </span>
                  <span className="text-[10px] text-[#999] uppercase">
                    {new Date(b.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a1a]">{b.serviceName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-[#999]">
                      <Clock className="w-3 h-3" />
                      {formatTime(b.startTime)} – {formatTime(b.endTime)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#999]">
                      <User className="w-3 h-3" />
                      {b.clientName}
                    </span>
                  </div>
                  {b.notes && <p className="text-xs text-[#ccc] mt-1">{b.notes}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium tracking-wider uppercase px-2 py-1 rounded ${
                  b.status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" :
                  b.status === "completed" ? "bg-blue-500/10 text-blue-600" :
                  "bg-red-500/10 text-red-600"
                }`}>
                  {b.status}
                </span>
                {b.status === "confirmed" && (
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => updateStatus(b.id, "completed")}
                      className="p-1.5 rounded hover:bg-[#f5f5f5] transition-colors"
                      title="Mark completed"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </button>
                    <button
                      onClick={() => updateStatus(b.id, "cancelled")}
                      className="p-1.5 rounded hover:bg-[#f5f5f5] transition-colors"
                      title="Cancel"
                    >
                      <XCircle className="w-4 h-4 text-red-500" />
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

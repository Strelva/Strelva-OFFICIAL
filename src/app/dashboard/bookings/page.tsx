"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, User, CheckCircle, XCircle } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { IconButton } from "@/components/ui/Button";

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
      <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto space-y-4">
        <SkeletonLine width="w-48" height="h-8" />
        <SkeletonLine width="w-full" height="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-warm-black tracking-tight">Bookings</h1>
        <p className="text-sm text-gray-muted mt-1">Manage your appointment schedule</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-600/5 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <p className="text-2xl font-semibold text-warm-black">{todayBookings.length}</p>
          <p className="text-xs text-gray-muted mt-1">Today</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-warm-black">{weekBookings.length}</p>
          <p className="text-xs text-gray-muted mt-1">This week</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-warm-black">
            {bookings.filter((b) => b.status === "confirmed" && b.date >= today).length}
          </p>
          <p className="text-xs text-gray-muted mt-1">Upcoming</p>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="mb-6">
        <Tabs
          variant="segment"
          items={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
            { value: "all", label: "All" },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as "upcoming" | "past" | "all")}
        />
      </div>

      {/* Bookings list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-5 h-5 text-gray-muted" strokeWidth={1.5} />}
          title={`No ${filter} bookings`}
          description="Bookings will appear here when clients book through your site."
          className="py-16"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <Card
              key={b.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-gray-bg">
                  <span className="text-xs font-bold text-warm-black leading-none">
                    {new Date(b.date + "T12:00:00").getDate()}
                  </span>
                  <span className="text-[11px] text-gray-muted uppercase">
                    {new Date(b.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-black">{b.serviceName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-muted">
                      <Clock className="w-3 h-3" />
                      {formatTime(b.startTime)} – {formatTime(b.endTime)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-muted">
                      <User className="w-3 h-3" />
                      {b.clientName}
                    </span>
                  </div>
                  {b.notes && <p className="text-xs text-gray-subtle mt-1">{b.notes}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={
                  b.status === "confirmed" ? "emerald" :
                  b.status === "completed" ? "sage" :
                  "red"
                }>
                  {b.status}
                </Badge>
                {b.status === "confirmed" && (
                  <div className="flex gap-1 ml-2">
                    <IconButton
                      label="Mark completed"
                      size="sm"
                      onClick={() => updateStatus(b.id, "completed")}
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </IconButton>
                    <IconButton
                      label="Cancel"
                      size="sm"
                      variant="danger"
                      onClick={() => updateStatus(b.id, "cancelled")}
                    >
                      <XCircle className="w-4 h-4 text-red-500" />
                    </IconButton>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

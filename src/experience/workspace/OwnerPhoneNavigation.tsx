"use client";

import { House, Inbox, MessageCircle, LayoutGrid } from "lucide-react";
import type { StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import styles from "./owner-phone-navigation.module.css";

/** Phone destinations use the same routing and release checks as the sidebar. */
export function OwnerPhoneNavigation({ active, onNavigate, askReleased }: { active: StrelvaSection; onNavigate: (section: StrelvaSection) => void; askReleased: boolean }) {
  const items = [{ section: "home" as const, label: "Home", Icon: House }, { section: "requests" as const, label: "Requests", Icon: Inbox }, ...(askReleased ? [{ section: "ask" as const, label: "Chats", Icon: MessageCircle }] : []), { section: "apps" as const, label: "Systems", Icon: LayoutGrid }];
  return <nav className={styles.nav} aria-label="Phone workspace navigation">{items.map(({ section, label, Icon }) => <button type="button" key={section} aria-current={active === section || section === "apps" && active === "system" ? "page" : undefined} onClick={() => onNavigate(section)}><Icon size={20} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></button>)}</nav>;
}

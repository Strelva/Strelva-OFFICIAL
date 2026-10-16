"use client";

/**
 * The sign-in felt's job: the email Strelva is about to send, carrying the
 * address as it is typed, then arriving once it is sent. The form and the
 * felt share one small state through context; without the provider the form
 * keeps its own state and works the same.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { XaPage } from "@/components/ui/strelva/Xa";
import { XaEntryPebbleLine } from "@/components/ui/strelva/xa/entry";
import styles from "./sign-in-mail.module.css";

export type SignInMailStatus = "idle" | "google" | "sending" | "sent" | "error";

interface SignInMail { email: string; status: SignInMailStatus; setEmail(value: string): void; setStatus(value: SignInMailStatus): void }

const SignInMailContext = createContext<SignInMail | null>(null);

export function SignInMailProvider({ children, initialEmail = "", initialStatus = "idle" }: { children: ReactNode; initialEmail?: string; initialStatus?: SignInMailStatus }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<SignInMailStatus>(initialStatus);
  const value = useMemo(() => ({ email, status, setEmail, setStatus }), [email, status]);
  return <SignInMailContext.Provider value={value}>{children}</SignInMailContext.Provider>;
}

/** The shared state when a provider is present; otherwise a local copy. */
export function useSignInMail(initialEmail: string, initialStatus: SignInMailStatus): SignInMail {
  const shared = useContext(SignInMailContext);
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<SignInMailStatus>(initialStatus);
  return shared ?? { email, status, setEmail, setStatus };
}

/** The email on the felt. `code` decides what the email carries. */
export function SignInMailFelt({ code, failed = false }: { code: boolean; failed?: boolean }) {
  const shared = useContext(SignInMailContext);
  const email = shared?.email.trim() ?? "";
  const status = shared?.status ?? "idle";
  const sent = status === "sent";
  const say = failed && !sent ? "The last sign-in didn’t finish. A new email starts it over."
    : sent ? code ? "It’s in your inbox. The code is the first line." : "It’s in your inbox. Open the link on this device."
      : status === "sending" ? "Sending it now."
        : status === "google" ? "Google is asking which account to use."
          : "I send this the moment you ask. There’s no password.";
  return <div className={styles.felt}>
    <XaPage address="Your inbox" label="The sign-in email" title={code ? "Your Strelva sign-in code" : "Sign in to Strelva"}>
      <dl className={styles.meta}>
        <div><dt>From</dt><dd>Strelva</dd></div>
        <div><dt>To</dt><dd data-empty={email ? undefined : true}>{email || "the address you type"}</dd></div>
      </dl>
      <p className={styles.body} data-sent={sent || undefined}>{code ? sent ? <>Your code is <span className={styles.code} aria-hidden="true">• • • • • •</span>. It works once.</> : "A six-digit code goes here when it’s sent. It works once." : "Open this link on the device you’re signing in on. It works once."}</p>
      <p className={styles.state} role="status" data-sent={sent || undefined}>{sent ? "Arrived" : status === "sending" ? "Sending" : "Not sent yet"}</p>
    </XaPage>
    <XaEntryPebbleLine>{say}</XaEntryPebbleLine>
  </div>;
}

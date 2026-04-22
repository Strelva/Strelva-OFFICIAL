"use client";

import React, { createContext, useContext, useMemo, useEffect, useState } from "react";
import { REBClient, createREBClient, ClientInfo } from "./client";

interface REBContextValue {
  client: REBClient;
  clientInfo: ClientInfo | null;
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
}

const REBContext = createContext<REBContextValue | null>(null);

export interface REBProviderProps {
  apiKey: string;
  baseUrl?: string;
  children: React.ReactNode;
}

export function REBProvider({ apiKey, baseUrl, children }: REBProviderProps) {
  const client = useMemo(
    () => createREBClient({ apiKey, baseUrl }),
    [apiKey, baseUrl]
  );

  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    client
      .verifyConnection()
      .then((info) => {
        setClientInfo(info);
        setError(null);
      })
      .catch((err) => {
        setError(err);
        console.error("[REB SDK] Connection failed:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [client]);

  const value = useMemo(
    () => ({
      client,
      clientInfo,
      isConnected: !!clientInfo && !error,
      isLoading,
      error,
    }),
    [client, clientInfo, isLoading, error]
  );

  return <REBContext.Provider value={value}>{children}</REBContext.Provider>;
}

export function useREB() {
  const context = useContext(REBContext);
  if (!context) {
    throw new Error("useREB must be used within a REBProvider");
  }
  return context;
}

export function useREBChat() {
  const { client, isConnected } = useREB();

  const sendMessage = async (
    message: string,
    content: Record<string, unknown>,
    context?: { siteName?: string; ownerName?: string }
  ) => {
    if (!isConnected) {
      throw new Error("REB client not connected");
    }
    return client.chat({ message, content, context });
  };

  return { sendMessage, isConnected };
}

export function useREBSuggestions() {
  const { client, isConnected } = useREB();

  const getSuggestions = async (
    content: Record<string, unknown>,
    lastUpdated?: Record<string, string>
  ) => {
    if (!isConnected) {
      throw new Error("REB client not connected");
    }
    return client.getSuggestions({ content, lastUpdated });
  };

  return { getSuggestions, isConnected };
}

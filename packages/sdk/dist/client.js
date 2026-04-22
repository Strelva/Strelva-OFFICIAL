"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  REBClient: () => REBClient,
  createREBClient: () => createREBClient
});
module.exports = __toCommonJS(client_exports);
var REBClient = class {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://reb.studio";
  }
  async fetch(path, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers
      }
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }
  async verifyConnection() {
    return this.fetch("/client");
  }
  async chat(request) {
    return this.fetch("/chat", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
  async getSuggestions(request) {
    return this.fetch("/suggest", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
  async generateReport(request) {
    return this.fetch("/report", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
};
function createREBClient(config) {
  return new REBClient(config);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  REBClient,
  createREBClient
});

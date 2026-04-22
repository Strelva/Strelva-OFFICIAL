// src/client.ts
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

export {
  REBClient,
  createREBClient
};

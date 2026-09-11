/** Stable, browser-safe errors for the Customers read boundary. */
export class CustomerAccessError extends Error {
  constructor() {
    super("Customer organization access denied");
    this.name = "CustomerAccessError";
  }
}

export class CustomerUnavailableError extends Error {
  constructor() {
    super("Customer is unavailable");
    this.name = "CustomerUnavailableError";
  }
}

/** A mapped source was authorized but could not produce a bounded read. */
export class CustomerSourceError extends Error {
  constructor() {
    super("Customer source is unavailable");
    this.name = "CustomerSourceError";
  }
}

export class CustomerInputError extends Error {
  constructor(message = "Customer request is invalid") {
    super(message);
    this.name = "CustomerInputError";
  }
}

export class CustomerCursorError extends CustomerInputError {
  constructor() {
    super("Customer cursor is invalid");
    this.name = "CustomerCursorError";
  }
}

export class CustomerScopeChangedError extends Error {
  constructor() {
    super("Customer access changed while the resource was being read");
    this.name = "CustomerScopeChangedError";
  }
}

export class CustomerStoreError extends Error {
  constructor() {
    super("Customer data is unavailable");
    this.name = "CustomerStoreError";
  }
}

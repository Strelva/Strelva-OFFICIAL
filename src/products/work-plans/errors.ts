


export class WorkPlanUnavailableError extends Error {
  constructor(message = "Planning is unavailable") {
    super(message);
    this.name = "WorkPlanUnavailableError";
  }
}

/** Model-backed planning is unavailable until an accepted work-economics job exists. */
export class WorkPlanFundingRequiredError extends Error {
  constructor(message = "Accept a planning budget before requesting a model-backed plan.") {
    super(message);
    this.name = "WorkPlanFundingRequiredError";
  }
}

/** A durable model receipt without a saved result must never trigger a second call. */
export class WorkPlanGenerationReplayError extends Error {
  constructor(message = "A previous planning call has a durable receipt but its result was not saved. Inspect or reconcile that receipt before retrying.") {
    super(message);
    this.name = "WorkPlanGenerationReplayError";
  }
}

export class WorkPlanUnsupportedOperationError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super(`The planning model proposed an unsupported native operation: ${operationId}`);
    this.name = "WorkPlanUnsupportedOperationError";
    this.operationId = operationId;
  }
}

export class WorkPlanInvalidOutputError extends Error {
  constructor(message = "The planning model returned an invalid plan") {
    super(message);
    this.name = "WorkPlanInvalidOutputError";
  }
}

export class WorkPlanNotFoundError extends Error {
  constructor(message = "The saved work plan is unavailable") {
    super(message);
    this.name = "WorkPlanNotFoundError";
  }
}

export class WorkPlanExecutionConflictError extends Error {
  constructor(message = "The saved plan changed before this output was accepted") {
    super(message);
    this.name = "WorkPlanExecutionConflictError";
  }
}

export class WorkPlanExecutionUnsupportedError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super(`The plan output cannot run the native operation: ${operationId}`);
    this.name = "WorkPlanExecutionUnsupportedError";
    this.operationId = operationId;
  }
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class IntegrationError extends AppError {
  constructor(provider: string, message: string) {
    super(`${provider}: ${message}`, 'INTEGRATION_ERROR', 502);
    this.name = 'IntegrationError';
  }
}

export class AntiTriggerBlockError extends AppError {
  constructor(
    accountId: string,
    public readonly antiTriggers: string[]
  ) {
    super(
      `Account ${accountId} blocked by anti-triggers: ${antiTriggers.join(', ')}`,
      'ANTI_TRIGGER_BLOCK',
      403
    );
    this.name = 'AntiTriggerBlockError';
  }
}

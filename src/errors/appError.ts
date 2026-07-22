export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly isOperational = true 
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}


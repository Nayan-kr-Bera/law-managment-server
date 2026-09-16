import { Request, Response, NextFunction } from "express";
export class AppError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errWithStatus = err as { status?: number; message?: string };
  if (typeof errWithStatus?.status === "number") {
    return res.status(errWithStatus.status).json({
      success: false,
      message: errWithStatus.message || "An error occurred",
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }

  if (err instanceof Error) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};

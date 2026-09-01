import type { IUserJwtPayload, IClientJwtPayload, ISubscriptionContext } from "./payload.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: IUserJwtPayload;
      clientUser?: IClientJwtPayload;
      tenantId?: string;
      officeId?: string;
      subscription?: ISubscriptionContext;
    }
  }
}

export { };

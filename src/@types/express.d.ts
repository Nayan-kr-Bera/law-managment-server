import type { IUserJwtPayload, IAdminJwtPayload, IClientJwtPayload, ISubscriptionContext } from "./payload.types.js";

declare global {
  namespace Express {
    interface Request {
      user: IUserJwtPayload;
      adminUser?: IAdminJwtPayload;
      clientUser?: IClientJwtPayload;
      tenantId?: string;
      officeId?: string;
      subscription?: ISubscriptionContext;
    }
  }
}

export { };

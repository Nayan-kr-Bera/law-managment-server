export interface IUserJwtPayload {
  userId: string;
  tenantId: string;
  scopeId: string;
  email: string;
  roleIds: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  iat?: number;
  exp?: number;
}

export type IJwtPayload = IUserJwtPayload;

export interface IClientJwtPayload {
  clientUserId: string;
  clientId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface ISubscriptionContext {
  tenantId: string;
  planId: string;
  planName: string;
  planCode: string;
  status: "active" | "canceled" | "expired" | "past_due" | "trial";
  billingCycle: "monthly" | "annual";
  maxUsers: number;
  maxOffices: number;
  maxStorageGb: number;
  features: string[];
  nextBillingDate: string | Date;
  autoRenew: boolean;
}

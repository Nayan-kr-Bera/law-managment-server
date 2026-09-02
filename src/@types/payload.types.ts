export interface IUserJwtPayload {
  userId: string;
  id?: string;
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
  /** The global client identity ID (clients.id) */
  clientUserId: string;
  clientId: string;
  email: string;

  /**
   * Active client_profiles.id — the selected law firm engagement.
   * Present on fully-scoped tokens. Absent on pre-auth tokens
   * (when client has multiple profiles and must pick one).
   */
  profileId?: string;

  /** Active tenantId — same as clientProfiles.tenantId */
  tenantId?: string;

  /** Active officeId — same as clientProfiles.officeId */
  officeId?: string;

  /**
   * When true, the token is a short-lived pre-auth token.
   * The client must call POST /auth/select-profile to get a full token.
   */
  requiresProfileSelection?: boolean;

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

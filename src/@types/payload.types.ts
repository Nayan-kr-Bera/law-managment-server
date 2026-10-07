export interface IUserJwtPayload {
  userId: string;
  tenantId: string;
  scopeId: string;
  email: string;
  name?: string;
  role?: string;
  roleIds: string[];
  permissions: string[];
  isTenantAdmin?: boolean;
  portal?: "tenant";
  iat?: number;
  exp?: number;
}

export interface IAdminJwtPayload {
  userId: string;
  adminId?: string;
  email: string;
  role: "admin" | "super_admin" | string;
  roleId?: string;
  permissions: string[];
  isSuperAdmin: boolean;
  isAdminPortalUser?: boolean;
  portal: "admin";
  iat?: number;
  exp?: number;
}

export type IJwtPayload = IUserJwtPayload | IAdminJwtPayload;

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

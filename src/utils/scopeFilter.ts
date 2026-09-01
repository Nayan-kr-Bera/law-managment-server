// import { eq, SQL } from "drizzle-orm";
// import { IUserJwtPayload } from "../@types/payload.types.js";


// export const getCollegeScopeWhere = (
//   user:IUserJwtPayload
// ): SQL | undefined => {
//   const { companyId, collegeId } = user.scope || {};
//   console.log("🔍 User Scope:", { companyId, collegeId });

//   // ✅ If college scoped → highest priority (most restrictive)
//   if (collegeId) {
//     return eq(colleges.id, collegeId);
//   }

//   // ✅ If company scoped → filter all colleges under company
//   if (companyId) {
//     return eq(colleges.companyId, companyId);
//   }

//   // ✅ No scope → full access (super admin)
//   return undefined;
// };
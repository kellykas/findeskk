/**
 * Permission helpers.
 *
 * The vocabulary and matrix live in `./roles`; this module re-exports them so
 * pages can import from either path without two definitions drifting apart.
 */
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  isStaffAdmin,
  type Permission,
  type Role,
} from "./roles";

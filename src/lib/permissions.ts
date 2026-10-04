import type { Role } from "./types";

export type ProductRole = "ADMIN" | "REGISTERED_USER";
// Legacy Finance accounts share the Admin shell without gaining CFO privileges.
export const isAdmin = (role: Role | undefined) =>
  role === "CFO_ADMIN" || role === "OCFO_MEMBER";
export const isRegisteredUser = (role: Role | undefined) =>
  role === "DEPARTMENT_MEMBER";
export const productRole = (role: Role): ProductRole =>
  isAdmin(role) ? "ADMIN" : "REGISTERED_USER";
export function assertCanFile(role: Role | undefined) {
  if (isAdmin(role))
    throw new Error(
      "Finance Administrator accounts cannot submit financial requests.",
    );
  if (!isRegisteredUser(role))
    throw new Error(
      "A registered department membership is required to file a request.",
    );
}

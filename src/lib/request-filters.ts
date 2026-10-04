export const requestFilterKeys = [
  "status",
  "department",
  "type",
  "project",
] as const;
export const requestQueryKeys = ["year", ...requestFilterKeys, "page"] as const;
export type RequestFilters = Partial<
  Record<(typeof requestQueryKeys)[number] | "notice", string>
>;
export function hasRequestFilters(params: RequestFilters) {
  return requestFilterKeys.some((key) => !!params[key]);
}

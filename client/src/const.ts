export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Returns the local login page path (replaces Manus OAuth portal)
export const getLoginUrl = (_returnPath?: string) => "/login";

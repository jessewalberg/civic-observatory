// Server functions for auth
export {
	getAuth,
	getSignInUrl,
	getSignUpUrl,
	signOut,
} from "./serverFunctions";
export { configure, getConfig } from "./ssr/config";
// Types
export type {
	AuthKitConfig,
	AuthResponse,
	GetAuthURLOptions,
	NoUserInfo,
	Session,
	UserInfo,
} from "./ssr/interfaces";
// SSR utilities
export {
	getAuth as getAuthFromRequest,
	getAuthorizationUrl,
	getClearSessionCookie,
	getSessionFromCookie,
	saveSession,
} from "./ssr/session";
export { getWorkOS } from "./ssr/workos";

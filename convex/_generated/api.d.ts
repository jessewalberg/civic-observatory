/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as functions_rateLimit_mutations from "../functions/rateLimit/mutations.js";
import type * as functions_rateLimit_queries from "../functions/rateLimit/queries.js";
import type * as functions_users_mutations from "../functions/users/mutations.js";
import type * as functions_users_queries from "../functions/users/queries.js";
import type * as lib_constants_limits from "../lib/constants/limits.js";
import type * as lib_permissions_helpers from "../lib/permissions/helpers.js";
import type * as lib_permissions_index from "../lib/permissions/index.js";
import type * as lib_permissions_roles from "../lib/permissions/roles.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "functions/rateLimit/mutations": typeof functions_rateLimit_mutations;
  "functions/rateLimit/queries": typeof functions_rateLimit_queries;
  "functions/users/mutations": typeof functions_users_mutations;
  "functions/users/queries": typeof functions_users_queries;
  "lib/constants/limits": typeof lib_constants_limits;
  "lib/permissions/helpers": typeof lib_permissions_helpers;
  "lib/permissions/index": typeof lib_permissions_index;
  "lib/permissions/roles": typeof lib_permissions_roles;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

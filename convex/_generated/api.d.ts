/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as data_index from "../data/index.js";
import type * as data_states_alabama from "../data/states/alabama.js";
import type * as data_states_alaska from "../data/states/alaska.js";
import type * as data_states_arizona from "../data/states/arizona.js";
import type * as data_states_arkansas from "../data/states/arkansas.js";
import type * as data_states_california from "../data/states/california.js";
import type * as data_states_colorado from "../data/states/colorado.js";
import type * as data_states_connecticut from "../data/states/connecticut.js";
import type * as data_states_delaware from "../data/states/delaware.js";
import type * as data_states_florida from "../data/states/florida.js";
import type * as data_states_georgia from "../data/states/georgia.js";
import type * as data_states_hawaii from "../data/states/hawaii.js";
import type * as data_states_idaho from "../data/states/idaho.js";
import type * as data_states_illinois from "../data/states/illinois.js";
import type * as data_states_indiana from "../data/states/indiana.js";
import type * as data_states_iowa from "../data/states/iowa.js";
import type * as data_states_kansas from "../data/states/kansas.js";
import type * as data_states_kentucky from "../data/states/kentucky.js";
import type * as data_states_louisiana from "../data/states/louisiana.js";
import type * as data_states_maine from "../data/states/maine.js";
import type * as data_states_maryland from "../data/states/maryland.js";
import type * as data_states_massachusetts from "../data/states/massachusetts.js";
import type * as data_states_michigan from "../data/states/michigan.js";
import type * as data_states_minnesota from "../data/states/minnesota.js";
import type * as data_states_mississippi from "../data/states/mississippi.js";
import type * as data_states_missouri from "../data/states/missouri.js";
import type * as data_states_montana from "../data/states/montana.js";
import type * as data_states_nebraska from "../data/states/nebraska.js";
import type * as data_states_nevada from "../data/states/nevada.js";
import type * as data_states_new_hampshire from "../data/states/new_hampshire.js";
import type * as data_states_new_jersey from "../data/states/new_jersey.js";
import type * as data_states_new_mexico from "../data/states/new_mexico.js";
import type * as data_states_new_york from "../data/states/new_york.js";
import type * as data_states_north_carolina from "../data/states/north_carolina.js";
import type * as data_states_north_dakota from "../data/states/north_dakota.js";
import type * as data_states_ohio from "../data/states/ohio.js";
import type * as data_states_oklahoma from "../data/states/oklahoma.js";
import type * as data_states_oregon from "../data/states/oregon.js";
import type * as data_states_pennsylvania from "../data/states/pennsylvania.js";
import type * as data_states_rhode_island from "../data/states/rhode_island.js";
import type * as data_states_south_carolina from "../data/states/south_carolina.js";
import type * as data_states_south_dakota from "../data/states/south_dakota.js";
import type * as data_states_tennessee from "../data/states/tennessee.js";
import type * as data_states_texas from "../data/states/texas.js";
import type * as data_states_utah from "../data/states/utah.js";
import type * as data_states_vermont from "../data/states/vermont.js";
import type * as data_states_virginia from "../data/states/virginia.js";
import type * as data_states_washington from "../data/states/washington.js";
import type * as data_states_west_virginia from "../data/states/west_virginia.js";
import type * as data_states_wisconsin from "../data/states/wisconsin.js";
import type * as data_states_wyoming from "../data/states/wyoming.js";
import type * as data_timezones from "../data/timezones.js";
import type * as data_types from "../data/types.js";
import type * as functions_ai_extractPdf from "../functions/ai/extractPdf.js";
import type * as functions_ai_index from "../functions/ai/index.js";
import type * as functions_ai_mutations from "../functions/ai/mutations.js";
import type * as functions_ai_ocrPdf from "../functions/ai/ocrPdf.js";
import type * as functions_ai_queries from "../functions/ai/queries.js";
import type * as functions_ai_summarize from "../functions/ai/summarize.js";
import type * as functions_alerts_index from "../functions/alerts/index.js";
import type * as functions_alerts_mutations from "../functions/alerts/mutations.js";
import type * as functions_alerts_queries from "../functions/alerts/queries.js";
import type * as functions_email_actions from "../functions/email/actions.js";
import type * as functions_email_index from "../functions/email/index.js";
import type * as functions_email_templates from "../functions/email/templates.js";
import type * as functions_meetings_index from "../functions/meetings/index.js";
import type * as functions_meetings_mutations from "../functions/meetings/mutations.js";
import type * as functions_meetings_queries from "../functions/meetings/queries.js";
import type * as functions_municipalities_discovery from "../functions/municipalities/discovery.js";
import type * as functions_municipalities_mutations from "../functions/municipalities/mutations.js";
import type * as functions_municipalities_probe from "../functions/municipalities/probe.js";
import type * as functions_municipalities_queries from "../functions/municipalities/queries.js";
import type * as functions_rateLimit_mutations from "../functions/rateLimit/mutations.js";
import type * as functions_rateLimit_queries from "../functions/rateLimit/queries.js";
import type * as functions_scrapeJobs_index from "../functions/scrapeJobs/index.js";
import type * as functions_scrapeJobs_mutations from "../functions/scrapeJobs/mutations.js";
import type * as functions_scrapeJobs_queries from "../functions/scrapeJobs/queries.js";
import type * as functions_scrapers_actions from "../functions/scrapers/actions.js";
import type * as functions_scrapers_index from "../functions/scrapers/index.js";
import type * as functions_scrapers_mutations from "../functions/scrapers/mutations.js";
import type * as functions_scrapers_queries from "../functions/scrapers/queries.js";
import type * as functions_storage_mutations from "../functions/storage/mutations.js";
import type * as functions_stripe_actions from "../functions/stripe/actions.js";
import type * as functions_stripe_mutations from "../functions/stripe/mutations.js";
import type * as functions_subscriptions_index from "../functions/subscriptions/index.js";
import type * as functions_subscriptions_mutations from "../functions/subscriptions/mutations.js";
import type * as functions_subscriptions_queries from "../functions/subscriptions/queries.js";
import type * as functions_summaries_queries from "../functions/summaries/queries.js";
import type * as functions_usage_mutations from "../functions/usage/mutations.js";
import type * as functions_usage_queries from "../functions/usage/queries.js";
import type * as functions_users_mutations from "../functions/users/mutations.js";
import type * as functions_users_queries from "../functions/users/queries.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_constants_limits from "../lib/constants/limits.js";
import type * as lib_permissions_helpers from "../lib/permissions/helpers.js";
import type * as lib_permissions_index from "../lib/permissions/index.js";
import type * as lib_permissions_roles from "../lib/permissions/roles.js";
import type * as scrapers_civicplus from "../scrapers/civicplus.js";
import type * as scrapers_generic from "../scrapers/generic.js";
import type * as scrapers_granicus from "../scrapers/granicus.js";
import type * as scrapers_index from "../scrapers/index.js";
import type * as scrapers_init from "../scrapers/init.js";
import type * as scrapers_legistarApi from "../scrapers/legistarApi.js";
import type * as scrapers_registry from "../scrapers/registry.js";
import type * as scrapers_types from "../scrapers/types.js";
import type * as scrapers_utils from "../scrapers/utils.js";
import type * as seed from "../seed.js";
import type * as seedMunicipalities from "../seedMunicipalities.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "data/index": typeof data_index;
  "data/states/alabama": typeof data_states_alabama;
  "data/states/alaska": typeof data_states_alaska;
  "data/states/arizona": typeof data_states_arizona;
  "data/states/arkansas": typeof data_states_arkansas;
  "data/states/california": typeof data_states_california;
  "data/states/colorado": typeof data_states_colorado;
  "data/states/connecticut": typeof data_states_connecticut;
  "data/states/delaware": typeof data_states_delaware;
  "data/states/florida": typeof data_states_florida;
  "data/states/georgia": typeof data_states_georgia;
  "data/states/hawaii": typeof data_states_hawaii;
  "data/states/idaho": typeof data_states_idaho;
  "data/states/illinois": typeof data_states_illinois;
  "data/states/indiana": typeof data_states_indiana;
  "data/states/iowa": typeof data_states_iowa;
  "data/states/kansas": typeof data_states_kansas;
  "data/states/kentucky": typeof data_states_kentucky;
  "data/states/louisiana": typeof data_states_louisiana;
  "data/states/maine": typeof data_states_maine;
  "data/states/maryland": typeof data_states_maryland;
  "data/states/massachusetts": typeof data_states_massachusetts;
  "data/states/michigan": typeof data_states_michigan;
  "data/states/minnesota": typeof data_states_minnesota;
  "data/states/mississippi": typeof data_states_mississippi;
  "data/states/missouri": typeof data_states_missouri;
  "data/states/montana": typeof data_states_montana;
  "data/states/nebraska": typeof data_states_nebraska;
  "data/states/nevada": typeof data_states_nevada;
  "data/states/new_hampshire": typeof data_states_new_hampshire;
  "data/states/new_jersey": typeof data_states_new_jersey;
  "data/states/new_mexico": typeof data_states_new_mexico;
  "data/states/new_york": typeof data_states_new_york;
  "data/states/north_carolina": typeof data_states_north_carolina;
  "data/states/north_dakota": typeof data_states_north_dakota;
  "data/states/ohio": typeof data_states_ohio;
  "data/states/oklahoma": typeof data_states_oklahoma;
  "data/states/oregon": typeof data_states_oregon;
  "data/states/pennsylvania": typeof data_states_pennsylvania;
  "data/states/rhode_island": typeof data_states_rhode_island;
  "data/states/south_carolina": typeof data_states_south_carolina;
  "data/states/south_dakota": typeof data_states_south_dakota;
  "data/states/tennessee": typeof data_states_tennessee;
  "data/states/texas": typeof data_states_texas;
  "data/states/utah": typeof data_states_utah;
  "data/states/vermont": typeof data_states_vermont;
  "data/states/virginia": typeof data_states_virginia;
  "data/states/washington": typeof data_states_washington;
  "data/states/west_virginia": typeof data_states_west_virginia;
  "data/states/wisconsin": typeof data_states_wisconsin;
  "data/states/wyoming": typeof data_states_wyoming;
  "data/timezones": typeof data_timezones;
  "data/types": typeof data_types;
  "functions/ai/extractPdf": typeof functions_ai_extractPdf;
  "functions/ai/index": typeof functions_ai_index;
  "functions/ai/mutations": typeof functions_ai_mutations;
  "functions/ai/ocrPdf": typeof functions_ai_ocrPdf;
  "functions/ai/queries": typeof functions_ai_queries;
  "functions/ai/summarize": typeof functions_ai_summarize;
  "functions/alerts/index": typeof functions_alerts_index;
  "functions/alerts/mutations": typeof functions_alerts_mutations;
  "functions/alerts/queries": typeof functions_alerts_queries;
  "functions/email/actions": typeof functions_email_actions;
  "functions/email/index": typeof functions_email_index;
  "functions/email/templates": typeof functions_email_templates;
  "functions/meetings/index": typeof functions_meetings_index;
  "functions/meetings/mutations": typeof functions_meetings_mutations;
  "functions/meetings/queries": typeof functions_meetings_queries;
  "functions/municipalities/discovery": typeof functions_municipalities_discovery;
  "functions/municipalities/mutations": typeof functions_municipalities_mutations;
  "functions/municipalities/probe": typeof functions_municipalities_probe;
  "functions/municipalities/queries": typeof functions_municipalities_queries;
  "functions/rateLimit/mutations": typeof functions_rateLimit_mutations;
  "functions/rateLimit/queries": typeof functions_rateLimit_queries;
  "functions/scrapeJobs/index": typeof functions_scrapeJobs_index;
  "functions/scrapeJobs/mutations": typeof functions_scrapeJobs_mutations;
  "functions/scrapeJobs/queries": typeof functions_scrapeJobs_queries;
  "functions/scrapers/actions": typeof functions_scrapers_actions;
  "functions/scrapers/index": typeof functions_scrapers_index;
  "functions/scrapers/mutations": typeof functions_scrapers_mutations;
  "functions/scrapers/queries": typeof functions_scrapers_queries;
  "functions/storage/mutations": typeof functions_storage_mutations;
  "functions/stripe/actions": typeof functions_stripe_actions;
  "functions/stripe/mutations": typeof functions_stripe_mutations;
  "functions/subscriptions/index": typeof functions_subscriptions_index;
  "functions/subscriptions/mutations": typeof functions_subscriptions_mutations;
  "functions/subscriptions/queries": typeof functions_subscriptions_queries;
  "functions/summaries/queries": typeof functions_summaries_queries;
  "functions/usage/mutations": typeof functions_usage_mutations;
  "functions/usage/queries": typeof functions_usage_queries;
  "functions/users/mutations": typeof functions_users_mutations;
  "functions/users/queries": typeof functions_users_queries;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/constants/limits": typeof lib_constants_limits;
  "lib/permissions/helpers": typeof lib_permissions_helpers;
  "lib/permissions/index": typeof lib_permissions_index;
  "lib/permissions/roles": typeof lib_permissions_roles;
  "scrapers/civicplus": typeof scrapers_civicplus;
  "scrapers/generic": typeof scrapers_generic;
  "scrapers/granicus": typeof scrapers_granicus;
  "scrapers/index": typeof scrapers_index;
  "scrapers/init": typeof scrapers_init;
  "scrapers/legistarApi": typeof scrapers_legistarApi;
  "scrapers/registry": typeof scrapers_registry;
  "scrapers/types": typeof scrapers_types;
  "scrapers/utils": typeof scrapers_utils;
  seed: typeof seed;
  seedMunicipalities: typeof seedMunicipalities;
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

// ScrapeJob queries

// ScrapeJob mutations
export {
	cancel,
	clearStuck,
	create,
	deleteOld,
	retry,
	update,
} from "./mutations";
export {
	getByMunicipality,
	getFailed,
	getJobDetail,
	getRecent,
	getRunning,
	getStats,
} from "./queries";

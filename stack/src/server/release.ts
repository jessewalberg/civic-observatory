// Vite embeds the checkout's full SHA in local and Alchemy builds.
export const commitSha: string = import.meta.env.VITE_COMMIT_SHA;

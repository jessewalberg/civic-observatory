/// <reference types="vite/client" />
// Shared convex-test module map. Vite's import.meta.glob must be rooted here
// (the convex/ dir) so convex-test can resolve function paths like
// "functions/users/queries". Excludes *.test.ts / *.setup.ts style files.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");

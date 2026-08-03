/**
 * The docs directory name the host CLI injects at runtime.
 *
 * Kanban itself never hardcodes it: the host owns the constant. Tests pin the value
 * the AIDD CLI passes so the fixtures they build on disk match what the repository reads.
 */
export const DOCS_DIRECTORY_NAME = "aidd_docs";

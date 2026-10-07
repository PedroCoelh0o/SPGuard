// All data operations use the local server. Windows' internet connection
// indicator must never pause SQLite reads or writes.
export const localQueryOptions = {
  queries: { networkMode: "always" as const, retry: 1 },
  // A write must not be retried automatically: the first attempt may already
  // have been committed before a transport error was reported.
  mutations: { networkMode: "always" as const, retry: false as const },
};

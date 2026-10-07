import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { localQueryOptions } from "./lib/local-query-options";

export const getRouter = () => {
  const queryClient = new QueryClient({ defaultOptions: localQueryOptions });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

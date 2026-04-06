/**
 * Central router definition — import this file anywhere you need typed routes.
 * Defining all routes here means the `declare module` augmentation is available
 * to every component that imports from this module.
 */
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

function RouteError({ error }: { error: Error }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 text-center">
      <p className="text-4xl mb-4">⚠️</p>
      <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Page error</h2>
      <pre className="text-xs text-left bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 overflow-auto text-red-700 dark:text-red-300 whitespace-pre-wrap">
        {error?.message ?? String(error)}
        {error?.stack ? `\n\n${error.stack}` : ""}
      </pre>
    </div>
  );
}

import { RootLayout } from "./RootLayout.tsx";
import { TopicsPage } from "./routes/topics/index";
import { TopicDetailPage } from "./routes/topics/$topicId";
import { PracticePage } from "./routes/practice/$topicId.$langCode";
import { DashboardPage } from "./routes/index";
import { SettingsPage } from "./routes/settings";
import { ImportPage } from "./routes/import";

export const rootRoute = createRootRoute({ component: RootLayout, errorComponent: ({ error }) => <RouteError error={error as Error} /> });
export const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage, errorComponent: ({ error }) => <RouteError error={error as Error} /> });
export const topicsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/topics", component: TopicsPage });
export const topicDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/topics/$topicId", component: TopicDetailPage });
export const practiceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/practice/$topicId/$langCode", component: PracticePage });
export const importRoute = createRoute({ getParentRoute: () => rootRoute, path: "/import", component: ImportPage, errorComponent: ({ error }) => <RouteError error={error as Error} /> });
export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage, errorComponent: ({ error }) => <RouteError error={error as Error} /> });

const routeTree = rootRoute.addChildren([
  indexRoute,
  topicsRoute,
  topicDetailRoute,
  practiceRoute,
  importRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

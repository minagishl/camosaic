import { Navigate, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "../components/layout";
import { HostRoute } from "../features/host/host-route";
import { ChildRoute } from "../features/child/child-route";
import { LabRoute } from "../features/lab/lab-route";

const rootRoute = createRootRoute({ component: AppLayout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <Navigate to="/host" replace /> });
const hostRoute = createRoute({ getParentRoute: () => rootRoute, path: "/host", component: HostRoute });
const childRoute = createRoute({ getParentRoute: () => rootRoute, path: "/child", component: ChildRoute });
const labRoute = createRoute({ getParentRoute: () => rootRoute, path: "/lab", component: LabRoute });
const routeTree = rootRoute.addChildren([indexRoute, hostRoute, childRoute, labRoute]);

export const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

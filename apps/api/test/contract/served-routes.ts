import type { Express } from 'express';

/** the parts of Express 5's router layers read here */
interface Layer {
  slash: boolean;
  path?: string;
  match(path: string): boolean;
  route?: Route;
  handle: { stack?: Layer[] };
}

interface Route {
  path: string;
  methods: Record<string, boolean>;
}

export interface ServedRoute {
  method: string;
  /** as written in its router, without the prefix it is mounted under */
  path: string;
  route: Route;
}

function stackOf(app: Express) {
  return (app.router as unknown as { stack: Layer[] }).stack;
}

function handles(route: Route, method: string) {
  return route.methods[method.toLowerCase()] === true;
}

/** every method and path the app's routers declare, middleware left out */
export function servedRoutes(app: Express): ServedRoute[] {
  const found: ServedRoute[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          found.push({ method: method.toUpperCase(), path: layer.route.path, route: layer.route });
        }
      } else if (layer.handle.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(stackOf(app));
  return found;
}

/**
 * the route a request would reach, found with the router's own matching and in
 * its order, or null when it would fall through to the 404
 */
export function routeFor(app: Express, method: string, path: string): Route | null {
  const search = (stack: Layer[], rest: string): Route | null => {
    for (const layer of stack) {
      if (!layer.match(rest)) continue;
      if (layer.route) {
        if (handles(layer.route, method)) return layer.route;
      } else if (layer.handle.stack) {
        // a router mounted under a prefix sees the path with the prefix taken off
        const inner = layer.slash ? rest : rest.slice(layer.path!.length) || '/';
        const route = search(layer.handle.stack, inner);
        if (route) return route;
      }
    }
    return null;
  };
  return search(stackOf(app), path);
}

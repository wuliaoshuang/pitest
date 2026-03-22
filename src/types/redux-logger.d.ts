declare module "redux-logger" {
  import type { Middleware } from "@reduxjs/toolkit";

  export type LoggerOptions = {
    collapsed?: boolean | ((...args: unknown[]) => boolean);
    duration?: boolean;
  };

  export function createLogger(options?: LoggerOptions): Middleware;
}

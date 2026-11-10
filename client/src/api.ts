// Local API for the standalone build.
//
// The client used to call server actions over RPC. The standalone build
// runs the same action logic in the browser instead: `api` below is the
// ported implementation in ./local/actions.ts, exposing the same method
// names, argument shapes, and response shapes the client has always
// used. Progress and sessions persist in localStorage (see
// ./local/store.ts), the question bank and glossary are bundled from
// ./data, and nothing leaves the device.
//
// ApiRequest and ApiResponse keep their original meaning so client code
// can keep writing:
//
//     import { api, type ApiResponse } from "./api";
//     type Session = ApiResponse<typeof api, "startSession">;

import { localActions } from "./local/actions";

export const api = localActions;

export type ApiRequest<TActions, K extends keyof TActions> =
  TActions[K] extends (args: infer A) => unknown ? A : never;

export type ApiResponse<TActions, K extends keyof TActions> =
  TActions[K] extends (args: never) => Promise<infer R> ? R : never;

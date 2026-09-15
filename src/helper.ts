import { errorCodeToString, processErrorResponse } from "@zondax/ledger-js";
import { ADDRLEN, PKLEN, PRINCIPAL_LEN } from "./consts";
import {
  type ResponseAddress,
  type ResponseBase,
  type ResponseTokenInfo,
  type ResponseTokenRegistrySize,
} from "./types";

/**
 * Flattens a thrown error into the plain `{ returnCode, errorMessage }` value this SDK
 * has always resolved to.
 *
 * `processErrorResponse` returned a plain object through `@zondax/ledger-js` 0.2.x. At
 * 2.0.0 it returns a `ResponseError`, which is an `Error` subclass, and the difference is
 * observable in two ways that reach callers:
 *
 * - `structuredClone` keeps only an Error's `name` / `message` / `stack`, so `returnCode`
 *   and `errorMessage` come back `undefined`. That is the algorithm behind `postMessage`,
 *   web workers and Electron IPC -- all of which sit between this SDK and a UI in practice.
 * - `resp instanceof Error` is a common stand-in for "this threw". An error returned as a
 *   *value* would now answer yes to it.
 *
 * Every rejection path in this package routes through here so neither changes.
 */
export function toResponse(e: unknown): ResponseBase {
  const { returnCode, errorMessage } = processErrorResponse(e);
  return { returnCode, errorMessage };
}

export function processGetAddrResponse(response: Buffer): ResponseAddress {
  const errorCodeData = response.subarray(-2);
  const returnCode = errorCodeData[0] * 256 + errorCodeData[1];

  const publicKey = Buffer.from(response.subarray(0, PKLEN));
  response = response.subarray(PKLEN);

  const principal = Buffer.from(response.subarray(0, PRINCIPAL_LEN));
  response = response.subarray(PRINCIPAL_LEN);

  const address = Buffer.from(response.subarray(0, ADDRLEN));
  response = response.subarray(ADDRLEN);

  const principalText = Buffer.from(response.subarray(0, -2))
    .toString()
    .replace(/(.{5})/g, "$1-");
  return {
    publicKey,
    principal,
    address,
    principalText,
    returnCode,
    errorMessage: errorCodeToString(returnCode),
  };
}

export function processTokenRegistrySizeResponse(
  response: Buffer,
): ResponseTokenRegistrySize {
  const errorCodeData = response.subarray(-2);
  const returnCode = errorCodeData[0] * 256 + errorCodeData[1];
  let errorMessage = errorCodeToString(returnCode);

  let RegistrySize = response[0];

  return {
    RegistrySize,
    returnCode,
    errorMessage,
  };
}

export function processTokenInfoResponse(
  response: Buffer,
): ResponseTokenInfo | null {
  const errorCodeData = response.subarray(-2);
  const returnCode = errorCodeData[0] * 256 + errorCodeData[1];

  let offset = 0;

  // Read canister ID
  const canisterIdLength = response[offset];
  offset += 1;
  const canisterId = response
    .slice(offset, offset + canisterIdLength)
    .toString("utf8");
  offset += canisterIdLength;

  // Read token symbol
  const symbolLength = response[offset];
  offset += 1;
  const tokenSymbol = response
    .slice(offset, offset + symbolLength)
    .toString("utf8");
  offset += symbolLength;

  // Read decimals (uint8)
  const decimals = response[offset];

  let tokenInfo = {
    canisterId,
    tokenSymbol,
    decimals,
  };

  return {
    tokenInfo,
    returnCode,
    errorMessage: errorCodeToString(returnCode),
  };
}

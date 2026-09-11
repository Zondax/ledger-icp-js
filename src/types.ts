import { type INSGeneric } from "@zondax/ledger-js";

/**
 * Base shape every response in this SDK carries.
 *
 * `@zondax/ledger-js` used to export this and dropped it at 1.0, when BaseApp moved from
 * returning errors as values to throwing `ResponseError`. Declaring it here keeps this
 * package's public API exactly as it was -- consumers still read `returnCode` and
 * `errorMessage` off every response -- so upgrading the dependency is not a breaking
 * change for them.
 */
export interface ResponseBase {
  errorMessage: string;
  returnCode: number;
}

export interface ICPIns extends INSGeneric {
  GET_VERSION: 0x00;
  GET_ADDR_SECP256K1: 0x01;
  SIGN_SECP256K1: 0x02;
  SIGN_COMBINED: 0x03;
  SAVE_CONSENT: 0x04;
  SAVE_CANISTER_CALL: 0x05;
  SAVE_CERITIFACE_AND_VERIFY: 0x06;
  GET_REGISTRY_LEN: 0x07;
  GET_TOKEN_I: 0x08;
}

export interface ResponseAddress extends ResponseBase {
  publicKey?: Buffer;
  principal?: Buffer;
  address?: Buffer;
  principalText?: string;
}

export interface ResponseSign extends ResponseBase {
  preSignHash?: Buffer;
  signatureRS?: Buffer;
  signatureDER?: Buffer;
}

export interface ResponseSignUpdateCall extends ResponseBase {
  RequestHash?: Buffer;
  RequestSignatureRS?: Buffer;
  StatusReadHash?: Buffer;
  StatusReadSignatureRS?: Buffer;
}

export interface ResponseTokenRegistrySize extends ResponseBase {
  RegistrySize?: number;
}

export interface TokenInfo {
  canisterId: string;
  tokenSymbol: string;
  decimals: number;
}

export interface ResponseTokenInfo extends ResponseBase {
  tokenInfo?: TokenInfo;
}

export interface ResponseTokenRegistry extends ResponseBase {
  tokenRegistry?: TokenInfo[];
}

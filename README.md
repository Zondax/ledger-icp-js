# @zondax/ledger-icp

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://badge.fury.io/js/%40zondax%2Fledger-template.svg)](https://badge.fury.io/js/%40zondax%2Fledger-template)

This package provides a basic client library to communicate with the Internet Computer App running in a Ledger Nano S, S+, X, Stax and Flex.

We recommend using the npmjs package in order to receive updates/fixes.

## Transports

`InternetComputerApp` accepts any transport that can send an APDU: a legacy `Transport` from
`@ledgerhq/hw-transport`, or a [Device Management Kit](https://www.ledger.com/blog-dmk-rollout)
session wrapped in `DMKTransport` from `@zondax/ledger-js`.

```ts
import InternetComputerApp from "@zondax/ledger-icp";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";

const app = new InternetComputerApp(await TransportNodeHid.create());
```

### Device Management Kit

```ts
import InternetComputerApp from "@zondax/ledger-icp";
import { DMKTransport } from "@zondax/ledger-js";

const sessionId = await dmk.connect({
  device,
  // Not optional for this app -- see below.
  sessionRefresherOptions: { isRefresherDisabled: true },
});

const app = new InternetComputerApp(new DMKTransport(dmk, sessionId));
```

> **Disable the session refresher.** By default a DMK session polls the device with
> `GetAppAndVersion` about once a second, over the same queue your APDUs leave on.
> `sign`, `signUpdateCall` and `signBls` each send their payload as a _sequence_ of chunks,
> awaiting one before sending the next, so a poll can land in a gap between two chunks --
> which the device sees as a foreign APDU mid-flow. hw-transport had no background traffic,
> so this hazard is new with the DMK. Ledger Live disables the refresher in its own DMK
> transport for the same reason.

## Breaking changes in 4.0.0

`@zondax/ledger-js` moves from `0.2.x` to `2.0.0`. The responses this SDK returns are
unchanged -- every method still resolves to a value carrying `returnCode` and `errorMessage`,
on failure as much as on success -- but three inherited members did change:

| 3.x                                                     | 4.0.0                  |                                                                 |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `signSendChunk(chunkIdx, chunkNum, chunk, txtype, ins)` | `signSendChunkTx(...)` | renamed; `BaseApp` claimed the old name for a method of its own |
| `prepareChunks(path, message)`                          | `protected`            | no longer reachable from outside the class                      |
| `acceptedPathLengths`                                   | removed                |                                                                 |

All three are chunk-level internals that `sign()` drives for you; none belongs to a normal
signing flow. In plain JS a call to the old `signSendChunk` now returns a rejected promise
rather than sending anything.

Smaller behaviour changes worth knowing:

- **Node 20 or later** is required; `@zondax/ledger-js` 2.0.0 sets that floor.
- **`@ledgerhq/hw-transport` is no longer installed as a side effect.** This package never
  imported it, but it used to arrive transitively. Declare it yourself if you import it.
- Unknown status codes now resolve to real names: `0x6a88` was `Unknown Return Code: 27272`
  and is now `Referenced Data Not Found`. `0x6985` is reworded to
  `Conditions of Use Not Satisfied`.
- An invalid derivation path now rejects with a `ResponseError` carrying
  `returnCode: 0xFFFFFFFF` and the message `Invalid path length. (e.g "m/44'/5757'/5'/0/3")`,
  where 3.x rejected with a plain `Error` and no code.
- `getVersion().targetId` comes back as `""` rather than `"0"` when the device reports none.

## Notes

Use `yarn install` to avoid issues.

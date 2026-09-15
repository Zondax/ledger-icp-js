/**
 * Guards the contract this SDK keeps across the `@zondax/ledger-js` 0.2.x -> 2.0.0 jump.
 *
 * Two things here are only held in place by code in `src/`, not by the dependency:
 *
 * 1. Every method resolves to a plain `{ returnCode, errorMessage }` value, on failure as
 *    much as on success. 2.0.0's `processErrorResponse` returns a `ResponseError`, which is
 *    an `Error` subclass and does not survive `structuredClone`.
 * 2. The 0x9001 and 0x6e00 special cases, which 2.0.0 represents as thrown errors with
 *    different codes. 0x9001 in particular is recovered by matching ledger-js's exact
 *    message text, so a reword upstream would silently degrade it to 0x6F00.
 */
import { LedgerError, ResponseError } from "@zondax/ledger-js";

import InternetComputerApp from "../src";

const PATH = "m/44'/223'/0'/0/0";
const CLA = 0x11;

interface Exchange {
  data?: Buffer;
  sw: number;
}

interface Apdu {
  cla: number;
  ins: number;
  p1: number;
  p2: number;
  data: Buffer;
}

/**
 * A transport that answers a scripted list of exchanges, reproducing hw-transport's
 * semantics: resolve `data || sw` when the status word is accepted, throw an object
 * carrying `statusCode` when it is not. `DMKTransport` throws the same shape, so both
 * transports drive this code down the same path.
 */
function mockTransport(exchanges: Exchange[]) {
  const sent: Apdu[] = [];
  let i = 0;

  const send = async (
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: Buffer = Buffer.alloc(0),
    statusList: number[] = [LedgerError.NoErrors],
  ): Promise<Buffer> => {
    sent.push({ cla, ins, p1, p2, data });
    const exchange = exchanges[Math.min(i, exchanges.length - 1)];
    i += 1;

    if (!statusList.includes(exchange.sw)) {
      throw Object.assign(new Error(`status 0x${exchange.sw.toString(16)}`), {
        statusCode: exchange.sw,
      });
    }

    const sw = Buffer.alloc(2);
    sw.writeUInt16BE(exchange.sw);
    return Buffer.concat([exchange.data ?? Buffer.alloc(0), sw]);
  };

  return { transport: { send }, sent };
}

const appWith = (exchanges: Exchange[]) => {
  const { transport, sent } = mockTransport(exchanges);
  return { app: new InternetComputerApp(transport), sent };
};

/** The 9-byte version payload the ICP app replies with. */
const versionPayload = Buffer.from([0, 2, 4, 9, 0, 0x00, 0x00, 0x00, 0x11]);

const appInfoPayload = (formatId: number) => {
  const appName = Buffer.from("Internet Computer", "ascii");
  const appVersion = Buffer.from("2.4.9", "ascii");
  return Buffer.concat([
    Buffer.from([formatId]),
    Buffer.from([appName.length]),
    appName,
    Buffer.from([appVersion.length]),
    appVersion,
    Buffer.from([1, 0x04]),
  ]);
};

describe("error responses are values, not Errors", () => {
  // 0x6986: the user rejected on the device. The single most common error path there is.
  const rejected: Exchange[] = [{ sw: 0x6986 }];

  const calls: Array<[string, (app: InternetComputerApp) => Promise<any>]> = [
    ["getVersion", (app) => app.getVersion()],
    ["appInfo", (app) => app.appInfo()],
    ["deviceInfo", (app) => app.deviceInfo()],
    ["getAddressAndPubKey", (app) => app.getAddressAndPubKey(PATH)],
    ["showAddressAndPubKey", (app) => app.showAddressAndPubKey(PATH)],
    ["sign", (app) => app.sign(PATH, Buffer.from("deadbeef", "hex"), 0)],
    [
      "signUpdateCall",
      (app) =>
        app.signUpdateCall(
          PATH,
          Buffer.from("dead", "hex"),
          Buffer.from("beef", "hex"),
          0,
        ),
    ],
    ["signBls", (app) => app.signBls(PATH, "aa", "bb", "cc")],
    ["tokenRegistry", (app) => app.tokenRegistry()],
  ];

  it.each(calls)("%s resolves rather than rejecting", async (_name, call) => {
    const { app } = appWith(rejected);
    const response = await call(app);
    expect(response.returnCode).toBe(0x6986);
    expect(response.errorMessage).toBe("Transaction rejected");
  });

  it.each(calls)("%s returns a plain object", async (_name, call) => {
    const { app } = appWith(rejected);
    const response = await call(app);
    expect(response).not.toBeInstanceOf(Error);
    expect(Object.getPrototypeOf(response)).toBe(Object.prototype);
  });

  // structuredClone is the algorithm behind postMessage, web workers and Electron IPC.
  // It keeps only name/message/stack off an Error, so a ResponseError arrives with both
  // fields undefined.
  it.each(calls)("%s survives structuredClone", async (_name, call) => {
    const { app } = appWith(rejected);
    const clone = structuredClone(await call(app));
    expect(clone.returnCode).toBe(0x6986);
    expect(clone.errorMessage).toBe("Transaction rejected");
  });

  it("treats a ResponseError from the transport the same as a status word", async () => {
    const viaStatusWord = await appWith([{ sw: 0x6986 }]).app.getVersion();
    const viaResponseError = await new InternetComputerApp({
      send: async () => {
        throw ResponseError.fromReturnCode(0x6986);
      },
    }).getVersion();

    expect(viaResponseError).toEqual(viaStatusWord);
    expect(viaResponseError).not.toBeInstanceOf(Error);
  });
});

describe("getVersion", () => {
  it("parses the 9-byte ICP reply and reports success as a value", async () => {
    const { app, sent } = appWith([{ data: versionPayload, sw: 0x9000 }]);
    const version = await app.getVersion();

    expect(sent[0]).toMatchObject({ cla: CLA, ins: 0x00, p1: 0, p2: 0 });
    expect(version).toMatchObject({
      testMode: false,
      major: 2,
      minor: 4,
      patch: 9,
      deviceLocked: false,
      targetId: "00000011",
      returnCode: LedgerError.NoErrors,
      errorMessage: "No errors",
    });
  });
});

describe("appInfo", () => {
  it("reports success as a value", async () => {
    const { app } = appWith([{ data: appInfoPayload(1), sw: 0x9000 }]);
    const info = await app.appInfo();

    expect(info).toMatchObject({
      appName: "Internet Computer",
      appVersion: "2.4.9",
      returnCode: LedgerError.NoErrors,
      errorMessage: "No errors",
    });
  });

  // The 0.2.x contract returned 0x9001 for an unrecognised format ID. 2.0.0 throws
  // `ResponseError(TechnicalProblem, 'Format ID not recognized')` instead, and that message
  // is the only thing distinguishing it. If this test fails after a ledger-js bump, the
  // string moved and `appInfo` is silently answering 0x6F00 -- re-sync src/index.ts.
  it("maps an unrecognised format ID back to 0x9001", async () => {
    const { app } = appWith([{ data: appInfoPayload(2), sw: 0x9000 }]);
    const info = await app.appInfo();

    expect(info.returnCode).toBe(0x9001);
    expect(info.errorMessage).toBe("Format ID not recognized");
  });

  it("still reports an unrelated technical problem as itself", async () => {
    const { app } = appWith([{ sw: LedgerError.TechnicalProblem }]);
    const info = await app.appInfo();

    expect(info.returnCode).toBe(LedgerError.TechnicalProblem);
  });
});

describe("deviceInfo", () => {
  it("maps 0x6e00 back to the dashboard-only message", async () => {
    const { app } = appWith([{ sw: 0x6e00 }]);
    const info = await app.deviceInfo();

    expect(info).toEqual({
      returnCode: 0x6e00,
      errorMessage: "This command is only available in the Dashboard",
    });
  });
});

describe("sign", () => {
  const preSignHash = Buffer.alloc(43, 0x01);
  const signatureRS = Buffer.alloc(64, 0x02);
  const signatureDER = Buffer.alloc(8, 0x03);
  const signature = Buffer.concat([
    preSignHash,
    signatureRS,
    Buffer.from([0x00]),
    signatureDER,
  ]);

  it("sends INIT then LAST and parses the signature", async () => {
    const { app, sent } = appWith([
      { sw: 0x9000 },
      { data: signature, sw: 0x9000 },
    ]);
    const response = await app.sign(PATH, Buffer.from("deadbeef", "hex"), 0);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ cla: CLA, ins: 0x02, p1: 0 }); // INIT
    expect(sent[1]).toMatchObject({ cla: CLA, ins: 0x02, p1: 2 }); // LAST
    expect(response.returnCode).toBe(LedgerError.NoErrors);
    expect(response.preSignHash).toEqual(preSignHash);
    expect(response.signatureRS).toEqual(signatureRS);
    expect(response.signatureDER).toEqual(signatureDER);
  });

  it("stops at the first failing chunk", async () => {
    const { app, sent } = appWith([{ sw: 0x9000 }, { sw: 0x6986 }]);
    const response = await app.sign(PATH, Buffer.from("deadbeef", "hex"), 0);

    expect(sent).toHaveLength(2);
    expect(response.returnCode).toBe(0x6986);
  });
});

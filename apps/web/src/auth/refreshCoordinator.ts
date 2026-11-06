type RefreshResult = {
  accessToken: string;
  user: unknown;
};

type CoordinatorMessage =
  | { type: "refresh-start" }
  | { type: "refresh-result"; ok: true; result: RefreshResult }
  | { type: "refresh-result"; ok: false };

const CHANNEL = "accounting-timer-auth-refresh";

let inFlight: Promise<RefreshResult | null> | null = null;

/**
 * Deduplicate refresh within a tab and coordinate across tabs.
 * One elected refresher performs the HTTP call; others adopt its result.
 * Server-side refresh reuse detection remains the safety net (T02).
 */
export function coordinatedRefresh(
  doRefresh: () => Promise<RefreshResult>,
): Promise<RefreshResult | null> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = runCoordinated(doRefresh).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runCoordinated(
  doRefresh: () => Promise<RefreshResult>,
): Promise<RefreshResult | null> {
  if (typeof BroadcastChannel === "undefined") {
    try {
      return await doRefresh();
    } catch {
      return null;
    }
  }

  const channel = new BroadcastChannel(CHANNEL);
  try {
    const followed = await waitForPeerResult(channel, 75);
    if (followed !== undefined) {
      return followed;
    }

    channel.postMessage({ type: "refresh-start" } satisfies CoordinatorMessage);
    try {
      const result = await doRefresh();
      channel.postMessage({
        type: "refresh-result",
        ok: true,
        result,
      } satisfies CoordinatorMessage);
      return result;
    } catch {
      channel.postMessage({
        type: "refresh-result",
        ok: false,
      } satisfies CoordinatorMessage);
      return null;
    }
  } finally {
    channel.close();
  }
}

/**
 * @returns peer result, null on peer failure, or undefined if we should lead
 */
function waitForPeerResult(
  channel: BroadcastChannel,
  electMs: number,
): Promise<RefreshResult | null | undefined> {
  return new Promise((resolve) => {
    let waitingForResult = false;

    const electTimer = setTimeout(() => {
      if (!waitingForResult) {
        channel.onmessage = null;
        resolve(undefined);
      }
    }, electMs);

    const resultTimer = setTimeout(() => {
      if (waitingForResult) {
        channel.onmessage = null;
        resolve(undefined);
      }
    }, 8_000);

    channel.onmessage = (event: MessageEvent<CoordinatorMessage>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "refresh-start") {
        waitingForResult = true;
        clearTimeout(electTimer);
        return;
      }
      if (msg.type === "refresh-result") {
        clearTimeout(electTimer);
        clearTimeout(resultTimer);
        channel.onmessage = null;
        resolve(msg.ok ? msg.result : null);
      }
    };
  });
}

/** Test helper */
export function resetRefreshCoordinatorForTests(): void {
  inFlight = null;
}

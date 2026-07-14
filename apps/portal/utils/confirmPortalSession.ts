type ConfirmableSession = object | null | undefined;

type ConfirmationOptions = {
  attempts?: number;
  retryDelayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

const waitFor = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export async function confirmPortalSession(
  refresh: () => Promise<ConfirmableSession>,
  { attempts = 3, retryDelayMs = 750, wait = waitFor }: ConfirmationOptions = {},
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (await refresh()) return true;
      return false;
    } catch {
      if (attempt === attempts) return false;
      await wait(retryDelayMs);
    }
  }
  return false;
}

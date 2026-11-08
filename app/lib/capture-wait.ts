/** How long a photo read may sit with no rows before Capture offers typing. */
export const CAPTURE_READING_WAIT_MS = 45_000;

export function captureReadingStalled(input: {
  reading: boolean;
  rowCount: number;
  sentAt: number | null;
  now: number;
}): boolean {
  return input.reading && input.rowCount === 0 && input.sentAt != null && input.now - input.sentAt >= CAPTURE_READING_WAIT_MS;
}

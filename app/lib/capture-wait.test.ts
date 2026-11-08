import { describe, expect, it } from "vitest";

import { captureReadingStalled } from "./capture-wait";

describe("captureReadingStalled", () => {
  const sentAt = 1_000_000;

  it("stays quiet before 45 seconds and while rows are arriving", () => {
    expect(captureReadingStalled({ reading: true, rowCount: 0, sentAt, now: sentAt + 44_999 })).toBe(false);
    expect(captureReadingStalled({ reading: true, rowCount: 2, sentAt, now: sentAt + 60_000 })).toBe(false);
    expect(captureReadingStalled({ reading: false, rowCount: 0, sentAt, now: sentAt + 60_000 })).toBe(false);
  });

  it("offers typing once a read has sat empty for 45 seconds", () => {
    expect(captureReadingStalled({ reading: true, rowCount: 0, sentAt, now: sentAt + 45_000 })).toBe(true);
  });
});

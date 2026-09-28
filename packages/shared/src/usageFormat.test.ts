// @effect-diagnostics globalDate:off -- A fixed instant keeps calendar-window assertions deterministic.
import { describe, expect, it, vi } from "vite-plus/test";

import {
  aggregateUsageMonths,
  enumerateHourStarts,
  enumerateMonths,
  formatMonthShort,
  formatDateTimeShort,
  formatHourShort,
  formatPercent,
  formatRelativeHourShort,
  makeWindow,
} from "./usageFormat.ts";

describe("formatPercent", () => {
  it("distinguishes a small positive share from zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(0.0004)).toBe("<0.1%");
    expect(formatPercent(0.0009)).toBe("<0.1%");
    expect(formatPercent(0.001)).toBe("0.1%");
    expect(formatPercent(0.023)).toBe("2.3%");
    expect(formatPercent(0.00004, 2)).toBe("<0.01%");
  });
});

describe("hourly usage formatting", () => {
  it("keeps requested zones separate when formatting repeated calls", () => {
    const instant = "2026-08-11T12:37:00.000Z";
    for (const zone of ["UTC", "America/New_York", "Asia/Kathmandu", "UTC"]) {
      expect(formatHourShort(instant, zone)).toBe(
        new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric" }).format(
          new Date(instant),
        ),
      );
    }
    expect(() => formatHourShort(instant, "Etc/Unknown")).toThrow(RangeError);
    expect(formatHourShort("invalid", "UTC")).toBe("invalid");
  });

  it("uses the current system zone when no zone is supplied", () => {
    try {
      vi.stubEnv("TZ", "UTC");
      expect(formatHourShort("2026-08-11T12:37:00.000Z")).toBe("12 PM");
      vi.stubEnv("TZ", "America/New_York");
      expect(formatHourShort("2026-08-11T12:37:00.000Z")).toBe("8 AM");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("enumerates 24 fixed buckets across a rolling window", () => {
    const hours = enumerateHourStarts("2026-08-10T12:37:00.000Z", "2026-08-11T12:37:00.000Z");

    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe("2026-08-10T12:37:00.000Z");
    expect(hours[23]).toBe("2026-08-11T11:37:00.000Z");
  });

  it("formats rolling instants in the requested time zone", () => {
    expect(formatHourShort("2026-08-11T00:37:00.000Z", "UTC")).toBe("12 AM");
    expect(formatHourShort("2026-08-11T12:37:00.000Z", "UTC")).toBe("12 PM");
    expect(formatDateTimeShort("2026-08-11T17:37:00.000Z", "UTC")).toBe("Aug 11, 5 PM");
  });

  it("disambiguates repeated hours during a fall-back transition", () => {
    expect(formatHourShort("2026-11-01T05:37:00.000Z", "America/New_York")).toBe("1 AM EDT");
    expect(formatHourShort("2026-11-01T06:37:00.000Z", "America/New_York")).toBe("1 AM EST");
  });

  it("makes hourly tooltip dates relative to the window in its requested time zone", () => {
    const windowEnd = "2026-08-11T14:37:00.000Z";

    expect(formatRelativeHourShort("2026-08-10T17:37:00.000Z", windowEnd, "UTC")).toBe(
      "5 PM yesterday",
    );
    expect(formatRelativeHourShort("2026-08-11T14:37:00.000Z", windowEnd, "UTC")).toBe(
      "2 PM today",
    );
    expect(
      formatRelativeHourShort(
        "2026-08-11T01:37:00.000Z",
        "2026-08-11T10:37:00.000Z",
        "America/Los_Angeles",
      ),
    ).toBe("6 PM yesterday");
  });

  it("builds an exact minute-aligned 24-hour request", () => {
    const window = makeWindow(1, new Date("2026-08-11T12:37:42.123Z"), "hour");

    expect(window.resolution).toBe("hour");
    expect(window.sinceTime).toBe("2026-08-10T12:37:00.000Z");
    expect(window.untilTime).toBe("2026-08-11T12:37:00.000Z");
  });

  it("requests all available history without an hourly range", () => {
    const window = makeWindow(0, new Date("2026-08-11T12:37:42.123Z"));
    expect(window).toMatchObject({ sinceDay: "1970-01-01", resolution: "day" });
    expect(window.sinceTime).toBeUndefined();
  });

  it("groups all-time chart data by month and keeps provider totals", () => {
    const daily = [
      {
        day: "2025-12-31",
        costUsd: 2,
        totalTokens: 20,
        byProvider: new Map([["codex" as const, { costUsd: 2, totalTokens: 20 }]]),
      },
      {
        day: "2026-01-01",
        costUsd: 3,
        totalTokens: 30,
        byProvider: new Map([["codex" as const, { costUsd: 3, totalTokens: 30 }]]),
      },
      {
        day: "2026-01-02",
        costUsd: 4,
        totalTokens: 40,
        byProvider: new Map([["claude" as const, { costUsd: 4, totalTokens: 40 }]]),
      },
    ];
    const months = aggregateUsageMonths(daily);
    expect(months.map((month) => [month.day, month.costUsd, month.totalTokens])).toEqual([
      ["2025-12-01", 2, 20],
      ["2026-01-01", 7, 70],
    ]);
    expect(months[1]?.byProvider.get("codex")?.totalTokens).toBe(30);
    expect(months[1]?.byProvider.get("claude")?.totalTokens).toBe(40);
    expect(enumerateMonths("2025-12-31", "2026-02-01")).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
    expect(formatMonthShort("2025-12-01")).toBe("Dec 2025");
  });

  it("degrades an unknown resolved zone to UTC instead of crashing", () => {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const resolvedOptions = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ ...resolved, timeZone: "Etc/Unknown" });

    try {
      const now = new Date("2026-08-11T12:37:42.123Z");

      expect(makeWindow(1, now, "hour").timeZone).toBe("UTC");
      expect(makeWindow(30, now).timeZone).toBe("UTC");
    } finally {
      resolvedOptions.mockRestore();
    }
  });
});

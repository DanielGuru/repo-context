import { describe, it, expect } from "vitest";
import { buildSessionSummary, detectQueryCategory, getRelativeTime } from "../src/mcp/server.js";

describe("detectQueryCategory", () => {
  it("routes 'why' queries to decisions", () => {
    expect(detectQueryCategory("why did we use Drizzle")).toBe("decisions");
    expect(detectQueryCategory("Why chose React")).toBe("decisions");
  });

  it("routes decision-related terms to decisions", () => {
    expect(detectQueryCategory("decision about auth")).toBe("decisions");
    expect(detectQueryCategory("alternatives to Redis")).toBe("decisions");
    expect(detectQueryCategory("trade-off between SQL and NoSQL")).toBe("decisions");
  });

  it("routes bug queries to regressions", () => {
    expect(detectQueryCategory("bug in login flow")).toBe("regressions");
    expect(detectQueryCategory("error handling in payments")).toBe("regressions");
    expect(detectQueryCategory("fix for token refresh")).toBe("regressions");
    expect(detectQueryCategory("known issues with deployment")).toBe("regressions");
  });

  it("routes style queries to preferences", () => {
    expect(detectQueryCategory("coding style for components")).toBe("preferences");
    expect(detectQueryCategory("preferred design pattern")).toBe("preferences");
    expect(detectQueryCategory("code formatting rules")).toBe("preferences");
    expect(detectQueryCategory("indentation rules")).toBe("preferences");
    expect(detectQueryCategory("linting configuration")).toBe("preferences");
  });

  it("does not route generic words to preferences", () => {
    // "pattern" and "format" are too broad — should NOT route to preferences
    expect(detectQueryCategory("API error handling pattern")).not.toBe("preferences");
    expect(detectQueryCategory("format of the response")).not.toBe("preferences");
  });

  it("routes session queries to sessions", () => {
    expect(detectQueryCategory("last session summary")).toBe("sessions");
    expect(detectQueryCategory("what was worked on yesterday")).toBe("sessions");
  });

  it("routes architecture queries to facts", () => {
    expect(detectQueryCategory("how does authentication work")).toBe("facts");
    expect(detectQueryCategory("database schema")).toBe("facts");
    expect(detectQueryCategory("API endpoint structure")).toBe("facts");
  });

  it("returns undefined for ambiguous queries", () => {
    expect(detectQueryCategory("react components")).toBeUndefined();
    expect(detectQueryCategory("user login")).toBeUndefined();
    expect(detectQueryCategory("deploy")).toBeUndefined();
  });
});

describe("buildSessionSummary", () => {
  it("builds a summary with all activity types", () => {
    const session = {
      startTime: new Date(),
      toolCalls: [
        { tool: "context_search", timestamp: new Date() },
        { tool: "context_read", timestamp: new Date() },
        { tool: "context_write", timestamp: new Date() },
      ],
      searchQueries: ["auth flow", "database"],
      entriesRead: ["facts/auth.md"],
      entriesWritten: ["decisions/use-jwt.md"],
      entriesDeleted: [],
      writeCallMade: true,
      readCallCount: 2,
    };

    const summary = buildSessionSummary(session, 300); // 5 min
    expect(summary).toContain("5min");
    expect(summary).toContain("auth flow, database");
    expect(summary).toContain("facts/auth.md");
    expect(summary).toContain("decisions/use-jwt.md");
    expect(summary).toContain("**Total tool calls:** 3");
  });

  it("handles empty activity", () => {
    const session = {
      startTime: new Date(),
      toolCalls: [],
      searchQueries: [],
      entriesRead: [],
      entriesWritten: [],
      entriesDeleted: [],
      writeCallMade: false,
      readCallCount: 0,
    };

    const summary = buildSessionSummary(session, 60);
    expect(summary).toContain("1min");
    expect(summary).toContain("**Total tool calls:** 0");
    expect(summary).not.toContain("Searched");
  });

  it("deduplicates search queries", () => {
    const session = {
      startTime: new Date(),
      toolCalls: [],
      searchQueries: ["auth", "auth", "database"],
      entriesRead: [],
      entriesWritten: [],
      entriesDeleted: [],
      writeCallMade: false,
      readCallCount: 0,
    };

    const summary = buildSessionSummary(session, 120);
    expect(summary).toContain("auth, database");
    // Should not contain duplicate "auth"
    const authMatches = summary.match(/auth/g);
    expect(authMatches?.length).toBe(1);
  });

  it("includes deleted entries", () => {
    const session = {
      startTime: new Date(),
      toolCalls: [],
      searchQueries: [],
      entriesRead: [],
      entriesWritten: [],
      entriesDeleted: ["facts/old-auth.md"],
      writeCallMade: false,
      readCallCount: 0,
    };

    const summary = buildSessionSummary(session, 60);
    expect(summary).toContain("facts/old-auth.md");
  });
});

describe("getRelativeTime", () => {
  it("returns 'just now' for recent times", () => {
    expect(getRelativeTime(new Date())).toBe("just now");
  });

  it("returns minutes for short durations", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(getRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours for medium durations", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(getRelativeTime(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days for longer durations", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(getRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("returns months for very long durations", () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    expect(getRelativeTime(twoMonthsAgo)).toBe("2mo ago");
  });
});

import { expect, it, vi, beforeEach } from "vitest";
vi.mock("./http", () => ({request: vi.fn()}));
import {request} from "./http";
import { assertVersion, loadHistory, diagnose, loadEvidence, type PublishedPage } from "./api";
const page = {pageId:"demo", version:3} as PublishedPage;
const alarm = {kind:"threshold", dataKey:"temp", threshold:80} as Parameters<typeof diagnose>[1];
beforeEach(() => vi.clearAllMocks());
it("rejects a result from another page or version", () => {
  expect(() => assertVersion({pageId:"other",version:3}, page)).toThrow("新版本");
  expect(() => assertVersion({pageId:"demo",version:4}, page)).toThrow("新版本");
});
it("holds the history cutoff during pagination", async () => {
  vi.mocked(request).mockResolvedValue({pageId:"demo",version:3,records:[]});
  await loadHistory(page, 20, "2026-10-11T01:00:00Z");
  expect(vi.mocked(request).mock.calls[0][0]).toContain("asOf=2026-10-11T01%3A00%3A00Z");
});
it("uses server time for evidence and refuses mismatched diagnosis", async () => {
  vi.mocked(request).mockResolvedValueOnce({pageId:"demo",version:3,queriedAt:"2026-10-11T01:00:00Z"}).mockResolvedValueOnce({pageId:"demo",version:3,observations:[]});
  await loadEvidence(page,alarm);
  expect(vi.mocked(request).mock.calls[1][0]).toContain("end=2026-10-11T01%3A00%3A00Z");
  vi.mocked(request).mockResolvedValueOnce({alarm:{pageId:"demo",version:4}});
  await expect(diagnose(page,alarm)).rejects.toThrow("新版本");
});

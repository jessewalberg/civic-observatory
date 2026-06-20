import { describe, expect, it } from "vitest";
import { formatMeetingDate, formatMeetingScheduleDate } from "./meetingDates";

describe("meeting date formatting", () => {
	it("formats date-only meeting timestamps without shifting by local timezone", () => {
		const meetingDate = Date.UTC(2026, 5, 18);

		expect(formatMeetingDate(meetingDate)).toBe("Thursday, June 18, 2026");
		expect(formatMeetingScheduleDate(meetingDate)).toBe("Thursday, June 18");
	});
});

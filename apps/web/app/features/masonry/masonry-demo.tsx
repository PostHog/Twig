import { DailyActiveUsers } from "./daily-active-users";
import { ErrorTracking } from "./error-tracking";
import { Experiments } from "./experiments";
import { FeatureFlags } from "./feature-flags";
import { IssueTracker } from "./issue-tracker";
import { Logs } from "./logs";
import { SessionRecordings } from "./session-recordings";
import { Survey } from "./survey";

export function MasonryDemo() {
  const columnWidth = 320;
  const gap = 40;
  const itemGap = 40;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: "750px",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        maskComposite: "intersect",
        WebkitMaskComposite: "destination-in",
      }}
    >
      <div className="relative flex h-full items-center justify-center">
        <div
          className="grid auto-rows-min"
          style={{
            gridTemplateColumns: `repeat(5, ${columnWidth}px)`,
            gap: `${gap}px`,
          }}
        >
          <div
            className="grid auto-rows-min"
            style={{ transform: "translateY(-40px)", gap: `${itemGap}px` }}
          >
            <div
              className="border border-border bg-bg"
              style={{ height: "240px" }}
            />
            <div
              className="border border-border bg-bg"
              style={{ height: "200px" }}
            />
            <div
              className="border border-border bg-bg"
              style={{ height: "240px" }}
            />
            <div
              className="border border-border bg-bg"
              style={{ height: "200px" }}
            />
          </div>
          <div
            className="grid auto-rows-min"
            style={{ transform: "translateY(-80px)", gap: `${itemGap}px` }}
          >
            <Logs />
            <IssueTracker />
            <Survey />
            <SessionRecordings />
          </div>
          <div
            className="grid auto-rows-min"
            style={{ transform: "translateY(-40px)", gap: `${itemGap}px` }}
          >
            <DailyActiveUsers />
            <div
              className="border border-border bg-bg"
              style={{ height: "240px" }}
            />
          </div>
          <div
            className="grid auto-rows-min"
            style={{ transform: "translateY(-80px)", gap: `${itemGap}px` }}
          >
            <ErrorTracking />
            <Experiments />
            <FeatureFlags />
          </div>
          <div
            className="grid auto-rows-min"
            style={{ transform: "translateY(-120px)", gap: `${itemGap}px` }}
          >
            <div
              className="border border-border bg-bg"
              style={{ height: "280px" }}
            />
            <div
              className="border border-border bg-bg"
              style={{ height: "200px" }}
            />
            <div
              className="border border-border bg-bg"
              style={{ height: "240px" }}
            />
            <div
              className="border border-border bg-bg"
              style={{ height: "240px" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

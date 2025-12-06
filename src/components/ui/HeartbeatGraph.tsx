import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { HeartIcon, AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { debounce } from "../../utils";
import type { HeartbeatCluster, Heartbeat } from "../../services/hackatime";
import type { HeartbeatLoadingProgress } from "../../hooks/useHeartbeatData";

type TabView = "graph" | "table";

type ColumnKey = 
  | "time" | "created_at" | "project" | "branch" | "category" | "editor" 
  | "entity" | "language" | "machine" | "operating_system" | "type" 
  | "user_agent" | "line_additions" | "line_deletions" | "lineno" 
  | "lines" | "cursorpos" | "project_root_count" | "is_write" | "source_type" | "ip_address";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "created_at", label: "Time Created" },
  { key: "project", label: "Project" },
  { key: "branch", label: "Branch" },
  { key: "category", label: "Category" },
  { key: "editor", label: "Editor" },
  { key: "entity", label: "Entity" },
  { key: "language", label: "Language" },
  { key: "machine", label: "Machine" },
  { key: "operating_system", label: "OS" },
  { key: "type", label: "Type" },
  { key: "user_agent", label: "User Agent" },
  { key: "line_additions", label: "Line Additions" },
  { key: "line_deletions", label: "Line Deletions" },
  { key: "lineno", label: "Line No" },
  { key: "lines", label: "Lines" },
  { key: "cursorpos", label: "Cursor" },
  { key: "project_root_count", label: "Root Count" },
  { key: "is_write", label: "Is Write" },
  { key: "source_type", label: "Source Type" },
  { key: "ip_address", label: "IP" },
];

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  "time", "created_at", "project", "entity", "user_agent", "lineno", "lines", "cursorpos", "ip_address"
];

function formatCellValue(heartbeat: Heartbeat, key: ColumnKey): string {
  const value = heartbeat[key];
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  return `${seconds} second${seconds !== 1 ? "s" : ""}`;
}

interface HeartbeatGraphProps {
  clusters: HeartbeatCluster[];
  currentClusterIndex: number;
  onClusterChange: (index: number) => void;
  isLoading?: boolean;
  progress?: HeartbeatLoadingProgress | null;
  hackatimeUserId?: number | null;
}

export function HeartbeatGraph({ clusters, currentClusterIndex, onClusterChange, isLoading, progress, hackatimeUserId }: HeartbeatGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [activeTab, setActiveTab] = useState<TabView>("graph");
  
  const initialTimeRange = useMemo(() => {
    if (clusters.length === 0 || currentClusterIndex >= clusters.length) return null;
    const heartbeats = clusters[currentClusterIndex].heartbeats;
    if (heartbeats.length === 0) return null;
    const times = heartbeats.map(h => h.time.getTime());
    return Math.max(...times) - Math.min(...times);
  }, [clusters, currentClusterIndex]);

  const [brushTimeRange, setBrushTimeRange] = useState<number | null>(null);
  const visibleTimeRange = brushTimeRange ?? initialTimeRange;

  const debouncedSetVisibleTimeRange = useMemo(
    () => debounce((range: number) => setBrushTimeRange(range), 250),
    []
  );

  const initialVisibleColumns = useMemo(() => {
    if (clusters.length > 0) {
      const allProjects = new Set(clusters.flatMap(c => c.heartbeats.map(h => h.project)));
      if (allProjects.size <= 1) {
        return DEFAULT_VISIBLE_COLUMNS.filter(col => col !== "project");
      }
    }
    return DEFAULT_VISIBLE_COLUMNS;
  }, [clusters]);

  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(initialVisibleColumns);

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = (width: number) => {
      if (width > 0) {
        setDimensions({ width, height: 500 });
      }
    };

    updateDimensions(containerRef.current.getBoundingClientRect().width);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateDimensions(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [clusters.length]);

  useEffect(() => {
    if (!svgRef.current || clusters.length === 0 || currentClusterIndex >= clusters.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const brushHeight = 40;
    const margin = { top: 20, right: 30, bottom: 20 + brushHeight, left: 60 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom - brushHeight;

    const currentCluster = clusters[currentClusterIndex];
    const heartbeats = currentCluster.heartbeats;

    const timeExtent = d3.extent(heartbeats, d => d.time) as [Date, Date];

    // Create scales
    const xScale = d3.scaleTime()
      .domain(timeExtent)
      .range([0, width]);

    const xScaleBrush = d3.scaleTime()
      .domain(timeExtent)
      .range([0, width]);

    // Get max line number and cursor position for Y scale
    const maxLineno = d3.max(heartbeats, d => d.lineno) || 100;
    const maxCursorpos = d3.max(heartbeats, d => d.cursorpos) || 100;
    const yMax = Math.max(maxLineno, maxCursorpos);

    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([height, 0]);

    // Add clip path
    svg.append("defs")
      .append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("width", width)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat((d) => d3.timeFormat("%H:%M")(d as Date));

    const yAxis = d3.axisLeft(yScale);

    const xAxisGroup = g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis);

    g.append("g")
      .call(yAxis)
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -40)
      .attr("x", -height / 2)
      .attr("fill", "currentColor")
      .style("text-anchor", "middle")
      .text("Line Number / Cursor Position");

    // Content group with clipping
    const content = g.append("g")
      .attr("clip-path", "url(#clip)");

    // Add dots for line numbers (blue)
    content.selectAll(".line-dot")
      .data(heartbeats)
      .enter()
      .append("circle")
      .attr("class", "line-dot")
      .attr("cx", d => xScale(d.time))
      .attr("cy", d => yScale(d.lineno))
      .attr("r", 5)
      .attr("fill", "#3b82f6")
      .attr("opacity", 0.7)
      .append("title")
      .text(d => `Line ${d.lineno} at ${d.time.toLocaleTimeString()}`);

    // Add dots for cursor positions (red)
    content.selectAll(".cursor-dot")
      .data(heartbeats)
      .enter()
      .append("circle")
      .attr("class", "cursor-dot")
      .attr("cx", d => xScale(d.time))
      .attr("cy", d => yScale(d.cursorpos))
      .attr("r", 5)
      .attr("fill", "#ef4444")
      .attr("opacity", 0.7)
      .append("title")
      .text(d => `Cursor pos ${d.cursorpos} at ${d.time.toLocaleTimeString()}`);

    // Brush context area
    const brushGroup = svg.append("g")
      .attr("class", "brush-context")
      .attr("transform", `translate(${margin.left},${margin.top + height + 30})`);

    // Mini Y scale for brush area
    const yScaleBrush = d3.scaleLinear()
      .domain([0, yMax])
      .range([brushHeight - 10, 0]);

    // Mini chart in brush area
    brushGroup.selectAll(".mini-line-dot")
      .data(heartbeats)
      .enter()
      .append("circle")
      .attr("cx", d => xScaleBrush(d.time))
      .attr("cy", d => yScaleBrush(d.lineno))
      .attr("r", 2)
      .attr("fill", "#3b82f6")
      .attr("opacity", 0.5);

    brushGroup.selectAll(".mini-cursor-dot")
      .data(heartbeats)
      .enter()
      .append("circle")
      .attr("cx", d => xScaleBrush(d.time))
      .attr("cy", d => yScaleBrush(d.cursorpos))
      .attr("r", 2)
      .attr("fill", "#ef4444")
      .attr("opacity", 0.5);

    // Brush
    const brush = d3.brushX()
      .extent([[0, 0], [width, brushHeight - 10]])
      .on("brush", (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection as [number, number];
        const newDomain = [xScaleBrush.invert(x0), xScaleBrush.invert(x1)] as [Date, Date];
        xScale.domain(newDomain);

        xAxisGroup.call(xAxis);

        content.selectAll<SVGCircleElement, typeof heartbeats[0]>(".line-dot")
          .attr("cx", d => xScale(d.time));

        content.selectAll<SVGCircleElement, typeof heartbeats[0]>(".cursor-dot")
          .attr("cx", d => xScale(d.time));
      })
      .on("end", (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection as [number, number];
        const newDomain = [xScaleBrush.invert(x0), xScaleBrush.invert(x1)] as [Date, Date];
        debouncedSetVisibleTimeRange(newDomain[1].getTime() - newDomain[0].getTime());
      });

    const brushElement = brushGroup.append("g")
      .attr("class", "brush")
      .call(brush)
      .call(brush.move, [0, width]);

    // Style the brush
    brushElement.selectAll(".selection")
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.1)
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.4);

  }, [clusters, currentClusterIndex, dimensions, activeTab, debouncedSetVisibleTimeRange]);

  if (isLoading) {
    const progressValue = progress ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center h-48 rounded-lg gap-3 border border-base-content/20">
        <HeartIcon className="w-8 h-8 text-gray-400 animate-pulse" />
        <p className="text-gray-500">
          Loading heartbeat data{progress ? ` (day ${progress.current} of ${progress.total})` : "..."}
        </p>
        <progress
          className="progress progress-primary w-56"
          value={progressValue}
          max={100}
        />
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No heartbeat data available</p>
      </div>
    );
  }

  const currentCluster = clusters[currentClusterIndex];

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
              <HeartIcon className="w-5 h-5" />
              Heartbeat Activity
            </h3>
          <p className="text-sm text-gray-600 flex gap-2">
            <span>Cluster {currentClusterIndex + 1} of {clusters.length}</span> •
            <span>{currentCluster.heartbeats.length} heartbeats</span> • 
            <span>{currentCluster.startTime.toLocaleTimeString()} - {currentCluster.endTime.toLocaleTimeString()}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm"
            disabled={currentClusterIndex === 0}
            onClick={() => onClusterChange(currentClusterIndex - 1)}
          >
            Previous
          </button>
          <span className="text-sm">
            {currentClusterIndex + 1} / {clusters.length}
          </span>
          <button
            className="btn btn-sm"
            disabled={currentClusterIndex === clusters.length - 1}
            onClick={() => onClusterChange(currentClusterIndex + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div role="tablist" className="tabs tabs-lift">
          <button
            role="tab"
            className={`tab border-base-content/50! ${activeTab === "graph" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            Graph View
          </button>
          <button
            role="tab"
            className={`tab border-base-content/50! ${activeTab === "table" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("table")}
          >
            Table View
          </button>
        </div>
        {hackatimeUserId && (
          <div className="flex gap-2">
            <a
              href={`https://billy.3kh0.net/?u=${encodeURIComponent(hackatimeUserId)}&d=${clusters[0].startTime.toISOString().split("T")[0]}-${clusters[clusters.length - 1].endTime.toISOString().split("T")[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline"
            >
              Inspect in Billy
            </a>
            <a
              href={`https://billy.3kh0.net/?u=${encodeURIComponent(hackatimeUserId)}&d=${currentCluster.startTime.toISOString().split("T")[0]}-${currentCluster.endTime.toISOString().split("T")[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline"
            >
              Inspect cluster in Billy
            </a>
          </div>
        )}
      </div>

      <div className="w-full overflow-hidden">
        {activeTab === "graph" && (
          <>
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              style={{ background: "transparent", borderRadius: "8px" }}
            />
            <div className="flex items-center justify-between mt-2 text-sm">
              <div className="text-base-content/60">
                {visibleTimeRange !== null && `Viewing ${formatDuration(visibleTimeRange)}`}
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>Line Numbers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Cursor Position</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {activeTab === "table" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-sm btn-ghost gap-2"
              >
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
                Columns
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-10 w-max p-2 shadow-lg border border-base-content/10 max-h-80"
              >
                {ALL_COLUMNS.map(col => (
                  <li key={col.key}>
                    <label className="label cursor-pointer justify-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      <span className="label-text">{col.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 rounded-box border border-base-content/5 bg-base-100">
            <table className="table table-xs">
              <thead>
                <tr>
                  {ALL_COLUMNS.filter(col => visibleColumns.includes(col.key)).map(col => (
                    <th key={col.key} className="whitespace-nowrap">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentCluster.heartbeats.map((hb, idx) => (
                  <tr key={idx} className="hover:bg-base-300">
                    {ALL_COLUMNS.filter(col => visibleColumns.includes(col.key)).map(col => (
                      <td key={col.key} className="whitespace-nowrap">{formatCellValue(hb, col.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

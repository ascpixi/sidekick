import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { HeartIcon, AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { debounce } from "../../utils";
import type { HeartbeatCluster, Heartbeat } from "../../services/hackatime";
import type { HeartbeatLoadingProgress } from "../../hooks/useHeartbeatData";

type TabView = "graph" | "table" | "delta";

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

interface DeltaPoint {
  index: number;
  deltaT: number;
  deltaL: number;
  deltaC: number;
}

function computeDeltas(heartbeats: Heartbeat[]): DeltaPoint[] {
  if (heartbeats.length < 2) return [];
  const deltas: DeltaPoint[] = [];
  for (let i = 1; i < heartbeats.length; i++) {
    const prev = heartbeats[i - 1];
    const curr = heartbeats[i];
    deltas.push({
      index: i,
      deltaT: (curr.time.getTime() - prev.time.getTime()) / 1000,
      deltaL: Math.abs(curr.lineno - prev.lineno),
      deltaC: Math.abs(curr.cursorpos - prev.cursorpos),
    });
  }
  return deltas;
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

    // Horizontal cursor with tooltip
    const cursorLine = g.append("line")
      .attr("class", "cursor-line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "currentColor")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0)
      .attr("pointer-events", "none");

    const tooltip = g.append("g")
      .attr("class", "cursor-tooltip")
      .attr("opacity", 0)
      .attr("pointer-events", "none");

    tooltip.append("rect")
      .attr("fill", "oklch(var(--b1))")
      .attr("fill-opacity", 0.75)
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.3)
      .attr("rx", 4)
      .attr("ry", 4);

    const lineDot = tooltip.append("circle")
      .attr("r", 5)
      .attr("fill", "#3b82f6");

    const lineText = tooltip.append("text")
      .attr("fill", "currentColor")
      .attr("font-size", "14px")
      .attr("text-anchor", "start");

    const cursorDot = tooltip.append("circle")
      .attr("r", 5)
      .attr("fill", "#ef4444");

    const cursorText = tooltip.append("text")
      .attr("fill", "currentColor")
      .attr("font-size", "14px")
      .attr("text-anchor", "start");

    const deltaText = tooltip.append("text")
      .attr("fill", "currentColor")
      .attr("font-size", "12px")
      .attr("opacity", 0.7)
      .attr("text-anchor", "start");

    const overlay = g.append("rect")
      .attr("class", "overlay")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .attr("pointer-events", "all");

    overlay.on("mousemove", function(event) {
      const [mouseX, mouseY] = d3.pointer(event);
      
      if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
        cursorLine.attr("opacity", 0);
        tooltip.attr("opacity", 0);
        return;
      }

      const time = xScale.invert(mouseX);

      const bisect = d3.bisector((d: typeof heartbeats[0]) => d.time).left;
      const idx = bisect(heartbeats, time);
      const d0 = heartbeats[idx - 1];
      const d1 = heartbeats[idx];
      const nearest = !d0 ? d1 : !d1 ? d0 : 
        (time.getTime() - d0.time.getTime() > d1.time.getTime() - time.getTime() ? d1 : d0);
      
      const nearestIdx = heartbeats.indexOf(nearest);
      const prev = nearestIdx > 0 ? heartbeats[nearestIdx - 1] : null;

      const snappedX = xScale(nearest.time);
      cursorLine
        .attr("x1", snappedX)
        .attr("x2", snappedX)
        .attr("opacity", 0.6);

      lineText.text(`Line: ${nearest.lineno}`);
      cursorText.text(`Cursor: ${nearest.cursorpos}`);
      
      if (prev) {
        const deltaT = (nearest.time.getTime() - prev.time.getTime()) / 1000;
        const deltaL = nearest.lineno - prev.lineno;
        const deltaC = nearest.cursorpos - prev.cursorpos;
        const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
        deltaText.text(`Δ ${deltaT.toFixed(1)}s | ${sign(deltaL)} lines | ${sign(deltaC)} cursor`);
      } else {
        deltaText.text("(first heartbeat)");
      }
      
      const lineTextBBox = (lineText.node() as SVGTextElement).getBBox();
      const cursorTextBBox = (cursorText.node() as SVGTextElement).getBBox();
      const deltaTextBBox = (deltaText.node() as SVGTextElement).getBBox();
      const padding = 8;
      const dotSize = 10;
      const lineHeight = Math.max(lineTextBBox.height, cursorTextBBox.height) + 4;
      const deltaRowHeight = deltaTextBBox.height + 4;
      const tooltipWidth = Math.max(lineTextBBox.width + dotSize + 8, cursorTextBBox.width + dotSize + 8, deltaTextBBox.width) + padding * 2;
      const tooltipHeight = lineHeight * 2 + deltaRowHeight + padding * 2;
      
      let tooltipX = mouseX + 10;
      let tooltipY = mouseY - tooltipHeight - 5;
      
      if (tooltipX + tooltipWidth > width) {
        tooltipX = mouseX - tooltipWidth - 10;
      }
      if (tooltipY < 0) {
        tooltipY = mouseY + 15;
      }

      tooltip.attr("transform", `translate(${tooltipX}, ${tooltipY})`);
      tooltip.select("rect")
        .attr("width", tooltipWidth)
        .attr("height", tooltipHeight);
      
      const firstRowY = padding + lineHeight * 0.6;
      const secondRowY = padding + lineHeight + lineHeight * 0.6;
      const thirdRowY = padding + lineHeight * 2 + deltaRowHeight * 0.6;
      
      lineDot.attr("cx", padding + 5).attr("cy", firstRowY);
      lineText.attr("x", padding + dotSize + 8).attr("y", firstRowY + 4);
      
      cursorDot.attr("cx", padding + 5).attr("cy", secondRowY);
      cursorText.attr("x", padding + dotSize + 8).attr("y", secondRowY + 4);
      
      deltaText.attr("x", padding).attr("y", thirdRowY + 2);

      tooltip.attr("opacity", 1);
    });

    overlay.on("mouseleave", function() {
      cursorLine.attr("opacity", 0);
      tooltip.attr("opacity", 0);
    });

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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
              <HeartIcon className="w-5 h-5" />
              Heartbeat Activity
            </h3>
          <p className="text-sm text-gray-600 flex flex-wrap gap-x-2">
            <span>Cluster {currentClusterIndex + 1} of {clusters.length}</span>
            <span className="hidden sm:inline">•</span>
            <span>{currentCluster.heartbeats.length} heartbeats</span>
            <span className="hidden sm:inline">•</span>
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div role="tablist" className="tabs tabs-lift">
          <button
            role="tab"
            className={`tab border-base-content/20! ${activeTab === "graph" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            Graph View
          </button>
          <button
            role="tab"
            className={`tab border-base-content/20! ${activeTab === "table" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("table")}
          >
            Table View
          </button>
          <button
            role="tab"
            className={`tab border-base-content/20! ${activeTab === "delta" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("delta")}
          >
            Delta Plot
          </button>
        </div>
        {hackatimeUserId && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://billy.3kh0.net/?u=${encodeURIComponent(hackatimeUserId)}&d=${clusters[0].startTime.toISOString().split("T")[0]}-${clusters[clusters.length - 1].endTime.toISOString().split("T")[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline border-base-content/20"
            >
              Inspect in Billy
            </a>
            <a
              href={`https://billy.3kh0.net/?u=${encodeURIComponent(hackatimeUserId)}&d=${currentCluster.startTime.toISOString().split("T")[0]}-${currentCluster.endTime.toISOString().split("T")[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline border-base-content/20"
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

      {activeTab === "delta" && (
        <DeltaPlotView heartbeats={currentCluster.heartbeats} width={dimensions.width} />
      )}
    </div>
  );
}

function DeltaPlotView({ heartbeats, width }: { heartbeats: Heartbeat[]; width: number }) {
  const deltaTRef = useRef<SVGSVGElement>(null);
  const deltaLRef = useRef<SVGSVGElement>(null);
  const deltaCRef = useRef<SVGSVGElement>(null);

  const deltas = useMemo(() => computeDeltas(heartbeats), [heartbeats]);

  const plotHeight = 180;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const innerHeight = plotHeight - margin.top - margin.bottom;

  useEffect(() => {
    if (deltas.length === 0) return;

    const xScale = d3.scaleLinear()
      .domain([0, deltas.length])
      .range([0, plotWidth]);

    function renderPlot(
      svgRef: React.RefObject<SVGSVGElement | null>,
      accessor: (d: DeltaPoint) => number,
      color: string,
      yLabel: string,
      tooltip: (d: DeltaPoint) => string
    ) {
      if (!svgRef.current) return;

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const yMax = d3.max(deltas, accessor) || 1;
      const yScale = d3.scaleLinear()
        .domain([0, yMax * 1.1])
        .range([innerHeight, 0]);

      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(Math.min(10, deltas.length)));

      g.append("g")
        .call(d3.axisLeft(yScale).ticks(5));

      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -45)
        .attr("x", -innerHeight / 2)
        .attr("fill", "currentColor")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text(yLabel);

      g.append("text")
        .attr("x", plotWidth / 2)
        .attr("y", innerHeight + 35)
        .attr("fill", "currentColor")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Heartbeat Index");

      g.selectAll(".delta-dot")
        .data(deltas)
        .enter()
        .append("circle")
        .attr("class", "delta-dot")
        .attr("cx", d => xScale(d.index))
        .attr("cy", d => yScale(accessor(d)))
        .attr("r", 4)
        .attr("fill", color)
        .attr("opacity", 0.7)
        .append("title")
        .text(tooltip);
    }

    renderPlot(deltaTRef, d => d.deltaT, "#8b5cf6", "Δt (seconds)", d => `Δt: ${d.deltaT.toFixed(1)}s`);
    renderPlot(deltaLRef, d => d.deltaL, "#3b82f6", "ΔL (lines)", d => `ΔL: ${d.deltaL} lines`);
    renderPlot(deltaCRef, d => d.deltaC, "#ef4444", "ΔC (chars)", d => `ΔC: ${d.deltaC} chars`);
  }, [deltas, plotWidth, innerHeight]);

  if (deltas.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-base-200 rounded-lg">
        <p className="text-gray-500">Not enough heartbeats to compute deltas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-lg border border-base-content/10 p-2">
          <div className="flex items-center gap-2 mb-1 px-2">
            <span className="w-3 h-3 rounded-full bg-violet-500" />
            <span className="text-sm font-medium">Time Between Heartbeats (Δt)</span>
          </div>
          <svg ref={deltaTRef} width={width} height={plotHeight} />
        </div>
        <div className="rounded-lg border border-base-content/10 p-2">
          <div className="flex items-center gap-2 mb-1 px-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm font-medium">Line Number Change (ΔL)</span>
          </div>
          <svg ref={deltaLRef} width={width} height={plotHeight} />
        </div>
        <div className="rounded-lg border border-base-content/10 p-2">
          <div className="flex items-center gap-2 mb-1 px-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-sm font-medium">Cursor Movement (ΔC)</span>
          </div>
          <svg ref={deltaCRef} width={width} height={plotHeight} />
        </div>
      </div>
    </div>
  );
}

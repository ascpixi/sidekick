import { ClockIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";
import { HeartbeatGraph } from "./HeartbeatGraph";
import { useState, useMemo, useEffect, useRef } from "react";
import { clusterHeartbeats, type Heartbeat } from "../../services/hackatime";
import type { HeartbeatLoadingProgress } from "../../hooks/useHeartbeatData";

export function TimeSection({
  localHoursSpent,
  localHoursSpentJustification,
  localHackatimeProjectKeys,
  onHoursSpentChange,
  onHoursSpentJustificationChange,
  onHackatimeProjectKeysChange,
  onSyncFromHackatime,
  hasHackatimeIntegration,
  heartbeats = [],
  heartbeatProgress,
  isLoadingHeartbeats = false,
  hackatimeUserId,
  aggregatedProjectHours
}: {
  localHoursSpent: number;
  localHoursSpentJustification: string;
  localHackatimeProjectKeys: string;
  onHoursSpentChange: (value: number) => void;
  onHoursSpentJustificationChange: (value: string) => void;
  onHackatimeProjectKeysChange: (value: string) => void;
  onSyncFromHackatime: () => void;
  hasHackatimeIntegration: boolean;
  heartbeats?: Heartbeat[];
  heartbeatProgress?: HeartbeatLoadingProgress | null;
  isLoadingHeartbeats?: boolean;
  hackatimeUserId?: number | null;
  aggregatedProjectHours?: number | null;
}) {
  const heartbeatsKey = heartbeats.length > 0 
    ? `${heartbeats.length}-${heartbeats[0]?.time ?? 0}` 
    : "empty";
  const [clusterState, setClusterState] = useState({ key: heartbeatsKey, index: 0 });

  const currentClusterIndex = clusterState.key === heartbeatsKey ? clusterState.index : 0;

  const setCurrentClusterIndex = (index: number) => {
    setClusterState({ key: heartbeatsKey, index });
  };

  const clusters = useMemo(() => {
    const allClusters = clusterHeartbeats(heartbeats);
    const significantClusters = allClusters.filter(c => c.heartbeats.length > 10);
    return significantClusters.length > 0 ? significantClusters : allClusters;
  }, [heartbeats]);

  return (
    <Accordion 
      title={
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5" />
          Time
        </div>
      } 
      className="mb-1" 
      defaultOpen
    >
      <div className="pl-4">
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium">Hours Spent</label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="input input-bordered input-sm flex-1 !outline-none focus:border-primary"
            value={localHoursSpent || ""}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0;
              onHoursSpentChange(value);
            }}
          />
          {hasHackatimeIntegration && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={onSyncFromHackatime}
            >
              <ClockIcon className="h-4 w-4" />
              Sync from Hackatime
            </button>
          )}
        </div>

        {hasHackatimeIntegration && (
          <div className="mb-4 flex items-center gap-2">
            <label className="text-sm font-medium">Hackatime Project Keys</label>
            <input
              type="text"
              className="input input-bordered input-sm flex-1 !outline-none focus:border-primary"
              value={localHackatimeProjectKeys}
              onChange={(e) => onHackatimeProjectKeysChange(e.target.value)}
              placeholder="comma-separated project names"
            />
          </div>
        )}

        {hasHackatimeIntegration && aggregatedProjectHours != null && (
          <div className="mb-4 flex items-center gap-2">
            <label className="text-sm font-medium">YSWS aggregate</label>
            <span className="text-sm font-mono bg-base-200 px-2 py-1 rounded">
              {aggregatedProjectHours.toFixed(1)} hours
            </span>
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Hours Spent Justification</label>
          <textarea
            className="textarea textarea-bordered text-sm w-full h-20 !outline-none focus:border-primary"
            value={localHoursSpentJustification}
            onChange={(e) => onHoursSpentJustificationChange(e.target.value)}
            placeholder="Explain any adjustments to the calculated hours..."
          />
        </div>

        {hasHackatimeIntegration && (heartbeats.length > 0 || isLoadingHeartbeats) && (
          <div className="mt-6">
            <HeartbeatGraph
              clusters={clusters}
              currentClusterIndex={currentClusterIndex}
              onClusterChange={setCurrentClusterIndex}
              isLoading={isLoadingHeartbeats}
              progress={heartbeatProgress}
              hackatimeUserId={hackatimeUserId}
            />
          </div>
        )}
      </div>
    </Accordion>
  );
}

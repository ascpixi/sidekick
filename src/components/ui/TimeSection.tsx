import { ClockIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";
import { HeartbeatGraph } from "./HeartbeatGraph";
import { useState, useMemo, useEffect, useRef } from "react";
import { clusterHeartbeats, type Heartbeat } from "../../services/hackatime";
import type { HeartbeatLoadingProgress } from "../../hooks/useHeartbeatData";
import { GroqService, type GroqInferenceResult } from "../../services/groq";

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
  aggregatedProjectHours,
  isApproved = false,
  groqApiKey,
  userProjectKeys = [],
  codeUrl,
  demoUrl,
  description
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
  isApproved?: boolean;
  groqApiKey?: string;
  userProjectKeys?: string[];
  codeUrl?: string;
  demoUrl?: string;
  description?: string;
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

  const [hoursSpentInput, setHoursSpentInput] = useState(localHoursSpent.toString());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isInferring, setIsInferring] = useState(false);
  const [inferResult, setInferResult] = useState<GroqInferenceResult | null>(null);

  useEffect(() => {
    setHoursSpentInput(localHoursSpent.toString());
  }, [localHoursSpent]);

  useEffect(() => {
    setInferResult(null);
  }, [localHackatimeProjectKeys]);

  async function handleInferProjectKey() {
    if (!groqApiKey || userProjectKeys.length === 0) return;

    setIsInferring(true);
    setInferResult(null);

    try {
      const groqService = new GroqService(groqApiKey);
      const result = await groqService.inferHackatimeProjectKey({
        projectKeys: userProjectKeys,
        existingProjectKey: localHackatimeProjectKeys || undefined,
        codeUrl,
        demoUrl,
        description
      });

      if (result) {
        setInferResult(result);
        onHackatimeProjectKeysChange(result.projectKey);
      } else {
        setInferResult(null);
      }
    } catch (err) {
      console.error("Failed to infer project key:", err);
    } finally {
      setIsInferring(false);
    }
  }

  function handleHoursSpentChange(value: string) {
    setHoursSpentInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const parsed = value === "" ? 0 : parseFloat(value);
      onHoursSpentChange(isNaN(parsed) ? 0 : parsed);
    }, 1000);
  }

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
            value={hoursSpentInput}
            onChange={(e) => handleHoursSpentChange(e.target.value)}
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
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Hackatime Project Keys</label>
              <input
                type="text"
                className="input input-bordered input-sm flex-1 !outline-none focus:border-primary"
                value={localHackatimeProjectKeys}
                onChange={(e) => onHackatimeProjectKeysChange(e.target.value)}
                placeholder="comma-separated project names"
              />
              <div className={!groqApiKey ? "tooltip tooltip-left" : ""} data-tip={!groqApiKey ? "Set a Groq API key in Preferences to enable AI inference" : undefined}>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={handleInferProjectKey}
                  disabled={!groqApiKey || isInferring || userProjectKeys.length === 0}
                >
                  {isInferring ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <SparklesIcon className="h-4 w-4" />
                  )}
                  Infer
                </button>
              </div>
            </div>
            {inferResult && (
              <div className="mt-2 text-xs text-base-content/70 flex items-center gap-2">
                <span className={`badge badge-xs ${
                  inferResult.confidence === "high" ? "badge-success" :
                  inferResult.confidence === "medium" ? "badge-warning" : "badge-error"
                }`}>
                  {inferResult.confidence}
                </span>
                <span>{inferResult.reasoning}</span>
              </div>
            )}
          </div>
        )}

        {hasHackatimeIntegration && isApproved && aggregatedProjectHours != null && (
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

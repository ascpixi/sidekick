import { useState, useEffect, useMemo } from "react";
import { HackatimeService, type HackatimeTrustLevel, type HackatimeTrustLog } from "../services/hackatime";
import { YswsSubmission } from "../types/submission";
import type { Heartbeat } from "../services/hackatime";

export interface HeartbeatLoadingProgress {
  current: number;
  total: number;
}

export function useHeartbeatData(
  selectedSubmission?: YswsSubmission,
  hackatimeApiKey?: string,
  allSubmissions?: YswsSubmission[]
) {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<HeartbeatLoadingProgress | null>(null);
  const [hackatimeUserId, setHackatimeUserId] = useState<number | null>(null);
  const [trustLevel, setTrustLevel] = useState<HackatimeTrustLevel | null>(null);
  const [trustLogs, setTrustLogs] = useState<HackatimeTrustLog[]>([]);
  const [aggregatedProjectHours, setAggregatedProjectHours] = useState<number | null>(null);

  const hackatimeService = useMemo(() => {
    if (!hackatimeApiKey) return null;
    try {
      return new HackatimeService(hackatimeApiKey);
    } catch {
      console.warn("Invalid Hackatime API key");
      return null;
    }
  }, [hackatimeApiKey]);

  useEffect(() => {
    let cancelled = false;

    async function fetchHeartbeats() {
      if (!hackatimeService || !selectedSubmission?.authorEmail) {
        setHeartbeats([]);
        setTrustLevel(null);
        setTrustLogs([]);
        setAggregatedProjectHours(null);
        return;
      }

      const projectKeys = selectedSubmission.hackatimeProjectKeys
        ?.split(",")
        .map(key => key.trim().toLowerCase())
        .filter(key => key.length > 0) ?? [];

      if (projectKeys.length === 0) {
        setHeartbeats([]);
        setTrustLevel(null);
        setTrustLogs([]);
        setAggregatedProjectHours(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const userId = await hackatimeService.findIdByEmail(selectedSubmission.authorEmail);
        if (cancelled) return;

        if (!userId) {
          setError("User not found in Hackatime");
          setHeartbeats([]);
          setHackatimeUserId(null);
          setTrustLevel(null);
          setTrustLogs([]);
          return;
        }
        setHackatimeUserId(userId);

        const userInfo = await hackatimeService.getUserInfo(userId);
        if (cancelled) return;

        setTrustLevel(userInfo.trust_level);

        if (userInfo.trust_level === "yellow" || userInfo.trust_level === "red") {
          const logs = await hackatimeService.getTrustLogs(userId);
          if (cancelled) return;
          setTrustLogs(logs);
        } else {
          setTrustLogs([]);
        }

        const allProjects = await hackatimeService.getUserProjects(userId);
        if (cancelled) return;

        const keys = selectedSubmission.hackatimeProjectKeys
          .split(/[,;]/)
          .map(x => x.toLowerCase().trim());

        const projects = allProjects.projects.filter(x => keys.includes(x.name.toLowerCase()));
        if (projects.length === 0) {
          setError("No matching projects found");
          setHeartbeats([]);
          setAggregatedProjectHours(null);
          return;
        }

        const authorSubmissions = allSubmissions?.filter(
          s => s.authorEmail?.toLowerCase() === selectedSubmission.authorEmail?.toLowerCase() && s.approved
        ) ?? (selectedSubmission.approved ? [selectedSubmission] : []);
        
        const allAuthorProjectKeys = new Set<string>();
        for (const sub of authorSubmissions) {
          const subKeys = sub.hackatimeProjectKeys?.split(/[,;]/).map(x => x.toLowerCase().trim()) ?? [];
          for (const key of subKeys) {
            if (key) allAuthorProjectKeys.add(key);
          }
        }
        
        const aggregateProjects = allProjects.projects.filter(x => allAuthorProjectKeys.has(x.name.toLowerCase()));
        const totalSeconds = aggregateProjects.reduce((sum, p) => sum + p.total_duration, 0);
        setAggregatedProjectHours(totalSeconds / 3600);

        let minTimestamp = Infinity;
        let maxTimestamp = -Infinity;
        for (const proj of projects) {
          if (proj.first_heartbeat < minTimestamp) {
            minTimestamp = proj.first_heartbeat;
          }

          if (proj.last_heartbeat > maxTimestamp) {
            maxTimestamp = proj.last_heartbeat;
          }
        }

        const startDate = new Date(minTimestamp * 1000);
        const endDate = new Date(maxTimestamp * 1000);

        const allHeartbeats: Heartbeat[] = [];

        const currentDate = new Date(startDate);
        currentDate.setUTCHours(0, 0, 0, 0);
        const endDay = new Date(endDate);
        endDay.setUTCHours(23, 59, 59, 999);

        const totalDays = Math.ceil((endDay.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) - 1;
        let currentDay = 0;
        setProgress({ current: 0, total: totalDays });

        while (currentDate <= endDay) {
          if (cancelled) return;

          const rawHeartbeats = await hackatimeService.getHeartbeatsFor(userId, currentDate);
          if (cancelled) return;

          const filtered = rawHeartbeats.filter(x => x.project && keys.includes(x.project.toLowerCase()));

          for (const hb of filtered) {
            allHeartbeats.push({
              time: hb.time,
              created_at: hb.created_at,
              project: hb.project,
              branch: hb.branch,
              category: hb.category,
              editor: hb.editor,
              entity: hb.entity,
              language: hb.language,
              machine: hb.machine,
              operating_system: hb.operating_system,
              type: hb.type,
              user_agent: hb.user_agent,
              line_additions: hb.line_additions,
              line_deletions: hb.line_deletions,
              lineno: hb.lineno,
              lines: hb.lines,
              cursorpos: hb.cursorpos,
              project_root_count: hb.project_root_count,
              is_write: hb.is_write,
              source_type: hb.source_type,
              ip_address: hb.ip_address
            });
          }

          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
          currentDay++;
          setProgress({ current: currentDay, total: totalDays });
        }

        if (cancelled) return;
        setHeartbeats(allHeartbeats);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch heartbeats:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch heartbeat data");
        setHeartbeats([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setProgress(null);
        }
      }
    }

    fetchHeartbeats();

    return () => {
      cancelled = true;
    };
  }, [hackatimeService, selectedSubmission?.authorEmail, selectedSubmission?.hackatimeProjectKeys]);

  return {
    heartbeats,
    isLoading,
    error,
    progress,
    hackatimeUserId,
    trustLevel,
    trustLogs,
    aggregatedProjectHours
  };
}

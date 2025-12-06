export interface Heartbeat {
  time: Date;
  created_at: Date;
  project: string;
  branch: string;
  category: string;
  editor: string;
  entity: string;
  language: string;
  machine: string;
  operating_system: string;
  type: string;
  user_agent: string;
  line_additions: number | null;
  line_deletions: number | null;
  lineno: number;
  lines: number;
  cursorpos: number;
  project_root_count: number;
  is_write: boolean | null;
  source_type: string;
  ip_address: string;
}

export interface HeartbeatCluster {
  id: string;
  startTime: Date;
  endTime: Date;
  heartbeats: Heartbeat[];
}

const CLUSTER_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function clusterHeartbeats(heartbeats: Heartbeat[]): HeartbeatCluster[] {
  if (heartbeats.length === 0) return [];

  // Sort heartbeats by time
  const sorted = [...heartbeats].sort((a, b) => a.time.getTime() - b.time.getTime());
  
  const clusters: HeartbeatCluster[] = [];
  let currentCluster: Heartbeat[] = [sorted[0]];
  let lastTime = sorted[0].time.getTime();

  for (let i = 1; i < sorted.length; i++) {
    const currentTime = sorted[i].time.getTime();
    
    if (currentTime - lastTime <= CLUSTER_THRESHOLD_MS) {
      // Add to current cluster
      currentCluster.push(sorted[i]);
    } else {
      // Start new cluster
      if (currentCluster.length > 0) {
        clusters.push({
          id: `cluster-${clusters.length}`,
          startTime: currentCluster[0].time,
          endTime: currentCluster[currentCluster.length - 1].time,
          heartbeats: currentCluster
        });
      }
      currentCluster = [sorted[i]];
    }
    lastTime = currentTime;
  }

  // Add the last cluster
  if (currentCluster.length > 0) {
    clusters.push({
      id: `cluster-${clusters.length}`,
      startTime: currentCluster[0].time,
      endTime: currentCluster[currentCluster.length - 1].time,
      heartbeats: currentCluster
    });
  }

  return clusters;
}

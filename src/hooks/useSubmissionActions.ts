import { useState, useCallback } from "react";
import { YswsSubmission, type BaseSettings, type AirtableBase } from "../types/submission";
import { HackatimeService } from "../services/hackatime";

export function useSubmissionActions(
  currentBase?: AirtableBase,
  baseSettings?: Record<string, BaseSettings>,
  hackatimeAdminKey?: string,
  onSubmissionUpdate?: () => void
) {
  const [approvingSubmission, setApprovingSubmission] = useState<string | null>(null);
  const [rejectingSubmission, setRejectingSubmission] = useState<string | null>(null);
  const [showRejectionPrompt, setShowRejectionPrompt] = useState(false);

  const handleApprove = useCallback(async (submission: YswsSubmission) => {
    if (approvingSubmission) return;
    
    setApprovingSubmission(submission.recordId);
    await submission.update({ approved: true });
    onSubmissionUpdate?.();
    setApprovingSubmission(null);
  }, [approvingSubmission, onSubmissionUpdate]);

  const handleReject = useCallback(async (submission: YswsSubmission) => {
    if (rejectingSubmission) return;
    
    const currentBaseSettings = currentBase ? baseSettings?.[currentBase.id] : undefined;
    const rejectedColumn = currentBaseSettings?.rejectedColumn;
    
    if (!rejectedColumn) {
      setShowRejectionPrompt(true);
      return;
    }
    
    setRejectingSubmission(submission.recordId);
    await submission.updateCustomField(rejectedColumn, true, true);
    onSubmissionUpdate?.();
    setRejectingSubmission(null);
  }, [rejectingSubmission, currentBase, baseSettings, onSubmissionUpdate]);

  const handleUndoRejection = useCallback(async (submission: YswsSubmission) => {
    if (rejectingSubmission) return;
    
    const currentBaseSettings = currentBase ? baseSettings?.[currentBase.id] : undefined;
    const rejectedColumn = currentBaseSettings?.rejectedColumn;
    
    if (!rejectedColumn) return;
    
    setRejectingSubmission(submission.recordId);
    await submission.updateCustomField(rejectedColumn, false, true);
    onSubmissionUpdate?.();
    setRejectingSubmission(null);
  }, [rejectingSubmission, currentBase, baseSettings, onSubmissionUpdate]);

  const handleSendGrant = useCallback((submission: YswsSubmission) => {
    const currentBaseSettings = currentBase ? baseSettings?.[currentBase.id] : undefined;
    const hcbOrgName = currentBaseSettings?.hcbOrgName;
    
    if (!hcbOrgName) return;

    const email = encodeURIComponent(submission.authorEmail);
    const amountCents = Math.floor(submission.hoursSpent * 500);
    const url = `https://hcb.hackclub.com/${hcbOrgName}/card-grants/new?email=${email}&amount_cents=${amountCents}`;
    
    window.open(url, "_blank");
  }, [currentBase, baseSettings]);

  const handleSyncFromHackatime = useCallback(async (
    submission: YswsSubmission,
    onUpdate: (hours: number, justification: string) => void
  ) => {
    if (!hackatimeAdminKey || !submission.hackatimeProjectKeys) return;

    const hackatimeService = new HackatimeService(hackatimeAdminKey);
    const projectKeys = submission.hackatimeProjectKeys.split(",").map(key => key.trim());
    
    const userId = await hackatimeService.findIdByEmail(submission.authorEmail);
    if (!userId) return;

    const userProjects = await hackatimeService.getUserProjects(userId);
    let totalSeconds = 0;
    const matchedProjects: { key: string; hours: number }[] = [];
    
    for (const projectKey of projectKeys) {
      const matchingProject = userProjects.projects.find(p => 
        p.name.toLowerCase().includes(projectKey.toLowerCase()) || 
        projectKey.toLowerCase().includes(p.name.toLowerCase())
      );
      if (matchingProject) {
        const projectHours = Math.round((matchingProject.total_duration / 3600) * 10) / 10;
        totalSeconds += matchingProject.total_duration;
        matchedProjects.push({ key: projectKey, hours: projectHours });
      }
    }

    const totalHours = totalSeconds / 3600;
    
    if (totalHours > 0) {
      const roundedHours = Math.round(totalHours * 10) / 10;
      
      let justification: string;
      if (matchedProjects.length === 1) {
        justification = `${matchedProjects[0].hours} hours, verified with Hackatime.`;
      } else {
        const hoursString = matchedProjects.map(p => p.hours).join(" + ");
        justification = `${hoursString} = ${roundedHours} hours, verified with Hackatime.`;
      }
      
      onUpdate(roundedHours, justification);
    }
  }, [hackatimeAdminKey]);

  return {
    approvingSubmission,
    rejectingSubmission,
    showRejectionPrompt,
    setShowRejectionPrompt,
    handleApprove,
    handleReject,
    handleUndoRejection,
    handleSendGrant,
    handleSyncFromHackatime
  };
}

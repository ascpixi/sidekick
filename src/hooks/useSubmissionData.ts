import { useState, useEffect, useCallback } from "react";
import { YswsSubmission } from "../types/submission";

export function useSubmissionData(
  selectedSubmission?: YswsSubmission,
  onSubmissionUpdate?: () => void,
  hackatimeProjectsColumn?: string
) {
  const [localHoursSpent, setLocalHoursSpent] = useState<number>(0);
  const [localHoursSpentJustification, setLocalHoursSpentJustification] = useState<string>("");
  const [localHackatimeProjectKeys, setLocalHackatimeProjectKeys] = useState<string>("");

  const updateHoursSpent = useCallback(async (submission: YswsSubmission, value: number) => {
    await submission.update({ hoursSpent: value });
    onSubmissionUpdate?.();
  }, [onSubmissionUpdate]);

  const updateHoursSpentJustification = useCallback(async (submission: YswsSubmission, value: string) => {
    await submission.update({ hoursSpentJustification: value });
    onSubmissionUpdate?.();
  }, [onSubmissionUpdate]);

  const updateHackatimeProjectKeys = useCallback(async (
    submission: YswsSubmission, 
    value: string,
    hackatimeProjectsColumn?: string
  ) => {
    if (!hackatimeProjectsColumn) return;
    
    await submission.updateCustomField(hackatimeProjectsColumn, value, true);
    onSubmissionUpdate?.();
  }, [onSubmissionUpdate]);

  useEffect(() => {
    if (!selectedSubmission) return;

    const timeoutId = setTimeout(() => {
      setLocalHoursSpent(selectedSubmission.hoursSpent || 0);
      setLocalHoursSpentJustification(selectedSubmission.hoursSpentJustification || "");
      setLocalHackatimeProjectKeys(selectedSubmission.hackatimeProjectKeys || "");
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [selectedSubmission]);

  useEffect(() => {
    if (!selectedSubmission) return;

    const timeout = setTimeout(() => {
      if (localHoursSpentJustification !== selectedSubmission.hoursSpentJustification) {
        updateHoursSpentJustification(selectedSubmission, localHoursSpentJustification);
      }
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [localHoursSpentJustification, selectedSubmission, updateHoursSpentJustification]);

  useEffect(() => {
    if (!selectedSubmission || !hackatimeProjectsColumn) return;

    const timeout = setTimeout(() => {
      if (localHackatimeProjectKeys !== selectedSubmission.hackatimeProjectKeys) {
        updateHackatimeProjectKeys(selectedSubmission, localHackatimeProjectKeys, hackatimeProjectsColumn);
      }
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [localHackatimeProjectKeys, selectedSubmission, hackatimeProjectsColumn, updateHackatimeProjectKeys]);

  return {
    localHoursSpent,
    localHoursSpentJustification, 
    localHackatimeProjectKeys,
    setLocalHoursSpent,
    setLocalHoursSpentJustification,
    setLocalHackatimeProjectKeys,
    updateHoursSpent,
    updateHackatimeProjectKeys
  };
}

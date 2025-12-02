import { YswsSubmission, type BaseSettings, type AirtableBase } from "../types/submission";
import { getSubmissionTitle } from "../utils/submission";
import { EnvelopeIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import { Card } from "./ui/Card";
import { Accordion } from "./ui/Accordion";
import { SubmissionHeader } from "./ui/SubmissionHeader";
import { TimeSection } from "./ui/TimeSection";
import { SubmissionDetails } from "./ui/SubmissionDetails";
import { FulfillmentInfo } from "./ui/FulfillmentInfo";
import { FeedbackSection } from "./ui/FeedbackSection";
import { ImagePreview } from "./ui/ImagePreview";
import { useSubmissionActions } from "../hooks/useSubmissionActions";
import { useSubmissionData } from "../hooks/useSubmissionData";
import { useRef, useEffect, useState } from "react";

export function MainLayout({ 
  submissions, 
  selectedSubmission, 
  onSubmissionSelect, 
  onSubmissionUpdate,
  isLoading, 
  error,
  currentBase,
  baseSettings,
  hackatimeAdminKey
}: { 
  submissions: YswsSubmission[];
  selectedSubmission?: YswsSubmission;
  onSubmissionSelect: (submission: YswsSubmission) => void;
  onSubmissionUpdate?: () => void;
  isLoading?: boolean;
  error?: string | null;
  currentBase?: AirtableBase;
  baseSettings: Record<string, BaseSettings>;
  hackatimeAdminKey?: string;
}) {
  const submissionViewRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const submissionActions = useSubmissionActions(
    currentBase,
    baseSettings,
    hackatimeAdminKey,
    onSubmissionUpdate
  );

  const submissionData = useSubmissionData(selectedSubmission, onSubmissionUpdate);

  useEffect(() => {
    if (selectedSubmission && submissionViewRef.current) {
      submissionViewRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedSubmission]);
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImage(null);
      }
    };

    if (previewImage) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [previewImage]);

  const pendingSubmissions = submissions.filter(s => !s.approved && !s.rejected);
  const approvedSubmissions = submissions.filter(s => s.approved);
  const rejectedSubmissions = submissions.filter(s => s.rejected);

  const renderSubmissionList = (submissions: YswsSubmission[]) => (
    <div className="divide-y divide-base-content/5">
      {submissions.map((submission, index) => {
        const isSelected = selectedSubmission === submission;
        const title = getSubmissionTitle(submission);

        return (
          <button
            key={index}
            onClick={() => onSubmissionSelect(submission)}
            className={`w-full p-4 text-left transition-colors cursor-pointer flex items-center gap-3 ${
              isSelected 
                ? "bg-primary bg-opacity-10 border-r-2 border-primary" 
                : "hover:bg-base-200"
            }`}
          >
            <div className="w-12 h-12 flex-shrink-0">
              {submission.screenshotUrl ? (
                <img 
                  src={submission.screenshotUrl} 
                  alt="Project screenshot"
                  className="w-full h-full object-cover rounded border border-base-content/10 cursor-pointer hover:opacity-80 transition-opacity"
                  width={submission.screenshotWidth}
                  height={submission.screenshotHeight}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage(submission.screenshotUrl);
                  }}
                />
              ) : (
                <div className="w-full h-full bg-base-300 rounded flex items-center justify-center">
                  <span className="text-xs text-base-content/50">📸</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{title}</div>
              <div className="text-xs text-base-content/70 mt-1 truncate">
                {submission.description || "No description"}
              </div>
              {submission.authorGithub && (
                <div className={`text-xs mt-1 ${isSelected ? "text-base-content/80" : "text-primary"}`}>
                  @{submission.authorGithub}
                </div>
              )}
            </div>
          </button>
        );
      })}

      {submissions.length === 0 && (
        <div className="p-8 text-center text-base-content/70">
          No submissions in this category
        </div>
      )}
    </div>
  );

   if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center">
          <span className="loading loading-spinner loading-md"></span>
          <span className="ml-2">Loading submissions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-error">
          <div className="text-sm">Failed to load submissions</div>
          <div className="text-xs text-base-content/70 mt-1">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-80 bg-base-100 border-r border-base-content/5 overflow-y-auto">        
        <div>
          <Accordion title={
            <div className="flex items-center gap-3">
              <span>Pending</span>
              <div className="badge badge-warning">{pendingSubmissions.length}</div>
            </div>
          } defaultOpen={true}>
            {renderSubmissionList(pendingSubmissions)}
          </Accordion>
          
          <Accordion title={
            <div className="flex items-center gap-3">
              <span>Approved</span>
              <div className="badge badge-success">{approvedSubmissions.length}</div>
            </div>
          } defaultOpen={false}>
            {renderSubmissionList(approvedSubmissions)}
          </Accordion>

          {rejectedSubmissions.length > 0 && (
            <Accordion title={
              <div className="flex items-center gap-3">
                <span>Rejected</span>
                <div className="badge badge-error">{rejectedSubmissions.length}</div>
              </div>
            } defaultOpen={false}>
              {renderSubmissionList(rejectedSubmissions)}
            </Accordion>
          )}

          {submissions.length === 0 && (
            <div className="p-8 text-center text-base-content/70">
              No submissions found
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={submissionViewRef}>
        {selectedSubmission ? (
          <div className="p-6">
            <div>
              <Card className="mb-1">
                <SubmissionHeader
                  submission={selectedSubmission}
                  isApproving={submissionActions.approvingSubmission === selectedSubmission.recordId}
                  isRejecting={submissionActions.rejectingSubmission === selectedSubmission.recordId}
                  onApprove={() => submissionActions.handleApprove(selectedSubmission)}
                  onReject={() => submissionActions.handleReject(selectedSubmission)}
                  onUndoRejection={() => submissionActions.handleUndoRejection(selectedSubmission)}
                  onSendGrant={() => submissionActions.handleSendGrant(selectedSubmission)}
                  hcbOrgName={currentBase ? baseSettings[currentBase.id]?.hcbOrgName : undefined}
                />

                <div className="flex flex-col gap-2 text-sm">
                  {selectedSubmission.codeUrl && (
                    <a 
                      href={selectedSubmission.codeUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="link link-hover text-base-content/70 flex items-center gap-2"
                    >
                      <CodeBracketIcon className="w-4 h-4" />
                      {selectedSubmission.codeUrl}
                    </a>
                  )}
                  
                  {selectedSubmission.authorEmail && (
                    <a 
                      href={`mailto:${selectedSubmission.authorEmail}`}
                      className="link link-hover text-base-content/70 flex items-center gap-2"
                    >
                      <EnvelopeIcon className="w-4 h-4" />
                      {selectedSubmission.authorEmail}
                    </a>
                  )}
                </div>
              </Card>

              <TimeSection
                localHoursSpent={submissionData.localHoursSpent}
                localHoursSpentJustification={submissionData.localHoursSpentJustification}
                localHackatimeProjectKeys={submissionData.localHackatimeProjectKeys}
                onHoursSpentChange={(value) => {
                  submissionData.setLocalHoursSpent(value);
                  submissionData.updateHoursSpent(selectedSubmission, value);
                }}
                onHoursSpentJustificationChange={submissionData.setLocalHoursSpentJustification}
                onHackatimeProjectKeysChange={submissionData.setLocalHackatimeProjectKeys}
                onSyncFromHackatime={() => submissionActions.handleSyncFromHackatime(
                  selectedSubmission, 
                  (hours, justification) => {
                    submissionData.setLocalHoursSpent(hours);
                    submissionData.setLocalHoursSpentJustification(justification);
                    submissionData.updateHoursSpent(selectedSubmission, hours);
                  }
                )}
                hasHackatimeIntegration={!!(currentBase && baseSettings[currentBase.id]?.hackatimeProjectsColumn)}
              />

              <SubmissionDetails
                submission={selectedSubmission}
                onImagePreview={setPreviewImage}
              />

              <FulfillmentInfo submission={selectedSubmission} />

              <FeedbackSection submission={selectedSubmission} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-4xl mb-4">📋</div>
              <h2 className="text-xl font-semibold mb-2">Select a submission</h2>
              <p className="text-base-content/70">
                Choose a submission from the sidebar to view details
              </p>
            </div>
          </div>
        )}
      </div>

      {previewImage && (
        <ImagePreview 
          imageUrl={previewImage} 
          onClose={() => setPreviewImage(null)} 
        />
      )}

      {submissionActions.showRejectionPrompt && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Rejection Column Not Configured</h3>
            <p className="py-4">
              To reject submissions, you need to configure a rejection column. Please go to the base settings and set up a rejection column first.
            </p>
            <div className="modal-action">
              <button 
                className="btn btn-primary"
                onClick={() => submissionActions.setShowRejectionPrompt(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { YswsSubmission, type BaseSettings, type AirtableBase, getSubmissionTitle } from "../types/submission";
import { EnvelopeIcon, CodeBracketIcon, ExclamationTriangleIcon, NoSymbolIcon, Bars3Icon, XMarkIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Card } from "./ui/Card";
import { Accordion } from "./ui/Accordion";
import { SubmissionHeader } from "./ui/SubmissionHeader";
import { TimeSection } from "./ui/TimeSection";
import { SubmissionDetails } from "./ui/SubmissionDetails";
import { FulfillmentInfo } from "./ui/FulfillmentInfo";
import { FeedbackSection } from "./ui/FeedbackSection";
import { AuxiliarySection } from "./ui/AuxiliarySection";
import { ImagePreview } from "./ui/ImagePreview";
import { useSubmissionActions } from "../hooks/useSubmissionActions";
import { useSubmissionData } from "../hooks/useSubmissionData";
import { useHeartbeatData } from "../hooks/useHeartbeatData";
import { TrustAlert } from "./ui/TrustAlert";
import { useRef, useEffect, useState, useMemo } from "react";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { normalizeUrl } from "../utils";

export function MainLayout({ 
  submissions, 
  selectedSubmission, 
  onSubmissionSelect, 
  onSubmissionUpdate,
  isLoading, 
  error,
  currentBase,
  baseSettings,
  hackatimeAdminKey,
  groqApiKey
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
  groqApiKey?: string;
}) {
  const submissionViewRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [codeUrlCopied, setCodeUrlCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authorFilter, setAuthorFilter] = useState("");
  
  const submissionActions = useSubmissionActions(
    currentBase,
    baseSettings,
    hackatimeAdminKey,
    onSubmissionUpdate
  );

  const hackatimeProjectsColumn = currentBase ? baseSettings[currentBase.id]?.hackatimeProjectsColumn : undefined;
  const submissionData = useSubmissionData(selectedSubmission, onSubmissionUpdate, hackatimeProjectsColumn);
  const heartbeatData = useHeartbeatData(selectedSubmission, hackatimeAdminKey, submissions);

  const handleCopyEmail = () => {
    if (selectedSubmission?.authorEmail) {
      navigator.clipboard.writeText(selectedSubmission.authorEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  };

  const handleCopyCodeUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedSubmission?.codeUrl) {
      navigator.clipboard.writeText(selectedSubmission.codeUrl);
      setCodeUrlCopied(true);
      setTimeout(() => setCodeUrlCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (selectedSubmission && submissionViewRef.current) {
      submissionViewRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedSubmission]);

  useEffect(() => {
    setAuthorFilter("");
  }, [currentBase?.id]);

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

  const filteredSubmissions = useMemo(() => {
    if (!authorFilter) return submissions;
    return submissions.filter(s => s.authorGithub === authorFilter);
  }, [submissions, authorFilter]);

  const pendingSubmissions = filteredSubmissions.filter(s => !s.approved && !s.rejected);
  const approvedSubmissions = filteredSubmissions.filter(s => s.approved);
  const rejectedSubmissions = filteredSubmissions.filter(s => s.rejected);

  const handleSubmissionClick = (submission: YswsSubmission) => {
    onSubmissionSelect(submission);
    setSidebarOpen(false);
  };

  const renderSubmissionList = (submissions: YswsSubmission[]) => (
    <div className="divide-y divide-base-content/5">
      {submissions.map((submission, index) => {
        const isSelected = selectedSubmission === submission;
        const title = getSubmissionTitle(submission);

        return (
          <button
            key={index}
            onClick={() => handleSubmissionClick(submission)}
            className={`w-full p-4 text-left transition-colors cursor-pointer flex items-center gap-3 rounded-lg ${
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
        <div className="p-4 text-center text-base-content/70 text-sm">
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

  const sidebarContent = (
    <div>
      <div className="p-3 border-b border-base-content/10">
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4 text-base-content/60 flex-shrink-0" />
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="select select-sm select-bordered w-full focus:!outline-none focus:!border-primary"
          >
            <option value="">All authors</option>
            {[...new Set(submissions.map(s => s.authorGithub).filter(Boolean))].sort().map(github => (
              <option key={github} value={github}>@{github}</option>
            ))}
          </select>
        </div>
        {authorFilter && (
          <div className="text-xs text-base-content/60 mt-1">
            Showing {filteredSubmissions.length} of {submissions.length} submissions
          </div>
        )}
      </div>
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
  );

  return (
    <div className="flex h-full relative">
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed bottom-4 right-4 z-50 btn btn-circle btn-primary btn-lg shadow-lg"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
      >
        {sidebarOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless open, always visible on desktop */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-[85vw] sm:w-80 bg-base-100 border-r border-base-content/5 overflow-y-auto
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-base-content/10">
          <span className="font-semibold">Submissions</span>
          <button 
            className="btn btn-ghost btn-sm btn-circle"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {sidebarContent}
      </div>

      <div className="flex-1 overflow-y-auto" ref={submissionViewRef}>
        {selectedSubmission ? (
          <div className="p-3 sm:p-6">
            <div>
              <Card className="mb-1 border border-base-content/10 rounded-2xl">
                {selectedSubmission.screenshotUrl && (
                  <div 
                    className="w-full h-48 -mx-6 -mt-6 mb-4 rounded-t-2xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ width: "calc(100% + 3rem)" }}
                    onClick={() => setPreviewImage(selectedSubmission.screenshotUrl!)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPreviewImage(selectedSubmission.screenshotUrl!);
                      }
                    }}
                  >
                    <img 
                      src={selectedSubmission.screenshotUrl} 
                      alt="Project screenshot" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
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
                    <div className="flex items-center gap-2">
                      <a 
                        href={normalizeUrl(selectedSubmission.codeUrl)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="link link-hover text-base-content/70 flex items-center gap-2"
                      >
                        <CodeBracketIcon className="w-4 h-4" />
                        {selectedSubmission.codeUrl}
                      </a>
                      <div className="tooltip" data-tip={codeUrlCopied ? "Copied!" : "Copy"}>
                        <ClipboardDocumentIcon 
                          className="w-4 h-4 cursor-pointer text-base-content/70 hover:text-primary transition-all active:scale-75" 
                          onClick={handleCopyCodeUrl}
                        />
                      </div>
                    </div>
                  )}
                  
                  {selectedSubmission.authorEmail && (
                    <div className="tooltip w-min" data-tip={emailCopied ? "Copied!" : "Click to copy"}>
                      <button 
                        onClick={handleCopyEmail}
                        className="link link-hover text-base-content/70 flex items-center gap-2 text-left"
                      >
                        <EnvelopeIcon className="w-4 h-4" />
                        {selectedSubmission.authorEmail}
                      </button>
                    </div>
                  )}
                </div>

                {heartbeatData.trustLevel === "yellow" && (
                  <TrustAlert
                    variant="warning"
                    icon={<ExclamationTriangleIcon className="h-6 w-6 shrink-0 stroke-current" />}
                    message="This user is a sussy baka."
                    trustLogs={heartbeatData.trustLogs}
                  />
                )}

                {heartbeatData.trustLevel === "red" && (
                  <TrustAlert
                    variant="error"
                    icon={<NoSymbolIcon className="h-6 w-6 shrink-0 stroke-current" />}
                    message="This user has been banished to the shadow realm."
                    trustLogs={heartbeatData.trustLogs}
                  />
                )}
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
                heartbeats={heartbeatData.heartbeats}
                heartbeatProgress={heartbeatData.progress}
                isLoadingHeartbeats={heartbeatData.isLoading}
                hackatimeUserId={heartbeatData.hackatimeUserId}
                aggregatedProjectHours={heartbeatData.aggregatedProjectHours}
                isApproved={selectedSubmission.approved}
                groqApiKey={groqApiKey}
                userProjectKeys={heartbeatData.userProjectKeys}
                codeUrl={selectedSubmission.codeUrl}
                demoUrl={selectedSubmission.demoUrl}
                description={selectedSubmission.description}
              />

              <SubmissionDetails
                submission={selectedSubmission}
                onImagePreview={setPreviewImage}
              />

              <FulfillmentInfo submission={selectedSubmission} />

              <FeedbackSection submission={selectedSubmission} />

              <AuxiliarySection submission={selectedSubmission} />
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
            <h3 className="font-bold text-lg flex items-center gap-2">
              <ExclamationTriangleIcon className="w-6 h-6" />
              And I oop-
            </h3>
            <p className="py-4">
              To reject submissions, you need to configure a rejection column. Click "Configure" on the header!
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

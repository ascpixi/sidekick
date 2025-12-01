import type { YswsSubmission } from "../types/submission";
import { getSubmissionTitle, formatAddress } from "../utils/submission";
import { EnvelopeIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import { Card } from "./ui/Card";
import { Accordion } from "./ui/Accordion";
import { ExpandableText } from "./ui/ExpandableText";

export function MainLayout({ 
  submissions, 
  selectedSubmission, 
  onSubmissionSelect, 
  isLoading, 
  error 
}: { 
  submissions: YswsSubmission[];
  selectedSubmission?: YswsSubmission;
  onSubmissionSelect: (submission: YswsSubmission) => void;
  isLoading?: boolean;
  error?: string | null;
}) {
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
        <div className="p-4 border-b border-base-100">
          <h2 className="font-semibold text-lg">Submissions ({submissions.length})</h2>
        </div>
        
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
                      className="w-full h-full object-cover rounded border border-base-content/10"
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
              No submissions found
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedSubmission ? (
          <div className="p-6">
            <div className="max-w-4xl">
              <Card className="mb-2">
                {selectedSubmission.demoUrl ? (
                  <h1 className="text-2xl font-bold mb-4">
                    <a 
                      href={selectedSubmission.demoUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="link link-hover text-primary"
                    >
                      {selectedSubmission.demoUrl}
                    </a>
                  </h1>
                ) : (
                  <h1 className="text-2xl font-bold mb-4 text-base-content/50">
                    No demo URL provided
                  </h1>
                )}

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

              <Card className="mb-2">
                <h2 className="text-lg font-semibold mb-4">Project Description</h2>
                <ExpandableText text={selectedSubmission.description} maxLines={3} />
              </Card>

              {selectedSubmission.screenshotUrl && (
                <Card className="mb-2">
                  <img 
                    src={selectedSubmission.screenshotUrl} 
                    alt="Project screenshot" 
                    className="max-w-full rounded-lg"
                  />
                </Card>
              )}

              <Accordion title="Fulfillment Information" className="mb-4">
                <div>
                  <span className="font-medium">Name:</span> {selectedSubmission.authorFirstName} {selectedSubmission.authorLastName}
                </div>
                {formatAddress(selectedSubmission).length > 0 && (
                  <div>
                    <span className="font-medium">Address:</span>
                    <div className="text-sm text-base-content/70 ml-4 mt-1">
                      {formatAddress(selectedSubmission).map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </Accordion>

              <Accordion title="Feedback" className="mb-6" defaultOpen={true}>
                <Card>
                  <h3 className="font-semibold mb-4">What are we doing well?</h3>
                  <ExpandableText text={selectedSubmission.whatAreWeDoingWell} maxLines={3} />
                </Card>
                <Card>
                  <h3 className="font-semibold mb-4">How can we improve?</h3>
                  <ExpandableText text={selectedSubmission.howCanWeImprove} maxLines={3} />
                </Card>
                <Card>
                  <h3 className="font-semibold mb-4">How did you hear about this?</h3>
                  <ExpandableText text={selectedSubmission.howDidYouHearAboutThis} maxLines={3} />
                </Card>
              </Accordion>
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
    </div>
  );
}

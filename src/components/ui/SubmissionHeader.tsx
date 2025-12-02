import type { YswsSubmission } from "../../types/submission";
import { ActionButtons } from "./ActionButtons";

function cleanUrlForDisplay(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

export function SubmissionHeader({
  submission,
  isApproving,
  isRejecting,
  onApprove,
  onReject,
  onUndoRejection,
  onSendGrant,
  hcbOrgName
}: {
  submission: YswsSubmission;
  isApproving: boolean;
  isRejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onUndoRejection: () => void;
  onSendGrant: () => void;
  hcbOrgName?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-2xl font-bold">
        {submission.demoUrl ? (
          <a 
            href={submission.demoUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="link link-hover text-primary"
          >
            {cleanUrlForDisplay(submission.demoUrl)}
          </a>
        ) : (
          <span className="text-base-content/50">
            No demo URL provided
          </span>
        )}
      </h1>
      <div className="flex items-center gap-3">
        <ActionButtons
          submission={submission}
          isApproving={isApproving}
          isRejecting={isRejecting}
          onApprove={onApprove}
          onReject={onReject}
          onUndoRejection={onUndoRejection}
          onSendGrant={onSendGrant}
          hcbOrgName={hcbOrgName}
        />
      </div>
    </div>
  );
}

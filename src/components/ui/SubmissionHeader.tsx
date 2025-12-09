import { useState } from "react";
import type { YswsSubmission } from "../../types/submission";
import { ActionButtons } from "./ActionButtons";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { normalizeUrl } from "../../utils";

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
  const [demoUrlCopied, setDemoUrlCopied] = useState(false);

  const handleCopyDemoUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    if (submission.demoUrl) {
      navigator.clipboard.writeText(submission.demoUrl);
      setDemoUrlCopied(true);
      setTimeout(() => setDemoUrlCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-3">
      <h1 className="text-xl sm:text-2xl font-bold break-all">
        {submission.demoUrl ? (
          <span className="inline-flex items-center gap-2">
            <a 
              href={normalizeUrl(submission.demoUrl)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="link link-hover text-primary"
            >
              {cleanUrlForDisplay(submission.demoUrl)}
            </a>
            <span className="tooltip" data-tip={demoUrlCopied ? "Copied!" : "Copy"}>
              <ClipboardDocumentIcon 
                className="w-5 h-5 cursor-pointer text-primary/70 hover:text-primary transition-all active:scale-75" 
                onClick={handleCopyDemoUrl}
              />
            </span>
          </span>
        ) : (
          <span className="text-base-content/50">
            No demo URL provided
          </span>
        )}
      </h1>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0 mt-2 sm:mt-0">
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

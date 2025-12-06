import { CheckIcon, XMarkIcon, BanknotesIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { YswsSubmission } from "../../types/submission";

export function ActionButtons({
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
  const airtableButton = (
    <a
      href={submission.airtableUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-ghost btn-md border border-base-content/20"
      title="Open in Airtable"
    >
      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      <span className="sm:hidden">Airtable</span>
      <span className="hidden sm:inline">Open in Airtable</span>
    </a>
  );

  if (submission.approved && hcbOrgName) {
    return (
      <>
        <button onClick={onSendGrant} className="btn btn-primary btn-md">
          <BanknotesIcon className="h-4 w-4" />
          Send HCB grant
        </button>
        {airtableButton}
      </>
    );
  }

  if (submission.rejected) {
    return (
      <>
        <button 
          onClick={onUndoRejection}
          disabled={isRejecting}
          className="btn btn-outline btn-sm"
        >
          {isRejecting ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Undoing...
            </>
          ) : (
            "Undo verdict"
          )}
        </button>
        {airtableButton}
      </>
    );
  }

  if (!submission.approved && !submission.rejected) {
    return (
      <>
        <button 
          onClick={onApprove}
          disabled={isApproving}
          className="btn btn-success btn-md"
        >
          {isApproving ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Approving...
            </>
          ) : (
            <>
              <CheckIcon className="h-4 w-4" />
              Approve
            </>
          )}
        </button>
        <button 
          onClick={onReject}
          disabled={isRejecting}
          className="btn btn-error btn-md"
        >
          {isRejecting ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Rejecting...
            </>
          ) : (
            <>
              <XMarkIcon className="h-4 w-4" />
              Reject
            </>
          )}
        </button>
        {airtableButton}
      </>
    );
  }

  return airtableButton;
}

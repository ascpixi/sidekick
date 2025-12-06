import { CheckIcon, XMarkIcon, BanknotesIcon } from "@heroicons/react/24/outline";
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
  if (submission.approved && hcbOrgName) {
    return (
      <button onClick={onSendGrant} className="btn btn-primary btn-md">
          <BanknotesIcon className="h-4 w-4" />
        Send HCB grant
      </button>
    );
  }

  if (submission.rejected) {
    return (
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
      </>
    );
  }

  return null;
}

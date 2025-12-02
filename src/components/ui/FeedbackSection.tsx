import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";
import { Card } from "./Card";
import { ExpandableText } from "./ExpandableText";
import { YswsSubmission } from "../../types/submission";

export function FeedbackSection({ submission }: { submission: YswsSubmission }) {
  return (
    <Accordion 
      title={
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="h-5 w-5" />
          Feedback
        </div>
      } 
      className="mb-3" 
      defaultOpen={true}
    >
      <div className="pl-4">
        <Card>
          <h3 className="font-semibold mb-2">What are we doing well?</h3>
          {submission.whatAreWeDoingWell?.trim() ? (
            <ExpandableText text={submission.whatAreWeDoingWell} maxLines={3} />
          ) : (
            <p className="text-gray-500 italic">(no feedback given)</p>
          )}
        </Card>
        <Card>
          <h3 className="font-semibold mb-2">How can we improve?</h3>
          {submission.howCanWeImprove?.trim() ? (
            <ExpandableText text={submission.howCanWeImprove} maxLines={3} />
          ) : (
            <p className="text-gray-500 italic">(no feedback given)</p>
          )}
        </Card>
        <Card>
          <h3 className="font-semibold mb-2">How did you hear about this?</h3>
          {submission.howDidYouHearAboutThis?.trim() ? (
            <ExpandableText text={submission.howDidYouHearAboutThis} maxLines={3} />
          ) : (
            <p className="text-gray-500 italic">(no feedback given)</p>
          )}
        </Card>
      </div>
    </Accordion>
  );
}

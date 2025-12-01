import type { RawAirtableSubmission, YswsSubmission } from "../types/submission";

export function transformAirtableSubmission(raw: RawAirtableSubmission): YswsSubmission {
  return {
    codeUrl: raw["Code URL"] || "",
    demoUrl: raw["Playable URL"] || "",
    howDidYouHearAboutThis: raw["How did you hear about this?"] || "",
    whatAreWeDoingWell: raw["What are we doing well?"] || "",
    howCanWeImprove: raw["How can we improve?"] || "",
    authorFirstName: raw["First Name"] || "",
    authorLastName: raw["Last Name"] || "",
    authorEmail: raw["Email"] || "",
    screenshotUrl: raw["Screenshot"] || "",
    description: raw["Description"] || "",
    authorGithub: (raw["GitHub Username"] || "").replace(/^@/, ""),
    authorAddress1: raw["Address (Line 1)"] || "",
    authorAddress2: raw["Address (Line 2)"] || "",
    authorCity: raw["City"] || "",
    authorState: raw["State / Province"] || "",
    authorCountry: raw["Country"] || "",
    authorZip: raw["ZIP / Postal Code"] || "",
    authorBirthday: raw["Birthday"] || "",
    hoursSpent: parseFloat(raw["Optional - Override Hours Spent"]) || 0,
    hoursSpentJustification: raw["Optional - Override Hours Spent Justification"] || "",
    approved: Boolean(raw["Automation - Submit to Unified YSWS"]),
    automationError: raw["Automation - Error"] || "",
    approvedOn: raw["Automation - First Submitted At"] ? new Date(raw["Automation - First Submitted At"]) : null,
    yswsDbRecordId: raw["Automation - YSWS Record ID"] || ""
  };
}

export function getSubmissionTitle(submission: YswsSubmission): string {
  if (!submission.codeUrl) 
    return `${submission.authorFirstName} ${submission.authorLastName}`;
  
  if (submission.codeUrl.includes("github.com/")) 
    return submission.codeUrl.replace(/^https?:\/\/github\.com\//, "");
  
  return submission.codeUrl;
}

export function formatAddress(submission: YswsSubmission): string[] {
  const addressParts: string[] = [];
  
  if (submission.authorAddress1) addressParts.push(submission.authorAddress1);
  if (submission.authorAddress2) addressParts.push(submission.authorAddress2);
  
  const cityStateZip = [submission.authorCity, submission.authorState, submission.authorZip]
    .filter(Boolean)
    .join(", ");
  
  if (cityStateZip) addressParts.push(cityStateZip);
  if (submission.authorCountry) addressParts.push(submission.authorCountry);
  
  return addressParts;
}

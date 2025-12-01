import type { Submission } from "../types/submission";

interface MainLayoutProps {
  submissions: Submission[];
  selectedSubmission?: Submission;
  onSubmissionSelect: (submission: Submission) => void;
}

export function MainLayout({ submissions, selectedSubmission, onSubmissionSelect }: MainLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Left Sidebar - Submissions List */}
      <div className="w-80 bg-base-100 border-r border-base-content/5 overflow-y-auto">
        <div className="p-4 border-b border-base-100">
          <h2 className="font-semibold text-lg">Submissions ({submissions.length})</h2>
        </div>
        <div className="divide-y divide-base-200">
          {submissions.map((submission, index) => (
            <button
              key={index}
              onClick={() => onSubmissionSelect(submission)}
              className={`w-full p-4 text-left hover:bg-base-200 transition-colors ${
                selectedSubmission === submission ? "bg-primary bg-opacity-10 border-r-2 border-primary" : ""
              }`}
            >
              <div className="font-medium text-sm">
                {submission["First Name"]} {submission["Last Name"]}
              </div>
              <div className="text-xs text-base-content/70 mt-1 truncate">
                {submission["Description"] || "No description"}
              </div>
              {submission["GitHub Username"] && (
                <div className="text-xs text-primary mt-1">
                  @{submission["GitHub Username"]}
                </div>
              )}
            </button>
          ))}
        </div>
        {submissions.length === 0 && (
          <div className="p-8 text-center text-base-content/70">
            No submissions found
          </div>
        )}
      </div>

      {/* Right Content Area - Submission Details */}
      <div className="flex-1 overflow-y-auto">
        {selectedSubmission ? (
          <div className="p-6">
            <div className="max-w-4xl">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">
                  {selectedSubmission["First Name"]} {selectedSubmission["Last Name"]}
                </h1>
                <div className="flex gap-4 text-sm text-base-content/70">
                  <span>{selectedSubmission["Email"]}</span>
                  {selectedSubmission["GitHub Username"] && (
                    <span>@{selectedSubmission["GitHub Username"]}</span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="card bg-base-100 shadow mb-6">
                <div className="card-body">
                  <h2 className="card-title">Project Description</h2>
                  <p className="whitespace-pre-wrap">{selectedSubmission["Description"]}</p>
                </div>
              </div>

              {/* URLs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="card bg-base-100 shadow">
                  <div className="card-body">
                    <h3 className="font-semibold">Code URL</h3>
                    {selectedSubmission["Code URL"] ? (
                      <a 
                        href={selectedSubmission["Code URL"]} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="link link-primary"
                      >
                        View Code
                      </a>
                    ) : (
                      <span className="text-base-content/50">Not provided</span>
                    )}
                  </div>
                </div>
                <div className="card bg-base-100 shadow">
                  <div className="card-body">
                    <h3 className="font-semibold">Playable URL</h3>
                    {selectedSubmission["Playable URL"] ? (
                      <a 
                        href={selectedSubmission["Playable URL"]} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="link link-primary"
                      >
                        Try Demo
                      </a>
                    ) : (
                      <span className="text-base-content/50">Not provided</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Feedback */}
              <div className="space-y-4 mb-6">
                <div className="card bg-base-100 shadow">
                  <div className="card-body">
                    <h3 className="font-semibold">What are we doing well?</h3>
                    <p className="whitespace-pre-wrap">{selectedSubmission["What are we doing well?"]}</p>
                  </div>
                </div>
                <div className="card bg-base-100 shadow">
                  <div className="card-body">
                    <h3 className="font-semibold">How can we improve?</h3>
                    <p className="whitespace-pre-wrap">{selectedSubmission["How can we improve?"]}</p>
                  </div>
                </div>
                <div className="card bg-base-100 shadow">
                  <div className="card-body">
                    <h3 className="font-semibold">How did you hear about this?</h3>
                    <p className="whitespace-pre-wrap">{selectedSubmission["How did you hear about this?"]}</p>
                  </div>
                </div>
              </div>

              {/* Screenshot */}
              {selectedSubmission["Screenshot"] && (
                <div className="card bg-base-100 shadow mb-6">
                  <div className="card-body">
                    <h3 className="font-semibold mb-2">Screenshot</h3>
                    <img 
                      src={selectedSubmission["Screenshot"]} 
                      alt="Project screenshot" 
                      className="max-w-full rounded-lg"
                    />
                  </div>
                </div>
              )}
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

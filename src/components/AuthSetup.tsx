import { useState } from "react";
import { ModalHeader } from "./ModalHeader";
import { Input } from "./Input";

export interface AuthConfig {
  airtablePAT: string;
  hackatimeKey: string;
  groqApiKey?: string;
}

export function AuthSetup({ 
  onComplete,
  isModal = false,
  onClose,
  initialValues
}: { 
  onComplete: (config: AuthConfig) => void;
  isModal?: boolean;
  onClose?: () => void;
  initialValues?: AuthConfig;
}) {
  const [airtablePAT, setAirtablePAT] = useState(initialValues?.airtablePAT || "");
  const [hackatimeKey, setHackatimeKey] = useState(initialValues?.hackatimeKey || "");
  const [groqApiKey, setGroqApiKey] = useState(initialValues?.groqApiKey || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (airtablePAT.trim() && hackatimeKey.trim()) {
      onComplete({
        airtablePAT: airtablePAT.trim(),
        hackatimeKey: hackatimeKey.trim(),
        groqApiKey: groqApiKey.trim() || undefined
      });
    }
  };

  const content = (
    <form className={isModal ? "p-0" : "card-body p-12 w-full"} onSubmit={handleSubmit}>
      <ModalHeader 
        title={isModal ? "Preferences" : "Set up Sidekick"}
        subtitle={isModal ? "Update your API keys and settings." : "These will be stored locally."}
      />
      
      <div className="flex flex-col gap-6">
        <Input
          label="Airtable Personal Access Token"
          placeholder="pat..."
          value={airtablePAT}
          onChange={setAirtablePAT}
          linkText="Create Airtable PAT →"
          linkHref="https://airtable.com/create/tokens"
          type="password"
          required
        />
        
        <Input
          label="Hackatime Admin Key"
          placeholder="hka_..."
          value={hackatimeKey}
          onChange={setHackatimeKey}
          linkText="Create Hackatime Admin Key →"
          linkHref="https://hackatime.hackclub.com/admin/admin_api_keys/new"
          type="password"
          required
        />

        <Input
          label="Groq API Key (optional)"
          placeholder="gsk_..."
          value={groqApiKey}
          onChange={setGroqApiKey}
          linkText="Get Groq API Key →"
          linkHref="https://console.groq.com/keys"
          type="password"
        />
        <p className="text-xs text-base-content/60 -mt-4">
          Used for AI-powered Hackatime project key inference. Leave empty to disable.
        </p>
      </div>

      
      <div className="form-control mt-6 flex flex-row gap-2">
        {isModal && onClose && (
          <button 
            type="button" 
            className="btn btn-ghost flex-1"
            onClick={onClose}
          >
            Cancel
          </button>
        )}
        <button 
          type="submit" 
          className={`btn btn-primary ${isModal ? "flex-1" : ""}`}
          disabled={!airtablePAT.trim() || !hackatimeKey.trim()}
        >
          {isModal ? "Save" : "Continue"}
        </button>
      </div>
    </form>
  );

  if (isModal) {
    return (
      <div className="modal modal-open">
        <div className="modal-box max-w-3xl p-10">
          {content}
        </div>
        <div className="modal-backdrop" onClick={onClose}></div>
      </div>
    );
  }

  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content max-w-none">
        <div className="card bg-base-100 w-full min-w-2xl shrink-0 shadow-2xl">
          {content}
        </div>
      </div>
    </div>
  );
}

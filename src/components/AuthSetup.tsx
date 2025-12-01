import { useState } from "react";
import { ModalHeader } from "./ModalHeader";
import { Input } from "./Input";

interface AuthSetupProps {
  onComplete: (airtablePAT: string, hackatimeKey: string) => void;
}

export function AuthSetup({ onComplete }: AuthSetupProps) {
  const [airtablePAT, setAirtablePAT] = useState("");
  const [hackatimeKey, setHackatimeKey] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (airtablePAT.trim() && hackatimeKey.trim()) {
      onComplete(airtablePAT.trim(), hackatimeKey.trim());
    }
  };

  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content max-w-none">
        <div className="card bg-base-100 w-full min-w-2xl shrink-0 shadow-2xl">
          <form className="card-body p-12 w-full" onSubmit={handleSubmit}>
            <ModalHeader 
              title="Set up Sidekick"
              subtitle="These will be stored locally."
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
            </div>

            
            <div className="form-control mt-6">
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!airtablePAT.trim() || !hackatimeKey.trim()}
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

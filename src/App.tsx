import { useState, useEffect } from "react";
import { AuthSetup } from "./components/AuthSetup";
import { Header } from "./components/Header";
import { MainLayout } from "./components/MainLayout";
import type { AppConfig, AirtableBase, Submission } from "./types/submission";

const STORAGE_KEY = "sidekick-config";

function App() {
  const [config, setConfig] = useState<AppConfig | null>(() => {
    // Load config from localStorage on app start
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    if (savedConfig) {
      try {
        return JSON.parse(savedConfig);
      } catch (error) {
        console.error("Failed to parse saved config:", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    return null;
  });
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | undefined>();

  // Save config to localStorage whenever it changes
  useEffect(() => {
    if (config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  const handleAuthComplete = (airtablePAT: string, hackatimeAdminKey: string) => {
    const newConfig = {
      airtablePAT,
      hackatimeAdminKey,
      bases: []
    };
    setConfig(newConfig);
  };

  const handleAddBase = (name: string, url: string) => {
    if (!config) return;
    
    const newBase: AirtableBase = {
      id: Date.now().toString(),
      name,
      url
    };
    
    const newBases = [...config.bases, newBase];
    setConfig({
      ...config,
      bases: newBases,
      // Auto-select the first base if none is currently selected
      selectedBaseId: config.selectedBaseId || newBase.id
    });
  };

  const handleBaseSelect = (baseId: string) => {
    if (!config) return;
    
    setConfig({
      ...config,
      selectedBaseId: baseId
    });
    
    // TODO: Fetch submissions from Airtable
    // For now, we'll show an empty state
    setSubmissions([]);
    setSelectedSubmission(undefined);
  };

  // If not authenticated, show auth setup
  if (!config) {
    return <AuthSetup onComplete={handleAuthComplete} />;
  }

  return (
    <div className="h-screen flex flex-col">
      <Header 
        bases={config.bases}
        selectedBaseId={config.selectedBaseId}
        onBaseSelect={handleBaseSelect}
        onAddBase={handleAddBase}
        airtablePAT={config.airtablePAT}
      />
      <div className="flex-1 overflow-hidden p-6">
        <MainLayout 
          submissions={submissions}
          selectedSubmission={selectedSubmission}
          onSubmissionSelect={setSelectedSubmission}
        />
      </div>
    </div>
  );
}

export default App;

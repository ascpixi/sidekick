import { useState, useEffect, useCallback } from "react";
import { AuthSetup, type AuthConfig } from "./components/AuthSetup";
import { Header } from "./components/Header";
import { MainLayout } from "./components/MainLayout";
import { AirtableService, type AirtableTable } from "./services/airtable";
import type { AppConfig, AirtableBase } from "./types/submission";
import { YswsSubmission } from "./types/submission";

const STORAGE_KEY = "sidekick-config";

function App() {
  const [config, setConfig] = useState<AppConfig | null>(() => {
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

  const [submissions, setSubmissions] = useState<YswsSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<YswsSubmission | undefined>();
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  const handleSubmissionSelect = useCallback((submission: YswsSubmission) => {
    setSelectedSubmission(submission);
    window.location.hash = submission.recordId;
  }, []);

  useEffect(() => {
    if (config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  function handleAuthComplete(authConfig: AuthConfig) {
    setConfig(prev => ({
      airtablePAT: authConfig.airtablePAT,
      hackatimeAdminKey: authConfig.hackatimeKey,
      groqApiKey: authConfig.groqApiKey,
      bases: prev?.bases || [],
      baseSettings: prev?.baseSettings || {},
      selectedBaseId: prev?.selectedBaseId
    }));
    setIsPreferencesOpen(false);
  }

  const handleUpdateBase = useCallback((baseId: string, tableId: string, tableName: string, viewId?: string, viewName?: string) => {
    setConfig(prevConfig => {
      if (!prevConfig) return prevConfig;
      
      const updatedBases = prevConfig.bases.map(base => 
        base.id === baseId 
          ? { ...base, tableId, tableName, viewId, viewName }
          : base
      );
      
      return {
        ...prevConfig,
        bases: updatedBases
      };
    });
  }, []);

  const tryAutoConfigureTable = useCallback(async (baseId: string) => {
    if (!config) return;

    try {
      const airtableBaseId = AirtableService.extractBaseIdFromUrl(baseId) || baseId;
      const airtableService = new AirtableService(config.airtablePAT);
      const schema = await airtableService.fetchBaseSchema(airtableBaseId);
      
      let targetTable = schema.tables.find((table: AirtableTable) => 
        table.name.toLowerCase() === "ysws project submission"
      );
      
      if (!targetTable) {
        targetTable = schema.tables.find((table: AirtableTable) => 
          table.name.toLowerCase() !== "ysws config"
        );
      }
      
      if (targetTable) {
        handleUpdateBase(baseId, targetTable.id, targetTable.name);
      } else {
        throw new Error("No suitable table found. Expected 'YSWS Project Submission' or at least one table that is not 'YSWS Config'.");
      }
    } catch (error) {
      setSubmissionsError(error instanceof Error ? error.message : "Failed to auto-configure table");
    }
  }, [config, handleUpdateBase]);

  const handleAddBase = useCallback((id: string, name: string, url: string) => {
    if (!config) return;

    const newBase: AirtableBase = { id, name, url };
    setConfig({
      ...config,
      bases: [...config.bases, newBase],
      selectedBaseId: newBase.id
    });
    
    setTimeout(() => tryAutoConfigureTable(id), 100);
  }, [config, tryAutoConfigureTable]);

  const fetchSubmissions = useCallback(async (baseId: string) => {
    if (!config) return;

    const selectedBase = config.bases.find(base => base.id === baseId);
    if (!selectedBase) {
      setSubmissionsError("Base not found");
      return;
    }

    if (!selectedBase.tableName) {
      setSubmissionsError("Please configure table and view for this base");
      return;
    }

    setIsLoadingSubmissions(true);
    setSubmissionsError(null);
    setSubmissions([]);
    setSelectedSubmission(undefined);
    
    try {
      const airtableBaseId = AirtableService.extractBaseIdFromUrl(selectedBase.url);
      if (!airtableBaseId) throw new Error("Invalid Airtable base URL");
      
      const airtableService = new AirtableService(config.airtablePAT);
      const rejectedColumn = config.baseSettings?.[baseId]?.rejectedColumn;
      const hackatimeProjectsColumn = config.baseSettings?.[baseId]?.hackatimeProjectsColumn;
      const submissions = await airtableService.fetchSubmissions(
        airtableBaseId,
        selectedBase.tableId!,
        selectedBase.tableName!, 
        selectedBase.viewId,
        rejectedColumn,
        hackatimeProjectsColumn
      );
      
      setSubmissions(submissions);
      
      const hashRecordId = window.location.hash.slice(1);
      const restoredSubmission = hashRecordId 
        ? submissions.find(s => s.recordId === hashRecordId)
        : undefined;
      const pendingSubmissions = submissions.filter(s => !s.approved && !s.rejected);
      const autoSelected = restoredSubmission ?? (pendingSubmissions.length > 0 ? pendingSubmissions[0] : submissions[0]);
      setSelectedSubmission(autoSelected);
      if (autoSelected) {
        window.location.hash = autoSelected.recordId;
      }
    } catch (error) {
      setSubmissionsError(error instanceof Error ? error.message : "Failed to fetch submissions");
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, [config]);

  const handleSubmissionUpdate = useCallback(() => setSubmissions(prev => [...prev]), []);

  useEffect(() => {
    if (config?.selectedBaseId) {
      fetchSubmissions(config.selectedBaseId);
    }
  }, [config?.selectedBaseId, fetchSubmissions]);

  function handleBaseSelect(baseId: string) {
    if (!config) return;

    setConfig({
      ...config,
      selectedBaseId: baseId
    });
    
    fetchSubmissions(baseId);
  }

  const handleBaseSettingsUpdate = useCallback((baseId: string, settings: import("./types/submission").BaseSettings) => {
    if (!config) return;

    setConfig({
      ...config,
      baseSettings: {
        ...config.baseSettings,
        [baseId]: settings
      }
    });
  }, [config]);

  if (!config) return <AuthSetup onComplete={handleAuthComplete} />;

  const authConfig: AuthConfig = {
    airtablePAT: config.airtablePAT,
    hackatimeKey: config.hackatimeAdminKey,
    groqApiKey: config.groqApiKey
  };

  return (
    <div className="min-h-screen sm:h-screen flex flex-col overflow-y-auto sm:overflow-hidden">
      <Header 
        bases={config.bases}
        selectedBaseId={config.selectedBaseId}
        onBaseSelect={handleBaseSelect}
        onAddBase={handleAddBase}
        airtablePAT={config.airtablePAT}
        baseSettings={config.baseSettings || {}}
        onBaseSettingsUpdate={handleBaseSettingsUpdate}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
      />
      <div className="flex-1 sm:overflow-hidden p-1 sm:p-6">
        <MainLayout 
          submissions={submissions}
          selectedSubmission={selectedSubmission}
          onSubmissionSelect={handleSubmissionSelect}
          onSubmissionUpdate={handleSubmissionUpdate}
          isLoading={isLoadingSubmissions}
          error={submissionsError}
          currentBase={config.selectedBaseId ? config.bases.find(base => base.id === config.selectedBaseId) : undefined}
          baseSettings={config.baseSettings || {}}
          hackatimeAdminKey={config.hackatimeAdminKey}
          groqApiKey={config.groqApiKey}
        />
      </div>

      {isPreferencesOpen && (
        <AuthSetup
          isModal
          onComplete={handleAuthComplete}
          onClose={() => setIsPreferencesOpen(false)}
          initialValues={authConfig}
        />
      )}
    </div>
  );
}

export default App;

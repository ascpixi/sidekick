import { useState, useEffect, useCallback } from "react";
import type { AirtableBase, BaseSettings } from "../types/submission";
import { SidekickIcon } from "./SidekickIcon";
import { ModalHeader } from "./ModalHeader";
import { Input } from "./Input";
import { BaseSettingsModal } from "./BaseSettingsModal";
import { SparklesIcon, WrenchScrewdriverIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { AirtableService, type AirtableTable } from "../services/airtable";

interface AirtableApiBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export function Header({ 
  bases, 
  selectedBaseId, 
  onBaseSelect, 
  onAddBase, 
  airtablePAT,
  baseSettings,
  onBaseSettingsUpdate,
  onOpenPreferences
}: { 
  bases: AirtableBase[];
  selectedBaseId?: string;
  onBaseSelect: (baseId: string) => void;
  onAddBase: (id: string, name: string, url: string) => void;
  airtablePAT: string;
  baseSettings: Record<string, BaseSettings>;
  onBaseSettingsUpdate: (baseId: string, settings: BaseSettings) => void;
  onOpenPreferences: () => void;
}) {
  const [isAddingBase, setIsAddingBase] = useState(false);
  const [availableBases, setAvailableBases] = useState<AirtableApiBase[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingBases, setIsLoadingBases] = useState(false);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsBaseId, setSettingsBaseId] = useState<string | null>(null);

  const fetchSubmissionCounts = useCallback(async (basesToCheck: AirtableApiBase[]) => {
    const counts: Record<string, number> = {};
    const airtableService = new AirtableService(airtablePAT);

    for (const base of basesToCheck) {
      try {
        const baseId = AirtableService.extractBaseIdFromUrl(base.id) || base.id;
        const schema = await airtableService.fetchBaseSchema(baseId);
        
        let targetTable = schema.tables.find((table: AirtableTable) => 
          table.name.toLowerCase() === "ysws project submission"
        );
        
        if (!targetTable) {
          targetTable = schema.tables.find((table: AirtableTable) => 
            table.name.toLowerCase() !== "ysws config"
          );
        }

        if (targetTable) {
          const rejectedColumn = baseSettings[base.id]?.rejectedColumn;
          const hackatimeProjectsColumn = baseSettings[base.id]?.hackatimeProjectsColumn;
    const submissions = await airtableService.fetchSubmissions(baseId, targetTable.id, targetTable.name, undefined, rejectedColumn, hackatimeProjectsColumn);
          // Only count pending submissions (not approved and not rejected)
          const pendingSubmissions = submissions.filter(submission => !submission.approved && !submission.rejected);
          counts[base.id] = pendingSubmissions.length;
        } else {
          counts[base.id] = 0;
        }
      } catch {
        counts[base.id] = 0;
      }
    }
    
    setSubmissionCounts(counts);
  }, [airtablePAT, baseSettings]);

  const fetchAvailableBases = useCallback(async () => {
    if (!airtablePAT) return;
    
    setIsLoadingBases(true);
    try {
      const response = await fetch("https://api.airtable.com/v0/meta/bases", {
        headers: {
          Authorization: `Bearer ${airtablePAT}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const ywswsBases = data.bases.filter((base: AirtableApiBase) =>
          base.name.toLowerCase().includes("ysws")
        );
        setAvailableBases(ywswsBases);
        
        fetchSubmissionCounts(ywswsBases);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingBases(false);
    }
  }, [airtablePAT, fetchSubmissionCounts]);

  function handleBaseSelection(base: AirtableApiBase) {
    const baseUrl = `https://airtable.com/${base.id}`;
    onAddBase(base.id, base.name, baseUrl);
    setIsAddingBase(false);
    setSearchTerm("");

    setTimeout(() => {
      setSettingsBaseId(base.id);
      setIsSettingsModalOpen(true);
    }, 100);
  }

  function handleOpenModal() {
    setIsAddingBase(true);
  }

  function handleConfigureBase() {
    if (currentBase) {
      setSettingsBaseId(currentBase.id);
      setIsSettingsModalOpen(true);
    }
  }

  function handleSettingsSave(baseId: string, settings: BaseSettings) {
    onBaseSettingsUpdate(baseId, settings);
  }

  const currentBase = selectedBaseId ? bases.find(base => base.id === selectedBaseId) : bases[0];

  const shouldForceModal = bases.length === 0;
  const showModal = isAddingBase || shouldForceModal;

  useEffect(() => {
    if (showModal) {
      fetchAvailableBases();
    }
  }, [showModal, airtablePAT, fetchAvailableBases]);

  useEffect(() => {
    if (bases.length > 0 && airtablePAT) {
      const basesToCheck: AirtableApiBase[] = bases.map(base => ({
        id: base.id,
        name: base.name,
        permissionLevel: "read" // This field is not used in fetchSubmissionCounts
      }));
      fetchSubmissionCounts(basesToCheck);
    }
  }, [bases, airtablePAT, fetchSubmissionCounts, baseSettings]);

  return (
    <header className="navbar bg-base-100 shadow-lg px-4 sm:px-8 py-4 flex-shrink-0">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <div className="dropdown">
            <div tabIndex={0} role="button" className="btn btn-ghost text-xl flex items-center gap-3 rounded-lg">
              <SidekickIcon />
              <span>{currentBase?.name || "No Base Selected"}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-50 w-80 p-2 shadow-xl border border-base-content/10">
            {bases.map(base => (
              <li key={base.id}>
                <button 
                  onClick={() => {
                    onBaseSelect(base.id);
                    const activeElement = document.activeElement as HTMLElement;
                    activeElement?.blur();
                  }}
                  className={`w-full text-left ${selectedBaseId === base.id ? "active" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{base.name}</span>
                    {submissionCounts[base.id] !== undefined ? (
                      submissionCounts[base.id] > 0 ? (
                        <div className="badge badge-sm badge-secondary">
                          {submissionCounts[base.id]}
                        </div>
                      ) : null
                    ) : (
                      <div className="badge badge-sm badge-outline">
                        ...
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
            <li className="border-t border-base-content/10 mt-2 pt-2">
              <button 
                onClick={handleOpenModal}
                className="w-full text-left text-primary"
              >
                + Add YSWS Base
              </button>
            </li>
          </ul>
          </div>
          {currentBase && (
            <button
              onClick={handleConfigureBase}
              className="btn btn-primary btn-md sm:btn-sm"
              title="Configure base settings"
            >
              <WrenchScrewdriverIcon className="w-4 h-4" />
              Configure
            </button>
          )}
        </div>
      </div>
      <div className="flex-none gap-2">
        <button
          onClick={onOpenPreferences}
          className="btn btn-ghost btn-md sm:btn-sm"
          title="Preferences"
        >
          <Cog6ToothIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Preferences</span>
        </button>
      </div>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl p-12 relative">
            {!shouldForceModal && (
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
                onClick={() => setIsAddingBase(false)}
              >
                ✕
              </button>
            )}
            <ModalHeader
              title={shouldForceModal ? "Select Your First YSWS Base" : "Select a YSWS Base"}
              subtitle={shouldForceModal ? "You need to add at least one YSWS base to get started." : undefined}
              icon={<SparklesIcon className="w-8 h-8 text-primary" />}
            />
            
            <div className="mb-6">
              <Input
                label=""
                type="search"
                placeholder="Search for a base..."
                value={searchTerm}
                onChange={setSearchTerm}
              />
            </div>
              
            <div className="max-h-64 overflow-y-auto border border-base-content/20 rounded-lg">
                {isLoadingBases ? (
                  <div className="flex items-center justify-center p-8">
                    <span className="loading loading-spinner loading-md"></span>
                    <span className="ml-2">Loading bases...</span>
                  </div>
                ) : (
                  <>
                    {availableBases
                      .filter(base => 
                        base.name.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((base) => (
                        <button
                        key={base.id}
                        onClick={() => handleBaseSelection(base)}
                        className="w-full p-4 text-left hover:bg-base-200 border-b border-base-content/10 last:border-b-0 cursor-pointer"
                        >
                        <div className="font-medium">{base.name}</div>
                        <div className="text-sm text-base-content/70">{base.id}</div>
                         </button>
                      ))}
                    
                    {availableBases.length === 0 && !isLoadingBases && (
                      <div className="p-8 text-center text-base-content/70">
                        No YSWS bases found. Make sure you have bases with "YSWS" in the name.
                      </div>
                    )}
                    
                    {availableBases.length > 0 && 
                     availableBases.filter(base => 
                       base.name.toLowerCase().includes(searchTerm.toLowerCase())
                     ).length === 0 && (
                      <div className="p-8 text-center text-base-content/70">
                        No bases match your search.
                      </div>
                    )}
                  </>
                )}
            </div>
            
            <div className="modal-action">
              {!shouldForceModal && (
                <button 
                  type="button" 
                  className="btn btn-soft btn-neutral"
                  onClick={() => setIsAddingBase(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {settingsBaseId && (
        <BaseSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => {
            setIsSettingsModalOpen(false);
            setSettingsBaseId(null);
          }}
          base={bases.find(base => base.id === settingsBaseId)!}
          settings={baseSettings[settingsBaseId]}
          onSave={handleSettingsSave}
          airtablePAT={airtablePAT}
        />
      )}
    </header>
  );
}

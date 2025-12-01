import { useState, useEffect } from "react";
import type { AirtableBase } from "../types/submission";
import { SidekickIcon } from "./SidekickIcon";
import { ModalHeader } from "./ModalHeader";
import { Input } from "./Input";
import { SparklesIcon } from "@heroicons/react/24/outline";

interface HeaderProps {
  bases: AirtableBase[];
  selectedBaseId?: string;
  onBaseSelect: (baseId: string) => void;
  onAddBase: (name: string, url: string) => void;
  airtablePAT: string;
}

interface AirtableApiBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export function Header({ bases, selectedBaseId, onBaseSelect, onAddBase, airtablePAT }: HeaderProps) {
  const [isAddingBase, setIsAddingBase] = useState(false);
  const [availableBases, setAvailableBases] = useState<AirtableApiBase[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingBases, setIsLoadingBases] = useState(false);

  const fetchAvailableBases = async () => {
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
        // Filter bases that contain "YSWS" in the name
        const ywswsBases = data.bases.filter((base: AirtableApiBase) =>
          base.name.toLowerCase().includes("ysws")
        );
        setAvailableBases(ywswsBases);
      }
    } catch (error) {
      console.error("Error fetching bases:", error);
    } finally {
      setIsLoadingBases(false);
    }
  };

  const handleBaseSelection = (base: AirtableApiBase) => {
    const baseUrl = `https://airtable.com/${base.id}`;
    onAddBase(base.name, baseUrl);
    setIsAddingBase(false);
    setSearchTerm("");
  };

  const handleOpenModal = () => {
    setIsAddingBase(true);
  };

  // Auto-select first base if none selected and bases exist
  const currentBase = selectedBaseId ? bases.find(base => base.id === selectedBaseId) : bases[0];
  
  // Force modal if no bases exist
  const shouldForceModal = bases.length === 0;
  const showModal = isAddingBase || shouldForceModal;

  // Fetch available bases whenever the modal is shown
  useEffect(() => {
    if (showModal) {
      fetchAvailableBases();
    }
  }, [showModal, airtablePAT]);

  return (
    <header className="navbar bg-base-100 shadow-lg px-8 py-4">
      <div className="flex-1">
        <div className="dropdown">
          <div tabIndex={0} role="button" className="btn btn-ghost text-xl flex items-center gap-3 rounded-lg">
            <SidekickIcon />
            <span>{currentBase?.name || "No Base Selected"}</span>
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
          <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[1] w-80 p-2 shadow-xl border border-base-content/10">
            {bases.map(base => (
              <li key={base.id}>
                <button 
                  onClick={() => onBaseSelect(base.id)}
                  className={`w-full text-left ${selectedBaseId === base.id ? "active" : ""}`}
                >
                  {base.name}
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
      </div>
      <div className="flex-none gap-2">
      </div>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl p-12">
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
                          className="w-full p-4 text-left hover:bg-base-200 border-b border-base-content/10 last:border-b-0"
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
                  className="btn"
                  onClick={() => setIsAddingBase(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

import { useState } from "react";
import SettingsSidebar from "@/components/SettingsSidebar";
import ProviderList from "@/components/ProviderList";
import ProviderModels from "@/components/ProviderModels";
import ExcludeFolders from "@/components/ExcludeFolders";
import LogoSettings from "@/components/LogoSettings";
import { useSettingsStore } from "@/stores/SettingsStore";
import { PromptOptimizerSettings } from "@/components/PromptOptimizerSettings";
import { RemoteAccessSettings } from "@/components/RemoteAccessSettings";

export default function SettingsPage() {
  const { activeSection, setActiveSection } = useSettingsStore();
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");
  const providerNames = [
    "openai",
    "google",
    "ollama",
    "openrouter",
    "xai"
  ];

  return (
    <div className="flex h-screen">
      <SettingsSidebar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection} 
      />
      
      <div className="flex-1 px-6 overflow-y-auto">
        {activeSection === "provider" && (
          <div className="grid grid-cols-3 gap-6">
            <ProviderList 
              providers={providerNames}
              selectedProvider={selectedProvider}
              onProviderSelect={setSelectedProvider}
            />
            <ProviderModels 
              selectedProvider={selectedProvider}
            />
          </div>
        )}
        {activeSection === "promptOptimizer" && <PromptOptimizerSettings />}
        {activeSection === "security" && <p>Security Settings</p>}
        {activeSection === "working" && <p>Working Directory Settings</p>}
        {activeSection === "remoteAccess" && <RemoteAccessSettings />}
        {activeSection === "exclude" && <ExcludeFolders />}
        {activeSection === "logo" && <LogoSettings />}
      </div>
    </div>
  );
}

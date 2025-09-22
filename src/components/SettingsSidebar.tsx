import { Button } from "@/components/ui/button";

interface SettingsSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function SettingsSidebar({ 
  activeSection, 
  onSectionChange 
}: SettingsSidebarProps) {
  return (
    <div className="w-64 border-r bg-muted/30 px-4 space-y-2">
      <Button
        variant={activeSection === "provider" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("provider")}
      >
        Provider
      </Button>
      <Button
        variant={activeSection === "promptOptimizer" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("promptOptimizer")}
      >
        Prompt Optimizer
      </Button>
      <Button
        variant={activeSection === "security" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("security")}
      >
        Security
      </Button>
      <Button
        variant={activeSection === "working" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("working")}
      >
        Working Directory
      </Button>
      <Button
        variant={activeSection === "remoteAccess" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("remoteAccess")}
      >
        Remote Access
      </Button>
      <Button
        variant={activeSection === "exclude" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("exclude")}
      >
        Exclude Folders
      </Button>
      <Button
        variant={activeSection === "logo" ? "default" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSectionChange("logo")}
      >
        Logo Settings
      </Button>
    </div>
  );
}

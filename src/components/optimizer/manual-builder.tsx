import { useState, useMemo } from "react";
import { SheetCanvas } from "./sheet-canvas";
import { GuillotineSheetPacker } from "@/lib/optimizer/guillotine";
import type { CutPartInput, StockSheetInput, OptimizerSettings } from "@/lib/optimizer/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

interface ManualBuilderProps {
  parts: CutPartInput[];
  stockSheet: StockSheetInput;
  settings: OptimizerSettings;
  onClose: () => void;
}

export function ManualBuilder({ parts, stockSheet, settings, onClose }: ManualBuilderProps) {
  // Expand parts based on qty
  const expandedParts = useMemo(() => {
    const exp: CutPartInput[] = [];
    parts.forEach((p) => {
      for (let i = 0; i < p.qty; i++) {
        exp.push({ ...p, id: `${p.id}_${i}` });
      }
    });
    return exp;
  }, [parts]);

  // We maintain a Guillotine instance
  const [packer] = useState(() => new GuillotineSheetPacker(stockSheet, settings, "BSSF", "MAXAS", 0));
  const [placedCount, setPlacedCount] = useState(0); 
  const [rotatedParts, setRotatedParts] = useState<Record<string, boolean>>({});

  const layout = useMemo(() => packer.getLayout(), [packer, placedCount]);
  
  // Track which unique expanded part IDs are placed
  const placedIds = new Set(layout.placedParts.map((p) => p.partId));
  const remainingParts = expandedParts.filter((p) => !placedIds.has(p.id));

  const handlePlace = (part: CutPartInput) => {
    const isRotated = rotatedParts[part.id] || false;
    
    // If user pre-rotated it in the list, swap dimensions for the packer
    const packPart = isRotated 
      ? { ...part, length: part.width, width: part.length, grain: "none" as const }
      : part;

    const colors = ["#bae6fd", "#fed7aa", "#bbf7d0", "#e9d5ff", "#fbcfe8", "#fde047"];
    const color = colors[placedCount % colors.length];

    const success = packer.tryPlace(packPart, color);
    if (success) {
      setPlacedCount((c) => c + 1);
    } else {
      toast.error(`Cannot fit ${part.name} (${packPart.length}x${packPart.width}) in the remaining space.`);
    }
  };

  const handleReset = () => {
    packer.reset();
    setPlacedCount(0);
    setRotatedParts({});
    toast.info("Manual board cleared.");
  };

  const toggleRotate = (id: string) => {
    setRotatedParts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 sm:p-6 animate-in slide-in-from-bottom-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Manual Sandbox Builder</h2>
          <p className="text-sm text-muted">Test individual part placements on a blank board. Real-time sequence validation.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full bg-surface-container hover:bg-surface-hover">
          <X className="size-5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        {/* Left side: Canvas */}
        <div className="flex-1 overflow-auto rounded-lg border border-outline bg-paper p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Interactive Board</h3>
            <Button variant="danger" size="sm" onClick={handleReset} className="h-8">
              <Trash2 className="mr-2 size-4" />
              Clear Board
            </Button>
          </div>
          <SheetCanvas layout={layout} />
        </div>

        {/* Right side: Available Parts */}
        <div className="flex w-full flex-col lg:w-96">
          <Card className="flex h-full flex-col border-outline bg-paper p-4">
            <h3 className="mb-4 font-semibold text-foreground">Available Parts ({remainingParts.length})</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
              {remainingParts.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted">
                  No parts remaining.
                </div>
              ) : (
                remainingParts.map((part) => {
                  const isRotated = rotatedParts[part.id] || false;
                  const displayL = isRotated ? part.width : part.length;
                  const displayW = isRotated ? part.length : part.width;

                  return (
                    <div key={part.id} className="flex flex-col gap-2 rounded-md border border-outline bg-surface p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-sm">{part.name}</span>
                        <span className="font-mono text-xs text-muted">
                          {displayL} x {displayW}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 h-7 text-xs" 
                          onClick={() => handlePlace(part)}
                        >
                          <Plus className="mr-1 size-3" /> Insert
                        </Button>
                        <Button 
                          variant={isRotated ? "default" : "outline"}
                          size="icon" 
                          className="h-7 w-7 shrink-0" 
                          onClick={() => toggleRotate(part.id)}
                          title="Rotate 90deg"
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

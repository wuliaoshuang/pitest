import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelImperativeHandle,
  type PanelProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      className={cn(
        "flex h-full w-full bg-[linear-gradient(180deg,#ffffff_0%,#f5f7fb_100%)] dark:bg-[linear-gradient(180deg,#000000_0%,#08101a_100%)] data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function ResizablePanel(props: PanelProps) {
  return <Panel {...props} />;
}

export function ResizableHandle({
  className,
  withHandle = false,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      className={cn(
        "group relative shrink-0 bg-transparent transition-colors duration-150 data-[orientation=horizontal]:w-2 data-[orientation=vertical]:h-2",
        "data-[orientation=horizontal]:cursor-col-resize data-[orientation=vertical]:cursor-row-resize",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center",
          "data-[orientation=horizontal]:w-2 data-[orientation=vertical]:h-2",
        )}
      >
        <div
          className={cn(
            "rounded-full border border-white/75 bg-white/68 shadow-[0_8px_18px_rgba(52,72,112,0.08)] backdrop-blur-xl transition dark:border-white/10 dark:bg-white/8",
            "group-hover:border-[color:var(--app-accent-border)] group-hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.92),var(--app-accent-soft))]",
            withHandle
              ? "flex size-7 items-center justify-center text-slate-400 group-hover:text-[color:var(--app-accent-text)] dark:text-slate-500"
              : "data-[orientation=horizontal]:mx-auto data-[orientation=horizontal]:h-10 data-[orientation=horizontal]:w-px data-[orientation=vertical]:my-auto data-[orientation=vertical]:h-px data-[orientation=vertical]:w-10",
          )}
        >
          {withHandle ? <GripVertical className="size-3.5 rotate-90" /> : null}
        </div>
      </div>
    </Separator>
  );
}

export type { PanelImperativeHandle };

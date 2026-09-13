import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

export function LogoLockup({
  className,
  withTagline = false,
}: {
  className?: string;
  withTagline?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <LogoMark className="size-14" />
      <span className="mt-3 bg-gradient-to-br from-[#14b8a6] via-[#0d9488] to-[#1e4ed8] bg-clip-text font-heading text-3xl font-bold tracking-tight text-transparent">
        BaseMind
      </span>
      {withTagline ? (
        <span className="mt-1 text-sm font-medium text-[#1e4ed8]">
          Knowledge Driven AI Agents
        </span>
      ) : null}
    </div>
  );
}
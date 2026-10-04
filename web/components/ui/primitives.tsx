"use client";
/**
 * Token-styled wrappers over Radix primitives (shadcn-style, written locally because the
 * shadcn registry is not reachable from the build environment). Behaviour/a11y come from Radix;
 * look comes from SolarSight tokens. Deliberately no Card/Badge components.
 */
import * as React from "react";
import { Accordion as A, Collapsible as C, Dialog as D, ScrollArea as SA, Select as S, Slider as SL,
  Switch as SW, Tabs as T, ToggleGroup as TG, Tooltip as TT } from "radix-ui";
import { Check, ChevronDown, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------- Button ---------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "outline" | "subtle";
  size?: "sm" | "md" | "icon";
};
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "ghost", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-7 px-2 text-xs",
        size === "md" && "h-8 px-3 text-[13px]",
        size === "icon" && "h-8 w-8",
        variant === "ghost" && "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
        variant === "outline" && "border border-border text-text-primary hover:border-border-strong hover:bg-surface-raised",
        variant === "subtle" && "bg-surface-raised text-text-primary hover:bg-border",
        className,
      )}
      {...props}
    />
  );
});

/* ---------------- Segmented control (ToggleGroup) ---------------- */
export function Segmented<V extends string>({ value, onChange, options, label, className }: {
  value: V; onChange: (v: V) => void; label: string; className?: string;
  options: { value: V; label: React.ReactNode; title?: string }[];
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as V)}
      aria-label={label}
      className={cn("grid auto-cols-fr grid-flow-col rounded-md border border-border bg-surface-sunken p-0.5", className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className="h-7 rounded-[5px] px-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary data-[state=on]:bg-surface-raised data-[state=on]:text-text-primary data-[state=on]:shadow-[inset_0_0_0_1px_var(--border-strong)]"
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({ checked, onCheckedChange, id, ...rest }: {
  checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; "aria-label"?: string;
}) {
  return (
    <SW.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...rest}
      className="relative h-5 w-9 shrink-0 rounded-full border border-border bg-surface-sunken transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent/30"
    >
      <SW.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-text-secondary transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-text-primary" />
    </SW.Root>
  );
}

/* ---------------- Tooltip / InfoTip ---------------- */
export const TooltipProvider = TT.Provider;
export function Tip({ content, children, side = "top" }: {
  content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TT.Root delayDuration={150}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[280px] rounded-md border border-border bg-surface-raised px-3 py-2 text-xs leading-[18px] text-text-secondary shadow-[var(--shadow-raised)]"
        >
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
export function InfoTip({ content, label }: { content: React.ReactNode; label: string }) {
  return (
    <Tip content={content}>
      <button type="button" aria-label={label} className="inline-flex h-4 w-4 items-center justify-center rounded text-text-muted hover:text-text-secondary">
        <Info size={13} aria-hidden />
      </button>
    </Tip>
  );
}

/* ---------------- Select ---------------- */
export function Select<V extends string>({ value, onChange, options, label }: {
  value: V; onChange: (v: V) => void; label: string;
  options: { value: V; label: string; hint?: string }[];
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onChange(v as V)}>
      <S.Trigger aria-label={label} className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-surface-sunken px-2.5 text-[13px] text-text-primary hover:border-border-strong">
        <S.Value />
        <S.Icon><ChevronDown size={14} className="text-text-muted" /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-md border border-border bg-surface-raised p-1 shadow-[var(--shadow-raised)]">
          <S.Viewport>
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="relative flex cursor-default select-none flex-col rounded px-2 py-1.5 pl-7 text-[13px] text-text-primary outline-none data-[highlighted]:bg-border">
                <S.ItemIndicator className="absolute left-2 top-2"><Check size={13} /></S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="meta-text">{o.hint}</span>}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/* ---------------- Slider ---------------- */
export function Slider({ value, onChange, min, max, step, label, disabled }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number; label: string; disabled?: boolean;
}) {
  return (
    <SL.Root value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={step} disabled={disabled}
      className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-40">
      <SL.Track className="relative h-1 grow rounded-full bg-border">
        <SL.Range className="absolute h-full rounded-full bg-accent" />
      </SL.Track>
      <SL.Thumb aria-label={label} className="block h-3.5 w-3.5 rounded-full border border-accent bg-text-primary" />
    </SL.Root>
  );
}

/* ---------------- Collapsible ---------------- */
export function Disclosure({ title, right, children, defaultOpen = false, open, onOpenChange }: {
  title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
  open?: boolean; onOpenChange?: (o: boolean) => void;
}) {
  return (
    <C.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} className="group/d">
      <C.Trigger className="flex w-full items-center gap-2 py-2 text-left">
        <ChevronDown size={14} className="-rotate-90 text-text-muted transition-transform group-data-[state=open]/d:rotate-0" aria-hidden />
        <span className="section-title flex-1">{title}</span>
        {right}
      </C.Trigger>
      <C.Content className="pb-2">{children}</C.Content>
    </C.Root>
  );
}

/* ---------------- Tabs ---------------- */
export const Tabs = T.Root;
export const TabsContent = T.Content;
export function TabsList({ children, label }: { children: React.ReactNode; label: string }) {
  return <T.List aria-label={label} className="flex items-center gap-1">{children}</T.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <T.Trigger value={value} className="h-7 rounded-md px-2.5 text-[13px] font-medium text-text-muted hover:text-text-secondary data-[state=active]:bg-surface-raised data-[state=active]:text-text-primary">
      {children}
    </T.Trigger>
  );
}

/* ---------------- Sheet (Dialog) ---------------- */
export function Sheet({ open, onOpenChange, title, description, children, side = "right" }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string;
  children: React.ReactNode; side?: "right" | "bottom";
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <D.Content
          className={cn(
            "fixed z-50 flex flex-col border-border bg-surface shadow-[var(--shadow-raised)] outline-none",
            side === "right" && "inset-y-0 right-0 w-full max-w-[560px] border-l",
            side === "bottom" && "inset-x-0 bottom-0 max-h-[85vh] rounded-t-[10px] border-t",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <D.Title className="text-[15px] font-semibold text-text-primary">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-xs text-text-secondary">{description}</D.Description>
                : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X size={16} /></Button>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ---------------- Accordion ---------------- */
export function Accordion({ items, defaultValue }: {
  items: { value: string; title: string; content: React.ReactNode }[]; defaultValue?: string[];
}) {
  return (
    <A.Root type="multiple" defaultValue={defaultValue} className="divide-y divide-border">
      {items.map((it) => (
        <A.Item key={it.value} value={it.value}>
          <A.Header>
            <A.Trigger className="group flex w-full items-center justify-between px-5 py-3 text-left text-[13px] font-medium text-text-primary hover:bg-surface-raised">
              {it.title}
              <ChevronDown size={14} className="text-text-muted transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </A.Trigger>
          </A.Header>
          <A.Content className="px-5 pb-4 text-[13px] leading-5 text-text-secondary">{it.content}</A.Content>
        </A.Item>
      ))}
    </A.Root>
  );
}

/* ---------------- ScrollArea ---------------- */
export function Scroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <SA.Root className={cn("overflow-hidden", className)}>
      <SA.Viewport className="h-full w-full">{children}</SA.Viewport>
      <SA.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none p-0.5">
        <SA.Thumb className="relative flex-1 rounded-full bg-border" />
      </SA.Scrollbar>
    </SA.Root>
  );
}

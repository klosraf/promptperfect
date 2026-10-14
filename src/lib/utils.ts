/**
 * Dependency-free class-name helper (shadcn/ui `cn` API).
 *
 * The repo pins a lockfile and `npm install` is known-broken upstream, so this
 * avoids adding clsx/tailwind-merge. It filters falsy values and joins the
 * rest; call order controls precedence (later classes are emitted last).
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, unknown>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input && input !== 0) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key);
      }
    }
  }
  return out.join(' ');
}

type VariantShape = Record<string, Record<string, string | undefined>>;

interface VariantConfig<V extends VariantShape> {
  variants: V;
  compoundVariants?: Array<
    Partial<Record<keyof V, string>> & { class?: string; className?: string }
  >;
  defaultVariants?: Partial<Record<keyof V, string>>;
  base?: string;
}

/**
 * Minimal cva-style variant helper: builds a class string from a base class,
 * variant maps, and compound variants. Matches the shadcn/ui usage surface so
 * components can be swapped to real cva later without edits.
 */
export function cvaLite<V extends VariantShape>(
  base: string,
  config: VariantConfig<V>,
) {
  return (props?: {
    variant?: string;
    size?: string;
    className?: string;
  } & Record<string, string | undefined>): string => {
    const selected: Record<string, string> = {};
    for (const key of Object.keys(config.variants)) {
      const value =
        props?.[key] ?? config.defaultVariants?.[key] ?? undefined;
      if (value) {
        const mapped = config.variants[key]?.[value];
        if (mapped) selected[key] = mapped;
      }
    }
    const parts: string[] = [base, ...Object.values(selected)];
    for (const cv of config.compoundVariants ?? []) {
      const matches = Object.entries(cv).every(([k, v]) => {
        if (k === 'class' || k === 'className') return true;
        const value = props?.[k] ?? config.defaultVariants?.[k];
        return value === v;
      });
      if (matches) parts.push(cv.class ?? cv.className ?? '');
    }
    if (props?.className) parts.push(props.className);
    return cn(...parts);
  };
}

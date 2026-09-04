import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, onFocus, ...props }, ref) => {
  // For number fields, select the existing value on focus so typing replaces it
  // (e.g. a default of 0 becomes "1", not "10"/"01" depending on cursor position).
  const handleFocus = (e) => {
    if (type === 'number') {
      const el = e.target;
      try { el.select(); } catch (_) { /* some browsers disallow select() on number inputs */ }
    }
    onFocus?.(e);
  };
  return (
    (<input
      type={type}
      onFocus={handleFocus}
      className={cn(
        "flex h-9 w-full rounded-[4px] border border-input bg-transparent px-3 py-1 text-base shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      style={{ fontFamily: 'var(--font-highway)' }}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-[4px] border border-input bg-transparent px-3 py-2 text-base shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      style={{ fontFamily: 'var(--font-highway)' }}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, onKeyDown, ...props }: React.ComponentProps<"textarea">) {
  // Enterキーの伝播を止めてDialog/フォームのSubmitを防ぐ
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation()
    }
    onKeyDown?.(e)
  }

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}

export { Textarea }

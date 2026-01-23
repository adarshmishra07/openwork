import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toast notification container component.
 * Positioned top-right, styled for dark theme.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      duration={5000}
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          title: 'group-[.toast]:text-foreground group-[.toast]:font-medium',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error:
            'group-[.toaster]:bg-destructive/10 group-[.toaster]:border-destructive/50 group-[.toaster]:text-destructive',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };

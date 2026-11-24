// The director desk: its own navigation beside the view. Each view reads its data inside its own Suspense.
import { DeskNav } from '@/components/desk/DeskNav';

export default function DeskLayout({ children }: LayoutProps<'/c/[slug]/desk'>) {
  return (
    <div className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 lg:grid-cols-[168px_minmax(0,1fr)] print:block print:max-w-none">
      <DeskNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

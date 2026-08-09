import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stage • Urban',
  description: 'Atril digital',
};

export default function StageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {children}
    </div>
  );
}

import { Header } from "@/components/header";
import { LiveRefresh } from "@/components/live-refresh";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <LiveRefresh />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="container py-6">{children}</main>
      </div>
    </div>
  );
}

import { DevTestPanel } from "@/components/dev-test-panel";

export default function HubHome() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">SparkMotion NFC Scan test</h1>
      <DevTestPanel />
    </main>
  );
}

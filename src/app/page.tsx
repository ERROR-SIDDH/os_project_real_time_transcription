import { Room } from '@/components/Room';
import { Toaster } from "@/components/ui/toaster";
import Image from 'next/image';

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="w-[95%] md:w-[80%] mx-auto flex h-14 items-center justify-between">
          <div className="flex items-center">
            <a className="flex items-center space-x-2" href="/">
              <Image
                src="/EchoVault-min.png"
                alt="EchoVault Logo"
                width={32}
                height={32}
                className="rounded-sm"
              />
              <span className="font-bold">
                EchoVault
              </span>
            </a>
          </div>
        </div>
      </header>
      <main className="flex flex-col items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 md:p-8">
          <header className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-primary font-headline">EchoVault</h1>
            <p className="text-muted-foreground mt-2">Real-time room-based transcription service.</p>
          </header>

          <div className="mb-12 w-full">
            <Room />
          </div>
        </div>
        <Toaster />
      </main>
    </>
  );
}

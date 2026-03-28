import type { Metadata } from "next";
import { LobbyProvider } from "@/context/LobbyContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "BigThink Game",
  description: "Multiplayer arena game",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LobbyProvider>
          {children}
        </LobbyProvider>
      </body>
    </html>
  );
}
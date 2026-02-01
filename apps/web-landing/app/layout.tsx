import "./globals.css";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-body" });

export const metadata = {
  title: "Lead Lander - School Landing Pages",
  description: "Educational program landing pages"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}

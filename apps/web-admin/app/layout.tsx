import "./admin.css";
import { Sora, Source_Sans_3 } from "next/font/google";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lead Lander Admin",
  description: "Lead Lander Administration Portal",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>"
  }
};

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["400", "500", "600", "700"]
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-admin-body",
  weight: ["400", "500", "600"]
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${sourceSans.variable} admin-root`}>
        {children}
      </body>
    </html>
  );
}

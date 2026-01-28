import "./admin.css";
import { Sora, Source_Sans_3 } from "next/font/google";

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
    <div className={`${sora.variable} ${sourceSans.variable} admin-root`}>
      {children}
    </div>
  );
}

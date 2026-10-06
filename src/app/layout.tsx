import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attendance",
  description: "Team attendance and training registration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

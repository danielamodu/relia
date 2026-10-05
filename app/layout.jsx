import "./globals.css";

export const metadata = {
  title: "Relia — Upgrade risk investigation",
  description: "Investigate software upgrades with source-backed requirements, relationships, and proof.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}

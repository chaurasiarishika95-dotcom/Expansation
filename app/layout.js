import "./globals.css";

export const metadata = {
  title: "UFC Expansion Command Center",
  description:
    "Demand forecasting, UFC expansion, assortment planning and scenario simulation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
